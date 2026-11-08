-- Impulse Buying Circuit Breaker — initial schema (PRD §6)

create type public.item_status as enum ('cooling', 'unlocked', 'purchased', 'dropped', 'expired');

create table public.items (
  id                   uuid primary key default gen_random_uuid(),
  url                  text not null,
  normalized_url       text not null,
  title                text,
  site_name            text,
  image_url            text,
  price                numeric(12, 2) check (price >= 0),
  currency             char(3),
  reason               text check (char_length(reason) <= 500),
  status               public.item_status not null default 'cooling',
  cooldown_hours       int not null default 48 check (cooldown_hours > 0),
  created_at           timestamptz not null default now(),
  unlocks_at           timestamptz not null,
  unlocked_at          timestamptz,
  notified_at          timestamptz,
  decided_at           timestamptz,
  broke_cooldown       boolean not null default false,
  source               text not null check (source in ('telegram', 'web')),
  enrichment_status    text not null default 'pending'
                       check (enrichment_status in ('pending', 'done', 'failed')),
  telegram_message_id  bigint
);

comment on column public.items.normalized_url is 'Tracking params stripped, short links resolved; used for dedupe.';
comment on column public.items.notified_at is 'Set only after Telegram confirms the unlock alert was sent.';
comment on column public.items.telegram_message_id is 'Bot confirmation message id; maps user replies back to the item.';

-- unlocks_at = created_at + cooldown_hours.
-- Not a generated column: timestamptz + interval is STABLE, not IMMUTABLE.
create function public.set_unlocks_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unlocks_at := new.created_at + make_interval(hours => new.cooldown_hours);
  return new;
end;
$$;

create trigger items_set_unlocks_at
  before insert on public.items
  for each row execute function public.set_unlocks_at();

-- Scheduler: find cooling items that are due
create index items_cooling_due_idx on public.items (unlocks_at) where status = 'cooling';
-- Scheduler: unlocked items whose alert hasn't been sent yet
create index items_unnotified_idx on public.items (unlocked_at) where status = 'unlocked' and notified_at is null;
-- Scheduler: unlocked items to expire
create index items_unlocked_at_idx on public.items (unlocked_at) where status = 'unlocked';
-- Telegram replies → item
create index items_tg_msg_idx on public.items (telegram_message_id) where telegram_message_id is not null;
-- Dashboard lists, newest first
create index items_status_created_idx on public.items (status, created_at desc);
-- One active (cooling/unlocked) entry per product
create unique index items_active_url_uniq on public.items (normalized_url) where status in ('cooling', 'unlocked');

-- Only the API (service role) touches this table.
-- RLS on with no policies + revoked grants = the anon/authenticated keys get nothing.
alter table public.items enable row level security;
revoke all on table public.items from anon, authenticated;
