-- Preserve the exact rarity vocabulary supplied by the current TCGdex card
-- contract, including Pokémon TCG Pocket tiers and legacy rarity names.
-- `None` is intentionally not a rarity: the importer keeps it null.
insert into catalog.rarities (game_code, code, english_label, rarity_group, sort_order)
values
  ('pokemon', 'classic_collection', 'Classic Collection', 'special', 81),
  ('pokemon', 'full_art_trainer', 'Full Art Trainer', 'special', 82),
  ('pokemon', 'holo_rare', 'Holo Rare', 'legacy', 83),
  ('pokemon', 'holo_rare_v', 'Holo Rare V', 'legacy', 84),
  ('pokemon', 'holo_rare_vmax', 'Holo Rare VMAX', 'legacy', 85),
  ('pokemon', 'holo_rare_vstar', 'Holo Rare VSTAR', 'legacy', 86),
  ('pokemon', 'legend', 'LEGEND', 'legacy', 87),
  ('pokemon', 'rare_holo', 'Rare Holo', 'legacy', 88),
  ('pokemon', 'rare_holo_lv_x', 'Rare Holo LV.X', 'legacy', 89),
  ('pokemon', 'rare_prime', 'Rare PRIME', 'legacy', 90),
  ('pokemon', 'shiny_rare_v', 'Shiny Rare V', 'special', 91),
  ('pokemon', 'shiny_rare_vmax', 'Shiny Rare VMAX', 'special', 92),
  ('pokemon', 'one_diamond', 'One Diamond', 'pocket', 101),
  ('pokemon', 'two_diamond', 'Two Diamond', 'pocket', 102),
  ('pokemon', 'three_diamond', 'Three Diamond', 'pocket', 103),
  ('pokemon', 'four_diamond', 'Four Diamond', 'pocket', 104),
  ('pokemon', 'one_star', 'One Star', 'pocket', 105),
  ('pokemon', 'two_star', 'Two Star', 'pocket', 106),
  ('pokemon', 'three_star', 'Three Star', 'pocket', 107),
  ('pokemon', 'crown', 'Crown', 'pocket', 108),
  ('pokemon', 'one_shiny', 'One Shiny', 'pocket', 109),
  ('pokemon', 'two_shiny', 'Two Shiny', 'pocket', 110)
on conflict (game_code, code) do update set
  english_label = excluded.english_label,
  rarity_group = excluded.rarity_group,
  sort_order = excluded.sort_order,
  deprecated_at = null,
  updated_at = now();
