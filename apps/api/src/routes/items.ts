import { Hono } from 'hono';
import { z } from 'zod';
import { createItemSchema, decisionSchema, listItemsQuerySchema, updateItemSchema, type ItemRow } from '@cb/shared';
import { db } from '../lib/db';
import { env } from '../env';
import { validate } from '../lib/validate';
import { applyDecision, getItem, getStats, ingestLink, listItems, updateItem } from '../services/items';
import { safeEdit } from '../bot/bot';
import { renderItem } from '../bot/render';

const idParam = validate('param', z.object({ id: z.uuid() }));

/** Keep the item's Telegram message in sync with changes made from the dashboard. */
async function syncTelegram(item: ItemRow) {
  if (item.telegram_message_id == null) return;
  const stats = item.status === 'dropped' || item.status === 'expired' ? await getStats() : undefined;
  await safeEdit(env.TELEGRAM_OWNER_CHAT_ID, item.telegram_message_id, renderItem(item, { stats }));
}

export const items = new Hono()
  .get('/', validate('query', listItemsQuerySchema), async (c) => {
    return c.json(await listItems(c.req.valid('query').status));
  })

  .post('/', validate('json', createItemSchema), async (c) => {
    const body = c.req.valid('json');
    const result = await ingestLink({ rawUrl: body.url, source: 'web', ...body });
    if (result.kind === 'duplicate') {
      return c.json({ error: 'Already on your list', item: result.item }, 409);
    }
    return c.json(result.item, 201);
  })

  .get('/:id', idParam, async (c) => {
    const item = await getItem(c.req.valid('param').id);
    return item ? c.json(item) : c.json({ error: 'Not found' }, 404);
  })

  .patch('/:id', idParam, validate('json', updateItemSchema), async (c) => {
    const { id } = c.req.valid('param');
    if (!(await getItem(id))) return c.json({ error: 'Not found' }, 404);
    const updated = await updateItem(id, c.req.valid('json'));
    void syncTelegram(updated);
    return c.json(updated);
  })

  .post('/:id/decision', idParam, validate('json', decisionSchema), async (c) => {
    const { decision, brokeCooldown } = c.req.valid('json');
    const result = await applyDecision(c.req.valid('param').id, decision, { brokeCooldown });
    if (!result.ok) {
      if (result.reason === 'not_found') return c.json({ error: 'Not found' }, 404);
      const error =
        result.reason === 'needs_broke_cooldown'
          ? 'Still cooling. Confirm "bought it anyway" to mark it purchased.'
          : `Can't do that — this item is already ${result.item.status}.`;
      return c.json({ error, item: result.item }, 409);
    }
    void syncTelegram(result.item);
    return c.json(result.item);
  })

  .delete('/:id', idParam, async (c) => {
    const { data, error } = await db.from('items').delete().eq('id', c.req.valid('param').id).select('id');
    if (error) throw error;
    return data.length ? c.body(null, 204) : c.json({ error: 'Not found' }, 404);
  });
