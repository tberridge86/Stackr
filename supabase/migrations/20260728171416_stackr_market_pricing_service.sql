create extension if not exists pgcrypto;

create schema if not exists market;
create schema if not exists api;

create table if not exists market.source_providers (
  code text primary key,
  display_name text not null,
  provider_kind text not null
    check (provider_kind in ('marketplace', 'manual_import', 'secondary_market', 'exchange_rate', 'internal')),
  active boolean not null default false,
  official_api_required boolean not null default true,
  oauth_required boolean not null default false,
  supports_active_listings boolean not null default false,
  supports_sold_observations boolean not null default false,
  supports_raw_cards boolean not null default true,
  supports_graded_cards boolean not null default true,
  supports_sealed_products boolean not null default true,
  supported_marketplaces text[] not null default '{}'::text[],
  supported_currencies text[] not null default '{}'::text[],
  terms_url text,
  data_licence_status text not null default 'unreviewed'
    check (data_licence_status in ('approved', 'restricted', 'unreviewed', 'unavailable')),
  automated_refresh_allowed boolean not null default false,
  credential_env_names text[] not null default '{}'::text[],
  health_status text not null default 'unknown'
    check (health_status in ('ok', 'degraded', 'disabled', 'unavailable', 'unknown')),
  last_health_checked_at timestamptz,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active = false or data_licence_status in ('approved', 'restricted')),
  check (automated_refresh_allowed = false or data_licence_status = 'approved')
);

create table if not exists market.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  display_name text not null,
  minor_unit integer not null default 2 check (minor_unit >= 0 and minor_unit <= 8),
  active boolean not null default true,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.exchange_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  base_currency_code text not null references market.currencies(code) on delete restrict,
  quote_currency_code text not null references market.currencies(code) on delete restrict,
  provider_code text not null references market.source_providers(code) on delete restrict,
  rate numeric not null check (rate > 0),
  observed_at timestamptz not null,
  source_reference text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (base_currency_code, quote_currency_code, provider_code, observed_at),
  check (base_currency_code <> quote_currency_code)
);

create table if not exists market.conditions (
  code text primary key,
  product_kind text not null check (product_kind in ('raw_card', 'graded_card', 'sealed_product')),
  display_name text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.graders (
  code text primary key,
  display_name text not null,
  website_url text,
  active boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.grades (
  id uuid primary key default gen_random_uuid(),
  grader_code text not null references market.graders(code) on delete restrict,
  grade_value text not null,
  grade_numeric numeric,
  display_label text not null,
  sort_order numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grader_code, grade_value)
);

create table if not exists market.duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  duplicate_key text not null unique,
  provider_code text references market.source_providers(code) on delete restrict,
  decision text not null default 'pending'
    check (decision in ('pending', 'canonical', 'duplicate', 'split', 'ignored')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists market.price_observations
  add column if not exists provider_code text,
  add column if not exists source_item_id text,
  add column if not exists observed_price numeric,
  add column if not exists shipping_price numeric,
  add column if not exists currency_code text,
  add column if not exists sale_or_listing_type text,
  add column if not exists condition_code text,
  add column if not exists grader_code text,
  add column if not exists grade_id uuid,
  add column if not exists sold_at timestamptz,
  add column if not exists source_url text,
  add column if not exists raw_title text,
  add column if not exists parsed_match_confidence numeric,
  add column if not exists duplicate_group_id uuid,
  add column if not exists ingestion_run_id uuid,
  add column if not exists observation_kind text
    check (observation_kind in ('active_asking_price', 'accepted_offer', 'auction_result', 'confirmed_sold_transaction', 'market_estimate', 'manual_verified_comp'));

do $$
begin
  if to_regclass('market.price_observations') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_provider_code_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_provider_code_fkey
        foreign key (provider_code) references market.source_providers(code) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_currency_code_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_currency_code_fkey
        foreign key (currency_code) references market.currencies(code) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_condition_code_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_condition_code_fkey
        foreign key (condition_code) references market.conditions(code) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_grader_code_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_grader_code_fkey
        foreign key (grader_code) references market.graders(code) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_grade_id_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_grade_id_fkey
        foreign key (grade_id) references market.grades(id) on delete restrict;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_duplicate_group_id_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_duplicate_group_id_fkey
        foreign key (duplicate_group_id) references market.duplicate_groups(id) on delete set null;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'market_price_observations_ingestion_run_id_fkey'
        and conrelid = 'market.price_observations'::regclass
    ) then
      alter table market.price_observations
        add constraint market_price_observations_ingestion_run_id_fkey
        foreign key (ingestion_run_id) references ingest.import_runs(id) on delete set null;
    end if;
  end if;
end $$;

create table if not exists market.active_listings (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id) on delete restrict,
  variant_id uuid references catalog.card_variants(id) on delete restrict,
  sealed_product_variant_id uuid references catalog.sealed_product_variants(id) on delete restrict,
  provider_code text not null references market.source_providers(code) on delete restrict,
  source_item_id text not null,
  observed_price numeric not null check (observed_price >= 0),
  shipping_price numeric check (shipping_price is null or shipping_price >= 0),
  currency_code text not null references market.currencies(code) on delete restrict,
  listing_type text not null
    check (listing_type in ('fixed_price', 'auction_active', 'classified', 'unknown')),
  condition_code text references market.conditions(code) on delete restrict,
  grader_code text references market.graders(code) on delete restrict,
  grade_id uuid references market.grades(id) on delete restrict,
  observed_at timestamptz not null,
  listing_started_at timestamptz,
  listing_ends_at timestamptz,
  source_url text,
  raw_title text not null,
  parsed_match_confidence numeric not null default 0 check (parsed_match_confidence >= 0 and parsed_match_confidence <= 1),
  duplicate_group_id uuid references market.duplicate_groups(id) on delete set null,
  ingestion_run_id uuid references ingest.import_runs(id) on delete set null,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  source_updated_at timestamptz,
  unavailable_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (variant_id is not null and sealed_product_variant_id is null)
    or (variant_id is null and sealed_product_variant_id is not null)
  )
);

