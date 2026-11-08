import { env } from '../env';
import { bot } from './bot';

/**
 * Point Telegram at <baseUrl>/telegram/webhook. Idempotent — safe to call on every boot, which also
 * repairs the webhook if local polling ever deleted it.
 */
export async function registerWebhook(baseUrl: string) {
  const url = new URL('/telegram/webhook', baseUrl).toString();
  if (!url.startsWith('https://')) throw new Error(`Telegram webhooks need https, got ${url}`);

  await bot.api.setWebhook(url, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
  });
  return bot.api.getWebhookInfo();
}
