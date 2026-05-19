insert into public.market_products
  (id, product_type, name, set_name, aliases, search_text, source)
values
  (
    'product:booster_bundle:scarlet-violet-151-booster-bundle',
    'booster_bundle',
    'Scarlet & Violet 151 Booster Bundle',
    'Scarlet & Violet 151',
    array['151 booster bundle', 'pokemon 151 booster bundle', 'sv 151 booster bundle'],
    'scarlet violet 151 booster bundle booster bundle 151 booster bundle pokemon 151 booster bundle sv 151 booster bundle',
    'seed'
  ),
  (
    'product:booster_bundle:paldean-fates-booster-bundle',
    'booster_bundle',
    'Paldean Fates Booster Bundle',
    'Paldean Fates',
    array['paldean fates bundle', 'paldean fates booster bundle'],
    'paldean fates booster bundle booster bundle paldean fates bundle paldean fates booster bundle',
    'seed'
  ),
  (
    'product:booster_bundle:prismatic-evolutions-booster-bundle',
    'booster_bundle',
    'Prismatic Evolutions Booster Bundle',
    'Prismatic Evolutions',
    array['prismatic evolutions booster bundle', 'prismatic booster bundle'],
    'prismatic evolutions booster bundle booster bundle prismatic booster bundle',
    'seed'
  ),
  (
    'product:booster_pack:surging-sparks-booster-pack',
    'booster_pack',
    'Surging Sparks Booster Pack',
    'Surging Sparks',
    array['surging sparks single pack', 'surging sparks loose pack'],
    'surging sparks booster pack booster pack single pack loose pack',
    'seed'
  ),
  (
    'product:sleeved_booster_pack:surging-sparks-sleeved-booster-pack',
    'sleeved_booster_pack',
    'Surging Sparks Sleeved Booster Pack',
    'Surging Sparks',
    array['surging sparks sleeved pack', 'surging sparks sleeved booster'],
    'surging sparks sleeved booster pack sleeved pack sleeved booster',
    'seed'
  ),
  (
    'product:booster_pack:twilight-masquerade-booster-pack',
    'booster_pack',
    'Twilight Masquerade Booster Pack',
    'Twilight Masquerade',
    array['twilight masquerade single pack', 'twilight masquerade loose pack'],
    'twilight masquerade booster pack booster pack single pack loose pack',
    'seed'
  ),
  (
    'product:sleeved_booster_pack:twilight-masquerade-sleeved-booster-pack',
    'sleeved_booster_pack',
    'Twilight Masquerade Sleeved Booster Pack',
    'Twilight Masquerade',
    array['twilight masquerade sleeved pack', 'twilight masquerade sleeved booster'],
    'twilight masquerade sleeved booster pack sleeved pack sleeved booster',
    'seed'
  ),
  (
    'product:booster_pack:temporal-forces-booster-pack',
    'booster_pack',
    'Temporal Forces Booster Pack',
    'Temporal Forces',
    array['temporal forces single pack', 'temporal forces loose pack'],
    'temporal forces booster pack booster pack single pack loose pack',
    'seed'
  ),
  (
    'product:sleeved_booster_pack:temporal-forces-sleeved-booster-pack',
    'sleeved_booster_pack',
    'Temporal Forces Sleeved Booster Pack',
    'Temporal Forces',
    array['temporal forces sleeved pack', 'temporal forces sleeved booster'],
    'temporal forces sleeved booster pack sleeved pack sleeved booster',
    'seed'
  ),
  (
    'product:booster_pack:obsidian-flames-booster-pack',
    'booster_pack',
    'Obsidian Flames Booster Pack',
    'Obsidian Flames',
    array['obsidian flames single pack', 'obsidian flames loose pack'],
    'obsidian flames booster pack booster pack single pack loose pack',
    'seed'
  ),
  (
    'product:sleeved_booster_pack:obsidian-flames-sleeved-booster-pack',
    'sleeved_booster_pack',
    'Obsidian Flames Sleeved Booster Pack',
    'Obsidian Flames',
    array['obsidian flames sleeved pack', 'obsidian flames sleeved booster'],
    'obsidian flames sleeved booster pack sleeved pack sleeved booster',
    'seed'
  ),
  (
    'product:collection_bundle:prismatic-evolutions-binder-collection',
    'collection_bundle',
    'Prismatic Evolutions Binder Collection',
    'Prismatic Evolutions',
    array['prismatic evolutions binder collection', 'prismatic binder collection'],
    'prismatic evolutions binder collection collection box prismatic binder collection',
    'seed'
  ),
  (
    'product:collection_bundle:prismatic-evolutions-poster-collection',
    'collection_bundle',
    'Prismatic Evolutions Poster Collection',
    'Prismatic Evolutions',
    array['prismatic evolutions poster collection', 'prismatic poster collection'],
    'prismatic evolutions poster collection collection box prismatic poster collection',
    'seed'
  ),
  (
    'product:collection_bundle:paldean-fates-tech-sticker-collection',
    'collection_bundle',
    'Paldean Fates Tech Sticker Collection',
    'Paldean Fates',
    array['paldean fates sticker collection', 'paldean fates collection box'],
    'paldean fates tech sticker collection collection box paldean fates sticker collection',
    'seed'
  )
on conflict (id) do update set
  product_type = excluded.product_type,
  name = excluded.name,
  set_name = excluded.set_name,
  aliases = excluded.aliases,
  search_text = excluded.search_text,
  source = excluded.source,
  updated_at = now();

delete from public.market_products
where id in (
  'product:sealed_product:scarlet-violet-151-booster-bundle',
  'product:sealed_product:paldean-fates-booster-bundle'
);