create table if not exists market.sold_observations (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id) on delete restrict,
  variant_id uuid references catalog.card_variants(id) on delete restrict,
  sealed_product_variant_id uuid references catalog.sealed_product_variants(id) on delete restrict,
  provider_code text not null references market.source_providers(code) on delete restrict,
  source_item_id text not null,
  sold_price numeric not null check (sold_price >= 0),
  shipping_price numeric check (shipping_price is null or shipping_price >= 0),
  currency_code text not null references market.currencies(code) on delete restrict,
  sale_type text not null
    check (sale_type in ('auction_result', 'accepted_offer', 'confirmed_sold_transaction', 'manual_verified_sale', 'provider_sold_observation')),
  condition_code text references market.conditions(code) on delete restrict,
  grader_code text references market.graders(code) on delete restrict,
  grade_id uuid references market.grades(id) on delete restrict,
  observed_at timestamptz not null,
  sold_at timestamptz not null,
  source_url text,
  raw_title text not null,
  parsed_match_confidence numeric not null default 0 check (parsed_match_confidence >= 0 and parsed_match_confidence <= 1),
  duplicate_group_id uuid references market.duplicate_groups(id) on delete set null,
  ingestion_run_id uuid references ingest.import_runs(id) on delete set null,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (variant_id is not null and sealed_product_variant_id is null)
    or (variant_id is null and sealed_product_variant_id is not null)
  )
);

