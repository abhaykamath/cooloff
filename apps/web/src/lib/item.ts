import { formatMoney, type ItemRow } from '@cb/shared';

export const DEFAULT_CURRENCY = 'INR';

export function itemPrice(item: ItemRow): string | null {
  return item.price == null ? null : formatMoney(Number(item.price), item.currency ?? DEFAULT_CURRENCY);
}

/** 0 → just saved (hot), 1 → cool-down over (cold). */
export function coolProgress(item: ItemRow, now: number): number {
  const start = Date.parse(item.created_at);
  const end = Date.parse(item.unlocks_at);
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Sum a per-currency map into display text: "₹41,480" or "₹41,480 + $100". */
export function moneyText(m: Record<string, number>, fallbackCurrency = DEFAULT_CURRENCY): string {
  const parts = Object.entries(m).filter(([, v]) => v > 0);
  return parts.length ? parts.map(([c, v]) => formatMoney(v, c)).join(' + ') : formatMoney(0, fallbackCurrency);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
