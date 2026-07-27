-- Normalised TCGdex catalogue repair layer.
-- This migration is additive: it keeps the existing StackR catalogue tables
-- intact while adding provider/image/price state that can be audited and
-- refreshed without deleting user inventory or binder relationships.

create extension if not exists "pgcrypto";

alter table if exists public.tcg_sets
  add column if not exists provider_reported_total integer,
  add column if not exists retrieved_total integer,
  add column if not exists stored_total integer,
  add column if not exists missing_total integer,
  add column if not exists duplicate_total integer,
  add column if not exists sync_status text default 'partial',
  add column if not exists last_card_sync_at timestamptz;

alter table if exists public.tcg_cards
  add column if not exists provider text,
  add column if not exists provider_card_id text,
  add column if not exists provider_set_id text,
  add column if not exists language text,
  add column if not exists region text,
  add column if not exists image_status text default 'needs_review',
  add column if not exists pricing_status text default 'unsupported',
  add column if not exists record_status text default 'partial',
  add column if not exists last_image_checked_at timestamptz,
  add column if not exists last_price_checked_at timestamptz,
  add column if not exists raw_source jsonb;

alter table if exists public.card_printings
  add column if not exists image_status text default 'needs_review',
  add column if not exists pricing_status text default 'unsupported',
  add column if not exists source_provider text,
  add column if not exists source_id text,
  add column if not exists raw_source jsonb;

alter table if exists public.market_prices
  add column if not exists original_price numeric,
  add column if not exists original_currency text,
  add column if not exists exchange_rate numeric,
  add column if not exists exchange_rate_timestamp timestamptz,
  add column if not exists pricing_status text default 'priced',
  add column if not exists next_check_at timestamptz,
  add column if not exists failure_reason text;

alter table if exists public.pokemon_cards
  add column if not exists image_status text default 'needs_review',
  add column if not exists pricing_status text default 'unsupported',
  add column if not exists last_image_checked_at timestamptz,
  add column if not exists last_price_checked_at timestamptz;

create table if not exists public.provider_card_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_record_type text not null default 'card',
  provider_record_id text not null,
  language text not null,
  region text not null,
  source_url text,
  response_status text not null default 'complete',
  raw_payload jsonb not null default '{}'::jsonb,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_record_id)
);

create table if not exists public.card_images (
  id uuid primary key default gen_random_uuid(),
  card_id text not null,
  provider text not null,
  provider_image_base text,
  resolved_image_url text,
  resolved_format text,
  resolved_quality text,
  image_width integer,
  image_height integer,
  content_type text,
  resolution_status text not null default 'needs_review',
  resolution_source text not null default 'tcgdex',
  variants jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  failure_reason text,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, provider, resolution_source)
);

create table if not exists public.card_image_checks (
  id uuid primary key default gen_random_uuid(),
  card_id text,
  provider text not null,
  provider_image_base text,
  candidate_url text,
  http_status integer,
  content_type text,
  image_width integer,
  image_height integer,
  resolution_status text not null,
  failure_reason text,
  checked_at timestamptz not null default now()
);

