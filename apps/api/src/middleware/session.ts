import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { env, isProd } from '../env';

const COOKIE = 'cb_session';
const MAX_AGE_S = 30 * 24 * 60 * 60;

/** Cookie value is just the issue time; the HMAC signature (SESSION_SECRET) is what makes it valid. */
export async function startSession(c: Context) {
  await setSignedCookie(c, COOKIE, `v1.${Date.now()}`, env.SESSION_SECRET, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE_S,
  });
}

export function endSession(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function hasSession(c: Context): Promise<boolean> {
  const value = await getSignedCookie(c, env.SESSION_SECRET, COOKIE);
  const issued = typeof value === 'string' ? Number(value.split('.')[1]) : NaN;
  return Number.isFinite(issued) && Date.now() - issued < MAX_AGE_S * 1000;
}

export const requireSession: MiddlewareHandler = async (c, next) => {
  if (!(await hasSession(c))) return c.json({ error: 'Not logged in' }, 401);
  await next();
};
