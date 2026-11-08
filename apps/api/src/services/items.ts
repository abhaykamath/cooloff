import {
  ACTIVE_STATUSES,
  ITEM_STATUSES,
  SAVED_STATUSES,
  canDecide,
  type Decision,
  type ItemInsert,
  type ItemRow,
  type ItemSource,
  type ItemStatus,
  type ItemUpdate,
} from '@cb/shared';
import { db } from '../lib/db';
import { env } from '../env';
import { fetchPage, parseMetadata, type PageMeta } from '../lib/metadata';
import { hostname, normalizeUrl } from '../lib/url';

export type IngestInput = {
  rawUrl: string;
  source: ItemSource;
  price?: number;
  currency?: string;
  reason?: string;
  telegramMessageId?: number;
};

export type IngestResult = { kind: 'created'; item: ItemRow } | { kind: 'duplicate'; item: ItemRow };

/**
 * Fetch the page (resolves short links + gives metadata), dedupe on the normalized URL,
 * then insert. Never throws on scrape failure — falls back to the domain as title.
 */
export async function ingestLink(input: IngestInput): Promise<IngestResult> {
  const page = await fetchPage(input.rawUrl);
  const url = page.finalUrl;
  const normalized = normalizeUrl(url);

  const existing = await findActiveByNormalizedUrl(normalized);
  if (existing) return { kind: 'duplicate', item: existing };

  let meta: PageMeta = {};
  if (page.html) {
    meta = await parseMetadata(page.html, url).catch((err) => {
      console.warn('metadata parse failed', url, err);
      return {};
    });
  }

  const row: ItemInsert = {
    url,
    normalized_url: normalized,
    title: meta.title ?? hostname(url),
    site_name: meta.siteName ?? hostname(url),
    image_url: meta.imageUrl ?? null,
    price: input.price ?? meta.price ?? null,
    currency: input.currency ?? meta.currency ?? env.DEFAULT_CURRENCY,
    reason: input.reason?.trim() || null,
    source: input.source,
    cooldown_hours: env.COOLDOWN_HOURS,
    enrichment_status: meta.title ? 'done' : 'failed',
    telegram_message_id: input.telegramMessageId ?? null,
  };

  const { data, error } = await db.from('items').insert(row).select().single();
  if (error?.code === '23505') {
    // Lost a race with a concurrent save of the same link.
    const dup = await findActiveByNormalizedUrl(normalized);
    if (dup) return { kind: 'duplicate', item: dup };
  }
  if (error) throw error;
  return { kind: 'created', item: data };
}

export async function findActiveByNormalizedUrl(normalized: string): Promise<ItemRow | null> {
  const { data, error } = await db
    .from('items')
    .select()
    .eq('normalized_url', normalized)
    .in('status', [...ACTIVE_STATUSES])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getItem(id: string): Promise<ItemRow | null> {
  const { data, error } = await db.from('items').select().eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function findByTelegramMessageId(messageId: number): Promise<ItemRow | null> {
  const { data, error } = await db
    .from('items')
    .select()
    .eq('telegram_message_id', messageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The newest still-cooling item saved within `withinMinutes` — target for plain (non-reply) text. */
export async function findRecentCooling(withinMinutes: number): Promise<ItemRow | null> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const { data, error } = await db
    .from('items')
    .select()
    .eq('status', 'cooling')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateItem(id: string, patch: ItemUpdate): Promise<ItemRow> {
  const { data, error } = await db.from('items').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function listItems(statuses: readonly ItemStatus[] = ITEM_STATUSES): Promise<ItemRow[]> {
  const { data, error } = await db
    .from('items')
    .select()
    .in('status', [...statuses])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type DecisionResult =
  | { ok: true; item: ItemRow }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_transition' | 'needs_broke_cooldown'; item: ItemRow };

/** Apply Buy/Drop, enforcing PRD §3. Conditional on the current status so concurrent taps can't double-apply. */
export async function applyDecision(
  id: string,
  decision: Decision,
  opts: { brokeCooldown?: boolean } = {},
): Promise<DecisionResult> {
  const item = await getItem(id);
  if (!item) return { ok: false, reason: 'not_found' };
  if (!canDecide(item.status, decision)) return { ok: false, reason: 'invalid_transition', item };

  const breaking = item.status === 'cooling' && decision === 'purchased';
  if (breaking && !opts.brokeCooldown) return { ok: false, reason: 'needs_broke_cooldown', item };

  const { data, error } = await db
    .from('items')
    .update({ status: decision, decided_at: new Date().toISOString(), broke_cooldown: breaking })
    .eq('id', id)
    .eq('status', item.status)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const fresh = await getItem(id);
    return fresh ? { ok: false, reason: 'invalid_transition', item: fresh } : { ok: false, reason: 'not_found' };
  }
  return { ok: true, item: data };
}

export type Stats = {
  saved: Record<string, number>;
  spent: Record<string, number>;
  counts: Record<ItemStatus, number>;
  brokeCooldown: number;
  unpriced: number;
};

export async function getStats(): Promise<Stats> {
  const { data, error } = await db.from('items').select('status, price, currency, broke_cooldown');
  if (error) throw error;

  const stats: Stats = {
    saved: {},
    spent: {},
    counts: Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0])) as Record<ItemStatus, number>,
    brokeCooldown: 0,
    unpriced: 0,
  };
  const saved: readonly ItemStatus[] = SAVED_STATUSES;

  for (const row of data) {
    stats.counts[row.status]++;
    if (row.broke_cooldown) stats.brokeCooldown++;
    if (row.price == null) {
      stats.unpriced++;
      continue;
    }
    const cur = row.currency ?? env.DEFAULT_CURRENCY;
    const bucket = saved.includes(row.status) ? stats.saved : row.status === 'purchased' ? stats.spent : null;
    if (bucket) bucket[cur] = (bucket[cur] ?? 0) + Number(row.price);
  }
  return stats;
}
