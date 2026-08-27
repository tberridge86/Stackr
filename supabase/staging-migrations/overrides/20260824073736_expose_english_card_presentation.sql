-- Preserve each published foreign-language printing and image identity while
-- exposing its verified concept-level English name and language-neutral detail
-- fields to the app. The API remains constrained to published catalogue rows.

create or replace view api.catalogue_cards
with (security_invoker = true)
as
select
  v.id as variant_id,
  cv.id as catalogue_version_id,
  cv.version_key as catalogue_version,
  v.canonical_key,
  v.game_code,
  v.language_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  p.set_id,
  s.set_code,
  s.native_name as set_native_name,
  s.english_display_name as set_english_display_name,
  p.id as printing_id,
  p.collector_number,
  p.collector_number_prefix,
  p.collector_number_sort,
  p.collector_number_suffix,
  p.collector_number_sort_key,
  p.native_name as card_native_name,
  p.english_display_name as card_english_display_name,
  r.code as rarity_code,
  r.english_label as rarity_label,
  v.variant_code,
  vt.english_label as variant_label,
  v.finish_code,
  f.english_label as finish_label,
  v.artwork_key,
  p.updated_at,
  greatest(p.updated_at, v.updated_at, s.updated_at) as changed_at,
  v.native_image_status,
  v.same_artwork_as_variant_id,
  p.card_concept_id,
  cc.default_english_name as concept_english_display_name,
  p.supertype,
  p.subtypes,
  p.artist
from catalog.catalogue_version_variants cvv
join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
join catalog.card_variants v on v.id = cvv.variant_id
join catalog.card_printings p on p.id = v.printing_id
join catalog.sets s on s.id = p.set_id
join catalog.languages l on l.code = v.language_code
left join catalog.card_concepts cc
  on cc.id = p.card_concept_id
  and cc.deprecated_at is null
left join catalog.rarities r on r.id = p.rarity_id
left join catalog.variant_taxonomy vt on vt.code = v.variant_code
left join catalog.finishes f on f.code = v.finish_code
where cv.status = 'published'
  and cv.deprecated_at is null
  and v.deprecated_at is null
  and p.deprecated_at is null
  and s.deprecated_at is null;

grant select on api.catalogue_cards to anon, authenticated, service_role;

comment on column api.catalogue_cards.concept_english_display_name is
  'Verified concept-level English fallback for presentation; the printing and its native-language assets remain unchanged.';
