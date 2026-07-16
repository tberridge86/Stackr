create table if not exists public.price_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  card_id text not null,
  set_id text,
  language text not null default 'en',
  reason text not null default 'manual',
  priority integer not null default 50,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  run_after timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists price_refresh_queue_due_idx
  on public.price_refresh_queue(processed_at, run_after, priority desc, requested_at);

create index if not exists price_refresh_queue_card_idx
  on public.price_refresh_queue(card_id, language, processed_at);

create table if not exists public.price_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  lane text not null,
  status text not null check (status in ('started', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cards_considered integer not null default 0,
  cards_refreshed integer not null default 0,
  cards_skipped_fresh integer not null default 0,
  errors integer not null default 0,
  details jsonb not null default '{}'::jsonb
);

create index if not exists price_refresh_runs_lane_started_idx
  on public.price_refresh_runs(lane, started_at desc);

alter table if exists public.market_price_snapshots
  add column if not exists refresh_lane text,
  add column if not exists refresh_reason text;

alter table if exists public.user_card_flags
  add column if not exists language text not null default 'en';

alter table if exists public.market_watchlist
  add column if not exists language text not null default 'en';

create index if not exists user_card_flags_trade_refresh_idx
  on public.user_card_flags(flag_type, listing_status, updated_at desc)
  where flag_type = 'trade';

create index if not exists market_watchlist_refresh_idx
  on public.market_watchlist(created_at desc);

comment on table public.price_refresh_queue is
  'Priority queue for cards that need a price refresh outside the normal cadence, e.g. scanned/listed/chase cards.';

comment on table public.price_refresh_runs is
  'Run log for scheduled price refresh lanes.';
