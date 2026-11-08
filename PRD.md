# Impulse Buying Circuit Breaker — PRD v1

Personal, single-user app. Status: **Draft v1** · Updated 2026-11-08

---

## 1. Overview

When I feel like buying something online, instead of adding it to the cart I **share the link** to my Telegram bot (or paste it into the dashboard). The item enters a **48-hour cool-down**. When the timer ends, I get a Telegram alert with **[✅ Buy] [❌ Drop]** buttons. A web dashboard shows everything that is cooling, ready to decide, and decided, along with a **money saved** total.

The app cannot block a purchase. It works by adding friction and reflection: a delay, plus my own "why do I want this?" note shown back to me when the item unlocks.

### Goals
- Saving a link takes about 3 taps from any shopping app on Android, iOS or macOS.
- An unlock alert never goes missing, even if the backend was asleep.
- An honest "money saved" number.

### Non-goals (v1)
- Multiple users, sign-up, onboarding
- WhatsApp integration (Business API approval, templates and per-conversation cost are not worth it for one user)
- Browser extension, price tracking, actually blocking checkout
- Automated tests

---

## 2. User flows

### 2.1 Save a link (Telegram, works on all devices)
1. In a shopping app or browser: **Share → Telegram → my bot → Send**.
2. The bot replies right away: `⏳ Saved — fetching details…`
3. The backend fetches the title, price and image in the background, then **edits** that message:
   ```
   ✅ Sony WH-1000XM5 — ₹29,990
   🔒 Unlocks Tue, 10 Nov · 9:40 PM
   Reply to this message with why you want it.
   ```
4. If no price was found, the message asks instead: `Reply with the price (e.g. 2999) and, optionally, why you want it.`
5. My next plain message (within 30 minutes, while the item is cooling), or a Telegram reply to the item's message at any time, is parsed as follows. A leading number is the price; any remaining text is the reason.

### 2.2 Save a link (dashboard)
Paste a URL into the "Add link" box, with optional price and reason. The rest is the same as above.

### 2.3 Unlock and decide
1. The scheduler sees that `unlocks_at` has passed, sets the item to `unlocked`, and sends:
   ```
   🔓 Cool-down over: Sony WH-1000XM5 — ₹29,990
   You said: "old ones broke, commute is loud"
   Still want it?
   [✅ Buy]  [❌ Drop]
   ```
2. Tapping a button records the decision and edits the message: `❌ Dropped. You've saved ₹41,480 so far.`
3. The same decision can be made from the dashboard.

### 2.4 Early exits
- **Drop while cooling:** allowed at any time ("changed my mind").
- **"I bought it anyway":** allowed while cooling, behind a confirmation. The item is recorded as `purchased` with `broke_cooldown = true`. The data stays honest without needing a lecture.

### 2.5 Ignored items
If an item stays `unlocked` for **7 days** with no decision, it becomes `expired`. Forgetting you wanted something counts as a win.

---

## 3. Status lifecycle

```
            ┌──────── drop ────────┐
            │                      ▼
 [cooling] ─┼── unlocks_at ──► [unlocked] ── buy ──► [purchased]
            │                      │  └──── drop ──► [dropped]
            │                      └─ 7 days ─────► [expired]
            └── "bought anyway" ─────────────────► [purchased] (broke_cooldown)
```

| From | Allowed to |
|---|---|
| cooling | unlocked (scheduler), dropped, purchased (broke_cooldown) |
| unlocked | purchased, dropped, expired (scheduler) |
| expired | purchased, dropped (late manual decision) |
| purchased / dropped | final |

**Money saved** = `sum(price)` where status is `dropped` or `expired`, grouped by currency. Items without a price are left out, and the dashboard shows a nudge: "3 items have no price".

---

## 4. Architecture

```
 Phone/Mac share sheet ──► Telegram ──webhook──┐
                                               ▼
 Dashboard (Netlify) ──/api/* proxy──► API (Render: Hono on Node) ──► Supabase Postgres
                                               │
                         node-cron (every 15m) │──► Telegram Bot API (alerts, message edits)
                         + catch-up on boot    │
                                               └──► Product pages (metadata fetch)

 cron-job.org ──► my keep-alive app ──► GET /health   (keeps the Render free tier awake)
```

- The **dashboard talks only to its own domain.** Netlify proxies `/api/*` to Render, so the session cookie is first-party and no CORS setup is needed.
- **Telegram calls Render directly** at `/telegram/webhook`.
- **Supabase is used as Postgres only.** The API reads and writes through supabase-js with the service-role key. No Supabase Auth, Storage or Edge Functions.

