-- Placeholder default so inserts (and generated types) don't need to supply unlocks_at.
-- The items_set_unlocks_at trigger always overwrites it with created_at + cooldown_hours.
alter table public.items alter column unlocks_at set default now();
