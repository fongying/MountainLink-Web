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
  await pool.query(`
    create table if not exists devices(
      device_id text primary key,
      alias text,
      last_ts timestamptz,
      hr int,
      battery int,
      lat double precision,
      lon double precision,
      alt double precision
    );
    create table if not exists telemetry(
      id bigserial primary key,
      device_id text not null,
      ts timestamptz not null,
      hr int,
      battery int,
      lat double precision,
      lon double precision,
      alt double precision
    );
    create index if not exists idx_telemetry_device_ts on telemetry(device_id, ts desc);

    create table if not exists alerts(
      id bigserial primary key,
      device_id text not null,
      type text not null,
      severity text,
      ts timestamptz not null,
      payload jsonb
    );
    create index if not exists idx_alerts_ts on alerts(ts desc);
  `);
  await pool.query(`
    ALTER TABLE devices   ADD COLUMN IF NOT EXISTS lat double precision;
    ALTER TABLE devices   ADD COLUMN IF NOT EXISTS lon double precision;
    ALTER TABLE devices   ADD COLUMN IF NOT EXISTS alt double precision;
    ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS lat double precision;
    ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS lon double precision;
    ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS alt double precision;
`);
}

function toISO(ts){ if(typeof ts==='number') return new Date(ts<1e12?ts*1000:ts).toISOString(); return new Date(ts||Date.now()).toISOString(); }

async function handleTelemetry(devId, payload) {
  const ts = toISO(payload.ts);
  const hr = payload.hr ?? null;
  const battery = payload.battery ?? payload.batt ?? null;
  const lat = payload.gps?.lat ?? null;
  const lon = payload.gps?.lon ?? null;
  const alt = payload.gps?.alt ?? null;

  await pool.query(
    'insert into telemetry(device_id, ts, hr, battery, lat, lon, alt) values($1,$2,$3,$4,$5,$6,$7)',
    [devId, ts, hr, battery, lat, lon, alt]
  );
  await pool.query(
    `insert into devices(device_id, last_ts, hr, battery, lat, lon, alt)
     values($1,$2,$3,$4,$5,$6,$7)
     on conflict (device_id) do update
     set last_ts=excluded.last_ts, hr=excluded.hr, battery=excluded.battery,
         lat=excluded.lat, lon=excluded.lon, alt=excluded.alt`,
    [devId, ts, hr, battery, lat, lon, alt]
  );

  bus.emit('telemetry', { type:'telemetry', device_id: devId, ts, hr, battery, lat, lon, alt });
}

async function handleSos(devId, payload) {
  const ts = toISO(payload.ts);
  await pool.query(
    'insert into alerts(device_id, type, severity, ts, payload) values($1,$2,$3,$4,$5)',
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
    mqttClient.subscribe('mountainlink/+/telemetry');
    mqttClient.subscribe('mountainlink/+/sos');
  });
  mqttClient.on('close', ()=>{ mqttConnected=false; fastify.log.warn('MQTT disconnected'); });
  mqttClient.on('error', e=>fastify.log.error(e));
  mqttClient.on('message', async (topic, msg) => {
    try{
      const payload = JSON.parse(String(msg||'{}'));
      const m = topic.match(/^mountainlink\/([^/]+)\/([^/]+)/); if(!m) return;
      const devId = m[1], kind = m[2];
      if (kind==='telemetry') await handleTelemetry(devId, payload);
      else if (kind==='sos')  await handleSos(devId, payload);
    }catch(e){ fastify.log.error(e); }
  });

  // 健檢
  const health = async()=>({ ok:true, db:true, mqtt:mqttConnected });
  fastify.get('/health', health); fastify.get('/api/health', health);
  fastify.register(auth);        // 掛上 /api/auth/login、/api/me、/api/auth/logout

  // 裝置清單（直接回 devices 內的最後座標）
  fastify.get('/api/devices', async (req, reply) => {
    try{
      const { rows } = await pool.query(
        `select device_id, hr, battery, last_ts, lat, lon, alt
         from devices order by device_id asc`
      );
      return rows;
    }catch(e){ req.log.error(e); reply.code(500).send({ok:false,error:'db_query_failed'}); }
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
         from telemetry where ${where} order by ts asc limit ${Number(limit)}`, params);
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
        `select id, device_id, type, severity, ts from alerts order by id desc limit 50`);
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

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  fastify.log.info(`HTTP listening at 0.0.0.0:${PORT}`);
}
start().catch(e=>{ console.error(e); process.exit(1); });

process.on('SIGINT', ()=>{ try{ mqttClient?.end(true); }finally{ process.exit(0);} });
process.on('SIGTERM',()=>{ try{ mqttClient?.end(true); }finally{ process.exit(0);} });