---

## 5. Tech stack

### Monorepo
pnpm workspaces.

```
.
├── apps/
│   ├── api/            # Hono backend
│   └── web/            # React dashboard
├── packages/
│   └── shared/         # Zod schemas, shared types, generated DB types
├── supabase/
│   └── migrations/     # SQL migrations (Supabase CLI)
├── pnpm-workspace.yaml
└── package.json
```

### API (`apps/api`)
| Purpose | Choice |
|---|---|
| Runtime | Node.js 22 + TypeScript |
| Framework | Hono + `@hono/node-server` |
| Validation | Zod + `@hono/zod-validator` |
| DB client | `@supabase/supabase-js` (typed via `supabase gen types`) |
| Telegram | grammY (webhook mode) |
| Scheduler | `node-cron` |
| Metadata | `open-graph-scraper` + JSON-LD (`Product` / `Offer`) parsing |
| Dev / build | `tsx watch` / `tsc --noEmit && tsup` |

tsup bundles `@cb/shared` into the output (`noExternal`), so Render only runs `node dist/index.js`.

### Web (`apps/web`)
| Purpose | Choice |
|---|---|
| UI | React 19 + Vite |
| Styling / components | Tailwind CSS v4 + shadcn/ui |
| Icons | Lucide React |
| Routing | React Router v7 |
| Server state | TanStack Query |
| Forms | React Hook Form + `@hookform/resolvers/zod` |

### Shared (`packages/shared`)
- Zod schemas for request bodies (used by `zod-validator` and React Hook Form)
- `database.types.ts` generated by the Supabase CLI
- Shared enums and constants (statuses, cool-down default, expiry window)

---

## 6. Data model

```sql
create type item_status as enum ('cooling', 'unlocked', 'purchased', 'dropped', 'expired');

create table items (
  id                   uuid primary key default gen_random_uuid(),
  url                  text not null,                 -- as received (after resolving short links)
  normalized_url       text not null,                 -- tracking params stripped; used for dedupe
  title                text,                          -- fallback: domain name
  site_name            text,
  image_url            text,
  price                numeric(12,2) check (price >= 0),
  currency             char(3),                       -- ISO 4217; fallback: DEFAULT_CURRENCY
  reason               text,                          -- "why do I want this?"
  status               item_status not null default 'cooling',
  cooldown_hours       int not null default 48 check (cooldown_hours > 0),
  created_at           timestamptz not null default now(),
  unlocks_at           timestamptz not null,          -- set by trigger
  unlocked_at          timestamptz,
  notified_at          timestamptz,                   -- set only after Telegram confirms the send
  decided_at           timestamptz,
  broke_cooldown       boolean not null default false,
  source               text not null check (source in ('telegram', 'web')),
  enrichment_status    text not null default 'pending'
                       check (enrichment_status in ('pending', 'done', 'failed')),
  telegram_message_id  bigint                          -- bot's confirmation msg; maps replies → item
);

-- unlocks_at = created_at + cooldown_hours (a generated column isn't allowed: timestamptz + interval is not immutable)
create function set_unlocks_at() returns trigger language plpgsql as $$
begin
  new.unlocks_at := new.created_at + make_interval(hours => new.cooldown_hours);
  return new;
end $$;

create trigger items_set_unlocks_at
  before insert on items for each row execute function set_unlocks_at();

create index items_cooling_due_idx on items (unlocks_at) where status = 'cooling';
create index items_unnotified_idx  on items (unlocked_at) where status = 'unlocked' and notified_at is null;
create index items_tg_msg_idx      on items (telegram_message_id);
create unique index items_active_url_uniq
  on items (normalized_url) where status in ('cooling', 'unlocked');

-- Only the API (service role) touches this table. RLS on with no policies = anon key gets nothing.
alter table items enable row level security;
```

**Dedupe:** if the same normalized URL is already cooling or unlocked, no new row is created. The bot replies `Already cooling — unlocks in 31h`.

**URL normalization:**
- Follow redirects so short links like `amzn.in` and `fkrt.it` resolve to the final URL.
- Lowercase the host.
- Drop `utm_*`, `ref`, `ref_`, `tag`, `fbclid`, `gclid` and the fragment.

---

## 7. Backend behaviour

