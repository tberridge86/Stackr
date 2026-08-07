-- Deterministic taxonomy seed only. No user, card, price, or provider payload data belongs here.
insert into catalog.games (code, display_name, publisher)
values ('pokemon', 'Pokemon', 'The Pokemon Company')
on conflict (code) do update set
  display_name = excluded.display_name,
  publisher = excluded.publisher,
  updated_at = now();

insert into catalog.languages (code, bcp47_code, english_name, native_name, script_code, sort_order)
values
  ('en', 'en', 'English', 'English', 'Latn', 10),
  ('ja', 'ja', 'Japanese', '日本語', 'Jpan', 20),
  ('zh-Hans', 'zh-Hans', 'Simplified Chinese', '简体中文', 'Hans', 30),
  ('zh-Hant', 'zh-Hant', 'Traditional Chinese', '繁體中文', 'Hant', 40),
  ('ko', 'ko', 'Korean', '한국어', 'Kore', 50)
on conflict (code) do update set
  bcp47_code = excluded.bcp47_code,
  english_name = excluded.english_name,
  native_name = excluded.native_name,
  script_code = excluded.script_code,
  sort_order = excluded.sort_order,
  active = true,
  deprecated_at = null,
  updated_at = now();

insert into catalog.languages (code, bcp47_code, english_name, native_name, script_code, sort_order)
values
  ('zh-cn', 'zh-CN', 'Chinese (Simplified)', 'Chinese (Simplified)', 'Hans', 30),
  ('zh-tw', 'zh-TW', 'Chinese (Traditional)', 'Chinese (Traditional)', 'Hant', 40)
on conflict (code) do update set
  bcp47_code = excluded.bcp47_code,
  english_name = excluded.english_name,
  native_name = excluded.native_name,
  script_code = excluded.script_code,
  sort_order = excluded.sort_order,
  active = true,
  deprecated_at = null,
  deprecated_reason = null,
  updated_at = now();

update catalog.languages
set
  active = false,
  deprecated_at = coalesce(deprecated_at, now()),
  deprecated_reason = coalesce(deprecated_reason, 'Replaced by strict importer language codes zh-cn and zh-tw.'),
  updated_at = now()
where code in ('zh-Hans', 'zh-Hant');

insert into catalog.finishes (code, english_label, finish_group, sort_order, description)
values
  ('normal', 'Normal', 'standard', 10, 'Standard non-special finish.'),
  ('holo', 'Holo', 'foil', 20, 'Holographic finish.'),
  ('reverse_holo', 'Reverse Holo', 'foil', 30, 'Reverse holographic finish.'),
  ('first_edition', 'First Edition', 'edition', 40, 'First edition print marker.'),
  ('unlimited', 'Unlimited', 'edition', 50, 'Unlimited edition print.'),
  ('promo', 'Promo', 'other', 60, 'Promotional distribution marker retained for compatibility.'),
  ('stamped', 'Stamped', 'stamp', 70, 'Stamped promotional or event variant.'),
  ('poke_ball', 'Poke Ball', 'parallel', 80, 'Poke Ball patterned parallel finish.'),
  ('master_ball', 'Master Ball', 'parallel', 90, 'Master Ball patterned parallel finish.'),
  ('regional_other', 'Other Regional Variant', 'regional', 100, 'Other regional finish.')
on conflict (code) do update set
  english_label = excluded.english_label,
  finish_group = excluded.finish_group,
  sort_order = excluded.sort_order,
  description = excluded.description,
  deprecated_at = null,
  updated_at = now();

insert into catalog.variant_taxonomy (code, english_label, variant_group, finish_code, sort_order, description)
values
  ('normal', 'Normal', 'base', 'normal', 10, 'Default raw card variant.'),
  ('holo', 'Holo', 'foil', 'holo', 20, 'Holographic card variant.'),
  ('reverse_holo', 'Reverse Holo', 'foil', 'reverse_holo', 30, 'Reverse holographic card variant.'),
  ('first_edition', 'First Edition', 'edition', 'first_edition', 40, 'First edition card variant.'),
  ('unlimited', 'Unlimited', 'edition', 'unlimited', 50, 'Unlimited card variant.'),
  ('promo', 'Promo', 'promo', 'promo', 60, 'Promotional card variant.'),
  ('stamped', 'Stamped', 'stamp', 'stamped', 70, 'Stamped card variant.'),
  ('poke_ball', 'Poke Ball', 'regional', 'poke_ball', 80, 'Poke Ball patterned regional variant.'),
  ('master_ball', 'Master Ball', 'regional', 'master_ball', 90, 'Master Ball patterned regional variant.'),
  ('regional_other', 'Other Regional Variant', 'regional', 'regional_other', 100, 'Other regional variant.'),
  ('sealed_standard', 'Sealed Standard', 'sealed', null, 200, 'Default sealed product variant.'),
  ('graded_standard', 'Graded Standard', 'graded', null, 300, 'Default graded-card identity variant.')
on conflict (code) do update set
  english_label = excluded.english_label,
  variant_group = excluded.variant_group,
  finish_code = excluded.finish_code,
  sort_order = excluded.sort_order,
  description = excluded.description,
  active = true,
  deprecated_at = null,
  updated_at = now();
