// Manually (re-)register the webhook. Not needed on Render — the server does this on boot.
//   PUBLIC_API_URL=https://your-api.example.com pnpm --filter api tg:webhook
import { bot, COMMANDS } from '../bot/bot';
import { registerWebhook } from '../bot/webhook';
import { publicApiUrl } from '../env';

if (!publicApiUrl) {
  console.error('Set PUBLIC_API_URL to the deployed API (https://…) first.');
  process.exit(1);
}

const info = await registerWebhook(publicApiUrl);
await bot.api.setMyCommands(COMMANDS);
console.log(`✅ Webhook set: ${info.url} (pending updates: ${info.pending_update_count})`);
