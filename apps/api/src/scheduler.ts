import cron from 'node-cron';
import type { ItemRow } from '@cb/shared';
import { db } from './lib/db';
import { env } from './env';
import { bot, safeEdit } from './bot/bot';
import { renderItem } from './bot/render';

/**
 * One scheduler pass (PRD §7.2). Every step is idempotent, so it is safe to run on boot,
 * every 15 min, and overlapping with a previous run.
 */
export async function tick(): Promise<void> {
  const unlocked = await unlockDue();
  const notified = await notifyPending();
  const expired = await expireIgnored();
  if (unlocked || notified || expired) {
    console.log(`[tick] unlocked ${unlocked} · notified ${notified} · expired ${expired}`);
  }
}

/** cooling → unlocked. A single UPDATE … RETURNING, so concurrent ticks can't both claim a row. */
async function unlockDue(): Promise<number> {
  const { data, error } = await db
    .from('items')
    .update({ status: 'unlocked', unlocked_at: new Date().toISOString() })
    .eq('status', 'cooling')
    .lte('unlocks_at', new Date().toISOString())
    .select('id');
  if (error) throw error;
  return data.length;
}

/**
 * Send the Buy/Drop alert for unlocked items not yet notified. notified_at is set only after
 * Telegram accepts the message, so a failed send is retried next tick.
 */
async function notifyPending(): Promise<number> {
  const { data, error } = await db
    .from('items')
    .select()
    .eq('status', 'unlocked')
    .is('notified_at', null)
    .order('unlocked_at')
    .limit(20);
  if (error) throw error;

  let sent = 0;
  for (const item of data) {
    try {
      const r = renderItem(item);
      const msg = await bot.api.sendMessage(env.TELEGRAM_OWNER_CHAT_ID, r.text, {
        parse_mode: 'HTML',
        reply_markup: r.reply_markup,
        link_preview_options: r.link_preview_options,
      });
      // Point replies (price/reason edits) and the expiry edit at the alert message.
      await db
        .from('items')
        .update({ notified_at: new Date().toISOString(), telegram_message_id: msg.message_id })
        .eq('id', item.id);
      sent++;
    } catch (err) {
      console.error(`[tick] alert failed for ${item.id}, will retry`, err);
    }
  }
  return sent;
}

/** unlocked for EXPIRE_AFTER_DAYS with no decision → expired; redraw the alert without buttons. */
async function expireIgnored(): Promise<number> {
  const cutoff = new Date(Date.now() - env.EXPIRE_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from('items')
    .update({ status: 'expired', decided_at: new Date().toISOString() })
    .eq('status', 'unlocked')
    .lt('unlocked_at', cutoff)
    .select();
  if (error) throw error;

  await Promise.all(
    data
      .filter((i): i is ItemRow & { telegram_message_id: number } => i.telegram_message_id != null)
      .map((i) => safeEdit(env.TELEGRAM_OWNER_CHAT_ID, i.telegram_message_id, renderItem(i))),
  );
  return data.length;
}

async function safeTick() {
  try {
    await tick();
  } catch (err) {
    console.error('[tick] failed', err);
  }
}

/** Run once now (catch up after Render sleeps / restarts), then every 15 minutes. */
export function startScheduler() {
  void safeTick();
  return cron.schedule('*/15 * * * *', safeTick, { name: 'tick', noOverlap: true });
}
