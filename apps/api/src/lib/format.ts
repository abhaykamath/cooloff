import { env } from '../env';

export { formatMoney, timeLeft } from '@cb/shared';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "Tue, 10 Nov · 9:40 PM" in the configured timezone. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: env.TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: env.TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${parts.weekday}, ${parts.day} ${parts.month} · ${time}`;
}

