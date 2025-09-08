import Fastify from 'fastify';
import auth from './auth.js';
import mqtt from 'mqtt';
import pg from 'pg';
import { EventEmitter } from 'events';
const { Pool } = pg;

const PORT = Number(process.env.PORT || 4000);
const MQTT_URL = process.env.MQTT_URL || 'mqtt://mosq:1883';
const DB_URL   = process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/mountainlink';

const fastify = Fastify({ logger: true });
const bus = new EventEmitter(); bus.setMaxListeners(1000);
const pool = new Pool({ connectionString: DB_URL });

async function waitDbReady(n=30){ while(n--){ try{ await pool.query('select 1'); return; }catch{ await new Promise(r=>setTimeout(r,1000)); } } throw new Error('DB not ready'); }

async function ensureSchema() {
  await pool.query(`create schema if not exists mlink;`);
  await pool.query(`
    create table if not exists mlink.devices(
      device_id text primary key,
      alias text,
      last_ts timestamptz,
      hr int,
      battery int,
      lat double precision,
      lon double precision,
      alt double precision
    );
    create table if not exists mlink.telemetry(
      id bigserial primary key,
      device_id text not null,
      ts timestamptz not null,
      hr int,
      battery int,
      lat double precision,
      lon double precision,
      alt double precision
    );
    create index if not exists idx_telemetry_device_ts on mlink.telemetry(device_id, ts desc);

    create table if not exists mlink.alerts(
      id bigserial primary key,
      device_id text not null,
      type text not null,
      severity text,
      ts timestamptz not null,
      payload jsonb
    );
    create index if not exists idx_alerts_ts on mlink.alerts(ts desc);
  `);
  await pool.query(`
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS last_ts timestamptz;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS hr int;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS battery int;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS lat double precision;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS lon double precision;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS alt double precision;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS owner text;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS note text;
    ALTER TABLE mlink.devices   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE mlink.telemetry ADD COLUMN IF NOT EXISTS lat double precision;
    ALTER TABLE mlink.telemetry ADD COLUMN IF NOT EXISTS lon double precision;
    ALTER TABLE mlink.telemetry ADD COLUMN IF NOT EXISTS alt double precision;
`);
}

function toISO(ts){ if(typeof ts==='number') return new Date(ts<1e12?ts*1000:ts).toISOString(); return new Date(ts||Date.now()).toISOString(); }

