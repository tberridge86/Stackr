create extension if not exists pgcrypto;

create table if not exists public.canonical_card_concepts (
  id text primary key,
  canonical_name text not null,
  pokemon_dex_ids integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tcg_series (
  id text primary key,
  game text not null default 'pokemon',
  region text not null,
  language text not null,
  canonical_name text not null,
  local_name text,
  source_provider text not null,
  source_id text not null,
  display_order integer,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id, language)
);

create table if not exists public.tcg_sets (
  id text primary key,
  series_id text references public.tcg_series(id) on delete set null,
  region text not null,
  language text not null,
  canonical_name text not null,
  local_name text,
  english_display_name text,
  set_code text,
  printed_total integer,
  actual_total integer,
  release_date date,
  symbol_url text,
  logo_url text,
  source_provider text not null,
  source_id text not null,
  data_completeness text not null default 'unavailable',
  image_completeness text not null default 'unavailable',
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id, language)
);

create table if not exists public.tcg_cards (
  id text primary key,
  set_id text not null references public.tcg_sets(id) on delete cascade,
  concept_id text references public.canonical_card_concepts(id) on delete set null,
  region text not null,
  language text not null,
  canonical_name text not null,
  local_name text,
  english_display_name text,
  collector_number text,
  printed_number text,
  rarity text,
  supertype text,
  subtypes text[] not null default '{}'::text[],
  hp text,
  artist text,
  image_small_url text,
  image_large_url text,
  source_provider text not null,
  source_id text not null,
  data_completeness text not null default 'unavailable',
  image_status text not null default 'unavailable',
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id, language)
);

create table if not exists public.card_printings (
  id text primary key,
  concept_id text references public.canonical_card_concepts(id) on delete set null,
  card_id text not null references public.tcg_cards(id) on delete cascade,
  set_id text not null references public.tcg_sets(id) on delete cascade,
  region text not null,
  language text not null,
  collector_number text,
  variant text not null default 'normal',
  rarity text,
  image_small_url text,
  image_large_url text,
  source_provider text not null,
  source_id text not null,
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id, language, variant)
);

create table if not exists public.card_variants (
  id text primary key,
  card_id text not null references public.tcg_cards(id) on delete cascade,
  printing_id text references public.card_printings(id) on delete cascade,
  region text not null,
  language text not null,
  variant_type text not null,
  variant_label text,
  source_provider text not null,
  source_id text,
  confidence text not null default 'medium',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sealed_products (
  id text primary key,
  region text not null,
  language text not null,
  product_type text not null,
  canonical_name text not null,
  local_name text,
  english_display_name text,
  set_id text references public.tcg_sets(id) on delete set null,
  release_date date,
  pack_count integer,
  cards_per_pack integer,
  box_configuration text,
  manufacturer_product_code text,
  barcode text,
  image_front_url text,
  image_back_url text,
  image_side_url text,
  image_source text,
  image_license_status text not null default 'unknown',
  image_verified boolean not null default false,
  image_last_checked timestamptz,
  source_provider text not null,
  source_id text not null,
  data_completeness text not null default 'unavailable',
  image_status text not null default 'unavailable',
  confidence text not null default 'unavailable',
  search_text text not null default '',
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id, language)
);

create table if not exists public.sealed_product_variants (
  id text primary key,
  product_id text not null references public.sealed_products(id) on delete cascade,
  variant_type text not null,
  variant_label text,
  region text not null,
  language text not null,
  quantity integer,
  image_url text,
  source_provider text not null,
  source_id text,
  confidence text not null default 'unavailable',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_record_type text not null,
  provider_record_id text not null,
  region text,
  language text not null default '',
  retrieved_at timestamptz not null default now(),
  response_status text not null default 'success',
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.provider_records
  alter column language set default '';

update public.provider_records
set language = ''
where language is null;

alter table if exists public.provider_records
  alter column language set not null;

create table if not exists public.provider_mappings (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text,
  provider text not null,
  provider_card_id text not null,
  language text not null default 'en',
  confidence numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_card_id, language)
);

alter table if exists public.provider_mappings
  alter column stackr_card_id drop not null,
  add column if not exists provider_record_type text,
  add column if not exists provider_record_id text,
  add column if not exists stackr_entity_type text,
  add column if not exists stackr_entity_id text,
  add column if not exists match_method text,
  add column if not exists match_confidence numeric,
  add column if not exists match_status text not null default 'matched',
  add column if not exists last_verified_at timestamptz;

update public.provider_mappings
set
  provider_record_type = coalesce(provider_record_type, 'card'),
  provider_record_id = coalesce(provider_record_id, provider_card_id),
  stackr_entity_type = coalesce(stackr_entity_type, 'card'),
  stackr_entity_id = coalesce(stackr_entity_id, stackr_card_id),
  match_confidence = coalesce(match_confidence, confidence),
  match_method = coalesce(match_method, 'legacy_mapping'),
  last_verified_at = coalesce(last_verified_at, updated_at, created_at, now())
