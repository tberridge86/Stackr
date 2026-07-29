-- Metadata-only catalogue coverage for the commonly requested Japanese
-- CoroCoro Mew promos. These records intentionally do not include card image
-- URLs; approved imagery should come through the existing asset pipeline.

alter table if exists public.pokemon_sets
  add column if not exists raw_data jsonb;

insert into public.canonical_card_concepts (id, canonical_name, pokemon_dex_ids)
values ('pokemon:mew', 'Mew', array[151])
on conflict (id) do update set
  canonical_name = excluded.canonical_name,
  pokemon_dex_ids = excluded.pokemon_dex_ids,
  updated_at = now();

insert into public.tcg_series (
  id,
  game,
  region,
  language,
  canonical_name,
  local_name,
  source_provider,
  source_id,
  display_order,
  raw_payload
)
values (
  'ja:unnumbered-promos',
  'pokemon',
  'JP',
  'ja',
  'Japanese Unnumbered Promos',
  'Japanese Unnumbered Promos',
  'stackr_manual',
  'unnumbered-promos',
  10,
  jsonb_build_object('curation_status', 'partial_metadata_only')
)
on conflict (id) do update set
  canonical_name = excluded.canonical_name,
  local_name = excluded.local_name,
  raw_payload = excluded.raw_payload,
  updated_at = now();

insert into public.tcg_sets (
  id,
  series_id,
  region,
  language,
  canonical_name,
  local_name,
  english_display_name,
  set_code,
  printed_total,
  actual_total,
  release_date,
  symbol_url,
  logo_url,
  source_provider,
  source_id,
  data_completeness,
  image_completeness,
  last_synced_at,
  raw_payload
)
values
  (
    'ja:corocoro-comic-february-1997-promo',
    'ja:unnumbered-promos',
    'JP',
    'ja',
    'CoroCoro Comic Promo (February 1997)',
    'CoroCoro Comic Promo',
    'CoroCoro Comic Promo (February 1997)',
    'corocoro-1997-02',
    1,
    1,
    date '1997-01-15',
    null,
    null,
    'stackr_manual',
    'corocoro-comic-february-1997-promo',
    'partial',
    'metadata_only',
    now(),
    jsonb_build_object(
      'name', 'CoroCoro Comic Promo (February 1997)',
      'local_name', 'CoroCoro Comic Promo',
      'english_display_name', 'CoroCoro Comic Promo (February 1997)',
      'language', 'ja',
      'region', 'JP',
      'releaseDate', '1997-01-15',
      'cardCount', jsonb_build_object('official', 1, 'total', 1),
      'curation_status', 'partial_metadata_only',
      'image_policy', 'no_unlicensed_card_image'
    )
  ),
  (
    'ja:corocoro-comic-may-2001-promo',
    'ja:unnumbered-promos',
    'JP',
    'ja',
    'CoroCoro Comic Promo (May 2001)',
    'CoroCoro Comic Promo',
    'CoroCoro Comic Promo (May 2001)',
    'corocoro-2001-05',
    1,
    1,
    date '2001-04-15',
    null,
    null,
    'stackr_manual',
    'corocoro-comic-may-2001-promo',
    'partial',
    'metadata_only',
    now(),
    jsonb_build_object(
      'name', 'CoroCoro Comic Promo (May 2001)',
      'local_name', 'CoroCoro Comic Promo',
      'english_display_name', 'CoroCoro Comic Promo (May 2001)',
      'language', 'ja',
      'region', 'JP',
      'releaseDate', '2001-04-15',
      'cardCount', jsonb_build_object('official', 1, 'total', 1),
      'curation_status', 'partial_metadata_only',
      'image_policy', 'no_unlicensed_card_image'
    )
  )
on conflict (id) do update set
  series_id = excluded.series_id,
  canonical_name = excluded.canonical_name,
  local_name = excluded.local_name,
  english_display_name = excluded.english_display_name,
  set_code = excluded.set_code,
  printed_total = excluded.printed_total,
  actual_total = excluded.actual_total,
  release_date = excluded.release_date,
  data_completeness = excluded.data_completeness,
  image_completeness = excluded.image_completeness,
  raw_payload = excluded.raw_payload,
  updated_at = now();

