import { Bot, GrammyError, type Context } from 'grammy';
import type { BotCommand } from 'grammy/types';
import type { ItemRow } from '@cb/shared';
import { env } from '../env';
import { extractUrl } from '../lib/url';
import {
  applyDecision,
  findByTelegramMessageId,
  findRecentCooling,
  getStats,
  ingestLink,
  listItems,
  updateItem,
} from '../services/items';
import { renderItem, renderList, renderStats, type Rendered } from './render';
import { parseReply } from './parse-reply';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

export const COMMANDS: BotCommand[] = [
  { command: 'list', description: "What's cooling and what's unlocked" },
  { command: 'saved', description: 'Total money saved' },
  { command: 'help', description: 'How this works' },
];

const HELP = [
  '👋 <b>Impulse Buying Circuit Breaker</b>',
  '',
  'Feel like buying something? Share the product link here instead of adding it to your cart.',
  "I'll lock it for 48 hours, then ask if you still want it.",
  '',
  '💬 Right after sharing, send a price (e.g. <code>2999</code>) and/or why you want it.',
  '/list — what is cooling and what is unlocked',
  '/saved — money saved so far',
].join('\n');

// ── Owner lock: everything below only runs for TELEGRAM_OWNER_CHAT_ID ──────────────
bot.use(async (ctx, next) => {
  if (ctx.chat?.id === env.TELEGRAM_OWNER_CHAT_ID) return next();
  if (ctx.chat && ctx.message?.text?.startsWith('/start')) {
    await ctx.reply(`🔒 This is a private bot.\nYour chat id: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' });
  }
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
});

// ── Commands ─────────────────────────────────────────────────────────────────────
bot.command(['start', 'help'], (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));

bot.command('list', async (ctx) => {
  const items = await listItems(['cooling', 'unlocked']);
  await ctx.reply(
    renderList(
      items.filter((i) => i.status === 'cooling'),
      items.filter((i) => i.status === 'unlocked'),
    ),
    { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
  );
});

bot.command('saved', async (ctx) => {
  await ctx.reply(renderStats(await getStats()), { parse_mode: 'HTML' });
});

// ── Buy / Drop buttons ──────────────────────────────────────────────────────────
bot.callbackQuery(/^(buy|drop):([0-9a-f-]{36})$/, async (ctx) => {
  const decision = ctx.match[1] === 'buy' ? 'purchased' : 'dropped';
  const result = await applyDecision(ctx.match[2]!, decision);

  if (!result.ok) {
    const text =
      result.reason === 'not_found'
        ? 'That item no longer exists.'
        : result.reason === 'needs_broke_cooldown'
          ? 'Still cooling — Buy unlocks when the timer ends.'
          : 'Already decided.';
    await ctx.answerCallbackQuery({ text });
    if (result.reason !== 'not_found') await editMessage(ctx, renderItem(result.item));
    return;
  }

  const stats = decision === 'dropped' ? await getStats() : undefined;
  await ctx.answerCallbackQuery({ text: decision === 'dropped' ? 'Dropped 💪' : 'Enjoy it 🛍️' });
  await editMessage(ctx, renderItem(result.item, { stats }));
});

bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery());

// ── Links and replies ───────────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
  const text = ctx.msg.text ?? ctx.msg.caption ?? '';
  const url = extractUrl(text, ctx.msg.entities ?? ctx.msg.caption_entities);
  if (url) return handleLink(ctx, url);

  if (!text.trim()) return;

  const repliedTo = ctx.msg.reply_to_message;
  if (repliedTo && repliedTo.from?.id === ctx.me.id) {
    const item = await findByTelegramMessageId(repliedTo.message_id);
    if (item) return annotate(ctx, item, text);
    return ctx.reply("I couldn't match that reply to an item. Reply to the message that shows the item.");
  }

  // Plain text right after saving a link: attach it to that item (nobody remembers to use "reply").
  const recent = await findRecentCooling(RECENT_ITEM_MINUTES);
  if (recent) return annotate(ctx, recent, text);

  await ctx.reply('Send me a product link to start a cool-down. /list shows what is cooling.');
});

const RECENT_ITEM_MINUTES = 30;

async function handleLink(ctx: Context, url: string) {
  const ack = await ctx.reply('⏳ Saving…', { reply_parameters: { message_id: ctx.msg!.message_id } });
  const chatId = ack.chat.id;

  // Don't block the update (webhook mode has a timeout) — fetch + save in the background, then edit the ack.
  void (async () => {
    try {
      const result = await ingestLink({ rawUrl: url, source: 'telegram', telegramMessageId: ack.message_id });
      let item = result.item;
      let prefix = '';
      if (result.kind === 'duplicate') {
        // Point replies at the newest message about this item.
        item = await updateItem(item.id, { telegram_message_id: ack.message_id });
        prefix = '↩️ <b>Already on your list.</b>\n\n';
      }
      const r = renderItem(item);
      await safeEdit(chatId, ack.message_id, { ...r, text: prefix + r.text });
    } catch (err) {
      console.error('ingest failed', url, err);
      await safeEdit(chatId, ack.message_id, {
        text: "⚠️ Couldn't save that link. Try sending it again.",
        link_preview_options: { is_disabled: true },
      });
    }
  })();
}

/** Apply a price and/or reason to an item, redraw its message, and 👍 the user's text. */
async function annotate(ctx: Context, item: ItemRow, text: string) {
  const { price, reason } = parseReply(text);
  const updated = await updateItem(item.id, {
    ...(price != null && { price, currency: item.currency ?? env.DEFAULT_CURRENCY }),
    ...(reason && { reason }),
  });

  if (updated.telegram_message_id) await safeEdit(ctx.chat!.id, updated.telegram_message_id, renderItem(updated));
  await ctx.react('👍').catch(() => {});
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
async function editMessage(ctx: Context, r: Rendered) {
  const msg = ctx.callbackQuery?.message;
  if (msg) await safeEdit(msg.chat.id, msg.message_id, r);
}

export async function safeEdit(chatId: number, messageId: number, r: Rendered) {
  try {
    await bot.api.editMessageText(chatId, messageId, r.text, {
      parse_mode: 'HTML',
      reply_markup: r.reply_markup,
      link_preview_options: r.link_preview_options,
    });
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes('message is not modified')) return;
    console.error('editMessageText failed', err);
  }
}

bot.catch(({ error, ctx }) => {
  console.error(`bot error on update ${ctx.update.update_id}:`, error);
});
