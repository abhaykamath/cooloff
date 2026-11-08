// Pure formatters shared by the bot and the dashboard.

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** "1d 23h", "5h 12m", "40m", "any minute now". */
export function timeLeft(iso: string, now = Date.now()): string {
  const mins = Math.ceil((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return 'any minute now';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Store titles (Amazon especially) run 150+ chars. Cut at the first spec separator, then hard-cap. */
export function shortTitle(title: string, max = 70): string {
  const cut = title.split(/\s+(?:with|for)\s+|\s*[,|([]\s*|\s+[-–—]\s+/i)[0]!.trim();
  const t = cut.length >= 12 ? cut : title;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