create table if not exists market.price_estimate_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique,
  methodology text not null,
  weighting_config jsonb not null default '{}'::jsonb,
  outlier_config jsonb not null default '{}'::jsonb,
  currency_policy jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.price_estimates (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id) on delete restrict,
  estimate_version_id uuid not null references market.price_estimate_versions(id) on delete restrict,
  product_kind text not null check (product_kind in ('raw_card', 'graded_card', 'sealed_product')),
  variant_id uuid references catalog.card_variants(id) on delete restrict,
  sealed_product_variant_id uuid references catalog.sealed_product_variants(id) on delete restrict,
  condition_code text references market.conditions(code) on delete restrict,
  grader_code text references market.graders(code) on delete restrict,
  grade_id uuid references market.grades(id) on delete restrict,
  display_currency_code text not null references market.currencies(code) on delete restrict,
  evidence_status text not null default 'unavailable'
    check (evidence_status in ('recent_sold_value', 'thin_sold_value', 'market_estimate', 'asking_price_indication', 'unavailable')),
  unavailable_reason text,
  sample_count integer not null default 0 check (sample_count >= 0),
  sold_sample_count integer not null default 0 check (sold_sample_count >= 0),
  active_listing_count integer not null default 0 check (active_listing_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  date_range_start timestamptz,
  date_range_end timestamptz,
  low_estimate numeric check (low_estimate is null or low_estimate >= 0),
  central_estimate numeric check (central_estimate is null or central_estimate >= 0),
  high_estimate numeric check (high_estimate is null or high_estimate >= 0),
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  confidence_label text not null default 'insufficient_evidence'
    check (confidence_label in ('high', 'medium', 'low', 'insufficient_evidence')),
  freshness text not null default 'unknown'
    check (freshness in ('fresh', 'stale', 'expired', 'unknown')),
  recency_weight numeric,
  source_breakdown jsonb not null default '[]'::jsonb,
  outlier_summary jsonb not null default '{}'::jsonb,
  fallback_identity_key text,
  fallback_reason text,
  calculated_at timestamptz not null default now(),
  stale_after timestamptz,
  superseded_at timestamptz,
  public_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    fallback_identity_key is null
    or fallback_reason is not null
  ),
  check (
    (variant_id is not null and sealed_product_variant_id is null)
    or (variant_id is null and sealed_product_variant_id is not null)
  )
);

create table if not exists market.outlier_decisions (
  id uuid primary key default gen_random_uuid(),
  price_estimate_id uuid references market.price_estimates(id) on delete cascade,
  price_observation_id uuid references market.price_observations(id) on delete cascade,
  active_listing_id uuid references market.active_listings(id) on delete cascade,
  sold_observation_id uuid references market.sold_observations(id) on delete cascade,
  decision text not null check (decision in ('included', 'excluded_outlier', 'excluded_duplicate', 'excluded_mismatch', 'manual_override')),
  method text not null default 'median_absolute_deviation',
  observed_price numeric,
  median_price numeric,
  mad_score numeric,
  reason text,
  decided_by text not null default 'pricing_service',
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    price_observation_id is not null
    or active_listing_id is not null
    or sold_observation_id is not null
  )
);

