import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import pkg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pkg;

export default fp(async (app) => {
  app.register(cookie, { parseOptions: { sameSite: 'lax', httpOnly: true, path: '/' } });
  app.register(jwt, { secret: process.env.JWT_SECRET || 'change_this_secret' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password) return reply.code(400).send({ ok:false, error:'missing' });

    const { rows } = await pool.query(
      'SELECT user_id, email, name, password_hash, active FROM mlink.users WHERE email=$1 LIMIT 1',
      [email]
    );
    const u = rows[0];
    if (!u || !u.active) return reply.code(401).send({ ok:false, error:'invalid' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return reply.code(401).send({ ok:false, error:'invalid' });

    const token = app.jwt.sign({ user_id: u.user_id, email: u.email, name: u.name }, { expiresIn: '7d' });
    reply
      .setCookie('ml-auth', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7*24*3600 })
      .send({ ok:true, user: { user_id: u.user_id, email: u.email, name: u.name } });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('ml-auth', { path: '/' }).send({ ok:true });
  });

  app.get('/api/me', async (req, reply) => {
    try {
      const token = req.cookies['ml-auth'];
      const payload = app.jwt.verify(token);
      return { ok:true, user: { user_id: payload.user_id, email: payload.email, name: payload.name } };
    } catch {
      return reply.code(401).send({ ok:false });
    }
  });

  app.get('/api/auth/login', async (_req, reply) => {
    reply.code(405).send({ ok:false, error:'use POST' });
  });
});
