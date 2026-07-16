alter table if exists public.pokemon_sets
  add column if not exists language text not null default 'en',
  add column if not exists region text,
  add column if not exists external_ids jsonb not null default '{}'::jsonb;

alter table if exists public.pokemon_cards
  add column if not exists language text not null default 'en',
  add column if not exists region text,
  add column if not exists external_ids jsonb not null default '{}'::jsonb;

alter table if exists public.binder_cards
  add column if not exists language text not null default 'en';

alter table if exists public.market_price_snapshots
  add column if not exists language text not null default 'en',
  add column if not exists tcgdex_card_id text,
  add column if not exists tcgdex_price numeric,
  add column if not exists tcgdex_price_updated_at timestamptz,
  add column if not exists price_source text,
  add column if not exists source_payload jsonb;

create index if not exists pokemon_cards_language_set_idx
  on public.pokemon_cards(language, set_id);

create index if not exists pokemon_cards_external_ids_gin_idx
  on public.pokemon_cards using gin (external_ids);

create index if not exists pokemon_sets_language_idx
  on public.pokemon_sets(language);

create index if not exists market_price_snapshots_language_card_idx
  on public.market_price_snapshots(language, card_id, snapshot_at desc);

create index if not exists market_price_snapshots_tcgdex_idx
  on public.market_price_snapshots(tcgdex_card_id, snapshot_at desc)
  where tcgdex_card_id is not null;

comment on column public.pokemon_cards.language is
  'Card print language. English cards use en; Japanese cards use ja.';

comment on column public.market_price_snapshots.language is
  'Pricing language lane so English and Japanese market prices do not overwrite each other.';

comment on column public.market_price_snapshots.tcgdex_price is
  'Preferred GBP price resolved from TCGdex pricing data.';
