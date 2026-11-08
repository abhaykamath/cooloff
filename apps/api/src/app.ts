import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { telegramMode } from './env';
import { requireSession } from './middleware/session';
import { auth } from './routes/auth';
import { health } from './routes/health';
import { items } from './routes/items';
import { stats } from './routes/stats';
import { telegramWebhook } from './routes/telegram';

export const app = new Hono();

app.use(logger());
app.use(secureHeaders());

app.route('/health', health);
if (telegramMode === 'webhook') app.route('/telegram/webhook', telegramWebhook());

// Dashboard API — reached via the Netlify /api/* proxy (Vite proxy in dev), so cookies are first-party.
const api = new Hono()
  .use(bodyLimit({ maxSize: 64 * 1024 }))
  .use(async (c, next) => (c.req.path === '/api/auth/login' ? next() : requireSession(c, next)))
  .route('/auth', auth)
  .route('/items', items)
  .route('/stats', stats);

app.route('/api', api);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export type AppType = typeof app;
