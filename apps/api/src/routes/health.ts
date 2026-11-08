import { Hono } from 'hono';

// Keep-alive target: no auth, no DB call — must stay fast and cheap.
export const health = new Hono().get('/', (c) => c.json({ ok: true, uptime: Math.round(process.uptime()) }));