### 7.1 Ingestion (shared by Telegram and the dashboard)
1. Pull the first URL out of the message. Shared text often looks like `"Check this out: <title> https://…"`, so use Telegram's `url` entities first and fall back to a regex.
2. **Telegram:** reply `⏳ Saving…` immediately; everything below runs in the background, then that message is edited.
3. Fetch the page with an **8 s timeout** and a browser-like User-Agent. Following redirects resolves short links (`amzn.in`, `fkrt.it`) even when the final page blocks us.
4. Normalize the final URL and check for duplicates.
5. Parse metadata:
   - title: `og:title`, then `<title>` (store suffixes like "Amazon.in: …" stripped)
   - image: `og:image`, then Amazon's `#landingImage` (never "first `<img>` on the page")
   - price and currency: JSON-LD `Offer.price` / `priceCurrency`, then `product:price:amount` meta tags, then `itemprop="price"`, then Amazon's price markup
6. Insert the row (`enrichment_status = done | failed`), with the domain as title if scraping failed. If there's no price, the message asks for it.

Stores often block scrapers. Failing gracefully (domain as title, plus asking for the price) is expected behaviour, not an error.

### 7.2 Scheduler: `tick()`
Runs on **every boot** and **every 15 minutes** (`node-cron`, `*/15 * * * *`). Every step is idempotent, so overlapping or catch-up runs are safe.

