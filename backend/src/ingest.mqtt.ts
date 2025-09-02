import mqtt from 'mqtt';
import { Pool } from 'pg';

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
      const device_id = m[1];
      const kind = m[2];
      const data = JSON.parse(payload.toString());

      if (kind === 'telemetry') {
        const { ts, lat, lon, alt, hr, battery, sos } = data;

        await pool.query(
          `INSERT INTO mlink.devices(device_id, last_seen)
           VALUES ($1, NOW())
           ON CONFLICT (device_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
          [device_id]
        );

        await pool.query(
          `INSERT INTO mlink.telemetry(device_id, ts, lat, lon, alt, hr, battery, sos)
           VALUES ($1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, $7, $8)`,
          [device_id, ts, lat, lon, alt, hr, battery, sos]
        );
      } else if (kind === 'alert') {
        app.log.warn({ device_id, alert: data }, '[ALERT]');
        // TODO: 若有 alerts 表，在此 INSERT
      }
    } catch (e) {
      app.log.error(e, '[MQTT] message error');
    }
  });

  client.on('error', (err) => app.log.error(err, '[MQTT] error'));
}