where provider_record_id is null
   or stackr_entity_id is null
   or match_confidence is null
   or last_verified_at is null;

create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  entity_type text not null,
  region text not null,
  language text not null,
  currency text not null,
  condition text,
  grader text,
  grade text,
  price_type text not null,
  low numeric,
  average numeric,
  market numeric,
  high numeric,
  last_sold numeric,
  sales_count integer,
  original_price numeric,
  original_currency text,
  display_price numeric,
  display_currency text not null default 'GBP',
  exchange_rate numeric,
  exchange_rate_timestamp timestamptz,
  source_provider text not null,
  source_url text,
  provider_updated_at timestamptz,
  retrieved_at timestamptz not null default now(),
  confidence text not null default 'unavailable',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  market_price_id uuid references public.market_prices(id) on delete cascade,
  entity_id text not null,
  entity_type text not null,
  region text not null,
  language text not null,
  price_type text not null,
  display_price numeric,
  display_currency text not null default 'GBP',
  original_price numeric,
  original_currency text,
  observed_at timestamptz not null default now(),
  source_provider text not null,
  confidence text not null default 'unavailable',
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_name text not null,
  region text,
  language text,
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_requested integer not null default 0,
  records_retrieved integer not null default 0,
  records_written integer not null default 0,
  records_skipped integer not null default 0,
  missing_records integer not null default 0,
  duplicate_records integer not null default 0,
  failed_mappings integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.sync_runs(id) on delete cascade,
  provider text not null,
  sync_name text not null,
  entity_type text,
  entity_id text,
  error_type text not null,
  error_message text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.catalogue_review_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  region text,
  language text,
  reason text not null,
  match_candidates jsonb not null default '[]'::jsonb,
  status text not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.market_products
  add column if not exists language text,
  add column if not exists region text,
  add column if not exists release_year text,
  add column if not exists source_provider text,
  add column if not exists source_id text,
  add column if not exists confidence text,
  add column if not exists data_completeness text,
  add column if not exists image_status text;

create index if not exists idx_sets_region_language
  on public.tcg_sets(region, language);

create index if not exists idx_sets_release_date
  on public.tcg_sets(release_date desc);

drop index if exists public.idx_provider_set_mapping;

create unique index if not exists idx_provider_set_mapping
  on public.provider_mappings(provider, provider_record_type, provider_record_id, language)
  where provider_record_type = 'set' and provider_record_id is not null;

create index if not exists idx_cards_set_number
  on public.tcg_cards(set_id, collector_number);

create index if not exists idx_cards_language_name
  on public.tcg_cards(language, canonical_name);

create index if not exists idx_cards_local_name
  on public.tcg_cards using gin(to_tsvector('simple', coalesce(local_name, '') || ' ' || coalesce(english_display_name, '') || ' ' || coalesce(collector_number, '')));

create index if not exists idx_products_set_type
  on public.sealed_products(set_id, product_type);

create index if not exists idx_products_search_text
  on public.sealed_products using gin(to_tsvector('simple', search_text));

create unique index if not exists idx_provider_records_identity
  on public.provider_records(provider, provider_record_type, provider_record_id, language);

create index if not exists market_products_language_idx
  on public.market_products(language, region);

create index if not exists market_products_source_provider_idx
  on public.market_products(source_provider, source_id);

create index if not exists idx_prices_entity_latest
  on public.market_prices(entity_type, entity_id, retrieved_at desc);

create index if not exists idx_sync_runs_provider_latest
  on public.sync_runs(provider, language, started_at desc);

create index if not exists idx_sync_errors_run
  on public.sync_errors(sync_run_id, created_at desc);

