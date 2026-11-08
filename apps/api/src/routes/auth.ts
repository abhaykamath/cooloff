import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { loginSchema } from '@cb/shared';
import { env } from '../env';
import { validate } from '../lib/validate';
import { endSession, hasSession, startSession } from '../middleware/session';

// Simple in-memory throttle: 5 failures per IP → locked for 15 min. Resets on restart, which is fine for one user.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() || 'unknown';
}

function passwordMatches(input: string): boolean {
  // Hash both sides so lengths match and timingSafeEqual doesn't leak the password length.
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(env.DASHBOARD_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

export const auth = new Hono()
  .post('/login', validate('json', loginSchema), async (c) => {
    const ip = clientIp(c.req.header('x-forwarded-for'));
    const entry = failures.get(ip);
    if (entry && entry.count >= MAX_FAILS && entry.until > Date.now()) {
      const mins = Math.ceil((entry.until - Date.now()) / 60_000);
      return c.json({ error: `Too many attempts. Try again in ${mins} min.` }, 429);
    }

    if (!passwordMatches(c.req.valid('json').password)) {
      const count = (entry && entry.until > Date.now() ? entry.count : 0) + 1;
      failures.set(ip, { count, until: Date.now() + LOCK_MS });
      return c.json({ error: 'Wrong password' }, 401);
    }

    failures.delete(ip);
    await startSession(c);
    return c.json({ ok: true });
  })
  .post('/logout', (c) => {
    endSession(c);
    return c.json({ ok: true });
  })
  .get('/me', async (c) => ((await hasSession(c)) ? c.json({ ok: true }) : c.json({ error: 'Not logged in' }, 401)));
