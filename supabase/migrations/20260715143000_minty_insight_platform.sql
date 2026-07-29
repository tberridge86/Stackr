create extension if not exists pgcrypto;

create table if not exists public.provider_mappings (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text not null references public.pokemon_cards(id) on delete cascade,
  provider text not null,
  provider_card_id text not null,
  language text not null default 'en',
  confidence numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_card_id, language)
);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text not null references public.pokemon_cards(id) on delete cascade,
  language text not null default 'en',
  condition text,
  grader text,
  grade text,
  grade_label text,
  source text not null,
  source_type text not null check (source_type in ('active_listing', 'sold_listing', 'market_price')),
  original_price numeric not null,
  original_currency text not null,
  converted_price_gbp numeric not null,
  observed_at timestamptz not null default now(),
  sold_at timestamptz,
  listing_url text,
  shipping_included boolean not null default false,
  verified_sale boolean not null default false,
  match_confidence numeric not null default 0,
  excluded boolean not null default false,
  exclusion_reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text references public.pokemon_cards(id) on delete cascade,
  product_key text,
  language text not null default 'en',
  raw_or_graded text not null default 'raw' check (raw_or_graded in ('raw', 'graded', 'sealed')),
  grader text,
  grade text,
  variant text,
  median_sold_gbp numeric,
  median_active_listing_gbp numeric,
  active_supply integer not null default 0,
  confirmed_sales_7d integer not null default 0,
  confirmed_sales_30d integer not null default 0,
  favourite_count integer not null default 0,
  chase_count integer not null default 0,
  collection_adds_30d integer not null default 0,
  source_count integer not null default 0,
  source_agreement numeric not null default 0,
  data_freshness numeric not null default 0,
  outlier_rate numeric not null default 0,
  snapshot_at timestamptz not null default now(),
  input_observation_ids uuid[] not null default '{}'::uuid[],
  raw_metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.card_market_metrics (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text references public.pokemon_cards(id) on delete cascade,
  product_key text,
  language text not null default 'en',
  raw_or_graded text not null default 'raw' check (raw_or_graded in ('raw', 'graded', 'sealed')),
  grader text,
  grade text,
  grade_label text,
  variant text,
  median_sold_gbp numeric,
  median_active_listing_gbp numeric,
  change_7d_percent numeric,
  change_30d_percent numeric,
  change_90d_percent numeric,
  active_supply integer not null default 0,
  new_listings_7d integer not null default 0,
  confirmed_sales_7d integer not null default 0,
  confirmed_sales_30d integer not null default 0,
  sell_through_rate numeric,
  median_time_to_sell_days numeric,
  listing_to_sale_gap_percent numeric,
  volatility numeric,
  favourite_growth_30d numeric,
  collection_growth_30d numeric,
  chase_growth_30d numeric,
  liquidity numeric not null default 0,
  data_freshness numeric not null default 0,
  source_agreement numeric not null default 0,
  outlier_rate numeric not null default 0,
  source_count integer not null default 0,
  match_confidence numeric not null default 0,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  raw_metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.minty_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stackr_card_id text references public.pokemon_cards(id) on delete set null,
  recommendation text not null check (recommendation in (
    'strong_buy',
    'buy',
    'watch',
    'hold',
    'consider_selling',
    'sell',
    'avoid',
    'insufficient_data'
  )),
  recommendation_label text not null,
  recommendation_score numeric not null,
  confidence_score numeric not null,
  confidence_label text not null,
  relevance_score numeric not null default 0,
  input_snapshot_id uuid,
  structured_signals jsonb not null default '[]'::jsonb,
  narrative jsonb not null default '{}'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  data_limitations jsonb not null default '[]'::jsonb,
  card_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  version text not null default 'minty-v2.0.0',
  stale boolean not null default false
);

