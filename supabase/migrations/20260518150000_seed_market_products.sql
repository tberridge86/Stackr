insert into public.market_products
  (id, product_type, name, set_name, aliases, search_text, source)
values
  (
    'product:elite_trainer_box:scarlet-violet-151-elite-trainer-box',
    'elite_trainer_box',
    'Scarlet & Violet 151 Elite Trainer Box',
    'Scarlet & Violet 151',
    array['151 etb', 'pokemon 151 etb', 'sv 151 elite trainer box'],
    'scarlet violet 151 elite trainer box 151 etb pokemon 151 etb sv 151 elite trainer box',
    'seed'
  ),
  (
    'product:sealed_product:scarlet-violet-151-booster-bundle',
    'sealed_product',
    'Scarlet & Violet 151 Booster Bundle',
    'Scarlet & Violet 151',
    array['151 booster bundle', 'pokemon 151 booster bundle', 'sv 151 booster bundle'],
    'scarlet violet 151 booster bundle 151 booster bundle pokemon 151 booster bundle sv 151 booster bundle',
    'seed'
  ),
  (
    'product:collection_bundle:scarlet-violet-151-poster-collection',
    'collection_bundle',
    'Scarlet & Violet 151 Poster Collection',
    'Scarlet & Violet 151',
    array['151 poster collection', 'pokemon 151 poster box'],
    'scarlet violet 151 poster collection 151 poster collection pokemon 151 poster box',
    'seed'
  ),
  (
    'product:collection_bundle:scarlet-violet-151-binder-collection',
    'collection_bundle',
    'Scarlet & Violet 151 Binder Collection',
    'Scarlet & Violet 151',
    array['151 binder collection', 'pokemon 151 binder box'],
    'scarlet violet 151 binder collection 151 binder collection pokemon 151 binder box',
    'seed'
  ),
  (
    'product:collection_bundle:scarlet-violet-151-ultra-premium-collection',
    'collection_bundle',
    'Scarlet & Violet 151 Ultra-Premium Collection',
    'Scarlet & Violet 151',
    array['151 upc', '151 ultra premium collection', 'pokemon 151 upc'],
    'scarlet violet 151 ultra premium collection 151 upc 151 ultra premium collection pokemon 151 upc',
    'seed'
  ),
  (
    'product:elite_trainer_box:prismatic-evolutions-elite-trainer-box',
    'elite_trainer_box',
    'Prismatic Evolutions Elite Trainer Box',
    'Prismatic Evolutions',
    array['prismatic evolutions etb', 'prismatic etb'],
    'prismatic evolutions elite trainer box prismatic evolutions etb prismatic etb',
    'seed'
  ),
  (
    'product:booster_box:surging-sparks-booster-box',
    'booster_box',
    'Surging Sparks Booster Box',
    'Surging Sparks',
    array['surging sparks booster display', 'surging sparks bb'],
    'surging sparks booster box surging sparks booster display surging sparks bb',
    'seed'
  ),
  (
    'product:elite_trainer_box:surging-sparks-elite-trainer-box',
    'elite_trainer_box',
    'Surging Sparks Elite Trainer Box',
    'Surging Sparks',
    array['surging sparks etb'],
    'surging sparks elite trainer box surging sparks etb',
    'seed'
  ),
  (
    'product:booster_box:twilight-masquerade-booster-box',
    'booster_box',
    'Twilight Masquerade Booster Box',
    'Twilight Masquerade',
    array['twilight masquerade booster display'],
    'twilight masquerade booster box twilight masquerade booster display',
    'seed'
  ),
  (
    'product:elite_trainer_box:twilight-masquerade-elite-trainer-box',
    'elite_trainer_box',
    'Twilight Masquerade Elite Trainer Box',
    'Twilight Masquerade',
    array['twilight masquerade etb'],
    'twilight masquerade elite trainer box twilight masquerade etb',
    'seed'
  ),
  (
    'product:booster_box:temporal-forces-booster-box',
    'booster_box',
    'Temporal Forces Booster Box',
    'Temporal Forces',
    array['temporal forces booster display'],
    'temporal forces booster box temporal forces booster display',
    'seed'
  ),
  (
    'product:elite_trainer_box:temporal-forces-elite-trainer-box',
    'elite_trainer_box',
    'Temporal Forces Elite Trainer Box',
    'Temporal Forces',
    array['temporal forces etb'],
    'temporal forces elite trainer box temporal forces etb',
    'seed'
  ),
  (
    'product:sealed_product:paldean-fates-booster-bundle',
    'sealed_product',
    'Paldean Fates Booster Bundle',
    'Paldean Fates',
    array['paldean fates bundle'],
    'paldean fates booster bundle paldean fates bundle',
    'seed'
  ),
  (
    'product:elite_trainer_box:paldean-fates-elite-trainer-box',
    'elite_trainer_box',
    'Paldean Fates Elite Trainer Box',
    'Paldean Fates',
    array['paldean fates etb'],
    'paldean fates elite trainer box paldean fates etb',
    'seed'
  ),
  (
    'product:booster_box:obsidian-flames-booster-box',
    'booster_box',
    'Obsidian Flames Booster Box',
    'Obsidian Flames',
    array['obsidian flames booster display'],
    'obsidian flames booster box obsidian flames booster display',
    'seed'
  ),
  (
    'product:elite_trainer_box:obsidian-flames-elite-trainer-box',
    'elite_trainer_box',
    'Obsidian Flames Elite Trainer Box',
    'Obsidian Flames',
    array['obsidian flames etb'],
    'obsidian flames elite trainer box obsidian flames etb',
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
