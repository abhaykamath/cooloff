# Cooloff

A personal circuit breaker for impulse buying. Instead of adding something to your cart, share the link to a Telegram bot (or paste it into the dashboard). It locks for 48 hours. When the timer ends, the bot asks: **Buy** or **Drop**? The dashboard keeps a running total of money not spent.

- **Dashboard:** https://cooloffapp.netlify.app
- **Bot:** [@cooloff_bot](https://t.me/cooloff_bot) (private, it only answers its owner)
- **Spec:** [PRD.md](PRD.md)

## How it works

```
Share link ──► Telegram ──webhook──► API (Render) ──► Supabase Postgres
                                       │  ▲
Dashboard (Netlify) ──/api/* proxy─────┘  │
                                          │
           every 15 min: unlock due items → send Buy/Drop alert → expire ignored ones
```

1. **Save.** The bot replies "⏳ Saving…", fetches the page (title, price, image), then edits the message. Short links (`amzn.in`, `fkrt.it`) are resolved, and the same product twice is detected as a duplicate.
2. **Add context.** Right after saving, type a price and/or why you want it (`2999 for the gym`). It attaches to that item.
3. **Wait.** 48 hours. The dashboard shows a heat bar cooling from ember to blue.
4. **Decide.** At unlock, the bot sends **✅ Buy / ❌ Drop**. Ignore it for 7 days and the item expires, which counts as not spent.

Item lifecycle: `cooling → unlocked → purchased | dropped | expired`. You can drop early, or record "I bought it anyway".

## Stack

| | |
|---|---|
| API (`apps/api`) | Node 22, TypeScript, Hono, supabase-js, Zod, grammY, node-cron, open-graph-scraper |
| Web (`apps/web`) | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Hook Form, React Router v7 |
| Shared (`packages/shared`) | Zod schemas, status rules, formatters, generated DB types |
| Database | Supabase Postgres (used as a plain database; all logic is in the API) |
| Hosting | Render (API), Netlify (web) |

```
apps/api            Hono server, Telegram bot, scheduler
apps/web            Dashboard
packages/shared     Code used by both
supabase/migrations SQL migrations
```

## Running locally

**Prerequisites:** Node 22+, pnpm 10, the [Supabase CLI](https://supabase.com/docs/guides/cli), a Supabase project, and a Telegram bot from [@BotFather](https://t.me/BotFather).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill it in (see below)
pnpm dev                                 # API on :8787, dashboard on http://localhost:5173
```

The dashboard proxies `/api` to the local API, the same way Netlify does in production.

### ⚠️ The bot and local development

In development the bot defaults to **polling**: the local API fetches updates from Telegram itself. Starting polling **deletes the production webhook**, so the live bot stops answering until Render restarts and re-registers it. Two ways to avoid that:

- **Use a separate dev bot.** Create a second bot with BotFather and put its token in your local `.env`.
- **Run the API without the bot.** `TELEGRAM_MODE=webhook PUBLIC_API_URL= pnpm dev`. The dashboard works; the bot is left alone.

### Environment variables (`apps/api/.env`)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server only. Bypasses row-level security. |
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | Any random string: `openssl rand -hex 32` |
| `TELEGRAM_OWNER_CHAT_ID` | ✅ | Your chat ID. Send the bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`. |
| `DASHBOARD_PASSWORD` | ✅ | Dashboard login, at least 8 characters |
| `SESSION_SECRET` | ✅ | Signs the login cookie: `openssl rand -hex 32` |
| `TELEGRAM_MODE` | | `polling` (default in dev) or `webhook` (default when `NODE_ENV=production`) |
| `PUBLIC_API_URL` | | Public https URL for the webhook when not on Render |
| `DEFAULT_CURRENCY` | | Default `INR` |
| `TIMEZONE` | | Default `Asia/Kolkata`, used for times in bot messages |
| `COOLDOWN_HOURS` | | Default `48` |
| `EXPIRE_AFTER_DAYS` | | Default `7` |

The server checks these on startup and lists anything missing or invalid.

### Database

```bash
supabase link --project-ref <ref>
supabase db push        # apply supabase/migrations
pnpm db:types           # regenerate packages/shared/src/database.types.ts
```

The `items` table has row-level security on with no policies, so only the API (service-role key) can read or write it.

## Deploying

### API on Render

| Setting | Value |
|---|---|
| Root directory | *(empty, the repo root)* |
| Build command | `pnpm install --frozen-lockfile --prod=false && pnpm --filter api build` |
| Start command | `pnpm --filter api start` |
| Health check path | `/health` |
| Environment | The required variables above, plus `NODE_ENV=production` and `TELEGRAM_MODE=webhook` |

`--prod=false` is needed because `NODE_ENV=production` would otherwise skip the build tools.

On startup the server registers the Telegram webhook itself, using Render's built-in `RENDER_EXTERNAL_URL`. The logs show `Bot @… webhook → https://…/telegram/webhook`.

Render's free tier sleeps after about 15 minutes idle. An external cron pinging `/health` every 5 minutes keeps it awake. One always-on service fits inside the free 750 hours a month, but those hours are shared by all free services in a workspace. If the server does sleep, the scheduler catches up on startup, so alerts are late rather than lost.

### Dashboard on Netlify

Import the repo and choose **Other (configure manually)** as the project, so Netlify builds from the root and reads [`netlify.toml`](netlify.toml). That file sets the build, proxies `/api/*` to Render (keeping the login cookie first-party), and sends all other paths to the React app. No environment variables are needed.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API and dashboard together |
| `pnpm dev:api` / `pnpm dev:web` | One of them |
| `pnpm build` | Typecheck and build everything |
| `pnpm typecheck` | Typecheck everything |
| `pnpm db:types` | Regenerate DB types from the linked Supabase project |
| `pnpm --filter api tg:webhook` | Manually register the webhook (`PUBLIC_API_URL` must be https) |
