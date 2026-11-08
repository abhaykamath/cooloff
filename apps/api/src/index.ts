import { serve } from '@hono/node-server';
import { env, telegramMode } from './env';
import { app } from './app';
import { bot, COMMANDS } from './bot/bot';
import { startScheduler } from './scheduler';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

await bot.init();
await bot.api.setMyCommands(COMMANDS).catch((err) => console.warn('setMyCommands failed', err));

if (telegramMode === 'polling') {
  // bot.start() removes any webhook and long-polls. Not awaited: it resolves only when the bot stops.
  void bot.start({ onStart: (me) => console.log(`Bot @${me.username} polling for updates`) });
} else {
  console.log(`Bot @${bot.botInfo.username} in webhook mode (POST /telegram/webhook)`);
}

const scheduler = startScheduler();

async function shutdown() {
  await scheduler.stop();
  if (bot.isRunning()) await bot.stop();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