create or replace view public.japanese_catalogue_health as
select
  s.id as set_id,
  s.source_provider,
  s.source_id,
  s.local_name,
  s.english_display_name,
  s.set_code,
  s.release_date,
  s.printed_total,
  s.actual_total,
  count(c.id)::integer as stored_total,
  count(c.id) filter (where c.data_completeness in ('verified', 'high', 'medium'))::integer as cards_with_metadata,
  count(c.id) filter (where c.image_small_url is not null)::integer as cards_with_small_image,
  count(c.id) filter (where c.image_large_url is not null)::integer as cards_with_large_image,
  count(c.id) filter (
    where exists (
      select 1
      from public.market_prices p
      where p.entity_type in ('card', 'card_printing')
        and p.entity_id in (c.id, coalesce(c.source_id, c.id))
        and p.region = s.region
        and p.language = s.language
    )
  )::integer as cards_with_price,
  greatest(coalesce(s.actual_total, 0) - count(c.id) filter (
    where exists (
      select 1
      from public.market_prices p
      where p.entity_type in ('card', 'card_printing')
        and p.entity_id in (c.id, coalesce(c.source_id, c.id))
        and p.region = s.region
        and p.language = s.language
    )
  ), 0)::integer as cards_missing_price,
  count(c.id) filter (where c.image_small_url is null and c.image_large_url is null)::integer as cards_missing_image,
  count(c.id) filter (where c.data_completeness = 'unavailable')::integer as cards_unmatched,
  count(distinct sp.id)::integer as sealed_products_linked,
  max(c.last_synced_at) as last_successful_sync,
  case
    when s.data_completeness = 'sync_failed' then 'Sync failed'
    when count(c.id) < coalesce(s.actual_total, s.printed_total, 0) then 'Card metadata incomplete'
    when count(c.id) filter (where c.image_small_url is null and c.image_large_url is null) > 0 then 'Images incomplete'
    when count(distinct sp.id) = 0 then 'Products incomplete'
    when count(c.id) filter (
      where exists (
        select 1
        from public.market_prices p
        where p.entity_type in ('card', 'card_printing')
          and p.entity_id in (c.id, coalesce(c.source_id, c.id))
          and p.region = s.region
          and p.language = s.language
      )
    ) < count(c.id) then 'Pricing incomplete'
    when s.data_completeness in ('verified', 'high') and s.image_completeness in ('verified', 'high') then 'Complete'
    else 'Needs review'
  end as current_status
from public.tcg_sets s
left join public.tcg_cards c on c.set_id = s.id
left join public.sealed_products sp on sp.set_id = s.id
where s.region = 'JP' and s.language = 'ja'
group by s.id;

alter table public.canonical_card_concepts enable row level security;
alter table public.tcg_series enable row level security;
alter table public.tcg_sets enable row level security;
alter table public.tcg_cards enable row level security;
alter table public.card_printings enable row level security;
alter table public.card_variants enable row level security;
alter table public.sealed_products enable row level security;
alter table public.sealed_product_variants enable row level security;
alter table public.provider_records enable row level security;
alter table public.provider_mappings enable row level security;
alter table public.market_prices enable row level security;
alter table public.price_history enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_errors enable row level security;
alter table public.catalogue_review_queue enable row level security;

drop policy if exists "Catalogue concepts are readable" on public.canonical_card_concepts;
create policy "Catalogue concepts are readable" on public.canonical_card_concepts for select using (true);

drop policy if exists "TCG series are readable" on public.tcg_series;
create policy "TCG series are readable" on public.tcg_series for select using (true);

drop policy if exists "TCG sets are readable" on public.tcg_sets;
create policy "TCG sets are readable" on public.tcg_sets for select using (true);

drop policy if exists "TCG cards are readable" on public.tcg_cards;
create policy "TCG cards are readable" on public.tcg_cards for select using (true);

drop policy if exists "Card printings are readable" on public.card_printings;
create policy "Card printings are readable" on public.card_printings for select using (true);

drop policy if exists "Card variants are readable" on public.card_variants;
create policy "Card variants are readable" on public.card_variants for select using (true);

drop policy if exists "Sealed products are readable" on public.sealed_products;
create policy "Sealed products are readable" on public.sealed_products for select using (true);

drop policy if exists "Sealed product variants are readable" on public.sealed_product_variants;
create policy "Sealed product variants are readable" on public.sealed_product_variants for select using (true);

drop policy if exists "Market prices are readable" on public.market_prices;
create policy "Market prices are readable" on public.market_prices for select using (true);

drop policy if exists "Provider mappings are readable" on public.provider_mappings;
create policy "Provider mappings are readable" on public.provider_mappings for select using (true);

drop policy if exists "Price history is readable" on public.price_history;
create policy "Price history is readable" on public.price_history for select using (true);

drop policy if exists "Sync runs require authenticated read" on public.sync_runs;
create policy "Sync runs require authenticated read" on public.sync_runs for select to authenticated using (true);

drop policy if exists "Sync errors require authenticated read" on public.sync_errors;
create policy "Sync errors require authenticated read" on public.sync_errors for select to authenticated using (true);

grant select on
  public.canonical_card_concepts,
  public.tcg_series,
  public.tcg_sets,
  public.tcg_cards,
  public.card_printings,
  public.card_variants,
  public.sealed_products,
  public.sealed_product_variants,
  public.provider_mappings,
  public.market_prices,
  public.price_history,
  public.japanese_catalogue_health
to anon, authenticated;

grant all on
  public.canonical_card_concepts,
  public.tcg_series,
  public.tcg_sets,
  public.tcg_cards,
  public.card_printings,
  public.card_variants,
  public.sealed_products,
  public.sealed_product_variants,
  public.provider_mappings,
  public.provider_records,
  public.market_prices,
  public.price_history,
  public.sync_runs,
  public.sync_errors,
  public.catalogue_review_queue
to service_role;

comment on view public.japanese_catalogue_health is
  'Administrative coverage view for Japanese catalogue metadata, images, products and pricing. Complete means expected records were processed and missing fields are accounted for.';
