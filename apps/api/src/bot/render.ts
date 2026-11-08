import { InlineKeyboard } from 'grammy';
import type { LinkPreviewOptions } from 'grammy/types';
import { shortTitle, type ItemRow } from '@cb/shared';
import { env } from '../env';
import { escapeHtml, formatDateTime, formatMoney, timeLeft } from '../lib/format';
import type { Stats } from '../services/items';

export type Rendered = {
  text: string;
  reply_markup?: InlineKeyboard;
  link_preview_options: LinkPreviewOptions;
};

function titleLink(item: ItemRow): string {
  return `<a href="${escapeHtml(item.url)}">${escapeHtml(shortTitle(item.title ?? item.url))}</a>`;
}

function priceOf(item: ItemRow): string | null {
  return item.price == null ? null : formatMoney(Number(item.price), item.currency ?? env.DEFAULT_CURRENCY);
}

function reasonLine(item: ItemRow, prefix: string): string | null {
  return item.reason ? `${prefix} <i>“${escapeHtml(item.reason)}”</i>` : null;
}

const preview = (item: ItemRow): LinkPreviewOptions => ({ url: item.url, prefer_small_media: true });
const noPreview: LinkPreviewOptions = { is_disabled: true };

/** One renderer for every status, so any message about an item can be re-drawn from DB state. */
export function renderItem(item: ItemRow, opts: { stats?: Stats } = {}): Rendered {
  const price = priceOf(item);
  const head = `${titleLink(item)}${price ? ` — <b>${price}</b>` : ''}`;

  switch (item.status) {
    case 'cooling': {
      const hint =
        item.price == null
          ? '💬 <i>Send the price (e.g. 2999) and, optionally, why you want it.</i>'
          : !item.reason
            ? '💬 <i>Why do you want it? Just type it.</i>'
            : null;
      const lines = [
        `🔒 ${head}`,
        `Unlocks <b>${formatDateTime(item.unlocks_at)}</b> (in ${timeLeft(item.unlocks_at)})`,
        reasonLine(item, '💭'),
        hint && `\n${hint}`,
      ];
      return {
        text: lines.filter(Boolean).join('\n'),
        reply_markup: new InlineKeyboard().text('❌ Drop it now', `drop:${item.id}`),
        link_preview_options: noPreview,
      };
    }
    case 'unlocked':
      return {
        text: [`🔓 <b>Cool-down over</b>`, head, reasonLine(item, 'You said:'), '', 'Still want it?']
          .filter((l) => l !== null)
          .join('\n'),
        reply_markup: new InlineKeyboard().text('✅ Buy', `buy:${item.id}`).text('❌ Drop', `drop:${item.id}`),
        link_preview_options: preview(item),
      };
    case 'purchased':
      return {
        text: `🛍️ <b>Bought</b> · ${head}${item.broke_cooldown ? '\n<i>Before the cool-down ended.</i>' : ''}`,
        link_preview_options: noPreview,
      };
    case 'dropped':
    case 'expired': {
      const label = item.status === 'dropped' ? '❌ <b>Dropped</b>' : '⌛ <b>Expired</b>';
      const note = item.status === 'expired' ? '\n<i>You never came back for it — counts as saved.</i>' : '';
      const cur = item.currency ?? env.DEFAULT_CURRENCY;
      const total = opts.stats?.saved[cur];
      const savedLine = total ? `\n💰 Saved so far: <b>${formatMoney(total, cur)}</b>` : '';
      return { text: `${label} · ${head}${note}${savedLine}`, link_preview_options: noPreview };
    }
  }
}

export function renderList(cooling: ItemRow[], unlocked: ItemRow[]): string {
  if (!cooling.length && !unlocked.length) {
    return 'Nothing cooling right now. Share a product link here to start a cool-down.';
  }
  const line = (i: ItemRow, suffix: string) => {
    const price = priceOf(i);
    return `• ${titleLink(i)}${price ? ` — ${price}` : ''} · ${suffix}`;
  };
  const sections: string[] = [];
  if (unlocked.length) {
    sections.push(`🔓 <b>Ready to decide (${unlocked.length})</b>\n${unlocked.map((i) => line(i, 'unlocked')).join('\n')}`);
  }
  if (cooling.length) {
    const sorted = [...cooling].sort((a, b) => a.unlocks_at.localeCompare(b.unlocks_at));
    sections.push(
      `🔒 <b>Cooling (${cooling.length})</b>\n${sorted.map((i) => line(i, `${timeLeft(i.unlocks_at)} left`)).join('\n')}`,
    );
  }
  return sections.join('\n\n');
}

export function renderStats(stats: Stats): string {
  const money = (m: Record<string, number>) =>
    Object.entries(m)
      .map(([cur, amt]) => formatMoney(amt, cur))
      .join(' + ') || formatMoney(0, env.DEFAULT_CURRENCY);
  const c = stats.counts;
  const lines = [
    `💰 <b>Saved: ${money(stats.saved)}</b>`,
    `🛍️ Spent: ${money(stats.spent)}`,
    '',
    `❌ Dropped ${c.dropped} · ⌛ Expired ${c.expired} · 🛍️ Bought ${c.purchased}`,
    `🔒 Cooling ${c.cooling} · 🔓 Waiting on you ${c.unlocked}`,
  ];
  if (stats.brokeCooldown) lines.push(`⚡ Broke the cool-down ${stats.brokeCooldown}×`);
  if (stats.unpriced) lines.push(`\n<i>${stats.unpriced} item(s) have no price and aren't counted.</i>`);
  return lines.join('\n');
}