insert into public.tcg_cards (
  id,
  set_id,
  concept_id,
  region,
  language,
  canonical_name,
  local_name,
  english_display_name,
  collector_number,
  printed_number,
  rarity,
  supertype,
  subtypes,
  hp,
  artist,
  image_small_url,
  image_large_url,
  source_provider,
  source_id,
  data_completeness,
  image_status,
  last_synced_at,
  raw_payload
)
values
  (
    'ja:corocoro-mew-1997',
    'ja:corocoro-comic-february-1997-promo',
    'pokemon:mew',
    'JP',
    'ja',
    'Mew',
    'ミュウ',
    'Mew',
    'Unnumbered',
    'Unnumbered',
    'Promo',
    'Pokemon',
    array['Basic'],
    null,
    null,
    null,
    null,
    'stackr_manual',
    'corocoro-mew-1997',
    'partial',
    'metadata_only',
    now(),
    jsonb_build_object(
      'id', 'corocoro-mew-1997',
      'name', 'Mew',
      'local_name', 'ミュウ',
      'english_display_name', 'Mew',
      'canonical_name', 'Mew',
      'language', 'ja',
      'region', 'JP',
      'number', 'Unnumbered',
      'localId', 'Unnumbered',
      'printed_number', 'Unnumbered',
      'pokedexNumber', 151,
      'dexId', jsonb_build_array(151),
      'rarity', 'Promo',
      'supertype', 'Pokemon',
      'types', jsonb_build_array('Psychic'),
      'variant_label', 'Glossy CoroCoro Comic promo',
      'release_date', '1997-01-15',
      'release_label', 'February 1997 CoroCoro Comic insert',
      'aliases', jsonb_build_array(
        'CoroCoro Mew',
        'Coro Coro Mew',
        'CoroCoro Comic Mew',
        'Mew CoroCoro Promo',
        '1997 CoroCoro Mew',
        'Lilypad Mew',
        'Lily Pad Mew',
        'Glossy Mew',
        'No.151 Mew',
        '#151 Mew'
      ),
      'source_urls', jsonb_build_array(
        'https://bulbapedia.bulbagarden.net/wiki/Mew_(Wizards_Promo_47)',
        'https://pokumon.com/card/mew-corocoro-1997-unnumbered/'
      ),
      'provenance', jsonb_build_object(
        'source_provider', 'stackr_manual',
        'curation_status', 'metadata_only',
        'image_policy', 'no_unlicensed_card_image'
      ),
      'images', jsonb_build_object('small', null, 'large', null),
      'set', jsonb_build_object(
        'id', 'ja:corocoro-comic-february-1997-promo',
        'name', 'CoroCoro Comic Promo (February 1997)',
        'local_name', 'CoroCoro Comic Promo',
        'english_display_name', 'CoroCoro Comic Promo (February 1997)',
        'series', 'Japanese Unnumbered Promos',
        'language', 'ja',
        'region', 'JP',
        'releaseDate', '1997-01-15',
        'printedTotal', 1,
        'total', 1,
        'set_code', 'corocoro-1997-02',
        'source_provider', 'stackr_manual',
        'source_id', 'corocoro-comic-february-1997-promo'
      )
    )
  ),
  (
    'ja:corocoro-shining-mew-2001',
    'ja:corocoro-comic-may-2001-promo',
    'pokemon:mew',
    'JP',
    'ja',
    'Shining Mew',
    'ひかるミュウ',
    'Shining Mew',
    'Unnumbered',
    'Unnumbered',
    'Promo',
    'Pokemon',
    array['Basic'],
    null,
    null,
    null,
    null,
    'stackr_manual',
    'corocoro-shining-mew-2001',
    'partial',
    'metadata_only',
    now(),
    jsonb_build_object(
      'id', 'corocoro-shining-mew-2001',
      'name', 'Shining Mew',
      'local_name', 'ひかるミュウ',
      'english_display_name', 'Shining Mew',
      'canonical_name', 'Shining Mew',
      'language', 'ja',
      'region', 'JP',
      'number', 'Unnumbered',
      'localId', 'Unnumbered',
      'printed_number', 'Unnumbered',
      'pokedexNumber', 151,
      'dexId', jsonb_build_array(151),
      'rarity', 'Promo',
      'supertype', 'Pokemon',
      'types', jsonb_build_array('Psychic'),
      'variant_label', 'CoroCoro Comic holo promo',
      'release_date', '2001-04-15',
      'release_label', 'May 2001 CoroCoro Comic insert',
      'aliases', jsonb_build_array(
        'CoroCoro Shining Mew',
        'Coro Coro Shining Mew',
        'Shining Mew CoroCoro',
        'Shining Mew CoroCoro Comic Promo',
        '2001 CoroCoro Mew',
        '2001 CoroCoro Shining Mew',
        'No.151 Shining Mew',
        '#151 Shining Mew'
      ),
      'source_urls', jsonb_build_array(
        'https://bulbapedia.bulbagarden.net/wiki/Shining_Mew_(CoroCoro_promo)',
        'https://bulbapedia.bulbagarden.net/wiki/Unnumbered_Promotional_cards_(TCG)/1996-2005'
      ),
      'provenance', jsonb_build_object(
        'source_provider', 'stackr_manual',
        'curation_status', 'metadata_only',
        'image_policy', 'no_unlicensed_card_image'
      ),
      'images', jsonb_build_object('small', null, 'large', null),
      'set', jsonb_build_object(
        'id', 'ja:corocoro-comic-may-2001-promo',
        'name', 'CoroCoro Comic Promo (May 2001)',
        'local_name', 'CoroCoro Comic Promo',
        'english_display_name', 'CoroCoro Comic Promo (May 2001)',
        'series', 'Japanese Unnumbered Promos',
        'language', 'ja',
        'region', 'JP',
        'releaseDate', '2001-04-15',
        'printedTotal', 1,
        'total', 1,
        'set_code', 'corocoro-2001-05',
        'source_provider', 'stackr_manual',
        'source_id', 'corocoro-comic-may-2001-promo'
      )
    )
  )
