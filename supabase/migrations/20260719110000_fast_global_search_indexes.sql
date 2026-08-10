create extension if not exists pg_trgm with schema extensions;

create index if not exists pokemon_cards_language_name_idx
  on public.pokemon_cards(language, name);

create index if not exists pokemon_cards_language_number_idx
  on public.pokemon_cards(language, number);

create index if not exists pokemon_sets_name_trgm_idx
  on public.pokemon_sets using gin (name gin_trgm_ops);

create index if not exists pokemon_sets_series_trgm_idx
  on public.pokemon_sets using gin (series gin_trgm_ops);

create index if not exists market_products_search_text_trgm_idx
  on public.market_products using gin (search_text gin_trgm_ops);

create index if not exists user_card_flags_product_name_trgm_idx
  on public.user_card_flags using gin (product_name gin_trgm_ops)
  where flag_type = 'trade';

create index if not exists user_card_flags_card_id_trgm_idx
  on public.user_card_flags using gin (card_id gin_trgm_ops)
  where flag_type = 'trade';

create index if not exists user_card_flags_grade_company_trgm_idx
  on public.user_card_flags using gin (grade_company gin_trgm_ops)
  where flag_type = 'trade';

comment on index public.market_products_search_text_trgm_idx is
  'Supports sub-500ms global search product lookups that use ilike search_text filters.';

comment on index public.user_card_flags_product_name_trgm_idx is
  'Supports fast marketplace listing search by product name.';
