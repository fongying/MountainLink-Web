// backend/src/ingest.mqtt.ts
import mqtt from 'mqtt';
import { Pool } from 'pg';
import { emitSos } from '../server'; // 依你的路徑調整

const MQTT_URL = process.env.MQTT_URL || 'mqtt://admin:change_me@mosq:1883';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function startMqttIngest(app: any) {
  const client = mqtt.connect(MQTT_URL, { reconnectPeriod: 2000 });

  client.on('connect', () => {
    app.log.info('[MQTT] connected');
    client.subscribe('mlink/+/telemetry', { qos: 0 });
    client.subscribe('mlink/+/alert', { qos: 0 });
  });

  client.on('message', async (topic, payload) => {
    try {
      const m = String(topic).match(/^mlink\/([^/]+)\/(telemetry|alert)$/);
      if (!m) return;
      const device_id = String(m[1]);       // ← 這個才是權威 ID
      const kind = m[2];
      const data = JSON.parse(payload.toString());

      // --- 2) 小工具：數值/布林清洗 ---
      const toBool = (v: any) => {
        if (v === true || v === 1 || v === '1') return true;
        if (v === false || v === 0 || v === '0') return false;
        if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
        return null; // ← 不確定就回 null（讓 COALESCE 保留舊值）
      };
      const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

      // --- 3) 在 telemetry 分支裡，全部改用 device_id 與清洗過的欄位 ---
      if (kind === 'telemetry') {
        const ts   = data.ts ?? new Date().toISOString();
        const lat  = num(data.lat);
        const lon  = num(data.lon);
        const alt  = num(data.alt);
        const hr   = num(data.hr);
        const bat  = num(data.battery);

        // 可能來源：payload.sos / payload.decoded.telemetry.sos / payload.extra.sos
        const rawSos = (data as any).sos;
        const sosFlag = data.sos === true || data.sos === 'true' || data.sos === 1 || data.sos === '1';

        // 寫歷史（可只留必要欄位）
        await pool.query(`
          INSERT INTO mlink.telemetry (device_id, ts, lat, lon, alt, hr, battery, sos)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (device_id, ts) DO NOTHING
        `, [device_id, ts, lat, lon, alt, hr, bat, sosFlag]);

        // 寫最新；只有 sos !== null 才覆寫
        await pool.query(`
          INSERT INTO mlink.device_status (device_id, ts, lat, lon, alt, hr, battery, sos)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (device_id) DO UPDATE SET
            ts      = EXCLUDED.ts,
            lat     = EXCLUDED.lat,
            lon     = EXCLUDED.lon,
            alt     = EXCLUDED.alt,
            hr      = EXCLUDED.hr,
            battery = EXCLUDED.battery,
            sos     = CASE WHEN EXCLUDED.sos IS NOT NULL
                           THEN EXCLUDED.sos ELSE mlink.device_status.sos END
        `, [device_id, ts, lat, lon, alt, hr, bat, sosFlag]);
        if (sosFlag === true) {
          emitSos({
            type: 'sos',
            device_id: id || device_id,  // 兩者取其一，你當前欄位名
            ts,
            lat, lon
          });
        }
      }else if (kind === 'alert') {
        app.log.warn({ device_id, alert: data }, '[ALERT]');
      }
    } catch (e) {
      app.log.error(e, '[MQTT] message error');
    }
  });

  client.on('error', (err) => app.log.error(err, '[MQTT] error'));
}
