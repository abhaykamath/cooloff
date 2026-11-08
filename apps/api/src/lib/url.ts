import type { MessageEntity } from 'grammy/types';

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

/** Pull the first link out of a Telegram message (shared text often wraps the URL in prose). */
export function extractUrl(text: string, entities: readonly MessageEntity[] = []): string | null {
  for (const e of entities) {
    if (e.type === 'text_link') return withScheme(e.url);
    // Entity offsets are UTF-16 code units — same as JS string indices.
    if (e.type === 'url') return withScheme(text.slice(e.offset, e.offset + e.length));
  }
  const match = text.match(URL_RE);
  return match ? withScheme(match[0].replace(/[).,;!?'"]+$/, '')) : null;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const TRACKING_PARAMS = new Set([
  'ref', 'ref_', 'tag', 'fbclid', 'gclid', 'igshid', 'si', 'smid', 'psc', 'th', 'linkcode', 'linkid',
  '_encoding', 'content-id', 'sr', 'qid', 'keywords', 'crid', 'sprefix', 'dib', 'dib_tag',
  'social_share', 'mc_cid', 'mc_eid', 'affid', 'affextparam1', 'affextparam2', 'srno', 'otracker',
  'otracker1', 'iid', 'ssid', 'lid', 'marketplace', 'store', 'spotlighttagid', 'fm', 'ppt', 'ppn',
  'cmpid', 'campaign', 'source', 'medium',
]);
const TRACKING_PREFIXES = ['utm_', 'pf_rd_', 'pd_rd_', 'sp_', '_branch', 'mc_'];

const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/;
const AMAZON_ASIN = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i;

/**
 * Canonical form used for duplicate detection: lowercase host, no fragment, no tracking params,
 * sorted query, no trailing slash. Amazon collapses to /dp/<ASIN>; Flipkart keeps only `pid`.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }

  const host = u.hostname.toLowerCase().replace(/^m\./, 'www.');
  u.hostname = host;
  u.hash = '';
  u.port = '';

  if (AMAZON_HOST.test(host)) {
    const asin = u.pathname.match(AMAZON_ASIN)?.[1];
    if (asin) return `https://${host}/dp/${asin.toUpperCase()}`;
  }

  if (host.endsWith('flipkart.com')) {
    const pid = u.searchParams.get('pid');
    u.search = pid ? `?pid=${encodeURIComponent(pid)}` : '';
    return stripTrailingSlash(u);
  }

  const kept = [...u.searchParams.entries()]
    .filter(([k]) => {
      const key = k.toLowerCase();
      return !TRACKING_PARAMS.has(key) && !TRACKING_PREFIXES.some((p) => key.startsWith(p));
    })
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(kept).toString();

  return stripTrailingSlash(u);
}

function stripTrailingSlash(u: URL): string {
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