1. **Unlock:** one filtered update (a single SQL `UPDATE … RETURNING`, so it's atomic):
   `update items set status='unlocked', unlocked_at=now() where status='cooling' and unlocks_at <= now()`
2. **Notify:** select `status='unlocked' and notified_at is null`, send each Telegram alert, then set `notified_at`. A failed send is retried on the next tick.
3. **Expire:** `update items set status='expired' where status='unlocked' and unlocked_at < now() - interval '7 days'`

The running-on-boot behaviour means that if Render slept through an unlock time, the alert goes out as soon as the server wakes up.

### 7.3 Telegram bot
- **Webhook:** `POST /telegram/webhook`, verified with the `X-Telegram-Bot-Api-Secret-Token` header.
- **Owner lock:** updates from any chat other than `TELEGRAM_OWNER_CHAT_ID` are ignored. On `/start`, the bot replies with the sender's chat ID so it can be copied into the env var during setup.
- **Commands:**
  - `/start`: hello, plus the sender's chat ID
  - `/list`: what's cooling and what's unlocked, with time remaining
  - `/saved`: money-saved total
- **Callback data:** `buy:<uuid>` / `drop:<uuid>` (41 bytes, under Telegram's 64-byte limit). A decision is only applied if the transition is valid (§3). Stale buttons get the answer "Already decided".
- **Webhook registration:** one-off script, `pnpm --filter api tg:webhook`, which calls `setWebhook` with the URL and secret.
- **Modes:** `TELEGRAM_MODE=polling` (default in development) or `webhook` (default in production). ⚠️ Polling deletes the registered webhook, so don't run local polling against the live bot. Re-run `tg:webhook` after doing so, or use a separate dev bot.

### 7.4 Dashboard auth (single user)
- `POST /api/auth/login { password }`: timing-safe comparison against `DASHBOARD_PASSWORD`. On success it sets a signed cookie (`hono/cookie` `setSignedCookie`) with `HttpOnly`, `Secure`, `SameSite=Lax` and a 30-day lifetime.
- Middleware protects everything under `/api/*` except `/api/auth/login`.
- Basic login throttling: 5 failed attempts per IP within 15 minutes trigger a 15-minute lockout, tracked in memory.

---

## 8. API

All dashboard routes are under `/api` and need a session.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Keep-alive / uptime (no auth, no DB call) |
| POST | `/telegram/webhook` | Telegram updates (secret-token auth) |
| POST | `/api/auth/login` | `{ password }` → session cookie |
| POST | `/api/auth/logout` | Clear the cookie |
| GET | `/api/auth/me` | `200` if logged in, else `401` |
| GET | `/api/items?status=…` | List items, newest first; `status` accepts a comma-separated list |
| POST | `/api/items` | `{ url, price?, currency?, reason? }` → created item (or `409` + existing item if duplicate) |
| GET | `/api/items/:id` | Item detail |
| PATCH | `/api/items/:id` | Edit `title`, `price`, `currency`, `reason` |
| POST | `/api/items/:id/decision` | `{ decision: 'purchased' \| 'dropped', brokeCooldown?: boolean }`; validated against §3 |
| DELETE | `/api/items/:id` | Remove a mistaken entry |
| GET | `/api/stats` | `{ saved: {INR: 41480}, spent: {...}, counts: {cooling, unlocked, ...}, unpriced: 3 }` |

Request bodies are validated with schemas from `@cb/shared`.

---

## 9. Dashboard

Mobile-first, since it's used on the phone as much as the Mac. Light and dark themes.

| Route | Content |
|---|---|
| `/login` | Password field |
| `/` (Home) | **Money saved** hero number; **Add link** box; **Ready to decide** (unlocked items with Buy / Drop); **Cooling** (cards with image, title, price, live countdown, reason, "Drop" / "Bought anyway" in a menu) |
| `/history` | Purchased / Dropped / Expired, with a status filter and per-status totals |
| `/items/:id` | Detail: edit title, price, currency and reason; decision buttons; timeline (created → unlocked → decided) |

- TanStack Query refetches every 30 s and on window focus, so links saved from the phone show up on the Mac without a manual refresh.
- Countdowns tick on the client from `unlocks_at`.
- Items without a price show an inline "Add price" prompt.

---

## 10. Hosting and deployment

### Netlify (web)
`netlify.toml`:
```toml
[build]
  base    = "/"
  command = "pnpm --filter web build"
  publish = "apps/web/dist"

[[redirects]]
  from   = "/api/*"
  to     = "https://<render-service>.onrender.com/api/:splat"
  status = 200
  force  = true

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

### Render (api), free web service
- Build: `pnpm install --frozen-lockfile && pnpm --filter api build`
- Start: `pnpm --filter api start`
- Health check path: `/health`
- Kept awake by my external keep-alive app (cron-job.org → keep-alive app → `/health`, every 5 minutes).
- ⚠️ Render's free tier allows about **750 instance-hours per month per workspace, shared across all free services**. One always-on service uses roughly 720–744 hours. Keeping several free services awake in the same workspace will run out mid-month, so check current limits and host the keep-alive app elsewhere if needed. If the API does sleep, the catch-up tick on boot (§7.2) means no alert is lost, only delayed.

### Supabase
- Migrations live in `supabase/migrations`, applied with `supabase db push`.
- Types: `supabase gen types typescript --project-id <id> > packages/shared/src/database.types.ts`

### Environment variables (`apps/api`)
| Var | Purpose |
|---|---|
| `PORT` | Set by Render |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB access (server only) |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random string, checked on every webhook call |
| `TELEGRAM_OWNER_CHAT_ID` | My chat ID |
| `PUBLIC_API_URL` | Render URL, used for webhook registration |
| `DASHBOARD_URL` | Netlify URL, used for "Open dashboard" links in bot messages |
| `DASHBOARD_PASSWORD` | Login password |
| `SESSION_SECRET` | Cookie signing |
| `DEFAULT_CURRENCY` | e.g. `INR` |
| `TIMEZONE` | e.g. `Asia/Kolkata`; used for times in bot messages |
| `COOLDOWN_HOURS` | Default `48` |
| `EXPIRE_AFTER_DAYS` | Default `7` |

---

## 11. Non-functional requirements

| Requirement | Target |
|---|---|
| Telegram acknowledgement ("⏳ Saved") | < 2 s while the server is awake |
| Metadata enrichment | Finishes or gives up within 8 s |
| Unlock alert | Within 15 min of `unlocks_at` while awake; immediately on wake if the server slept |
| Duplicate alerts | None; `notified_at` is set only after a successful send, and the unlock step is a single atomic update |
| Data access | Service-role key only on the server; RLS blocks the anon key |

---

## 12. Later (not in v1)

- **v1.1: Android share target.** Make the dashboard an installable PWA with a `share_target`, so it appears directly in Android's share sheet.
- Email as a second alert channel (Resend).
- One reminder 24 h after unlock if no decision has been made.
- Different wait times per item, or tiered by price (`cooldown_hours` already exists).
- Price-change check at unlock ("now ₹2,000 cheaper").
- Categories and tags; monthly saved-vs-spent charts.
- "What this money becomes" view (progress toward a savings goal).
- iOS Shortcut as a way to save links without Telegram.

---

## 13. Open questions

1. Default currency and timezone (assumed `INR` / `Asia/Kolkata` in the examples; set via env).
2. Is 7 days the right expiry window, and should `expired` count toward money saved? (Assumed yes.)
3. Should "bought anyway" count against a stat, like a "times I broke the cool-down" counter on the dashboard?
