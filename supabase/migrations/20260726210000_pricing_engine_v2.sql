create extension if not exists pgcrypto;

create table if not exists public.pricing_sources (
  id text primary key,
  source_name text not null,
  enabled boolean not null default false,
  source_type text not null,
  reliability_weight numeric not null default 0.3,
  supports_sold_data boolean not null default false,
  supports_active_data boolean not null default false,
  refresh_interval interval,
  rate_limit_config jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  health_status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text,
  card_id text,
  canonical_identity_key text,
  observation_hash text,
  source_id text,
  source text not null default 'unknown',
  source_type text not null default 'market_estimate',
  external_reference text,
  product_type text,
  title text,
  original_item_price numeric,
  original_shipping_price numeric,
  original_currency text not null default 'GBP',
  normalised_item_price_gbp numeric,
  normalised_delivered_price_gbp numeric,
  original_price numeric,
  converted_price_gbp numeric,
  sold_at timestamptz,
  listed_at timestamptz,
  fetched_at timestamptz,
  observed_at timestamptz not null default now(),
  language text not null default 'en',
  condition text,
  raw_condition text,
  grader text,
  grading_company text,
  grade text,
  grade_label text,
  variant text,
  finish text,
  edition text,
  match_confidence numeric not null default 0,
  match_score numeric,
  match_explanation text,
  source_reliability numeric,
  included_in_estimate boolean,
  excluded boolean not null default false,
  exclusion_reason text,
  listing_url text,
  shipping_included boolean not null default false,
  verified_sale boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  card_id text not null,
  set_id text,
  language text not null default 'en',
  tcg_low numeric,
  tcg_mid numeric,
  cardmarket_trend numeric,
  ebay_low numeric,
  ebay_average numeric,
  ebay_high numeric,
  ebay_count integer,
  tcgdex_card_id text,
  tcgdex_price numeric,
  tcgdex_price_updated_at timestamptz,
  price_source text,
  source_payload jsonb,
  refresh_lane text,
  refresh_reason text,
  snapshot_at timestamptz not null default now()
);

alter table if exists public.price_observations
  add column if not exists card_id text,
  add column if not exists canonical_identity_key text,
  add column if not exists observation_hash text,
  add column if not exists source_id text,
  add column if not exists external_reference text,
  add column if not exists product_type text,
  add column if not exists title text,
  add column if not exists original_item_price numeric,
  add column if not exists original_shipping_price numeric,
  add column if not exists normalised_item_price_gbp numeric,
  add column if not exists normalised_delivered_price_gbp numeric,
  add column if not exists listed_at timestamptz,
  add column if not exists fetched_at timestamptz,
  add column if not exists raw_condition text,
  add column if not exists grading_company text,
  add column if not exists variant text,
  add column if not exists finish text,
  add column if not exists edition text,
  add column if not exists match_score numeric,
  add column if not exists match_explanation text,
  add column if not exists source_reliability numeric,
  add column if not exists included_in_estimate boolean,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.price_observations') is not null then
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.price_observations'::regclass
        and conname = 'price_observations_source_type_check'
    ) then
      alter table public.price_observations
        drop constraint price_observations_source_type_check;
    end if;

    alter table public.price_observations
      add constraint price_observations_source_type_check
      check (source_type in ('active_listing', 'sold_listing', 'sold_transaction', 'market_price', 'market_estimate'));
  end if;
end $$;

alter table if exists public.market_price_snapshots
  add column if not exists canonical_identity_key text,
  add column if not exists market_price_gbp numeric,
  add column if not exists low_price_gbp numeric,
  add column if not exists high_price_gbp numeric,
  add column if not exists ebay_sold_estimate_gbp numeric,
  add column if not exists secondary_consensus_gbp numeric,
  add column if not exists active_listing_indication_gbp numeric,
  add column if not exists confidence_score numeric,
  add column if not exists confidence_label text,
  add column if not exists confidence_explanation text,
  add column if not exists comp_count integer,
  add column if not exists sold_comp_count integer,
  add column if not exists active_listing_count integer,
  add column if not exists source_count integer,
  add column if not exists volatility numeric,
  add column if not exists primary_source text,
  add column if not exists price_type text,
  add column if not exists methodology_version text,
  add column if not exists calculated_at timestamptz,
  add column if not exists stale_after timestamptz,
  add column if not exists is_stale boolean not null default false,
  add column if not exists source_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists pricing_identity_json jsonb not null default '{}'::jsonb,
  add column if not exists calculation_summary jsonb not null default '{}'::jsonb;

