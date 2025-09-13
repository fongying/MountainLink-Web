// backend/server.js  (ESM)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// ---- env ----
const PORT = Number(process.env.PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL; // 例如：postgres://admin%40mountain.link:密碼@db:5432/mountainlink
const JWT_SECRET = process.env.JWT_SECRET || 'please_change_me';

// ---- app ----
const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(fastifyCookie);

// ---- db ----
const pool = new Pool({ connectionString: DATABASE_URL });

// 重要：在每個連線建立時設定 search_path，避免在單一查詢裡下多條 SQL（你之前因此 500）
pool.on('connect', (client) => {
  client.query('SET search_path TO mlink, public').catch(() => {});
});

// ---- helpers ----
const ok  = (res, data) => res.send(data);
const bad = (res, msg = 'bad request', code = 400) => res.code(code).send({ ok: false, error: msg });

function authGuard(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return bad(res, 'unauthorized', 401);
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch {
    return bad(res, 'unauthorized', 401);
  }
}

// ========== Auth ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return bad(res, 'missing');

    // 注意：這裡已不再把 SET search_path 與 SELECT 放在同一個 query 字串
    const r = await pool.query(
      'SELECT email, password_hash, role, name, COALESCE(active,true) AS active FROM users WHERE email=$1 LIMIT 1',
      [email]
    );
    const row = r.rows?.[0];
    if (!row || !row.password_hash) return bad(res, 'invalid', 401);
    if (!row.active)                return bad(res, 'inactive', 403);

    const passOK = await bcrypt.compare(password, row.password_hash);
    if (!passOK) return bad(res, 'invalid', 401);

    const token = jwt.sign(
      { email: row.email, role: row.role || 'user', name: row.name || '' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' });
    return ok(res, { ok: true, user: { email: row.email, role: row.role || 'user', name: row.name || '' } });
  } catch (e) {
    req.log.error(e);
    return bad(res, 'auth error', 500);
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  return ok(res, { ok: true });
});

app.get('/api/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return ok(res, { ok: false });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    return ok(res, { ok: true, user });
  } catch {
    return ok(res, { ok: false });
  }
});

// ========== REST: /api/devices ==========
app.get('/api/devices', async (req, res) => {
  try {
    // 後端統一從你做的 View 取（會包含 sos、rssi、snr、sats、speed 欄位）
    const sql = `
      SELECT device_id, ts, hr, battery, lat, lon, alt,
             COALESCE(sos,false) AS sos, rssi, snr, sats, speed
      FROM v_devices_latest
      ORDER BY ts DESC NULLS LAST
    `;
    const r = await pool.query(sql);
    return ok(res, r.rows);
  } catch (e) {
    req.log.error(e);
    return bad(res, 'db error', 500);
  }
});

// ========== REST: /api/device/:id/trail ==========
app.get('/api/device/:id/trail', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 86400e3);
    const limit = Math.min(10000, Number(req.query.limit || 5000));

    const sql = `
      SELECT ts, lat, lon, alt, hr, battery, sos
      FROM telemetry
      WHERE device_id = $1 AND ts >= $2
      ORDER BY ts
      LIMIT $3
    `;
    const r = await pool.query(sql, [id, from.toISOString(), limit]);
    return ok(res, r.rows);
  } catch (e) {
    req.log.error(e);
    return bad(res, 'db error', 500);
  }
});

// ========== SSE: /api/stream ==========
app.get('/api/stream', async (req, res) => {
  res.header('Content-Type', 'text/event-stream');
  res.header('Cache-Control', 'no-cache, no-transform');
  res.header('Connection', 'keep-alive');
  res.raw.flushHeaders?.();

  const ping = setInterval(() => res.raw.write(`: ping\n\n`), 15000);
  req.raw.on('close', () => clearInterval(ping));

  // 這裡先回個開場訊息，前端可據此確認連線
  res.raw.write(`event: hello\ndata: {"ok":true}\n\n`);
});

// ---- start ----
try {
  await app.listen({ host: '0.0.0.0', port: PORT });
  app.log.info(`HTTP listening at 0.0.0.0:${PORT}`);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
