create extension if not exists pg_trgm with schema extensions;

create index if not exists pokemon_cards_language_set_number_idx
  on public.pokemon_cards(language, set_id, number);

create index if not exists pokemon_cards_name_trgm_idx
  on public.pokemon_cards using gin (name gin_trgm_ops);

create index if not exists pokemon_cards_raw_data_gin_idx
  on public.pokemon_cards using gin (raw_data);

create index if not exists market_price_snapshots_card_language_latest_idx
  on public.market_price_snapshots(card_id, language, snapshot_at desc);

create index if not exists user_card_variants_user_set_card_idx
  on public.user_card_variants(user_id, set_id, card_id);

create index if not exists user_card_variants_user_quantity_idx
  on public.user_card_variants(user_id, quantity)
  where quantity is not null;

create index if not exists user_card_flags_graded_listing_idx
  on public.user_card_flags(user_id, pricing_mode, grade_company, grade)
  where pricing_mode = 'graded' or grade_company is not null or grade is not null;

create index if not exists binder_cards_binder_owned_idx
  on public.binder_cards(binder_id, owned, card_id, set_id);

comment on index public.pokemon_cards_language_set_number_idx is
  'Supports fast Japanese/English exact set and collector-number searches.';

comment on index public.pokemon_cards_name_trgm_idx is
  'Supports approximate card-name search without client-side full-catalogue scans.';

comment on index public.market_price_snapshots_card_language_latest_idx is
  'Keeps English and Japanese price history lookups separate and ordered newest-first.';

comment on index public.user_card_variants_user_set_card_idx is
  'Supports shared collection summary aggregation by user, set and card.';

comment on index public.user_card_flags_graded_listing_idx is
  'Supports graded marketplace filtering by grader and grade.';