create table if not exists market.refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('variant', 'sealed_product_variant', 'market_identity', 'provider', 'all')),
  target_id uuid,
  provider_code text references market.source_providers(code) on delete restrict,
  job_type text not null check (job_type in ('active_listing_refresh', 'sold_observation_import', 'estimate_rebuild', 'exchange_rate_refresh')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  priority integer not null default 50 check (priority >= 0 and priority <= 100),
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_error text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_source_providers_active_idx
  on market.source_providers(active, provider_kind, health_status)
  where deprecated_at is null;

create index if not exists market_exchange_rates_latest_idx
  on market.exchange_rate_snapshots(base_currency_code, quote_currency_code, observed_at desc);

create index if not exists market_conditions_kind_idx
  on market.conditions(product_kind, sort_order)
  where deprecated_at is null;

create index if not exists market_grades_grader_sort_idx
  on market.grades(grader_code, sort_order)
  where active;

create unique index if not exists market_active_listings_provider_item_uidx
  on market.active_listings(provider_code, source_item_id);

create index if not exists market_active_listings_identity_observed_idx
  on market.active_listings(market_identity_id, observed_at desc);

create index if not exists market_active_listings_variant_idx
  on market.active_listings(variant_id, condition_code, grader_code, observed_at desc)
  where variant_id is not null;

create unique index if not exists market_sold_observations_provider_item_uidx
  on market.sold_observations(provider_code, source_item_id, sold_at);

create index if not exists market_sold_observations_identity_sold_idx
  on market.sold_observations(market_identity_id, sold_at desc);

create index if not exists market_sold_observations_variant_idx
  on market.sold_observations(variant_id, condition_code, grader_code, sold_at desc)
  where variant_id is not null;

create index if not exists market_price_estimates_variant_latest_idx
  on market.price_estimates(variant_id, product_kind, display_currency_code, calculated_at desc)
  where superseded_at is null and variant_id is not null;

create index if not exists market_price_estimates_identity_latest_idx
  on market.price_estimates(market_identity_id, estimate_version_id, calculated_at desc)
  where superseded_at is null;

create index if not exists market_outlier_decisions_estimate_idx
  on market.outlier_decisions(price_estimate_id, decision);

create index if not exists market_refresh_jobs_due_idx
  on market.refresh_jobs(status, scheduled_for, priority desc)
  where status in ('queued', 'failed');

create index if not exists market_price_observations_stage10_provider_idx
  on market.price_observations(provider_code, source_item_id, observed_at desc)
  where provider_code is not null;

create index if not exists market_price_observations_stage10_identity_idx
  on market.price_observations(market_identity_id, observation_kind, observed_at desc)
  where observation_kind is not null;

create or replace view api.market_price_estimates
with (security_invoker = true)
as
select
  pe.id as price_estimate_id,
  pe.market_identity_id,
  pe.product_kind,
  pe.variant_id,
  pe.sealed_product_variant_id,
  mi.identity_key,
  mi.language_code,
  pe.condition_code,
  c.display_name as condition_label,
  pe.grader_code,
  g.display_name as grader_label,
  gr.grade_value,
  gr.display_label as grade_label,
  pe.display_currency_code,
  pe.evidence_status,
  pe.unavailable_reason,
  pe.sample_count,
  pe.sold_sample_count,
  pe.active_listing_count,
  pe.source_count,
  pe.date_range_start,
  pe.date_range_end,
  pe.low_estimate,
  pe.central_estimate,
  pe.high_estimate,
  pe.confidence_score,
  pe.confidence_label,
  pe.freshness,
  pe.source_breakdown,
  pe.outlier_summary,
  pe.fallback_identity_key,
  pe.fallback_reason,
  pe.calculated_at,
  pe.stale_after,
  pev.version_key as estimate_version
from market.price_estimates pe
join market.market_identities mi on mi.id = pe.market_identity_id
join market.price_estimate_versions pev on pev.id = pe.estimate_version_id
left join market.conditions c on c.code = pe.condition_code
left join market.graders g on g.code = pe.grader_code
left join market.grades gr on gr.id = pe.grade_id
where pe.superseded_at is null;

create or replace view api.market_price_history
with (security_invoker = true)
as
select
  so.id as observation_id,
  'sold_observation'::text as observation_type,
  so.market_identity_id,
  so.variant_id,
  so.sealed_product_variant_id,
  mi.identity_key,
  mi.product_kind,
  mi.language_code,
  so.provider_code,
  sp.display_name as provider_name,
  so.source_item_id,
  so.sold_price as observed_price,
  so.shipping_price,
  so.currency_code,
  so.sale_type as sale_or_listing_type,
  so.condition_code,
  so.grader_code,
  gr.display_label as grade_label,
  so.observed_at,
  so.sold_at,
  so.source_url,
  so.raw_title as source_title,
  so.parsed_match_confidence,
  so.duplicate_group_id,
  so.created_at
from market.sold_observations so
join market.market_identities mi on mi.id = so.market_identity_id
join market.source_providers sp on sp.code = so.provider_code
left join market.grades gr on gr.id = so.grade_id
union all
select
  al.id as observation_id,
  'active_listing'::text as observation_type,
  al.market_identity_id,
  al.variant_id,
  al.sealed_product_variant_id,
  mi.identity_key,
  mi.product_kind,
  mi.language_code,
  al.provider_code,
  sp.display_name as provider_name,
  al.source_item_id,
  al.observed_price,
  al.shipping_price,
  al.currency_code,
  al.listing_type as sale_or_listing_type,
  al.condition_code,
  al.grader_code,
  gr.display_label as grade_label,
  al.observed_at,
  null::timestamptz as sold_at,
  al.source_url,
  al.raw_title as source_title,
  al.parsed_match_confidence,
  al.duplicate_group_id,
  al.created_at
from market.active_listings al
join market.market_identities mi on mi.id = al.market_identity_id
join market.source_providers sp on sp.code = al.provider_code
left join market.grades gr on gr.id = al.grade_id;

create or replace view api.market_movers
with (security_invoker = true)
as
with ranked as (
  select
    pe.*,
    row_number() over (
      partition by pe.market_identity_id, pe.display_currency_code
      order by pe.calculated_at desc
    ) as estimate_rank
  from market.price_estimates pe
  where pe.central_estimate is not null
),
latest as (
  select * from ranked where estimate_rank = 1 and superseded_at is null
),
previous as (
  select * from ranked where estimate_rank = 2
)
select
  latest.market_identity_id,
  latest.variant_id,
  latest.sealed_product_variant_id,
  latest.product_kind,
  latest.display_currency_code,
  latest.central_estimate as current_estimate,
  previous.central_estimate as previous_estimate,
  case
    when previous.central_estimate is null or previous.central_estimate = 0 then null
    else round(((latest.central_estimate - previous.central_estimate) / previous.central_estimate) * 100, 2)
  end as percentage_change,
  latest.confidence_score,
  latest.confidence_label,
  latest.calculated_at,
  previous.calculated_at as previous_calculated_at
from latest
left join previous
  on previous.market_identity_id = latest.market_identity_id
  and previous.display_currency_code = latest.display_currency_code;

create or replace view api.market_opportunities
with (security_invoker = true)
as
select
  al.id as active_listing_id,
  al.market_identity_id,
  al.variant_id,
  al.sealed_product_variant_id,
  pe.product_kind,
  al.provider_code,
  al.source_item_id,
  al.raw_title as source_title,
  al.observed_price,
  al.shipping_price,
  al.currency_code,
  pe.central_estimate,
  pe.low_estimate,
  pe.high_estimate,
  case
    when pe.central_estimate is null or pe.central_estimate = 0 then null
    else round(((pe.central_estimate - (al.observed_price + coalesce(al.shipping_price, 0))) / pe.central_estimate) * 100, 2)
  end as discount_percentage,
  al.source_url,
  al.observed_at,
  pe.calculated_at as estimate_calculated_at,
  pe.confidence_score,
  pe.confidence_label
from market.active_listings al
join market.price_estimates pe
  on pe.market_identity_id = al.market_identity_id
  and pe.display_currency_code = al.currency_code
  and pe.superseded_at is null
  and pe.central_estimate is not null
where (al.observed_price + coalesce(al.shipping_price, 0)) < pe.central_estimate;

alter table market.source_providers enable row level security;
alter table market.currencies enable row level security;
alter table market.exchange_rate_snapshots enable row level security;
alter table market.conditions enable row level security;
alter table market.graders enable row level security;
alter table market.grades enable row level security;
alter table market.duplicate_groups enable row level security;
alter table market.active_listings enable row level security;
alter table market.sold_observations enable row level security;
alter table market.price_estimate_versions enable row level security;
alter table market.price_estimates enable row level security;
alter table market.outlier_decisions enable row level security;
alter table market.refresh_jobs enable row level security;

create policy "market service role manages source providers" on market.source_providers for all to service_role using (true) with check (true);
create policy "market service role manages currencies" on market.currencies for all to service_role using (true) with check (true);
create policy "market service role manages exchange rates" on market.exchange_rate_snapshots for all to service_role using (true) with check (true);
create policy "market service role manages conditions" on market.conditions for all to service_role using (true) with check (true);
create policy "market service role manages graders" on market.graders for all to service_role using (true) with check (true);
create policy "market service role manages grades" on market.grades for all to service_role using (true) with check (true);
create policy "market service role manages duplicate groups" on market.duplicate_groups for all to service_role using (true) with check (true);
create policy "market service role manages active listings" on market.active_listings for all to service_role using (true) with check (true);
create policy "market service role manages sold observations" on market.sold_observations for all to service_role using (true) with check (true);
create policy "market service role manages estimate versions" on market.price_estimate_versions for all to service_role using (true) with check (true);
create policy "market service role manages price estimates" on market.price_estimates for all to service_role using (true) with check (true);
create policy "market service role manages outlier decisions" on market.outlier_decisions for all to service_role using (true) with check (true);
create policy "market service role manages refresh jobs" on market.refresh_jobs for all to service_role using (true) with check (true);

revoke all on all tables in schema market from anon, authenticated;
revoke all on all sequences in schema market from anon, authenticated;
grant usage on schema market to service_role;
grant select, insert, update, delete on all tables in schema market to service_role;
grant usage, select on all sequences in schema market to service_role;

grant usage on schema api to service_role;
grant select on table api.market_price_estimates to service_role;
grant select on table api.market_price_history to service_role;
grant select on table api.market_movers to service_role;
grant select on table api.market_opportunities to service_role;
revoke all on table api.market_price_estimates from anon, authenticated;
revoke all on table api.market_price_history from anon, authenticated;
revoke all on table api.market_movers from anon, authenticated;
revoke all on table api.market_opportunities from anon, authenticated;

insert into market.currencies (code, display_name, minor_unit) values
  ('GBP', 'Pound sterling', 2),
  ('USD', 'US dollar', 2),
  ('EUR', 'Euro', 2),
  ('JPY', 'Japanese yen', 0),
  ('CAD', 'Canadian dollar', 2),
  ('AUD', 'Australian dollar', 2)
on conflict (code) do update set
  display_name = excluded.display_name,
  minor_unit = excluded.minor_unit,
  updated_at = now();

insert into market.conditions (code, product_kind, display_name, sort_order) values
  ('raw_mint', 'raw_card', 'Mint', 10),
  ('raw_near_mint', 'raw_card', 'Near mint', 20),
  ('raw_lightly_played', 'raw_card', 'Lightly played', 30),
  ('raw_moderately_played', 'raw_card', 'Moderately played', 40),
  ('raw_heavily_played', 'raw_card', 'Heavily played', 50),
  ('raw_damaged', 'raw_card', 'Damaged', 60),
  ('raw_unknown', 'raw_card', 'Unknown raw condition', 100),
  ('graded', 'graded_card', 'Graded', 10),
  ('sealed_new', 'sealed_product', 'Factory sealed', 10),
  ('sealed_damaged', 'sealed_product', 'Sealed with damage', 20),
  ('sealed_unknown', 'sealed_product', 'Unknown sealed condition', 100)
on conflict (code) do update set
  product_kind = excluded.product_kind,
  display_name = excluded.display_name,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into market.graders (code, display_name, website_url) values
  ('PSA', 'Professional Sports Authenticator', 'https://www.psacard.com'),
  ('BGS', 'Beckett Grading Services', 'https://www.beckett.com/grading'),
  ('CGC', 'CGC Cards', 'https://www.cgccards.com'),
  ('SGC', 'Sportscard Guaranty Corporation', 'https://www.gosgc.com'),
  ('ACE', 'Ace Grading', 'https://acegrading.com')
on conflict (code) do update set
  display_name = excluded.display_name,
  website_url = excluded.website_url,
  updated_at = now();

insert into market.grades (grader_code, grade_value, grade_numeric, display_label, sort_order)
select grader_code, grade_value, grade_numeric, display_label, sort_order
from (
  values
    ('PSA', '10', 10, 'PSA 10', 100),
    ('PSA', '9', 9, 'PSA 9', 90),
    ('PSA', '8', 8, 'PSA 8', 80),
    ('BGS', '10', 10, 'BGS 10', 100),
    ('BGS', '9.5', 9.5, 'BGS 9.5', 95),
    ('BGS', '9', 9, 'BGS 9', 90),
    ('CGC', '10', 10, 'CGC 10', 100),
    ('CGC', '9.5', 9.5, 'CGC 9.5', 95),
    ('CGC', '9', 9, 'CGC 9', 90),
    ('ACE', '10', 10, 'ACE 10', 100),
    ('ACE', '9', 9, 'ACE 9', 90)
) as seed(grader_code, grade_value, grade_numeric, display_label, sort_order)
on conflict (grader_code, grade_value) do update set
  grade_numeric = excluded.grade_numeric,
  display_label = excluded.display_label,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into market.source_providers (
  code,
  display_name,
  provider_kind,
  active,
  official_api_required,
  oauth_required,
  supports_active_listings,
  supports_sold_observations,
  supported_marketplaces,
  supported_currencies,
  terms_url,
  data_licence_status,
  automated_refresh_allowed,
  credential_env_names,
  health_status
) values
  (
    'ebay_browse_active',
    'eBay Browse API active listings',
    'marketplace',
    true,
    true,
    true,
    true,
    false,
    array['EBAY_GB', 'EBAY_US', 'EBAY_DE', 'EBAY_FR', 'EBAY_CA', 'EBAY_AU'],
    array['GBP', 'USD', 'EUR', 'CAD', 'AUD'],
    'https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search',
    'approved',
    true,
    array['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_MARKETPLACE_ID', 'EBAY_OAUTH_SCOPES'],
    'unknown'
  ),
  (
    'ebay_sold_authorised',
    'Authorised eBay sold-data import',
    'marketplace',
    false,
    true,
    true,
    false,
    true,
    array['EBAY_GB', 'EBAY_US', 'EBAY_DE', 'EBAY_FR', 'EBAY_CA', 'EBAY_AU'],
    array['GBP', 'USD', 'EUR', 'CAD', 'AUD'],
    'https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html',
    'restricted',
    false,
    array['EBAY_SOLD_API_URL', 'EBAY_SOLD_API_KEY'],
    'unavailable'
  ),
  (
    'manual_verified_import',
    'Manual verified sale import',
    'manual_import',
    true,
    false,
    false,
    false,
    true,
    array[]::text[],
    array['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD'],
    null,
    'approved',
    false,
    array[]::text[],
    'unknown'
  ),
  (
    'stackr_legacy_market',
    'Existing Stackr market cache',
    'internal',
    true,
    false,
    false,
    true,
    false,
    array[]::text[],
    array['GBP'],
    null,
    'restricted',
    false,
    array[]::text[],
    'unknown'
  )
on conflict (code) do update set
  display_name = excluded.display_name,
  provider_kind = excluded.provider_kind,
  official_api_required = excluded.official_api_required,
  oauth_required = excluded.oauth_required,
  supports_active_listings = excluded.supports_active_listings,
  supports_sold_observations = excluded.supports_sold_observations,
  supported_marketplaces = excluded.supported_marketplaces,
  supported_currencies = excluded.supported_currencies,
  terms_url = excluded.terms_url,
  data_licence_status = excluded.data_licence_status,
  automated_refresh_allowed = excluded.automated_refresh_allowed,
  credential_env_names = excluded.credential_env_names,
  updated_at = now();

insert into market.price_estimate_versions (
  version_key,
  methodology,
  weighting_config,
  outlier_config,
  currency_policy,
  status,
  activated_at
) values (
  'market-pricing-v1.0.0',
  'Provider-neutral Stackr market pricing. Sold transactions, active asking prices, accepted offers, auction results, raw, graded and sealed products remain separate.',
  '{"sold_transaction":1,"manual_verified_sale":0.95,"market_estimate":0.55,"active_listing":0.35,"recency_half_life_days":45}'::jsonb,
  '{"method":"median_absolute_deviation","modified_z_threshold":3.5}'::jsonb,
  '{"default_display_currency":"GBP","exchange_rates_required":true}'::jsonb,
  'active',
  now()
)
on conflict (version_key) do update set
  methodology = excluded.methodology,
  weighting_config = excluded.weighting_config,
  outlier_config = excluded.outlier_config,
  currency_policy = excluded.currency_policy,
  status = excluded.status,
  updated_at = now();

comment on table market.source_providers is
  'Provider registry for Stackr market pricing. Credentials are named here but values must stay in backend/CI secret stores.';

comment on table market.active_listings is
  'Current asking-price evidence only. Rows in this table must never be presented as confirmed sold transactions.';

comment on table market.sold_observations is
  'Sold evidence from authorised sold-data sources, approved account data or legitimate imports only.';

comment on table market.price_estimates is
  'Provider-neutral estimates separated by canonical market identity, product kind, variant, condition, grader and grade.';

comment on column market.price_estimates.fallback_identity_key is
  'When populated, response clients must label the price as a fallback estimate rather than exact evidence.';

comment on view api.market_price_estimates is
  'Service-role API projection for /v1 pricing responses. Excludes raw payloads, provider secrets and internal notes.';

comment on view api.market_price_history is
  'Service-role API projection for pricing evidence history. Keeps active listings and sold observations explicitly separated.';
