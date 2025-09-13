// backend/src/index.ts
import Fastify from 'fastify';
import pg from 'pg';

const app = Fastify({ logger: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.get('/api/devices', async (_req, reply) => {
  const sql = `
    select device_id, hr, battery, ts, lat, lon, alt,
           sos, rssi, snr, sats, speed
    from mlink.v_devices_latest
    order by ts desc nulls last`;
  const { rows } = await pool.query(sql);
  reply.send(rows);
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' });
