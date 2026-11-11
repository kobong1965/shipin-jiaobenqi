import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { transaction } from '../../packages/storage/database';
import { AppError, admin, type AppContext } from './context';
import type { User } from '../../packages/contracts';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const scryptAsync = promisify(scrypt);
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}
async function passwordMatches(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  const actual = await scryptAsync(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const userSql = 'id, username, display_name AS "displayName", role, active';
const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,40}$/), password: z.string().min(10).max(200) });
const newUser = credentials.extend({ displayName: z.string().trim().min(1).max(50) });

export async function registerAuth(app: FastifyInstance, context: AppContext) {
  const { db, origin } = context;
  let owner = (await db.query('SELECT ' + userSql + " FROM users WHERE role='admin' ORDER BY created_at LIMIT 1")).rows[0];
  if (!owner) owner = (await db.query("INSERT INTO users(id,username,display_name,password_hash,role) VALUES($1,$2,$3,$4,'admin') RETURNING " + userSql, [randomUUID(), 'local-owner', '本地工作台', await passwordHash(randomBytes(32).toString('hex'))])).rows[0];
  owner = { ...owner, active: true };
  app.decorateRequest('user');
  app.decorateRequest('csrf', '');
  app.addHook('onRequest', async request => {
    if (!request.url.startsWith('/api/')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== origin) throw new AppError(403, '请求来源不符');
    request.user = owner; request.csrf = '';
  });
  app.get('/api/auth/state', async () => ({ needsSetup: false, hasSession: true }));
  app.get('/api/me', async request => {
    const { csrf: _, ...user } = request.user as User & { csrf?: string };
    return { user, csrf: request.csrf, preferences: (await db.query('SELECT preferences FROM users WHERE id=$1', [user.id])).rows[0].preferences };
  });
  app.put('/api/preferences', async request => {
    const value = z.object({ platform: z.enum(['douyin', 'tiktok']), market: z.enum(['CN', 'US', 'VN']), model: z.enum(['seedance-2.0', 'seedance-2.5']), category: z.string().max(50) }).parse(request.body);
    await db.query('UPDATE users SET preferences=$1 WHERE id=$2', [value, request.user.id]); return { ok: true };
  });
  app.post('/api/admin/invitations', async request => {
    admin(request); const { days } = z.object({ days: z.number().int().min(1).max(30).default(7) }).parse(request.body ?? {});
    const token = randomBytes(24).toString('hex');
    await db.query("INSERT INTO invitations(id,token_hash,creator_id,expires_at) VALUES($1,$2,$3,now()+make_interval(days=>$4))", [randomUUID(), digest(token), request.user.id, days]);
    return { token, days };
  });
  app.get('/api/admin/users', async request => { admin(request); return (await db.query(`SELECT ${userSql} FROM users ORDER BY created_at`)).rows; });
  app.patch('/api/admin/users/:id', async request => {
    admin(request); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { active } = z.object({ active: z.boolean() }).parse(request.body);
    if (id === request.user.id && !active) throw new AppError(400, '不能停用自己的账号');
    await transaction(db, async client => {
      await client.query('UPDATE users SET active=$1 WHERE id=$2', [active, id]);
      if (!active) await client.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      await client.query('INSERT INTO audit(user_id,action,resource_id) VALUES($1,$2,$3)', [request.user.id, active ? 'user.enabled' : 'user.disabled', id]);
    });
    return { ok: true };
  });
}
