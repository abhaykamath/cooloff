import ogs from 'open-graph-scraper';
import { hostname } from './url';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export type FetchedPage = { finalUrl: string; html: string | null };

export type PageMeta = {
  title?: string;
  siteName?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
};

/**
 * Fetch a product page. Follows redirects (resolves short links like amzn.in / fkrt.it) even
 * when the final page blocks us — `finalUrl` is still useful for dedupe.
 */
export async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-IN,en;q=0.9',
      },
    });
    const finalUrl = res.url || url;
    const isHtml = (res.headers.get('content-type') ?? '').includes('html');
    if (!res.ok || !isHtml) return { finalUrl, html: null };
    return { finalUrl, html: await res.text() };
  } catch {
    return { finalUrl: url, html: null };
  }
}

export async function parseMetadata(html: string, pageUrl: string): Promise<PageMeta> {
  const { result } = await ogs({
    html,
    // Don't fall back to "first <img> on the page" — on stores that's usually a logo or sprite.
    onlyGetOpenGraphInfo: ['image'],
    customMetaTags: [
      { multiple: false, property: 'product:price:amount', fieldName: 'productPriceAmount' },
      { multiple: false, property: 'product:price:currency', fieldName: 'productPriceCurrency' },
    ],
  });
  const custom = result as typeof result & { productPriceAmount?: string; productPriceCurrency?: string };

  const fromJsonLd = priceFromJsonLd(result.jsonLD);
  const metaAmount = toNumber(custom.productPriceAmount ?? result.ogPriceAmount);
  const fromMeta =
    metaAmount != null
      ? { price: metaAmount, currency: custom.productPriceCurrency ?? result.ogPriceCurrency }
      : null;
  const price = fromJsonLd ?? fromMeta ?? priceFromHtml(html);

  const image = result.ogImage?.[0]?.url ?? imageFromHtml(html);

  return {
    title: cleanTitle(result.ogTitle) ?? undefined,
    siteName: result.ogSiteName?.trim() || hostname(pageUrl),
    imageUrl: image ? absolutize(image, pageUrl) : undefined,
    price: price?.price,
    currency: normalizeCurrency(price?.currency),
  };
}

type Price = { price: number; currency?: string };

/** Depth-first search through JSON-LD for a Product/Offer price. Handles @graph, arrays, AggregateOffer. */
function priceFromJsonLd(nodes: unknown): Price | null {
  if (!nodes || typeof nodes !== 'object') return null;
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      const p = priceFromJsonLd(n);
      if (p) return p;
    }
    return null;
  }
  const node = nodes as Record<string, unknown>;
  const types = ([] as unknown[]).concat(node['@type'] ?? []).map(String);

  if (types.some((t) => /Offer$/.test(t))) {
    const p = priceFromOffer(node);
    if (p) return p;
  }
  for (const key of ['offers', '@graph', 'mainEntity', 'itemListElement']) {
    const p = priceFromJsonLd(node[key]);
    if (p) return p;
  }
  return null;
}

function priceFromOffer(o: Record<string, unknown>): Price | null {
  const spec = ([] as unknown[]).concat(o.priceSpecification ?? [])[0] as Record<string, unknown> | undefined;
  const amount = toNumber(o.price ?? o.lowPrice ?? spec?.price);
  if (amount == null) return null;
  const currency = (o.priceCurrency ?? spec?.priceCurrency) as string | undefined;
  return { price: amount, currency };
}

/** Last-resort scraping: schema.org microdata, then Amazon's price markup. */
function priceFromHtml(html: string): Price | null {
  const itemprop = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const itempropAmount = toNumber(itemprop);
  if (itempropAmount != null) {
    const cur = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    return { price: itempropAmount, currency: cur };
  }
  const whole = toNumber(html.match(/class="a-price-whole">([\d,]+)/)?.[1]);
  if (whole != null) {
    const symbol = html.match(/class="a-price-symbol">([^<]+)</)?.[1];
    return { price: whole, currency: symbol };
  }
  return null;
}

/** Amazon has no og:image; its main product photo is #landingImage (hi-res URL in data-old-hires). */
function imageFromHtml(html: string): string | undefined {
  const tag = html.match(/<img[^>]*id=["']landingImage["'][^>]*>/i)?.[0];
  if (!tag) return undefined;
  const attr = (name: string) => tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1];
  const url = attr('data-old-hires') || attr('src');
  return url?.startsWith('http') ? url : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  let s = value.replace(/[^\d.,]/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.299,00
  else s = s.replace(/,/g, '');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const SYMBOLS: Record<string, string> = { '₹': 'INR', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

function normalizeCurrency(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const t = c.trim();
  if (SYMBOLS[t]) return SYMBOLS[t];
  return /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : undefined;
}

function cleanTitle(title: string | undefined): string | null {
  if (!title) return null;
  const t = title
    .replace(/^Amazon\.[a-z.]+\s*:\s*(Buy\s+)?/i, '')
    .replace(/\s*[:|–-]\s*Amazon\.[a-z.]+.*$/i, '')
    .replace(/\s*(Online at (Best|Low) Prices?.*|\|\s*Flipkart\.com)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? t.slice(0, 300) : null;
}

function absolutize(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).toString();
  } catch {
    return undefined;
  }
}