create table if not exists public.pricing_review_queue (
  id uuid primary key default gen_random_uuid(),
  card_id text not null,
  canonical_identity_key text not null,
  reason text not null,
  disagreement_percentage numeric,
  priority integer not null default 50,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text
);

drop index if exists public.price_observations_v2_hash_idx;
create unique index price_observations_v2_hash_idx
  on public.price_observations(observation_hash);

create index if not exists price_observations_v2_identity_idx
  on public.price_observations(canonical_identity_key, source_type, sold_at desc, listed_at desc, fetched_at desc);

create index if not exists price_observations_v2_card_language_idx
  on public.price_observations(card_id, language, canonical_identity_key, fetched_at desc);

create index if not exists market_price_snapshots_v2_identity_latest_idx
  on public.market_price_snapshots(card_id, canonical_identity_key, methodology_version, calculated_at desc);

create index if not exists market_price_snapshots_v2_stale_idx
  on public.market_price_snapshots(is_stale, stale_after, calculated_at desc)
  where methodology_version = 'pricing-v2.0.0';

create index if not exists pricing_review_queue_open_idx
  on public.pricing_review_queue(status, priority desc, created_at)
  where status in ('open', 'in_review');

alter table public.pricing_sources enable row level security;
alter table public.price_observations enable row level security;
alter table public.pricing_review_queue enable row level security;

drop policy if exists "Pricing sources are readable" on public.pricing_sources;
create policy "Pricing sources are readable"
  on public.pricing_sources for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read price observations" on public.price_observations;
create policy "Authenticated users can read price observations"
  on public.price_observations for select
  to authenticated
  using (true);

drop policy if exists "Pricing review queue requires service role" on public.pricing_review_queue;
create policy "Pricing review queue requires service role"
  on public.pricing_review_queue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.pricing_sources to authenticated, service_role;
grant all on table public.pricing_sources to service_role;
grant all on table public.pricing_review_queue to service_role;
grant select on table public.price_observations to authenticated, service_role;
grant insert, update on table public.price_observations to service_role;
grant select, insert, update on table public.market_price_snapshots to service_role;

insert into public.pricing_sources (
  id,
  source_name,
  enabled,
  source_type,
  reliability_weight,
  supports_sold_data,
  supports_active_data,
  refresh_interval,
  health_status
) values
  ('ebay_sold', 'eBay sold transactions', false, 'sold_transaction', 1.00, true, false, interval '12 hours', 'unconfigured'),
  ('ebay_active', 'eBay active listings', true, 'active_listing', 0.35, false, true, interval '6 hours', 'unknown'),
  ('existing_stackr_source', 'Existing Stackr cached prices', true, 'market_estimate', 0.55, true, true, interval '12 hours', 'unknown'),
  ('manual_verified_comp', 'Manual verified comp', true, 'sold_transaction', 0.95, true, false, interval '24 hours', 'unknown')
on conflict (id) do update set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  reliability_weight = excluded.reliability_weight,
  supports_sold_data = excluded.supports_sold_data,
  supports_active_data = excluded.supports_active_data,
  refresh_interval = excluded.refresh_interval,
  updated_at = now();

comment on table public.pricing_sources is
  'Pricing Engine V2 provider registry. eBay sold remains disabled until authorised completed-sale access is configured.';

comment on column public.price_observations.source_type is
  'V2 keeps sold_transaction, market_estimate and active_listing separate. Active listings must never be presented as sold comps.';

comment on column public.market_price_snapshots.canonical_identity_key is
  'Deterministic product identity key: product type, language, set, number, variant, finish, edition, grader, grade and condition.';

comment on table public.pricing_review_queue is
  'Cards requiring human review due to source disagreement, no exact match or other pricing-quality issues.';