async function handleTelemetry(devId, payload) {
  // 1) 先確保 devices 有主鍵（若已存在就不動）
  await pool.query(
    `INSERT INTO mlink.devices(device_id) VALUES($1)
     ON CONFLICT (device_id) DO NOTHING`,
    [devId]
  );

  // 2) 正規化資料
  const ts = toISO(payload.ts);
  const hr = payload.hr ?? null;
  const battery = payload.battery ?? payload.batt ?? null;

  // 同時支援扁平欄位或 gps 內嵌欄位
  const lat = (payload.gps?.lat ?? payload.lat) ?? null;
  const lon = (payload.gps?.lon ?? payload.lon) ?? null;
  const alt = (payload.gps?.alt ?? payload.alt) ?? null;

  // 3) 寫 telemetry（此時外鍵不會再擋）
  await pool.query(
    `INSERT INTO mlink.telemetry(device_id, ts, hr, battery, lat, lon, alt)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [devId, ts, hr, battery, lat, lon, alt]
  );

  // 4) 更新 devices 快照
  await pool.query(
    `INSERT INTO mlink.devices(device_id, last_ts, hr, battery, lat, lon, alt)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (device_id) DO UPDATE SET
       last_ts = EXCLUDED.last_ts,
       hr      = EXCLUDED.hr,
       battery = EXCLUDED.battery,
       lat     = EXCLUDED.lat,
       lon     = EXCLUDED.lon,
       alt     = EXCLUDED.alt`,
    [devId, ts, hr, battery, lat, lon, alt]
  );

  bus.emit('telemetry', { type:'telemetry', device_id: devId, ts, hr, battery, lat, lon, alt });
}


async function handleSos(devId, payload) {
  const ts = toISO(payload.ts);
  await pool.query(
    'insert into mlink.alerts(device_id, type, severity, ts, payload) values($1,$2,$3,$4,$5)',
    [devId, 'SOS', 'HIGH', ts, payload ? JSON.stringify(payload) : null]
  );
  bus.emit('sos', { type:'sos', device_id: devId, ts, payload });
}

let mqttClient, mqttConnected=false;
async function start() {
  await waitDbReady(); await ensureSchema();

  // MQTT
  mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 2000 });
  mqttClient.on('connect', () => {
    mqttConnected = true; fastify.log.info('MQTT connected');
    mqttClient.subscribe(['mlink/+/telemetry', 'mlink/telemetry/+',
                          'mlink/+/sos',       'mlink/sos/+']);
  });
  mqttClient.on('close', ()=>{ mqttConnected=false; fastify.log.warn('MQTT disconnected'); });
  mqttClient.on('error', e=>fastify.log.error(e));
  mqttClient.on('message', async (topic, msg) => {
    try {
      const payload = JSON.parse(String(msg || '{}'));
      const parts = topic.split('/'); // ['mlink', '...', '...']
      if (parts[0] !== 'mlink') return;

      let devId, kind;
      // 支援 mlink/<id>/<kind> 以及 mlink/<kind>/<id>
      if (parts[2] === 'telemetry' || parts[2] === 'sos') {
        devId = parts[1]; kind = parts[2];
      } else if (parts[1] === 'telemetry' || parts[1] === 'sos') {
        kind = parts[1]; devId = parts[2];
      } else {
        return; // 其它不處理
      }

      if (kind === 'telemetry') await handleTelemetry(devId, payload);
      else if (kind === 'sos') await handleSos(devId, payload);
    } catch (e) { fastify.log.error(e); }
  });


  // 健檢
  const health = async()=>({ ok:true, db:true, mqtt:mqttConnected });
  fastify.get('/health', health); fastify.get('/api/health', health);
  fastify.register(auth);        // 掛上 /api/auth/login、/api/me、/api/auth/logout

  // 裝置清單（直接回 devices 內的最後座標）
  fastify.get('/api/devices', async (req, reply) => {
    try{
      const { rows } = await pool.query(
        `select device_id, hr, battery, last_ts as ts, lat, lon, alt
         from mlink.devices order by device_id asc`
      );
      return rows;
    }catch(e) { req.log.error(e); reply.code(500).send({ok:false,error:String(e)}); }
  });

  // 軌跡
  fastify.get('/api/device/:id/trail', async (req, reply) => {
    const { id } = req.params; const { from, to, limit=2000 } = req.query;
    try{
      const params=[id]; let i=2; let where='device_id=$1';
      if(from){ where+=` and ts >= $${i++}`; params.push(new Date(from).toISOString()); }
      if(to){   where+=` and ts <= $${i++}`; params.push(new Date(to).toISOString()); }
      const { rows } = await pool.query(
        `select ts, lat, lon, alt, hr, battery
         from mlink.telemetry where ${where} order by ts asc limit ${Number(limit)}`, params);
      const features = rows.filter(r=>r.lat!=null&&r.lon!=null).map(r=>({
        type:'Feature',
        properties:{ ts:r.ts, hr:r.hr, battery:r.battery, alt:r.alt },
        geometry:{ type:'Point', coordinates:[r.lon, r.lat, r.alt??0] }
      }));
      return { type:'FeatureCollection', features };
    }catch(e){ req.log.error(e); reply.code(500).send({ok:false,error:'db_query_failed'}); }
  });

  // 告警
  fastify.get('/api/alerts', async (req, reply) => {
    try{
      const { rows } = await pool.query(
        `select id, device_id, type, severity, ts from mlink.alerts order by id desc limit 50`);
      return rows;
    }catch(e){ req.log.error(e); reply.code(500).send({ok:false,error:'db_query_failed'}); }
  });

  // SSE
  fastify.get('/api/stream', async (req, reply) => {
    reply.header('Content-Type','text/event-stream');
    reply.header('Cache-Control','no-cache');
    reply.header('Connection','keep-alive');
    reply.raw.write('retry: 5000\n\ndata: {"type":"alive"}\n\n');
    const send = (ev)=>reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    const hb = setInterval(()=>reply.raw.write(':hb\n\n'), 25000);
    bus.on('telemetry', send); bus.on('sos', send);
    req.raw.on('close', ()=>{ clearInterval(hb); bus.off('telemetry',send); bus.off('sos',send); });
  });
  // ---- 裝置管理 CRUD ----
  // 取得裝置列表（支援關鍵字關聯查詢）
  fastify.get('/api/admin/devices', async (req, reply) => {
    const q = (req.query?.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE device_id ILIKE $1 OR COALESCE(alias,'') ILIKE $1 OR COALESCE(owner,'') ILIKE $1`;
    }
    const { rows } = await pool.query(
      `SELECT device_id, alias, owner, active, note, last_ts, hr, battery, lat, lon, alt
       FROM mlink.devices ${where} ORDER BY device_id ASC`, params);
    return rows;
  });

  // 新增/覆蓋（upsert）
  fastify.post('/api/admin/device', async (req, reply) => {
    const { device_id, alias, owner, active=true, note } = req.body || {};
    if (!device_id) return reply.code(400).send({ ok:false, error:'missing device_id' });
    await pool.query(
      `INSERT INTO mlink.devices(device_id,alias,owner,active,note,updated_at)
       VALUES($1,$2,$3,$4,$5,now())
       ON CONFLICT (device_id) DO UPDATE
       SET alias=EXCLUDED.alias, owner=EXCLUDED.owner, active=EXCLUDED.active, note=EXCLUDED.note, updated_at=now()`,
      [device_id, alias||null, owner||null, !!active, note||null]
    );
    return { ok:true };
  });

  // 局部更新
  fastify.patch('/api/admin/device/:id', async (req, reply) => {
    const id = req.params.id;
    const { alias, owner, active, note } = req.body || {};
    await pool.query(
      `UPDATE mlink.devices
       SET alias = COALESCE($2, alias),
           owner = COALESCE($3, owner),
           active = COALESCE($4, active),
           note = COALESCE($5, note),
           updated_at = now()
       WHERE device_id = $1`,
      [id, alias, owner, active, note]
    );
    return { ok:true };
  });

  // 刪除（可選）
  fastify.delete('/api/admin/device/:id', async (req, reply) => {
    await pool.query(`DELETE FROM mlink.devices WHERE device_id=$1`, [req.params.id]);
    return { ok:true };
  });

  // ---- 報案（reports） ----
  // 建立報案
  fastify.post('/api/admin/report', async (req, reply) => {
    const { device_id, kind, priority='medium', message, created_by } = req.body || {};
    if (!device_id) return reply.code(400).send({ ok:false, error:'missing device_id' });
    const { rows } = await pool.query(
      `INSERT INTO mlink.reports(device_id, kind, priority, message, created_by)
       VALUES($1,$2,$3,$4,$5) RETURNING report_id, status, priority, device_id, kind, message, created_at`,
      [device_id, kind||null, priority, message||null, created_by||null]
    );
    return rows[0];
  });

  // 變更狀態/關單
  fastify.patch('/api/admin/report/:id', async (req, reply) => {
    const id = req.params.id;
    const { status, priority, message } = req.body || {};
    const fields = [];
    const params = []; let i = 1;
    if (status)   { fields.push(`status=$${i++}`); params.push(status); }
    if (priority) { fields.push(`priority=$${i++}`); params.push(priority); }
    if (message)  { fields.push(`message=$${i++}`); params.push(message); }
    if (!fields.length) return { ok:true };
    // 若關單，補 closed_at
    const extra = (status === 'closed') ? `, closed_at=now()` : '';
    params.push(id);
    await pool.query(`UPDATE mlink.reports SET ${fields.join(', ')}${extra} WHERE report_id=$${i}`, params);
    return { ok:true };
  });

  // 查詢報案
  fastify.get('/api/admin/reports', async (req, reply) => {
    const { status, device_id, limit=100 } = req.query || {};
    const params=[]; let where=[];
    if (status)    { params.push(status); where.push(`status=$${params.length}`); }
    if (device_id) { params.push(device_id); where.push(`device_id=$${params.length}`); }
    const sql = `SELECT report_id, device_id, status, priority, kind, message, created_by, created_at, closed_at
                 FROM mlink.reports ${where.length?'WHERE '+where.join(' AND '):''}
                 ORDER BY created_at DESC LIMIT ${Number(limit)}`;
    const { rows } = await pool.query(sql, params);
    return rows;
  });


  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  fastify.log.info(`HTTP listening at 0.0.0.0:${PORT}`);
}
start().catch(e=>{ console.error(e); process.exit(1); });

process.on('SIGINT', ()=>{ try{ mqttClient?.end(true); }finally{ process.exit(0);} });
process.on('SIGTERM',()=>{ try{ mqttClient?.end(true); }finally{ process.exit(0);} });