on conflict (id) do update set
  set_id = excluded.set_id,
  concept_id = excluded.concept_id,
  canonical_name = excluded.canonical_name,
  local_name = excluded.local_name,
  english_display_name = excluded.english_display_name,
  collector_number = excluded.collector_number,
  printed_number = excluded.printed_number,
  rarity = excluded.rarity,
  supertype = excluded.supertype,
  subtypes = excluded.subtypes,
  data_completeness = excluded.data_completeness,
  image_status = excluded.image_status,
  raw_payload = excluded.raw_payload,
  updated_at = now();

insert into public.pokemon_sets (
  id,
  name,
  series,
  printed_total,
  total,
  release_date,
  symbol_url,
  logo_url,
  language,
  region,
  external_ids,
  raw_data
)
select
  id,
  canonical_name,
  'Japanese Unnumbered Promos',
  printed_total,
  actual_total,
  release_date,
  null,
  null,
  language,
  region,
  jsonb_build_object('stackrManual', source_id, 'setCode', set_code),
  raw_payload
from public.tcg_sets
where id in (
  'ja:corocoro-comic-february-1997-promo',
  'ja:corocoro-comic-may-2001-promo'
)
on conflict (id) do update set
  name = excluded.name,
  series = excluded.series,
  printed_total = excluded.printed_total,
  total = excluded.total,
  release_date = excluded.release_date,
  language = excluded.language,
  region = excluded.region,
  external_ids = excluded.external_ids,
  raw_data = excluded.raw_data;

insert into public.pokemon_cards (
  id,
  name,
  language,
  region,
  external_ids,
  number,
  rarity,
  image_small,
  image_large,
  set_id,
  raw_data
)
select
  id,
  english_display_name,
  language,
  region,
  jsonb_build_object('stackrManual', source_id),
  collector_number,
  rarity,
  null,
  null,
  set_id,
  raw_payload
from public.tcg_cards
where id in (
  'ja:corocoro-mew-1997',
  'ja:corocoro-shining-mew-2001'
)
on conflict (id) do update set
  name = excluded.name,
  language = excluded.language,
  region = excluded.region,
  external_ids = excluded.external_ids,
  number = excluded.number,
  rarity = excluded.rarity,
  image_small = excluded.image_small,
  image_large = excluded.image_large,
  set_id = excluded.set_id,
  raw_data = excluded.raw_data;
