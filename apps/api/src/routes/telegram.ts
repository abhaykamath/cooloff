import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { bot } from '../bot/bot';
import { env } from '../env';

/**
 * Only call in webhook mode — creating the handler puts grammY in webhook mode, after which
 * bot.start() (polling) refuses to run.
 * Telegram sends X-Telegram-Bot-Api-Secret-Token; grammY rejects requests without the right one.
 */
export function telegramWebhook() {
  return new Hono().post('/', webhookCallback(bot, 'hono', { secretToken: env.TELEGRAM_WEBHOOK_SECRET }));
}