create table if not exists public.card_prices (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  entity_type text not null default 'card',
  language text not null,
  region text not null,
  condition text not null default 'raw',
  grader text,
  grade text,
  currency text not null,
  price_type text not null,
  low numeric,
  market numeric,
  average numeric,
  high numeric,
  last_sold numeric,
  sales_count integer,
  original_price numeric,
  original_currency text,
  exchange_rate numeric,
  exchange_rate_timestamp timestamptz,
  display_price numeric,
  display_currency text not null default 'GBP',
  provider text not null,
  provider_record_id text,
  provider_updated_at timestamptz,
  retrieved_at timestamptz not null default now(),
  confidence text not null default 'medium',
  pricing_status text not null default 'priced',
  failure_reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_price_checks (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  entity_type text not null default 'card',
  language text not null,
  region text not null,
  provider text not null,
  provider_record_id text,
  pricing_status text not null,
  last_checked_at timestamptz not null default now(),
  next_check_at timestamptz,
  failure_reason text,
  provider_coverage jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  card_price_id uuid references public.card_prices(id) on delete set null,
  entity_id text not null,
  entity_type text not null default 'card',
  language text not null,
  region text not null,
  currency text not null,
  price_type text not null,
  price numeric,
  provider text not null,
  provider_record_id text,
  observed_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.catalogue_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'tcgdex',
  job_name text not null,
  language text,
  region text,
  set_id text,
  status text not null default 'running',
  provider_reported_total integer default 0,
  retrieved_total integer default 0,
  stored_total integer default 0,
  missing_total integer default 0,
  duplicate_total integer default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.catalogue_sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.catalogue_sync_runs(id) on delete cascade,
  provider text not null default 'tcgdex',
  job_name text,
  language text,
  region text,
  set_id text,
  card_id text,
  provider_record_id text,
  stage text not null,
  severity text not null default 'error',
  message text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.tcg_card_printings as
select
  cp.id,
  coalesce(cp.language, c.language) as language,
  coalesce(cp.region, c.region) as region,
  cp.set_id,
  coalesce(c.local_name, c.canonical_name, c.id) as local_name,
  coalesce(c.english_display_name, c.canonical_name, c.local_name, c.id) as english_display_name,
  cp.collector_number,
  cp.rarity,
  null::text as variant,
  coalesce(cp.source_provider, c.provider, 'tcgdex') as source_provider,
  coalesce(cp.source_id, c.provider_card_id, c.id) as source_id,
  coalesce(cp.image_status, c.image_status, 'needs_review') as image_status,
  coalesce(cp.pricing_status, c.pricing_status, 'unsupported') as pricing_status,
  cp.created_at as last_synced_at
from public.card_printings cp
left join public.tcg_cards c on c.id = cp.card_id;

create or replace view public.catalogue_health as
with latest_images as (
  select distinct on (card_id)
    card_id,
    resolution_status,
    resolution_source,
    failure_reason,
    last_verified_at
  from public.card_images
  order by
    card_id,
    case resolution_status
      when 'resolved' then 1
      when 'resolved_secondary' then 2
      when 'temporarily_unavailable' then 3
      when 'needs_review' then 4
      when 'invalid' then 5
      else 6
    end,
    last_verified_at desc nulls last
),
latest_prices as (
  select distinct on (entity_id)
    entity_id,
    pricing_status,
    price_type,
    retrieved_at,
    confidence
  from public.card_prices
  where entity_type = 'card'
  order by
    entity_id,
    case price_type
      when 'recent_sold' then 1
      when 'market' then 2
      when 'average_sold' then 3
      when 'low_listing' then 4
      when 'estimated' then 5
      else 6
    end,
    retrieved_at desc
),
latest_price_checks as (
  select distinct on (entity_id)
    entity_id,
    pricing_status,
    failure_reason,
    last_checked_at
  from public.card_price_checks
  where entity_type = 'card'
  order by entity_id, last_checked_at desc
),
latest_runs as (
  select
    language,
    max(finished_at) filter (where status = 'completed') as last_successful_sync,
    max(finished_at) filter (where job_name ilike '%repair%') as last_repair_run
  from public.catalogue_sync_runs
  group by language
),
duplicates as (
  select language, count(*)::integer as duplicate_records
  from (
    select language, provider, provider_card_id, count(*) as duplicate_count
    from public.tcg_cards
    where provider_card_id is not null
    group by language, provider, provider_card_id
    having count(*) > 1
  ) d
  group by language
)
select
  c.language,
  c.region,
  (select count(*)::integer from public.tcg_sets ss where ss.source_provider = 'tcgdex' and ss.language = 'en') as english_sets_stored,
  (select count(*)::integer from public.tcg_sets ss where ss.source_provider = 'tcgdex' and ss.language = 'ja') as japanese_sets_stored,
  count(*)::integer as cards_stored,
  count(*) filter (where li.resolution_status in ('resolved', 'resolved_secondary'))::integer as cards_with_resolved_images,
  count(*) filter (where li.resolution_status = 'resolved_secondary')::integer as cards_using_secondary_images,
  count(*) filter (where coalesce(li.resolution_status, c.image_status, 'missing') not in ('resolved', 'resolved_secondary'))::integer as cards_missing_images,
  count(*) filter (where lp.pricing_status = 'priced' and lp.retrieved_at >= now() - interval '24 hours')::integer as cards_with_current_prices,
  count(*) filter (where lp.pricing_status = 'priced' and lp.retrieved_at < now() - interval '24 hours')::integer as cards_with_stale_prices,
  count(*) filter (where lpc.pricing_status = 'no_provider_mapping')::integer as cards_without_provider_mappings,
  count(*) filter (where coalesce(lpc.pricing_status, c.pricing_status) in ('unsupported', 'no_recent_sales'))::integer as cards_with_no_pricing_support,
  (
    select count(*)::integer
    from public.card_image_checks cic
    join public.tcg_cards c2 on c2.id = cic.card_id
    where c2.language = c.language
      and cic.resolution_status not in ('resolved', 'resolved_secondary')
  ) as image_resolution_failures,
  (
    select count(*)::integer
    from public.card_price_checks cpc
    where cpc.language = c.language
      and cpc.pricing_status not in ('priced', 'partially_priced')
  ) as pricing_provider_failures,
  coalesce(d.duplicate_records, 0) as duplicate_records,
  lr.last_successful_sync,
  lr.last_repair_run
from public.tcg_cards c
left join public.tcg_sets s on s.id = c.set_id
left join latest_images li on li.card_id = c.id
left join latest_prices lp on lp.entity_id = c.id
left join latest_price_checks lpc on lpc.entity_id = c.id
left join latest_runs lr on lr.language = c.language
left join duplicates d on d.language = c.language
where c.provider = 'tcgdex' or c.source_provider = 'tcgdex'
group by c.language, c.region, d.duplicate_records, lr.last_successful_sync, lr.last_repair_run;

create index if not exists idx_card_printings_set
  on public.card_printings(set_id);

create index if not exists idx_card_printings_language_number
  on public.card_printings(language, collector_number);

create unique index if not exists idx_provider_card_record
  on public.provider_card_records(provider, provider_record_id);

create index if not exists idx_card_images_card_status
  on public.card_images(card_id, resolution_status);

create index if not exists idx_card_prices_card_latest
  on public.card_prices(entity_id, retrieved_at desc);

create index if not exists idx_price_checks_status
  on public.card_price_checks(pricing_status, next_check_at);

create index if not exists idx_tcg_cards_language_set
  on public.tcg_cards(language, set_id);

create index if not exists idx_tcg_cards_provider_language
  on public.tcg_cards(provider, language, provider_card_id);

grant select on public.tcg_card_printings to anon, authenticated;
grant select on public.catalogue_health to authenticated;