create table if not exists public.minty_insight_signals (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.minty_insights(id) on delete cascade,
  signal_type text not null check (signal_type in ('positive', 'negative', 'neutral')),
  label text not null,
  evidence text not null,
  confidence_score numeric not null,
  confidence_label text not null,
  source_observation_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create table if not exists public.provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null,
  status text not null check (status in ('started', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_read integer not null default 0,
  records_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.user_insight_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_id uuid references public.minty_insights(id) on delete set null,
  interaction_type text not null,
  recommendation text,
  confidence_score numeric,
  data_snapshot jsonb not null default '{}'::jsonb,
  outcome_checked_at timestamptz,
  outcome_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stackr_card_id text references public.pokemon_cards(id) on delete cascade,
  product_key text,
  language text not null default 'en',
  raw_or_graded text not null default 'raw' check (raw_or_graded in ('raw', 'graded', 'sealed')),
  grader text,
  grade text,
  target_price_gbp numeric,
  direction text not null default 'below' check (direction in ('below', 'above', 'movement')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- price_alerts predates Minty on the live project. CREATE TABLE IF NOT EXISTS
-- does not add the newer columns to that legacy table, so reconcile them
-- explicitly before creating Minty's indexes and policies.
alter table public.price_alerts
  add column if not exists stackr_card_id text references public.pokemon_cards(id) on delete cascade,
  add column if not exists product_key text,
  add column if not exists language text not null default 'en',
  add column if not exists raw_or_graded text not null default 'raw'
    check (raw_or_graded in ('raw', 'graded', 'sealed')),
  add column if not exists grader text,
  add column if not exists grade text,
  add column if not exists target_price_gbp numeric,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists provider_mappings_stackr_card_idx
  on public.provider_mappings(stackr_card_id, language);

create index if not exists price_observations_card_market_idx
  on public.price_observations(stackr_card_id, language, source_type, observed_at desc);

create index if not exists price_observations_graded_idx
  on public.price_observations(stackr_card_id, language, grader, grade, observed_at desc)
  where grader is not null or grade is not null;

create index if not exists price_observations_sold_idx
  on public.price_observations(stackr_card_id, language, sold_at desc)
  where source_type = 'sold_listing' and verified_sale = true and excluded = false;

create index if not exists market_snapshots_card_latest_idx
  on public.market_snapshots(stackr_card_id, language, raw_or_graded, snapshot_at desc);

create index if not exists card_market_metrics_lookup_idx
  on public.card_market_metrics(stackr_card_id, language, raw_or_graded, grader, grade, calculated_at desc);

create index if not exists minty_insights_user_latest_idx
  on public.minty_insights(user_id, expires_at desc, relevance_score desc, generated_at desc)
  where stale = false;

create index if not exists minty_insight_signals_insight_idx
  on public.minty_insight_signals(insight_id);

create index if not exists user_insight_interactions_user_idx
  on public.user_insight_interactions(user_id, created_at desc);

create index if not exists price_alerts_user_active_idx
  on public.price_alerts(user_id, active, created_at desc);

alter table public.provider_mappings enable row level security;
alter table public.price_observations enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.card_market_metrics enable row level security;
alter table public.minty_insights enable row level security;
alter table public.minty_insight_signals enable row level security;
alter table public.provider_sync_logs enable row level security;
alter table public.user_insight_interactions enable row level security;
alter table public.price_alerts enable row level security;

drop policy if exists "Authenticated users can read provider mappings" on public.provider_mappings;
create policy "Authenticated users can read provider mappings"
  on public.provider_mappings for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read price observations" on public.price_observations;
create policy "Authenticated users can read price observations"
  on public.price_observations for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read market snapshots" on public.market_snapshots;
create policy "Authenticated users can read market snapshots"
  on public.market_snapshots for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read card market metrics" on public.card_market_metrics;
create policy "Authenticated users can read card market metrics"
  on public.card_market_metrics for select
  to authenticated
  using (true);

drop policy if exists "Users can read own Minty insights" on public.minty_insights;
create policy "Users can read own Minty insights"
  on public.minty_insights for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own Minty insight signals" on public.minty_insight_signals;
create policy "Users can read own Minty insight signals"
  on public.minty_insight_signals for select
  to authenticated
  using (
    exists (
      select 1
      from public.minty_insights insights
      where insights.id = minty_insight_signals.insight_id
        and insights.user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can read provider sync logs" on public.provider_sync_logs;
create policy "Authenticated users can read provider sync logs"
  on public.provider_sync_logs for select
  to authenticated
  using (true);

drop policy if exists "Users can read own insight interactions" on public.user_insight_interactions;
create policy "Users can read own insight interactions"
  on public.user_insight_interactions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own insight interactions" on public.user_insight_interactions;
create policy "Users can insert own insight interactions"
  on public.user_insight_interactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own price alerts" on public.price_alerts;
create policy "Users can manage own price alerts"
  on public.price_alerts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on table
  public.provider_mappings,
  public.price_observations,
  public.market_snapshots,
  public.card_market_metrics,
  public.provider_sync_logs
to authenticated, service_role;

grant select on table
  public.minty_insights,
  public.minty_insight_signals
to authenticated, service_role;

grant insert on table public.user_insight_interactions to authenticated;
grant select, insert, update, delete on table public.price_alerts to authenticated;

grant all on table
  public.provider_mappings,
  public.price_observations,
  public.market_snapshots,
  public.card_market_metrics,
  public.minty_insights,
  public.minty_insight_signals,
  public.provider_sync_logs,
  public.user_insight_interactions,
  public.price_alerts
to service_role;

comment on table public.price_observations is
  'Audit-friendly normalised market observations. Active asking prices are stored separately from confirmed sold prices.';

comment on table public.minty_insights is
  'User-specific Minty recommendations calculated deterministically before any AI narrative is attached.';

