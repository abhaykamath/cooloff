// Registers the production webhook with Telegram. Run once after deploying:
//   pnpm --filter api tg:webhook        (with PUBLIC_API_URL pointing at Render)
import { bot, COMMANDS } from '../bot/bot';
import { env } from '../env';

const url = new URL('/telegram/webhook', env.PUBLIC_API_URL).toString();
if (!url.startsWith('https://')) {
  console.error(`Telegram webhooks need https. PUBLIC_API_URL is ${env.PUBLIC_API_URL}`);
  process.exit(1);
}

await bot.api.setWebhook(url, {
  secret_token: env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
});
await bot.api.setMyCommands(COMMANDS);

const info = await bot.api.getWebhookInfo();
console.log(`✅ Webhook set: ${info.url} (pending updates: ${info.pending_update_count})`);
