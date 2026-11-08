/**
 * Replies to an item message: a leading number is the price, anything after is the reason.
 *   "2999"                      → price 2999
 *   "₹1,499 old ones broke"     → price 1499, reason "old ones broke"
 *   "3.5k - for the trip"       → price 3500, reason "for the trip"
 *   "I need it for running"     → reason only
 */
export function parseReply(text: string): { price?: number; reason?: string } {
  const t = text.trim();
  const m = t.match(/^(?:₹|rs\.?|inr|\$|€|£)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?(?=\s|$|[-–—:,.])\s*[-–—:,.]?\s*([\s\S]*)$/i);
  if (!m) return { reason: t.slice(0, 500) };

  const base = Number.parseFloat(m[1]!.replace(/,/g, ''));
  const price = m[2] ? base * 1000 : base;
  const reason = m[3]?.trim();
  return {
    price: Number.isFinite(price) ? Math.round(price * 100) / 100 : undefined,
    reason: reason ? reason.slice(0, 500) : undefined,
  };
}
