import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,256}$/, 'Telegram allows only A-Z, a-z, 0-9, _ and -'),
  TELEGRAM_OWNER_CHAT_ID: z.coerce.number().int(),
  // polling = bot pulls updates (local dev, no public URL needed); webhook = Telegram pushes (Render).
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).optional(),

  // Public base URL of this API, for the Telegram webhook. On Render, RENDER_EXTERNAL_URL is set
  // automatically and wins; PUBLIC_API_URL is the fallback for other hosts / running the script locally.
  RENDER_EXTERNAL_URL: z.url().optional(),
  PUBLIC_API_URL: z.url().optional(),
  DASHBOARD_URL: z.url().optional(),

  DASHBOARD_PASSWORD: z.string().min(8, 'Use at least 8 characters'),
  SESSION_SECRET: z.string().min(32, 'Use at least 32 characters (openssl rand -hex 32)'),

  DEFAULT_CURRENCY: z.string().length(3).default('INR'),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  COOLDOWN_HOURS: z.coerce.number().int().positive().default(48),
  EXPIRE_AFTER_DAYS: z.coerce.number().int().positive().default(7),
});

// Treat `KEY=` (empty) as unset so defaults apply.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = envSchema.safeParse(raw);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const telegramMode = env.TELEGRAM_MODE ?? (isProd ? 'webhook' : 'polling');
export const publicApiUrl = env.RENDER_EXTERNAL_URL ?? env.PUBLIC_API_URL;
