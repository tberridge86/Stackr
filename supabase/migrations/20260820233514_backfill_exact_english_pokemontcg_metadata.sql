-- Exact English artist/rarity null-only backfill from the pinned Pokemon TCG data repository.
-- Evidence: reports/catalogue/english-metadata-gap/2026-08-21/pokemontcg-metadata-backfill-evidence.json
-- source-commit: 8b4e387930ead7be6595b4d4c59b7ba7a3a79f08
-- candidate-count: 444
-- rarity-field-count: 261
-- artist-field-count: 184
-- candidate-sha256: 8b51a1b66f2044bf82c16da1fcf86797d78f9f007bb6d46d2a2b2ed5354857af
-- migration-facts-sha256: 1405e0ddebc405f3ebfd460acbc13cba9ea419f5c4e8a5308b83d29abe1d6456
-- evidence-sha256: 58f0297b4da5670883c497adbf8929a2c1d8c52f97f32d182ddfc71ed8d03559

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table catalog.card_printings in share row exclusive mode;
lock table catalog.rarities in share row exclusive mode;

do $taxonomy_precondition$
declare
  existing record;
begin
  select code, english_label, rarity_group, sort_order, deprecated_at
  into existing
  from catalog.rarities
  where game_code='pokemon'
    and code='trainer_gallery_rare_holo';

  if found and (
    existing.english_label is distinct from 'Trainer Gallery Rare Holo'
    or existing.rarity_group is distinct from 'special'
    or existing.sort_order is distinct from 87
    or existing.deprecated_at is not null
  ) then
    raise exception 'Conflicting trainer_gallery_rare_holo taxonomy row already exists';
  end if;
end
$taxonomy_precondition$;

insert into catalog.rarities (
  game_code,
  code,
  english_label,
  native_label,
  rarity_group,
  sort_order,
  source_updated_at
)
select
  'pokemon',
  'trainer_gallery_rare_holo',
  'Trainer Gallery Rare Holo',
  'Trainer Gallery Rare Holo',
  'special',
  87,
  now()
where not exists (
  select 1
  from catalog.rarities
  where game_code='pokemon'
    and code='trainer_gallery_rare_holo'
);

create temporary table _stackr_pokemontcg_english_metadata_facts (
  ordinal integer primary key,
  canonical_set_code text not null,
  canonical_set_name text not null,
  canonical_set_release_date date not null,
  canonical_printed_total integer,
  canonical_set_total integer,
  collector_number text not null,
  canonical_card_name text not null,
  expected_existing_rarity_code text,
  expected_existing_artist text,
  proposed_rarity_code text,
  proposed_artist text,
  provider_set_id text not null,
  provider_card_id text not null,
  provider_card_file text not null,
  provider_card_file_sha256 text not null,
  provider_card_payload_sha256 text not null,
  check (proposed_rarity_code is not null or proposed_artist is not null),
  check (provider_card_file_sha256 ~ '^[0-9a-f]{64}$'),
  check (provider_card_payload_sha256 ~ '^[0-9a-f]{64}$')
) on commit drop;

insert into _stackr_pokemontcg_english_metadata_facts values
  (1, '2015xy', 'McDonald''s Collection 2015', '2015-11-27'::date, 12, 12, '8', 'Rhyhorn', null, 'Midori Harada', 'common', null, 'mcd15', 'mcd15-8', 'cards/en/mcd15.json', 'b69adc5c02d55fa78c4bb0cc1cae0d296493f800c2722f09c3d2bf61f622aeb1', 'b47d56d794535c56009be656ea37b86ed34375a8f2ef28c507e11403b3cbf5cf'),
  (2, 'bog', 'Best of game', '2002-12-01'::date, 9, 9, '1', 'Electabuzz', null, 'Ken Sugimori', 'promo', null, 'bp', 'bp-1', 'cards/en/bp.json', 'c6dd60f6eac84c1cb0ec71a2ffe232d3ef4ef02e902b9dbb71e0d2da70e45204', 'aadf841d1421279a0d71ee522b20b6ebad2e1f1d965d3e1abbff317a6387d3d1'),
  (3, 'bog', 'Best of game', '2002-12-01'::date, 9, 9, '2', 'Hitmonchan', null, 'Ken Sugimori', 'promo', null, 'bp', 'bp-2', 'cards/en/bp.json', 'c6dd60f6eac84c1cb0ec71a2ffe232d3ef4ef02e902b9dbb71e0d2da70e45204', '42c6c67c48ba49d096a66c4833d80b86a1011ff5d4b7f743e8fe51ab04b64d11'),
  (4, 'bog', 'Best of game', '2002-12-01'::date, 9, 9, '3', 'Professor Elm', null, 'Ken Sugimori', 'promo', null, 'bp', 'bp-3', 'cards/en/bp.json', 'c6dd60f6eac84c1cb0ec71a2ffe232d3ef4ef02e902b9dbb71e0d2da70e45204', '219d6bbaa75d7b7a63cead0d2153e4dee8d64f64366d56a672f3d50a5be0a181'),
  (5, 'bog', 'Best of game', '2002-12-01'::date, 9, 9, '6', 'Dark Ivysaur', null, 'Shin-ichi Yoshida', 'promo', null, 'bp', 'bp-6', 'cards/en/bp.json', 'c6dd60f6eac84c1cb0ec71a2ffe232d3ef4ef02e902b9dbb71e0d2da70e45204', '608f50775de68c243e3b74c43b39e148118751aabfccebbebef1ef3900b5e96b'),
  (6, 'bog', 'Best of game', '2002-12-01'::date, 9, 9, '7', 'Dark Venusaur', null, 'Shin-ichi Yoshida', 'promo', null, 'bp', 'bp-7', 'cards/en/bp.json', 'c6dd60f6eac84c1cb0ec71a2ffe232d3ef4ef02e902b9dbb71e0d2da70e45204', '5808712b7ac9f37afb82f643c4194bb9e561ad2743574b15d2b124bd7e96ec93'),
  (7, 'bwp', 'BW Black Star Promos', '2011-04-26'::date, 101, 101, 'BW28', 'Tropical Beach', 'common', null, null, 'Naoki Saito', 'bwp', 'bwp-BW28', 'cards/en/bwp.json', '089bd97ec78cf301748a3f735d14c186b7397d583a1d005d9ca2e596fe178e73', 'dbc10780d26f2ebf58a6782d55cac6ec647165e84800121a82318bd3940b4c4a'),
  (8, 'bwp', 'BW Black Star Promos', '2011-04-26'::date, 101, 101, 'BW50', 'Tropical Beach', 'common', null, null, 'Naoki Saito', 'bwp', 'bwp-BW50', 'cards/en/bwp.json', '089bd97ec78cf301748a3f735d14c186b7397d583a1d005d9ca2e596fe178e73', 'cb22718fc0fe1e0932b1fc5b3f7adb046247292d291071d8df5c53b117bbdce1'),
  (9, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '1', 'Alakazam', null, 'Hajime Kusajima', 'rare_holo', null, 'ecard1', 'ecard1-1', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', '251a5cfce6722d92b17e8039cf66e015caa0873e4ee2bbbb9173d72b98f3999e'),
  (10, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '2', 'Ampharos', null, 'Atsuko Nishida', 'rare_holo', null, 'ecard1', 'ecard1-2', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'bd35a4b2f458f5249f0dd727c8f9743a98eb5ce4a757cdc7abaf8fe15a9f10c7'),
  (11, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '3', 'Arbok', null, 'Kyoko Umemoto', 'rare_holo', null, 'ecard1', 'ecard1-3', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', '9aa388ad611df024a376679c66b539312e7f83305bf5682e00155f5c3e31943f'),
  (12, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '4', 'Blastoise', null, 'Kimiya Masago', 'rare_holo', null, 'ecard1', 'ecard1-4', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'ad9fdc4630dcca9b3287a2fb9255697a17c0a9883a765b7c22751c21922a9bf2'),
  (13, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '5', 'Butterfree', null, 'Sumiyoshi Kizuki', 'rare_holo', null, 'ecard1', 'ecard1-5', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'ef76e79832e4e98dcb7ffee7ab09a6f2c3aa88e71d597b7f48769f8a2a30dbb9'),
  (14, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '6', 'Charizard', null, 'Hiromichi Sugiyama', 'rare_holo', null, 'ecard1', 'ecard1-6', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', '65146e70e8b4c3bf5fb12c2bead02360270a6be7333c5f776ecb947965947f86'),
  (15, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '7', 'Clefable', null, 'Kagemaru Himeno', 'rare_holo', null, 'ecard1', 'ecard1-7', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'b93e93b578c6cd6372202fd9f3e4ff12c0a732da5c1def9810d8a7858f1645a8'),
  (16, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '8', 'Cloyster', null, 'Kyoko Umemoto', 'rare_holo', null, 'ecard1', 'ecard1-8', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'be6a64380af60a2fbb2d982a6e04ccc2131f202ab5bbee90af3392480dc5a783'),
  (17, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '9', 'Dragonite', null, 'Kagemaru Himeno', 'rare_holo', null, 'ecard1', 'ecard1-9', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', '7e8c04585b3f5584670189b3dbdd3e3adb7273ea30951657848a2b7b09aa5556'),
  (18, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '10', 'Dugtrio', null, 'Masako Yamashita', 'rare_holo', null, 'ecard1', 'ecard1-10', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'a1662caab92aadab5367e005b817c75781d25878d3da705a9b2eef42e4469826'),
  (19, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '11', 'Fearow', null, 'Kyoko Umemoto', 'rare_holo', null, 'ecard1', 'ecard1-11', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'f67067a4df93603739c30146e307c76274ce099d9a772b6a68c70f8354a2cad3'),
  (20, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '12', 'Feraligatr', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ecard1', 'ecard1-12', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'faf558e20248923212412b6ff5e692031e3d33d53c48c5f7c632274182d72c1f'),
  (21, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '13', 'Gengar', null, 'Yukiko Baba', 'rare_holo', null, 'ecard1', 'ecard1-13', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'c2764fba04c7e94fed76948c415f53da9149a826a3d6267fc4d4ec7529db7770'),
  (22, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '14', 'Golem', null, 'Aya Kusube', 'rare_holo', null, 'ecard1', 'ecard1-14', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'f1ba97c613fa3eb67e5489e13f7f30cf0b8f546878a2c844d93472987e0d6141'),
  (23, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '15', 'Kingler', null, 'Shin-ichi Yoshida', 'rare_holo', null, 'ecard1', 'ecard1-15', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', '055f9e380bc8129852b789229b95e85816069702b493953d17c54c10f984ef48'),
  (24, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '139', 'Dual Ball', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard1', 'ecard1-139', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'f9c68141ec1410d81a73a22a393f512305924c571b48526fd54a412b968c1cbb'),
  (25, 'ecard1', 'Expedition Base Set', '2002-09-15'::date, 165, 165, '146', 'Pokémon Reversal', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard1', 'ecard1-146', 'cards/en/ecard1.json', '4fc93f72fa6da576756bca2876445e738b7cfccfc952c13a8eea77ef71446013', 'ba115050d0e99c2f26fed79488a98f9c93c1d8502c6916a092bac8ee1a0d3338'),
  (26, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '119', 'Darkness Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-119', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', '1a4d7c498007d2b18c61e13959eb6013886c0aab7f659a9423c7f6e324d42f8b'),
  (27, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '121', 'Fighting Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-121', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', '5516613355ebaee329b00fc78fbe851ddb7197de4eda7411aa53b847e9b7cb0a'),
  (28, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '127', 'Lightning Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-127', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', '9eccf86c8d4119deb60eb8957933e504fcaa03134c59fa8b4b1c9f7ccb7432ed'),
  (29, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '129', 'Metal Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-129', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', 'a54d7002316e710353fb070901f1329b58c89c6681d20df31517e9a6aa6def1a'),
  (30, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '132', 'Psychic Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-132', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', '7fb21835420bcc75db18d4b7b3a1b0d12fd819eb0493479b11bee7f972caef88'),
  (31, 'ecard2', 'Aquapolis', '2003-01-15'::date, 147, 186, '140', 'Water Cube 01', 'uncommon', null, null, '"Big Mama" Tagawa', 'ecard2', 'ecard2-140', 'cards/en/ecard2.json', '273b88f89205afb16c92b2d537c538f82d7e3228d23bbd0232c091bd6f870d3b', 'f6227be5cbaba6076a47f8306fa090ff10bb49cde84d6affb87e2cb5df31cd67'),
  (32, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '1', 'Aggron', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex1', 'ex1-1', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '275ba843025771e419474cd203f8d537791c5657c70fdab3d435224ef1809a68'),
  (33, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '2', 'Beautifly', null, 'Hajime Kusajima', 'rare_holo', null, 'ex1', 'ex1-2', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '2728430d20d4a73e47d74661f04dfa8b4c42194b8933e775b8b701f12e876c15'),
  (34, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '3', 'Blaziken', null, 'Kouki Saitou', 'rare_holo', null, 'ex1', 'ex1-3', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '33defeab83091051ec284c7c4ea6c10de894db55a4af9e7c9fe105c48b9c210e'),
  (35, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '4', 'Camerupt', null, 'Ken Sugimori', 'rare_holo', null, 'ex1', 'ex1-4', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'a685311f44e9e53fbc0ac02c3bb81c6eba1066f3b9e8105fb127aa529a71263c'),
  (36, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '5', 'Delcatty', null, 'Atsuko Nishida', 'rare_holo', null, 'ex1', 'ex1-5', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '17aa899d63f3f2df4ef73e119c381531852a2d7a6bd01d5678f93aa6391e4c7f'),
  (37, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '6', 'Dustox', null, 'Midori Harada', 'rare_holo', null, 'ex1', 'ex1-6', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '4ef6b67a41b6cf8e34d8452e374f96028e7e7642b2dec30cac848bd9d1008b95'),
  (38, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '7', 'Gardevoir', null, 'Ken Sugimori', 'rare_holo', null, 'ex1', 'ex1-7', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '7ad4d059533757f1f014f9dc827d96647a0a120a7c0d95c2f2e130eea0e005f6'),
  (39, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '8', 'Hariyama', null, 'Naoyo Kimura', 'rare_holo', null, 'ex1', 'ex1-8', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '76788956d87e1605a26a160a45213e8d762544cfbbf48e140451086d41a68229'),
  (40, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '9', 'Manectric', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex1', 'ex1-9', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'd85f5d267679f446792dfdb4a8153e483e1fda571bea0d6015df8049080403c8'),
  (41, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '10', 'Mightyena', null, 'Atsuko Nishida', 'rare_holo', null, 'ex1', 'ex1-10', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', '8101b0e74fce3aa0a03ee5149602efb1cf85a42239b212fba3e72fea696a4e6b'),
  (42, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '11', 'Sceptile', null, 'Midori Harada', 'rare_holo', null, 'ex1', 'ex1-11', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'b338bd753333ecbe02782d8c611348cf53c900ca9cba42cb795dce452ae7a500'),
  (43, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '12', 'Slaking', null, 'Ken Sugimori', 'rare_holo', null, 'ex1', 'ex1-12', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'd2c42eb2529a3f6ded1ae30d9e1956d8f64a7806aa34ada67aa85f7f7c5745fa'),
  (44, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '13', 'Swampert', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex1', 'ex1-13', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'dd507afe5ed4aaea0ce563d5aec1539748d66e0a38ba94e4f5738f5d0d569f25'),
  (45, 'ex1', 'Ruby & Sapphire', '2003-07-01'::date, 109, 109, '14', 'Wailord', null, 'Ken Sugimori', 'rare_holo', null, 'ex1', 'ex1-14', 'cards/en/ex1.json', 'fbf529d6fc9543eda63706cb01bee614b7e58f9425f500cbc9cac8387a0d273b', 'bc9c1b47fa66a2ac65a131eaea5935e6f318a5454c429c7d1762f3c1749f2caf'),
  (46, 'ex10', 'Unseen Forces', '2005-08-22'::date, 115, 117, '85', 'Fluffy Berry', 'uncommon', null, null, 'Ryo Ueda', 'ex10', 'ex10-85', 'cards/en/ex10.json', '5e60dd7e3defd0108099327a59beaa4335a41e38dfa250149737677723082ce5', '6384124a072cd8e56a6072da88d442a175fc2279906fef52c5a974f1d54c1aad'),
  (47, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '1', 'Armaldo', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex2', 'ex2-1', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', 'ab787003174a57e5d62cd02bb8284949fa2c0be58aad2d51c543f8b00acdf435'),
  (48, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '2', 'Cacturne', null, 'Atsuko Nishida', 'rare_holo', null, 'ex2', 'ex2-2', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '80c86fdc8cc848494633f655d53744464b3ac6cb256ab4ce852c11e1743295e7'),
  (49, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '3', 'Cradily', null, 'Midori Harada', 'rare_holo', null, 'ex2', 'ex2-3', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '004c3047a1278fa7470803712282d287524867f88fdb2b7b329ac4efa0d59623'),
  (50, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '4', 'Dusclops', null, 'Midori Harada', 'rare_holo', null, 'ex2', 'ex2-4', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', 'bbce662e870cc92af9eee92d73a076550b69e039c45ac266849b3f2ceff7d0fe'),
  (51, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '5', 'Flareon', null, 'Midori Harada', 'rare_holo', null, 'ex2', 'ex2-5', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '20d29a4cef984640da49a805c65d5d6a4612b5c6203519264eb630861acdcf72'),
  (52, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '6', 'Jolteon', null, 'Atsuko Nishida', 'rare_holo', null, 'ex2', 'ex2-6', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '22e6d6e70f68f3e1fc95b7c19b00927a86ec0926b564706a6578de5557f0f150'),
  (53, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '7', 'Ludicolo', null, 'Tomokazu Komiya', 'rare_holo', null, 'ex2', 'ex2-7', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', 'd0720917a7d20a034385b6997e8e4b0f4c3ebfea2cdbff0950fc94870fdec230'),
  (54, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '8', 'Lunatone', null, 'Hajime Kusajima', 'rare_holo', null, 'ex2', 'ex2-8', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', 'baf0a93704435ef8863ade1c903f0fbdee09a76d0a14246aeabf9c58f11e58a3'),
  (55, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '9', 'Mawile', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex2', 'ex2-9', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '8353ec6da5b4bc865c2db2101edaec9c87355493b3c91a079db570d0301b03e5'),
  (56, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '10', 'Sableye', null, 'Hajime Kusajima', 'rare_holo', null, 'ex2', 'ex2-10', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '5f7c27a147fccab01638b8a6edd700a231499ede1ee4b4f88144c1da1508c8bc'),
  (57, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '11', 'Seviper', null, 'Hajime Kusajima', 'rare_holo', null, 'ex2', 'ex2-11', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', 'eaa68f114f53b833b2bb2a455d991714cb63b88b1b9563dc2eb83227e51ae5e9'),
  (58, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '12', 'Shiftry', null, 'Atsuko Nishida', 'rare_holo', null, 'ex2', 'ex2-12', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '1d01720d129bb9d42a8c8f77dbeef58789db8b65b2f8b94f26929f37276d32f5'),
  (59, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '13', 'Solrock', null, 'Hajime Kusajima', 'rare_holo', null, 'ex2', 'ex2-13', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '36640ed600c6823fa5b8cf800ce6c975660d8f15f98b8d91c8021da59b8801a7'),
  (60, 'ex2', 'Sandstorm', '2003-09-18'::date, 100, 100, '14', 'Zangoose', null, 'Kagemaru Himeno', 'rare_holo', null, 'ex2', 'ex2-14', 'cards/en/ex2.json', '15bff2d0b680eba3cbcbf0ec5332945af371271645203067647e97ec5419c907', '416943c700a95ffd952ec011f73c2fe34c6a18e107ce4f1b733b4c0512609cb4'),
  (61, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '1', 'Absol', null, 'Naoyo Kimura', 'rare_holo', null, 'ex3', 'ex3-1', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', 'a6ca9b9d4d2e4ecda4e30ab848d2a39d44f72707616b6b7b652a494b1dc4730d'),
  (62, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '2', 'Altaria', null, 'Atsuko Nishida', 'rare_holo', null, 'ex3', 'ex3-2', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', 'ce3d8159ccf2355af0b16a47025f2faaf16c69bb87aff08b6ba488e7dd0e52e5'),
  (63, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '3', 'Crawdaunt', null, 'Hisao Nakamura', 'rare_holo', null, 'ex3', 'ex3-3', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '95f353bab05ee8ab91ae7e4713908bba8f48d06691e1131538daa7254f3256d1'),
  (64, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '4', 'Flygon', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex3', 'ex3-4', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '6f1d813f6175010310701b8df9f7d898f906825f6f4cd236c9950717727c8431'),
  (65, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '5', 'Golem', null, 'Hisao Nakamura', 'rare_holo', null, 'ex3', 'ex3-5', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '5642103b4ef9ac901aa84dc8a9001dc1681a6dcb4a1218738769dc87920bc4f5'),
  (66, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '6', 'Grumpig', null, 'Midori Harada', 'rare_holo', null, 'ex3', 'ex3-6', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '0f13426be55a45d0b0f4950bc3b5200299e356aa1aa6906af1977a347176de61'),
  (67, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '7', 'Minun', null, 'Atsuko Nishida', 'rare_holo', null, 'ex3', 'ex3-7', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', 'eaff19f260903434ba902104e8003db9f9e4764929bb3927cbca418339f7c7cd'),
  (68, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '8', 'Plusle', null, 'Atsuko Nishida', 'rare_holo', null, 'ex3', 'ex3-8', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '7c128cd1d5f0cd77c26edb185512084d48c024289d6b36680006d843e933c95b'),
  (69, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '9', 'Roselia', null, 'Atsuko Nishida', 'rare_holo', null, 'ex3', 'ex3-9', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '0ae2f44e73a08fdbd201f695219207f4719c6d0f70c65662f29cd0ad8eae063d'),
  (70, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '10', 'Salamence', null, 'Mitsuhiro Arita', 'rare_holo', null, 'ex3', 'ex3-10', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '991ca449f4d9e63605319ea66bb59e9bdb44269c383b1ac1373a00df44f88c8e'),
  (71, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '11', 'Shedinja', null, 'Kagemaru Himeno', 'rare_holo', null, 'ex3', 'ex3-11', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '9e6bc47352d8b6c447bf70e7d24602c355cf9553df898cf4826afe4f3c1ad54b'),
  (72, 'ex3', 'Dragon', '2003-11-24'::date, 97, 100, '12', 'Torkoal', null, 'Kagemaru Himeno', 'rare_holo', null, 'ex3', 'ex3-12', 'cards/en/ex3.json', 'e960b69e8f96d65b4eed3ca3ea86d3e9309c1efcd91d2d1cc4fcaabb6c7d06f3', '8627ce452c444341be0bc506205596b4e504cf0d66ee7bcf7aa74166cc9c75f7'),
  (73, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '1', 'Team Aqua''s Cacturne', null, 'K. Utsunomiya', 'rare_holo', null, 'ex4', 'ex4-1', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '86ab0b36e6f44bba537c805527669c0402013b400254669b7eeb71854130074a'),
  (74, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '2', 'Team Aqua''s Crawdaunt', null, 'Nakaoka', 'rare_holo', null, 'ex4', 'ex4-2', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '24aa8cfa337df4d15980eca90563f96f4ed401b56ac6d42c10cbd2017562d349'),
  (75, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '3', 'Team Aqua''s Kyogre', null, 'K. Hoshiba', 'rare_holo', null, 'ex4', 'ex4-3', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'e7550cf1bf433742eed556c55231a42c8c6d1b1e0d628e5acd07e6ef96eb9462'),
  (76, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '4', 'Team Aqua''s Manectric', null, 'K. Utsunomiya', 'rare_holo', null, 'ex4', 'ex4-4', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '338c96ab0d4e760a8f97962c9258422af5dcc0af6d812a48e0d1dc0ed4ddec4d'),
  (77, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '5', 'Team Aqua''s Sharpedo', null, 'Katsura Tabata', 'rare_holo', null, 'ex4', 'ex4-5', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'bb1e973cd095994616c30b78e3b814ad6653a8fd3ad65abaf9334be2637b2ba8'),
  (78, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '6', 'Team Aqua''s Walrein', null, 'Ken Ikuji', 'rare_holo', null, 'ex4', 'ex4-6', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '345aca90fef53955a92f5e8cde020f137f098ebac72c7d72d5ae7d7bb75ed895'),
  (79, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '7', 'Team Magma''s Aggron', null, 'Hiromichi Sugiyama', 'rare_holo', null, 'ex4', 'ex4-7', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '43d1fc2575a58c80dddd2a84c445f96f91446f2ce1e028cdd8a6ecf4395ebf5c'),
  (80, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '8', 'Team Magma''s Claydol', null, 'Zu-Ka', 'rare_holo', null, 'ex4', 'ex4-8', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'd0d19ac52ee0b10e927dd78d0bed0198320afedc636101549744f266d74fa2b1'),
  (81, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '9', 'Team Magma''s Groudon', null, 'Kazuo Yazawa', 'rare_holo', null, 'ex4', 'ex4-9', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'dbdfe1ad5c020be542810091fbf458aceaafccc421b406dc2febb31d025e9adb'),
  (82, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '10', 'Team Magma''s Houndoom', null, 'Ken Ikuji', 'rare_holo', null, 'ex4', 'ex4-10', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'e20228d7f115bebee990a4b17c9994ecbc6d97dead6c1251f82a60688e9b4d4d'),
  (83, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '11', 'Team Magma''s Rhydon', null, 'T. Honda', 'rare_holo', null, 'ex4', 'ex4-11', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', 'e15a0f06c2beee0734f8ff38d493658e8743a38adbb05d2fe23630e291705fe9'),
  (84, 'ex4', 'Team Magma vs Team Aqua', '2004-03-01'::date, 95, 97, '12', 'Team Magma''s Torkoal', null, 'K. Hoshiba', 'rare_holo', null, 'ex4', 'ex4-12', 'cards/en/ex4.json', 'f55585eb06c032074b9d7daafed8448e34b576c9d150e2e92fc7e181f316f4f5', '0041a99db87a8e841fc6f1883358c0ef0a5563a8198305f66ad2aab599f4e6e0'),
  (85, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '1', 'Banette', null, 'Midori Harada', 'rare_holo', null, 'ex5', 'ex5-1', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '62d37ffaf01885ce4dd5da8276efcef5bd0408ea01bd8175eff54df59998a1b1'),
  (86, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '2', 'Claydol', null, 'Kyoko Umemoto', 'rare_holo', null, 'ex5', 'ex5-2', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '064eecaab03763f23a07b25416748f20f65527cc32947dacb992be16da036aae'),
  (87, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '3', 'Crobat', null, 'Midori Harada', 'rare_holo', null, 'ex5', 'ex5-3', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', 'cf2e2e55661cffa89774987c8603ebab7541c9822a819682ad578ed00848831a'),
  (88, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '4', 'Dark Celebi', null, 'Ken Ikuji', 'rare_holo', null, 'ex5', 'ex5-4', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', 'bc26be16108e5a7987eb827773aad5a2bc49ede7651c8d662006a47596db0e82'),
  (89, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '5', 'Electrode', null, 'Kyoko Umemoto', 'rare_holo', null, 'ex5', 'ex5-5', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '32114014e8ddf44d55da11d4a9757996b64d1a3dd82db8307e809822ac390200'),
  (90, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '6', 'Exploud', null, 'Tomokazu Komiya', 'rare_holo', null, 'ex5', 'ex5-6', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', 'fb2d321065f55442047f5def2f8b4e3297783ed8824d2707bc56c1023a58e221'),
  (91, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '7', 'Heracross', null, 'Hajime Kusajima', 'rare_holo', null, 'ex5', 'ex5-7', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', 'acfe5aa41a7741f6783574fbe4c34a3805099e7eeb44dac0709d39e453c272b1'),
  (92, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '8', 'Jirachi', null, 'Ryo Ueda', 'rare_holo', null, 'ex5', 'ex5-8', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '7df9a0a570c49cc2950f4a879ad86d44a48808dbeb8003c7212299d00913dc7a'),
  (93, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '9', 'Machamp', null, 'Hajime Kusajima', 'rare_holo', null, 'ex5', 'ex5-9', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '81017c33d998a2d87f62e98a4a09f3fa87dcd9dafeffa366f4e7f4eaa8f4d3d1'),
  (94, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '10', 'Medicham', null, 'Atsuko Nishida', 'rare_holo', null, 'ex5', 'ex5-10', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '154f62bc9764f8513882769fa218c303c023c8bd69aa20d1ff09e1ed8297422a'),
  (95, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '11', 'Metagross', null, 'Kouki Saitou', 'rare_holo', null, 'ex5', 'ex5-11', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '14c4191e16f7b77179f7222e54d759aa1f7ddef7bc7f85b21d7c09d742cb3be9'),
  (96, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '12', 'Milotic', null, 'Atsuko Nishida', 'rare_holo', null, 'ex5', 'ex5-12', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '67093e11c6d51af378bac8d386cf602d4ea040d31d52a49ee098ca1b524e6332'),
  (97, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '13', 'Pinsir', null, 'Hajime Kusajima', 'rare_holo', null, 'ex5', 'ex5-13', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '2c8b807c3253177630aec93b637f67f68eb1d6b5c25e9eee30ef2011b4c5dc31'),
  (98, 'ex5', 'Hidden Legends', '2004-06-01'::date, 101, 102, '14', 'Shiftry', null, 'Hisao Nakamura', 'rare_holo', null, 'ex5', 'ex5-14', 'cards/en/ex5.json', '894dfc5fe26779d50a62570a332207d1d53c2d9eda46f94340e832815f27e7ee', '614aea1f3f19a8d0737c84cc0b7c54dbd4091752fd0419e48e49d7f211a9c5df'),
  (99, 'ex9', 'Emerald', '2005-05-09'::date, 106, 107, '87', 'Double Rainbow Energy', 'rare', null, null, 'Takumi Akabane', 'ex9', 'ex9-87', 'cards/en/ex9.json', '9ecebe7bf9cb56f6176526ff0dd3c00810e15ae65215a769e2c77bebdc1ff07f', '4d6123933d93a37d4198dfc542a1a8c39e35110d23548bdeb7b187dc17c8363b'),
  (100, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '1', 'Blaine''s Moltres', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-1', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'bb527725c75a567f5ef84aaa1b8640aa951de56cc5a94df751768b0b537187ed'),
  (101, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '2', 'Brock''s Rhydon', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-2', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'daabf887fbece64c4efee2e90fe802f1db11967a1bcb69b06f262231b2b6d2af'),
  (102, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '3', 'Erika''s Clefable', null, 'Atsuko Nishida', 'rare_holo', null, 'gym1', 'gym1-3', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'b44b0b4d6b3e5287bdc7eef1dfa42bc7ed121822028971d7755c68a2493046db'),
  (103, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '4', 'Erika''s Dragonair', null, 'Atsuko Nishida', 'rare_holo', null, 'gym1', 'gym1-4', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', '4fa776ed29a496d163dadf30e4fac10f2fa4bffe9572336799f8a1347f008c2f'),
  (104, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '5', 'Erika''s Vileplume', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-5', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', '47433d9887a8ce9e7a3a3fb402757fd125551c7b4de8170d8e58591ad93ff6b5'),
  (105, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '6', 'Lt. Surge''s Electabuzz', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-6', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'e8fe971e0b5e1cc86a3288f21c3cb3a582fb76605486fb94096527de181cbfd0'),
  (106, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '7', 'Lt. Surge''s Fearow', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-7', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', '16b765e22f15380e6966e82c65fc9266846c61ad647e043eaa51114af29d6c8b'),
  (107, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '8', 'Lt. Surge''s Magneton', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-8', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'cac90b46a996d795c84817c0fdae740466f65342ed33c947ef542542517efee6'),
  (108, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '9', 'Misty''s Seadra', null, 'Atsuko Nishida', 'rare_holo', null, 'gym1', 'gym1-9', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'bf315f27992907d18fc53aa6f220b65da8fa700d3ceed083aa497e0475365d83'),
  (109, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '10', 'Misty''s Tentacruel', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-10', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'dfd6c00704decce9a3e2561e55cfc7928ae53e468c329d990eabfcd47e79df92'),
  (110, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '11', 'Rocket''s Hitmonchan', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-11', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'da9bfe55f39166f561fddbb89ee1e1715b4bf6b682aff779cfecd86535c7e059'),
  (111, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '12', 'Rocket''s Moltres', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-12', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'b7e6fd894619b98250efcfb8ffb8c19e615b3d7621cf5c5de8c80f286978935a'),
  (112, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '13', 'Rocket''s Scyther', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-13', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'fb06caa855d69c643bdcfa86677aca85b59462324bab2b29ec100d9e086e1ace'),
  (113, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '14', 'Sabrina''s Gengar', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-14', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', '64a4959795a321947e7147e9f27d09c761945e9a2f9a53914ebba472931838c8'),
  (114, 'gym1', 'Gym Heroes', '2000-08-14'::date, 132, 132, '15', 'Brock', null, 'Ken Sugimori', 'rare_holo', null, 'gym1', 'gym1-15', 'cards/en/gym1.json', '05a962766d61eec676ce6fe01945d3c2f677f7c7dbd00a0073c6103cf0fa416f', 'cca228ec0b28ecad33e98656f3ea7e3133ba111b245ad79be031fb1703ecf67a'),
  (115, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '1', 'Blaine''s Arcanine', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-1', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', 'd3f1e60a024a93a63005f47820a928d4c685e3bda940fb10a780f740660bc50a'),
  (116, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '2', 'Blaine''s Charizard', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-2', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '9c4dc6cf8374ad98ee45e0c63cdb7df6db272a47828f62cd83ca068508ffb79c'),
  (117, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '3', 'Brock''s Ninetales', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-3', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '9f45e264cc50dff77eb3db659a35aa92cc1bc4fcff3a90b45a1dfbaca99712d9'),
  (118, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '4', 'Erika''s Venusaur', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-4', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '41ef87c6a6797d92db522379091ae9a6b4f523a3d67f1d7aaa7b47f1fe166d9e'),
  (119, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '5', 'Giovanni''s Gyarados', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-5', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '7c9550324b75dfb3f245f973738691d1c50be69d57e2c1fccbbb2aae55c07124'),
  (120, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '6', 'Giovanni''s Machamp', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-6', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '323737439330c9652e13eec7d3816ba77d83ed67fbeeacc0a4d15cf7a95bff5b'),
  (121, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '7', 'Giovanni''s Nidoking', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-7', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '007ce44a0ca48b67d653ce62940577400457588c1882c2e2768ffce9cae7dfba'),
  (122, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '8', 'Giovanni''s Persian', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-8', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '2eb6251d3006458f899afcf7e908ad78aa3e0a7f79b7cd2aa066fcc2028dbbcd'),
  (123, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '9', 'Koga''s Beedrill', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-9', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '5fad16f5af5aeb2e13e2bf1d180f7e1f3fb7c355d2f3ee40f9ba44fff34310b0'),
  (124, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '10', 'Koga''s Ditto', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-10', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '17a4c955c877105b41b80cda9c3390900837515484ef850be07e791adb37796b'),
  (125, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '11', 'Lt. Surge''s Raichu', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-11', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '85c902a4f699949060c6d2bcee45eecbd3a8161356961c9d31bb462480cf80e5'),
  (126, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '12', 'Misty''s Golduck', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-12', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', 'fd574608a9a83c0558f12d32102d4877eeaf5e0f504b4836d654b6da3fdff75a'),
  (127, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '13', 'Misty''s Gyarados', null, 'Ken Sugimori', 'rare_holo', null, 'gym2', 'gym2-13', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '18c4af30b520b903833cd21e5dfc9a6d41dfbe849d93ecd26c13ed21b546826d'),
  (128, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '14', 'Rocket''s Mewtwo', null, 'Shin-ichi Yoshida', 'rare_holo', null, 'gym2', 'gym2-14', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '398051a3a54cd4674a306d0a9194692730a62df78528e619dfe25ef329874f36'),
  (129, 'gym2', 'Gym Challenge', '2000-10-16'::date, 132, 132, '15', 'Rocket''s Zapdos', null, 'Shin-ichi Yoshida', 'rare_holo', null, 'gym2', 'gym2-15', 'cards/en/gym2.json', '7ea4cee31b66e08d295745b8f9fe1ea9b9392ad6b6cb016d4cebaf6d00e118bf', '84293741888875bf5dfefe9c66bb9f8fb876def83d41ef11436d11d58c81b927'),
  (130, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '1', 'Arcanine', null, 'Naoki Saito', 'rare_holo', null, 'hgss1', 'hgss1-1', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '0415093353075b55b821beb0bbf861de4f815d5956f87de5a4a4a967a9d4690b'),
  (131, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '2', 'Azumarill', null, 'Kouki Saitou', 'rare_holo', null, 'hgss1', 'hgss1-2', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '6980c05facc9537e57f45a99770eeac0ae93861d0a54616407870999ff21210a'),
  (132, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '3', 'Clefable', null, 'Masakazu Fukuda', 'rare_holo', null, 'hgss1', 'hgss1-3', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '3460deb91951fe4550647934cdbb2f615e419be2a608713295cbc94fbfdf4c8d'),
  (133, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '4', 'Gyarados', null, 'Mitsuhiro Arita', 'rare_holo', null, 'hgss1', 'hgss1-4', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '6a77621815f8217b779055f24ce50db8f2928795f40311ecaf222b81d1f0ccc5'),
  (134, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '5', 'Hitmontop', null, 'Ken Sugimori', 'rare_holo', null, 'hgss1', 'hgss1-5', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '0d557be5a9336713eadbb0bde584530b68e57d77f1091864967c504903856f94'),
  (135, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '6', 'Jumpluff', null, 'sui', 'rare_holo', null, 'hgss1', 'hgss1-6', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '73fb262bc800ebecf7e2dd21e657d7acf417dc68b641271adcd9c38fdf8f8a79'),
  (136, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '7', 'Ninetales', null, 'TOKIYA', 'rare_holo', null, 'hgss1', 'hgss1-7', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '2b8d66043c0ebf45b9656f4ead8872a923a9dc34288470b74d90122d083b9d4d'),
  (137, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '8', 'Noctowl', null, 'Suwama Chiaki', 'rare_holo', null, 'hgss1', 'hgss1-8', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '58b1fe501a53a546f846155ca3494f311855821801dc029cc28f6385a82705a4'),
  (138, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '9', 'Quagsire', null, 'match', 'rare_holo', null, 'hgss1', 'hgss1-9', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', 'e0bfe4c79ae07585126b469507507e4f49ec0de2272398ba6e3be1bfb0cd9c0b'),
  (139, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '10', 'Raichu', null, 'match', 'rare_holo', null, 'hgss1', 'hgss1-10', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '49fdc2c285586a077507eb1412b09061b9d52beb1b394fc9585e302e2f11d37a'),
  (140, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '11', 'Shuckle', null, 'Sumiyoshi Kizuki', 'rare_holo', null, 'hgss1', 'hgss1-11', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '003a37d35f39d1638edf235b0fc70bb59df9cc03756843ec6517182a39c484ea'),
  (141, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '12', 'Slowking', null, 'Sumiyoshi Kizuki', 'rare_holo', null, 'hgss1', 'hgss1-12', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '4033bb5b2426bb27d6d21f9bf66cc9b17fe32edf95b60172834cc41e78a37b91'),
  (142, 'hgss1', 'HeartGold SoulSilver', '2010-02-10'::date, 123, 124, '13', 'Wobbuffet', null, 'Yuka Morii', 'rare_holo', null, 'hgss1', 'hgss1-13', 'cards/en/hgss1.json', 'acf378b771f58d74f3b124dd0ebf30caaf9a4ad7ea60e6bd42f7b4eb3ed14e80', '59d45d2028fbeeeb815e8eb3b18ec0bd3fbc41f4ff29af8f223a98f0d4065da2'),
  (143, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '1', 'Jirachi', null, 'Wataru Kawahara', 'rare_holo', null, 'hgss2', 'hgss2-1', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '01f761a06324b059f4f03eb939c93195b8bb354604fc19fce148158db107fdf9'),
  (144, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '2', 'Magmortar', null, 'Hajime Kusajima', 'rare_holo', null, 'hgss2', 'hgss2-2', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', 'f4efa763daf1fb1cdfe8fe33f41617f142ddf0f23b9289feb821cbdbfc8702ef'),
  (145, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '3', 'Manaphy', null, 'Masakazu Fukuda', 'rare_holo', null, 'hgss2', 'hgss2-3', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '5bf69049d8b159cdc33947d1807bde15ef07766fa3197d0e799104d9008907c5'),
  (146, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '4', 'Metagross', null, 'Wataru Kawahara', 'rare_holo', null, 'hgss2', 'hgss2-4', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '6d8957b8878790f7afaf5dd08f135fa7ad3761930d199689ba71431d2548583c'),
  (147, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '5', 'Mismagius', null, 'Hideaki Hakozaki', 'rare_holo', null, 'hgss2', 'hgss2-5', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', 'fa7b82a5c24af0fac1a5ba3de6d4eb52084d1034ddfdb705c2963e310cf94159'),
  (148, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '6', 'Octillery', null, 'Ken Sugimori', 'rare_holo', null, 'hgss2', 'hgss2-6', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', 'd380a85db99c3930f7f658019c90a7af94c19b72449e02cfad37c988c91ece1d'),
  (149, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '7', 'Politoed', null, 'Naoyo Kimura', 'rare_holo', null, 'hgss2', 'hgss2-7', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', 'b23ceb48f78f80f7cfa197efb4c159cfd84d758d9d427da29ca1302c611738a2'),
  (150, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '8', 'Shaymin', null, 'Hideaki Hakozaki', 'rare_holo', null, 'hgss2', 'hgss2-8', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '5fbd9a9d9f9ccd61619cbe14a35c5fc4687639408c9906c7f77376581f2be0a1'),
  (151, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '9', 'Sudowoodo', null, 'Sachiko Adachi', 'rare_holo', null, 'hgss2', 'hgss2-9', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', 'a63c2d70dd2dc2937760226a672d925d3f25b52ae89b3f37bd9898595fd0b32c'),
  (152, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '10', 'Torterra', null, 'match', 'rare_holo', null, 'hgss2', 'hgss2-10', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '6d22cdcedbc9037759fe371eda09c18fcf88410593cc5ceb1421e732a9c56dea'),
  (153, 'hgss2', 'Unleashed', '2010-05-12'::date, 95, 96, '11', 'Xatu', null, 'sui', 'rare_holo', null, 'hgss2', 'hgss2-11', 'cards/en/hgss2.json', '906daebeea83ecbd93ed468af8bbeccdfa390e580bf5f136b63823cb860d95df', '4872bb2188b8f288e7ec903410cbef924fd9793e73fb852d70b1e6cd00411db8'),
  (154, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '1', 'Bellossom', null, 'Mitsuhiro Arita', 'rare_holo', null, 'hgss3', 'hgss3-1', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', 'f630b6605c6be9a5b0380144a0900acf5172214835603e973445485bcc0dfbce'),
  (155, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '2', 'Espeon', null, 'match', 'rare_holo', null, 'hgss3', 'hgss3-2', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '9266c7c607835f281a07b9eff10f589a2c54a6854196f22e46de4001f408fdde'),
  (156, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '3', 'Forretress', null, 'Kyoko Umemoto', 'rare_holo', null, 'hgss3', 'hgss3-3', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '993a790ac67672d1a8c30bb4b86ea03e4ca059796eb8d732b228d88ebb2338bf'),
  (157, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '4', 'Gliscor', null, 'Naoki Saito', 'rare_holo', null, 'hgss3', 'hgss3-4', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', 'd7a0dfad523b14aad48cca5c162dade109d43bfa5440941809747e4332b512b1'),
  (158, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '5', 'Houndoom', null, 'Kagemaru Himeno', 'rare_holo', null, 'hgss3', 'hgss3-5', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '91845a84588363b3f776c7d7ad2f99b7b0c77e81ecf17c47f08047aad388112e'),
  (159, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '6', 'Magcargo', null, 'Yuka Morii', 'rare_holo', null, 'hgss3', 'hgss3-6', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '9153486047d9981cdc725a0085e0b5eeef07eb7b8ec3380f4e532dafa9550690'),
  (160, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '7', 'Scizor', null, 'Kent Kanetsuna/Direc. Shinji Higuchi', 'rare_holo', null, 'hgss3', 'hgss3-7', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '3a0a6e6c7b1a0cd9c76b9f28d37dae92b2db6b4ae85cac805c68422244d166c4'),
  (161, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '8', 'Smeargle', null, 'Midori Harada', 'rare_holo', null, 'hgss3', 'hgss3-8', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', 'e48992c49da44833dded7d0ff162517bb354aad3340036eb49a4c5decbe07603'),
  (162, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '9', 'Togekiss', null, 'Atsuko Nishida', 'rare_holo', null, 'hgss3', 'hgss3-9', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', 'e4faa1e518c3541aa5ad21ea31e458ebd52c52b977e8f3fa815edc78388df911'),
  (163, 'hgss3', 'Undaunted', '2010-08-18'::date, 90, 91, '10', 'Umbreon', null, 'Mitsuhiro Arita', 'rare_holo', null, 'hgss3', 'hgss3-10', 'cards/en/hgss3.json', '62f73bbb2f687ad94f3041f20990dfddbd49bb6f478c981bce1fbabcf70df9dd', '62a96c8cb576404c065f362e1869e3c96a621a26503207628b508f52fa268d64'),
  (164, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '1', 'Aggron', null, 'Kagemaru Himeno', 'rare_holo', null, 'hgss4', 'hgss4-1', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '1a6930a8ab29e6e792f7d0067f6d320ff4f31097f39c8ab4fa2cc10f2772c731'),
  (165, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '2', 'Altaria', null, 'Ryo Ueda', 'rare_holo', null, 'hgss4', 'hgss4-2', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '28478eb159bb292b915c6b7511cd3958e61bf2dc559b9f3261501038459d2908'),
  (166, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '3', 'Celebi', null, 'Shin Nagasawa', 'rare_holo', null, 'hgss4', 'hgss4-3', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', 'bfbd66d1ac1cdb3fa8e404007f282e57cae568e17e3654c4f5ede6c3aebb9258'),
  (167, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '4', 'Drapion', null, 'Sumiyoshi Kizuki', 'rare_holo', null, 'hgss4', 'hgss4-4', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', 'c87ea962f350c545204337ae333edf4df0ffcba0fb7b06f2226c88e4d98158b1'),
  (168, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '5', 'Mamoswine', null, 'Kagemaru Himeno', 'rare_holo', null, 'hgss4', 'hgss4-5', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '60c3bc27e6013bbafa8353d0f668c8ec4bf6655f8335c462a17fb7360066a45a'),
  (169, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '6', 'Nidoking', null, 'match', 'rare_holo', null, 'hgss4', 'hgss4-6', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '694f3af8a8092a72239cc61f7bb9ebd29951b19fc2cf0bb6821070965e581f09'),
  (170, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '7', 'Porygon-Z', null, 'Kouki Saitou', 'rare_holo', null, 'hgss4', 'hgss4-7', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', 'b63d8f26951aeb5ff545c7ca5dfea39819f49479946156df67c5c69004fa1e78'),
  (171, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '8', 'Rapidash', null, 'Kyoko Umemoto', 'rare_holo', null, 'hgss4', 'hgss4-8', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', 'ded2329876098b4c8495dc318c1df42cce117236047a6b423fc122af4b0b97ac'),
  (172, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '9', 'Solrock', null, 'Kouki Saitou', 'rare_holo', null, 'hgss4', 'hgss4-9', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', 'ccf274fa3878239eb0b64636243ca5f6b604681f67786fbadfcd5be6b470d390'),
  (173, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '11', 'Venomoth', null, 'Hideaki Hakozaki', 'rare_holo', null, 'hgss4', 'hgss4-11', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '9abd3df0333bacb7b86056bbe994f61cd906835734355ed574f22788d9b14f51'),
  (174, 'hgss4', 'Triumphant', '2010-11-03'::date, 102, 103, '12', 'Victreebel', null, 'Midori Harada', 'rare_holo', null, 'hgss4', 'hgss4-12', 'cards/en/hgss4.json', '13325098a58fd9cf5e3412f4f665255dad9089778511b19a5a2583ecdc767f61', '73ec7dbdb921fb0e0d7116d9482bf103a0c09f7e99dc23b206025a9b2d5b7653'),
  (175, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '1', 'Alakazam', null, 'Ken Sugimori', 'rare_holo', null, 'base6', 'base6-1', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '1fa2d14c7add32d03cea3fe61f349f1fd105e3c62f84097d309c1aa18f57c7e9'),
  (176, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '2', 'Articuno', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-2', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '6fd8fe4cc7791e1c6054bda230b99f8ac43f281d5e1d7a6c978efc66856415d1'),
  (177, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '3', 'Charizard', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-3', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '33bf16b7373512653bb9e8ea5c78559c0639bbaa702a7f992d47b053b86ea1bd'),
  (178, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '4', 'Dark Blastoise', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-4', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', 'e856dcfec6e662aabda56cd9e769f09a1af95a36f161fc4c559ed2f577bad59a'),
  (179, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '5', 'Dark Dragonite', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-5', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '3fbba23391ee6fd1f7cba711bbbdca14de131fee6d3842ea67a0c6eea9eb94d9'),
  (180, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '6', 'Dark Persian', null, 'Shin-ichi Yoshida', 'rare_holo', null, 'base6', 'base6-6', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '1e97d9fdf72668a455a3ef98724156a5c0aebdfdaf77b4adeba8c438da52bac4'),
  (181, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '7', 'Dark Raichu', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-7', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '624be6528c8eb94c94b110406b1dbb5f3d179f07b605c50e675b8b0451439714'),
  (182, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '8', 'Dark Slowbro', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-8', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', 'a0a76b8c1ae4c02cc9439ad7d613981dc568654b17bdf9ba5b9d99f746637ad0'),
  (183, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '9', 'Dark Vaporeon', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-9', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '9b9ca5ca64085aff2bc50262de425f429c5146ccf4e5d6bf9f4af939e5588d38'),
  (184, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '10', 'Flareon', null, 'Kagemaru Himeno', 'rare_holo', null, 'base6', 'base6-10', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', 'cb574ccdbd348ab7f27c622e4ddd0b885259755487f430f5f0171c35c4c2efcd'),
  (185, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '11', 'Gengar', null, 'Keiji Kinebuchi', 'rare_holo', null, 'base6', 'base6-11', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '268119582c452cde72405871032d7acc53aa28a706c088a16ddd83176fd7eeb3'),
  (186, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '12', 'Gyarados', null, 'Mitsuhiro Arita', 'rare_holo', null, 'base6', 'base6-12', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '1830b187302680ea79d5bfcb31039b96a8ca59fe082b883c9cfbbe7d62465459'),
  (187, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '13', 'Hitmonlee', null, 'Ken Sugimori', 'rare_holo', null, 'base6', 'base6-13', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '562e92868252740483af2cac82e3e5db01aeddba39219927aaae2e8871c2a3c4'),
  (188, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '14', 'Jolteon', null, 'Kagemaru Himeno', 'rare_holo', null, 'base6', 'base6-14', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', '8715b228e098d80baf215c9afd34bc8e7e77ab7aa8ffee2dd57295fb51b28808'),
  (189, 'lc', 'Legendary Collection', '2002-05-24'::date, 110, 110, '15', 'Machamp', null, 'Ken Sugimori', 'rare_holo', null, 'base6', 'base6-15', 'cards/en/base6.json', 'b9af1ab21fa467f846a7a4f89f5244f4a7738bfaee9ae4ca9ce80a5e257e1f50', 'e5c74a6a568edb48a3be0f8be4b2094fb9d405f2f994630d5f38ce1b8226a134'),
  (190, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '83', 'Arcade Game', 'rare', null, null, 'K. Hoshiba, CR CG gangs', 'neo1', 'neo1-83', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '4c00dafc3adecefbd8b1e09ad42228c0cd5ac972c65dee7bd4c472795cb114b4'),
  (191, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '84', 'Ecogym', 'rare', null, null, 'Shin-ichi Yoshikawa, CR CG gangs', 'neo1', 'neo1-84', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', 'd48aa82a01b60c0b0efdf2da495e341d391e3a33b4d9c4f08dcb8f5677e56b25'),
  (192, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '88', 'PokéGear', 'rare', null, null, 'Katsura Tabata, CR CG gangs', 'neo1', 'neo1-88', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', 'fce892cc7ffd53cf9c650655e121383a5aa968ea9c69f46c0ba5bbdac82cdbee'),
  (193, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '90', 'Time Capsule', 'rare', null, null, '"Big Mama" Tagawa, CR CG gangs', 'neo1', 'neo1-90', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '3e23e104bd737edf06b53e420fd0b1386c13a02c62a7361c99c6bf4699f9dabb'),
  (194, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '92', 'Card-Flip Game', 'uncommon', null, null, 'K. Hoshiba, CR CG gangs', 'neo1', 'neo1-92', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '21cc58400833e3d6051ea33338deea61595792b9a52977d24c2d6367e753c1fe'),
  (195, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '93', 'Gold Berry', 'uncommon', null, null, 'Ryuta Kusumi, CR CG gangs', 'neo1', 'neo1-93', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '3ec562d1c04e9cf582863ce4a6e6b7dae1314fb7a0543e4e0bd6de6b290365d9'),
  (196, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '94', 'Miracle Berry', 'uncommon', null, null, 'Yousuke Hirata, CR CG gangs', 'neo1', 'neo1-94', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '3b725415db63d039d85aa0ae2dd89aa60789358a4c46e809976be0e2de09c3d5'),
  (197, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '97', 'Sprout Tower', 'uncommon', null, null, 'Hiromichi Sugiyama, CR CG gangs', 'neo1', 'neo1-97', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', 'e7b3c27d97e2bc600d5f33801be6d73e382176e206eb6508bd56702e518b5d17'),
  (198, 'neo1', 'Neo Genesis', '2000-12-16'::date, 111, 111, '99', 'Berry', 'common', null, null, 'Yousuke Hirata, CR CG gangs', 'neo1', 'neo1-99', 'cards/en/neo1.json', 'c9cf5e1309be79fb1caff1107bf48db1afda11a67483a1baa0fbae2c07a57353', '0c71f6b0ece4a84797f308be3f1f231a701f57fd9ab549b205953c585464275a'),
  (199, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '7', 'Magnemite', 'rare', null, null, 'K. Hoshiba, CR CG gangs', 'neo2', 'neo2-7', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', '153ac886fb57f3e866e03ff5e6898c89ba72f45aeb1d077b539ab4844517bf73'),
  (200, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '26', 'Magnemite', 'rare', null, null, 'K. Hoshiba, CR CG gangs', 'neo2', 'neo2-26', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', '0fd03371be918ca510b665ebccb16f89aea354ef34a2f60a8f8a21f972d0999d'),
  (201, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '72', 'Fossil Egg', 'uncommon', null, null, 'K. Hoshiba, CR CG gangs', 'neo2', 'neo2-72', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', 'cebd3e1a6658737dbdbe55365e0307656d854148a32580044c84bfaf1001fa8a'),
  (202, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '73', 'Hyper Devolution Spray', 'uncommon', null, null, 'K. Hoshiba, CR CG gangs', 'neo2', 'neo2-73', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', '5299261d2e4701c96065dded8d56c2f96d63f35c29c86d75feb053d5d348989e'),
  (203, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '74', 'Ruin Wall', 'uncommon', null, null, '"Big Mama" Tagawa, CR CG gangs', 'neo2', 'neo2-74', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', 'd32d6066ed00665fabbecbb9ab45d77dd284942ca4f9789fce97edcec5b43c6d'),
  (204, 'neo2', 'Neo Discovery', '2001-06-01'::date, 75, 75, '75', 'Energy Ark', 'common', null, null, '"Big Mama" Tagawa & Benimaru Itoh', 'neo2', 'neo2-75', 'cards/en/neo2.json', '5704b7a86aa45a2031f2614758a0c85ce3e4db5dbdf65c7a56c8f5915149e51e', '1082bc83c2a503054b5001d2793b97e391ca5c039a06cd483e28d742d4d8d417'),
  (205, 'neo3', 'Neo Revelation', '2001-09-21'::date, 64, 66, '10', 'Magneton', 'rare', null, null, '"Big Mama" Tagawa, CR CG gangs', 'neo3', 'neo3-10', 'cards/en/neo3.json', 'a0b7860f9a8e351eba26a050cf356a3ab16e498469edcd18aa358f1173dde2b5', 'c2471c37ca16713e20dbf98c1442ec445daa6b91a1bc200b0950acc4541f5f60'),
  (206, 'neo3', 'Neo Revelation', '2001-09-21'::date, 64, 66, '25', 'Starmie', 'rare', null, null, 'Keita Komatsuya, CR CG gangs', 'neo3', 'neo3-25', 'cards/en/neo3.json', 'a0b7860f9a8e351eba26a050cf356a3ab16e498469edcd18aa358f1173dde2b5', '72c07500ea3f12b9844b5ff1c918fb6f5978637f3719b89aa50dce517af61693'),
  (207, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '2', 'Dark Crobat', 'rare', null, null, 'Shin-ichi Yoshikawa, CR CG gangs', 'neo4', 'neo4-2', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', '4d35f1635daa3041e721ea1bc4a970135e379229a51916780d0623d01609a184'),
  (208, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '8', 'Dark Porygon2', 'rare', null, null, 'Shin-ichi Yoshikawa, CR CG gangs', 'neo4', 'neo4-8', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', 'cb4e190e09464b617afb464d1cf744c37a6e8eb2f215d12bd3d3bb936fc67629'),
  (209, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '41', 'Heracross', 'uncommon', null, null, 'K. Hoshiba, CR CG gangs', 'neo4', 'neo4-41', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', '6b8e8aba9112e10b703616ace1763aa144ca01b98c1fba088f94ca77f635c4e3'),
  (210, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '78', 'Porygon', 'common', null, null, 'Hiromichi Sugiyama, CR CG gangs', 'neo4', 'neo4-78', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', '1ab7efbac7652260641c0353d1145fcb31cd8ed908af630566ab77f8a708368c'),
  (211, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '80', 'Remoraid', 'common', null, null, 'Jungo Suzuki, CR CG gangs', 'neo4', 'neo4-80', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', 'bd0bd3ae8e196cd87ac9a1ddf020a3a29bb610f08f226ef8b6a8261ed96a5db9'),
  (212, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '95', 'Radio Tower', 'rare', null, null, 'Yousuke Hirata, CR CG gangs', 'neo4', 'neo4-95', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', '19d6df40e51e5656362a45c8a05c3a23f6b364fe7d4c684d584f2da57adbf67b'),
  (213, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '98', 'Energy Amplifier', 'uncommon', null, null, '"Big Mama" Tagawa, CR CG gangs', 'neo4', 'neo4-98', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', 'c3f7d260f43cfc1cbd84c5e0a8b5fe396e91f865e54939c1d9ca058d952d4103'),
  (214, 'neo4', 'Neo Destiny', '2002-02-28'::date, 105, 113, '104', 'Heal Powder', 'common', null, null, 'Ryuta Kusumi, CR CG gangs', 'neo4', 'neo4-104', 'cards/en/neo4.json', 'e8a89bc775030ce636d75f657c01a3b23c27297ce3ea0bed670cc14ec12dab27', 'b45c33e2c1fa97e29185423106e2a9295d4179e36deeca553a1cf8d3187b0a31'),
  (215, 'np', 'Nintendo Black Star Promos', '2003-10-01'::date, 40, 40, '27', 'Tropical Tidal Wave', 'common', null, null, 'Sumiyoshi Kizuki', 'np', 'np-27', 'cards/en/np.json', 'e07a5c04d1ca6cf4c49ea7b1e634bbe7083501cd2b19afab8047ffc4bebdc848', 'cdda4c9d2fc010b725a42970634a75b557f9522fe320031488fe772bf46ca91b'),
  (216, 'np', 'Nintendo Black Star Promos', '2003-10-01'::date, 40, 40, '36', 'Tropical Tidal Wave', 'common', null, null, 'Sumiyoshi Kizuki', 'np', 'np-36', 'cards/en/np.json', 'e07a5c04d1ca6cf4c49ea7b1e634bbe7083501cd2b19afab8047ffc4bebdc848', 'c589be9389ed692c76ed637613842d1e48e0ee6608164fd41a514604b48ff4ed'),
  (217, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '1', 'Ampharos', null, 'Atsuko Nishida', 'rare_holo', null, 'pl1', 'pl1-1', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '8d3fcaa0de8ab27b43800830d29b51437ef6f223cc1d11a9847c933a66653297'),
  (218, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '2', 'Blastoise', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl1', 'pl1-2', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '3d83a6e71ccbe46c9531f61100ce97ef9d3e7e2a21a730465c99249ab285b376'),
  (219, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '3', 'Blaziken', null, 'Hajime Kusajima', 'rare_holo', null, 'pl1', 'pl1-3', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '90da76cfa8e0a37e9d5ed3ba3ff12c7051f823af19b9302450ea65b31956f9e3'),
  (220, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '4', 'Delcatty', null, 'Mitsuhiro Arita', 'rare_holo', null, 'pl1', 'pl1-4', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '328b5b27c702cd7726280189c032384c7762886ee85237c8f182641aeb55a522'),
  (221, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '5', 'Dialga', null, 'Mitsuhiro Arita', 'rare_holo', null, 'pl1', 'pl1-5', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '040909ebb44fa6b087e5496ae04dd478280dea7095c5febd81f754b00f68a903'),
  (222, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '6', 'Dialga', null, 'Kouki Saitou', 'rare_holo', null, 'pl1', 'pl1-6', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '6539884cceff0171742de6dde6e0686036558e1d56ecbdd42fff1506aaa8753e'),
  (223, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '7', 'Dialga G', null, 'Yusuke Ishikawa', 'rare_holo', null, 'pl1', 'pl1-7', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '908be7c90e5bd4c77db143f68b054a13a674b1d8b712d75d7052302181d777a0'),
  (224, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '8', 'Gardevoir', null, 'Kouki Saitou', 'rare_holo', null, 'pl1', 'pl1-8', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '4ddcf13e1189a73043e58aa8b94f6acb9a60f7feeb48311fbc516abee4d3be88'),
  (225, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '9', 'Giratina', null, 'Kouki Saitou', 'rare_holo', null, 'pl1', 'pl1-9', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', 'bcce3394f0aa6eafdff834001c67b80ad3f6b8c856c3d5e2987ced39c893ccd0'),
  (226, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '10', 'Giratina', null, 'Hajime Kusajima', 'rare_holo', null, 'pl1', 'pl1-10', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', 'f4ace3515608a8952871b955b85dfda997e346d66838570ea2f88b55a43b38eb'),
  (227, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '11', 'Manectric', null, 'Kouki Saitou', 'rare_holo', null, 'pl1', 'pl1-11', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '2c3cd01d17830d29b13443006746067ae92226af65dace88875fc952e7187e5a'),
  (228, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '12', 'Palkia G', null, 'Yusuke Ishikawa', 'rare_holo', null, 'pl1', 'pl1-12', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '62b979cee6fd3e9f634d319d72097546412186848efb34d9de342b1feafd2909'),
  (229, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '13', 'Rampardos', null, 'Masakazu Fukuda', 'rare_holo', null, 'pl1', 'pl1-13', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', 'b441227b305ea922d8854b119bab04b7ae678dfca9a2d925da8263751c56f35e'),
  (230, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '14', 'Shaymin', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl1', 'pl1-14', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '93f2ded8bf6cb6496db84e259adb8b42d3cebed1f9e4559651b2eb7ede3812ea'),
  (231, 'pl1', 'Platinum', '2009-02-11'::date, 127, 133, '15', 'Shaymin', null, 'Atsuko Nishida', 'rare_holo', null, 'pl1', 'pl1-15', 'cards/en/pl1.json', '5e6cb1eda16f621cfd0413d07d4a8ef8331946ad89b82106ad925cd1d66d7afa', '97131755efa55534a04ce3d73168364054bed90b10a7412d1b6d664dbe3adf0a'),
  (232, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '1', 'Arcanine', null, 'Masakazu Fukuda', 'rare_holo', null, 'pl2', 'pl2-1', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', 'c120bef28f6f7981b17312578cd5dfa413fb53969065c009af44641e9b514b64'),
  (233, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '2', 'Bastiodon GL', null, 'Hajime Kusajima', 'rare_holo', null, 'pl2', 'pl2-2', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', 'ac764f926daedf66e7bc2b7da82e60fb011447fa9c440062b2bb7eb6100689d8'),
  (234, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '3', 'Darkrai G', null, 'Makoto Imai', 'rare_holo', null, 'pl2', 'pl2-3', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '61be0cd15abd923517c5747d40fc511af44c0873377e93f084c01a3c955a23a6'),
  (235, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '4', 'Floatzel GL', null, 'Midori Harada', 'rare_holo', null, 'pl2', 'pl2-4', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '72e051c4b0e70510002fd5577557b327062121fb3b5c1ace3d08304b8cb72505'),
  (236, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '5', 'Flygon', null, 'Kouki Saitou', 'rare_holo', null, 'pl2', 'pl2-5', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '54967af12dc4221459b119c6f2dbc0518a9edacf1903a9abf260928753f7694c'),
  (237, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '6', 'Froslass GL', null, 'Atsuko Nishida', 'rare_holo', null, 'pl2', 'pl2-6', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '01485a8caf5042a3c53b7e3bf6ee475c75115ebedc331727c6e47afaf6b2c031'),
  (238, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '7', 'Jirachi', null, 'Kenkichi Toyama', 'rare_holo', null, 'pl2', 'pl2-7', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '1519f19558b3c3681fbe245df266aaf5cd9bb322f8ead7d7e37bdabb1a6a0a0e'),
  (239, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '8', 'Lucario GL', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl2', 'pl2-8', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '5ce28de3e3a5b8badba58cd4267e8c8cb3420684e58a890c027664da2219ce4f'),
  (240, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '9', 'Luxray GL', null, 'Kouki Saitou', 'rare_holo', null, 'pl2', 'pl2-9', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', 'b3f2a2669f7570e969ee2c1dea1c5bfe231d85ec090c4d4f1666b42ba3c06540'),
  (241, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '10', 'Mismagius GL', null, 'Naoyo Kimura', 'rare_holo', null, 'pl2', 'pl2-10', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', 'aa8491521d06f139ef8c1e91e4204dc943c82548c437f8b3650723f762b8296f'),
  (242, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '11', 'Rampardos GL', null, 'Suwama Chiaki', 'rare_holo', null, 'pl2', 'pl2-11', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', 'ec0b17d89045aeb0988b2a2db7cda38a1953a0dd49b965c2ad636bc7589b2f3a'),
  (243, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '12', 'Roserade GL', null, 'Kanako Eo', 'rare_holo', null, 'pl2', 'pl2-12', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '8f9adb494517c5823ad079f4ecc0f1b847beb771dc4957ff6547301644102662'),
  (244, 'pl2', 'Rising Rivals', '2009-05-16'::date, 111, 120, '13', 'Shiftry', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl2', 'pl2-13', 'cards/en/pl2.json', 'a3654b19f965dbdd4f102d766397ffea2a23f987cca867fa2201d1523660e432', '00e399c61456984b494d6679119965d4b9848c3a5a4eab50feec4fbf16955819'),
  (245, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '1', 'Absol G', null, 'Yusuke Ishikawa', 'rare_holo', null, 'pl3', 'pl3-1', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '2df0fdc3de01f7584504178f3b78f71cf87ab0324e7acc7cc32ec2ed8e395e85'),
  (246, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '2', 'Blaziken FB', null, 'Motofumi Fujiwara', 'rare_holo', null, 'pl3', 'pl3-2', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '10b29f504a40b5ba661e86518876b71f022d1cff253cbf399e9ddbf4bfd86511'),
  (247, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '3', 'Drifblim FB', null, 'Lee HyunJung', 'rare_holo', null, 'pl3', 'pl3-3', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '92c5571257e9a9510075ef01fd91a3cb2fae3c542d7dcc7da11b2bbc2e5eb106'),
  (248, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '4', 'Electivire FB', null, 'Hironobu Yoshida', 'rare_holo', null, 'pl3', 'pl3-4', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', 'e06e05716b9ad847ce39f2e36d11db1ac62fb8d5128f90e5e7f76fa4be24786c'),
  (249, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '5', 'Garchomp', null, 'Mitsuhiro Arita', 'rare_holo', null, 'pl3', 'pl3-5', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '0027c48080a83e30003b94805bf01cf37c858d22779c87405c7a9cd8715c44fd'),
  (250, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '6', 'Magmortar', null, 'Naoyo Kimura', 'rare_holo', null, 'pl3', 'pl3-6', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', 'c76b1b471e8cd3015451d48ccff60fb5a5c9c8697dafcbeecdf715f87dbfa819'),
  (251, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '7', 'Metagross', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl3', 'pl3-7', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '2d1592db3235958c06b2e947740a013de75f641828f9f68711fce173a02238cb'),
  (252, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '8', 'Rayquaza C', null, 'kawayoo', 'rare_holo', null, 'pl3', 'pl3-8', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '107daa591d23731279c90f915940b5500a79e2f736ae00cf571189a447d1f285'),
  (253, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '9', 'Regigigas FB', null, 'Shin Nagasawa', 'rare_holo', null, 'pl3', 'pl3-9', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', 'd1a86fdac14ff4a6ee9f2466f52834c2d8eb8b17bcce4e49bd31dabc16e7c755'),
  (254, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '10', 'Rhyperior', null, 'Hajime Kusajima', 'rare_holo', null, 'pl3', 'pl3-10', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', 'feb8f8ab27d10a7ae4d28f02b17943637733b4904193aa4bbffef5da5695c6f6'),
  (255, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '11', 'Staraptor FB', null, 'Hiroki Fuchino', 'rare_holo', null, 'pl3', 'pl3-11', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '7473a0cba409ce6abe6efff3bd9aa26e9c868a98a1b1dca80c945ab23b3a1d97'),
  (256, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '12', 'Swampert', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl3', 'pl3-12', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '6351797c9c8c4646bbc7fa4d65560fc784fe01dcdb37b51b1f0dc0d5c974e230'),
  (257, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '13', 'Venusaur', null, 'Kouki Saitou', 'rare_holo', null, 'pl3', 'pl3-13', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', '02bb612e42d796a39782126dad2dd7b6dd6ee52ee602749a29c09dffd341bb9d'),
  (258, 'pl3', 'Supreme Victors', '2009-08-19'::date, 147, 153, '14', 'Yanmega', null, 'Masakazu Fukuda', 'rare_holo', null, 'pl3', 'pl3-14', 'cards/en/pl3.json', 'c3f3898e9dba49ecd5c00356fc34695f8161a60b1b09452ceffa48b23202b932', 'f8a20ed3abb3241f4001c1d83857f8e2fcf033c64838fd29f714b2fa1751b15d'),
  (259, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '1', 'Charizard', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl4', 'pl4-1', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '17aa059aa9625aeccc46b7e1c2f4f2d7fa624148209acc4997db8527e5c06bfa'),
  (260, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '2', 'Froslass', null, 'TOKIYA', 'rare_holo', null, 'pl4', 'pl4-2', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '1cfbf4842bd4e78534f8f6f96bfd12727b2d7f8e5d2d5e1aa0ef0867e3eaebbd'),
  (261, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '3', 'Heatran', null, 'Keiko Moritsugu', 'rare_holo', null, 'pl4', 'pl4-3', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '712adf90e8c8f305eaf58264602ee0cf64e6911511a03671fafd6f4420938013'),
  (262, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '4', 'Kabutops', null, 'Hajime Kusajima', 'rare_holo', null, 'pl4', 'pl4-4', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'e1918404921f17c840cddcbb1fe0f6bede0b323e4f37c80647f241045b5e03a4'),
  (263, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '5', 'Luxray', null, 'kawayoo', 'rare_holo', null, 'pl4', 'pl4-5', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '31e94cef522f6c6ec20f852603d47b281a6bd25c933725b75a0afb0dcc956dd4'),
  (264, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '6', 'Mothim', null, 'Kagemaru Himeno', 'rare_holo', null, 'pl4', 'pl4-6', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'e3ebb605ea75ebf62347bc7bdfb12f79b828e4328debb8464c220440c3d681cd'),
  (265, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '7', 'Probopass', null, 'Kouki Saitou', 'rare_holo', null, 'pl4', 'pl4-7', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '45eacf7f6c651dd8942b33f1b85926c3bb2a547dfc9c2c72be8e8ff0cf4a3b18'),
  (266, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '8', 'Salamence', null, 'Shin Nagasawa', 'rare_holo', null, 'pl4', 'pl4-8', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', '91a6a4278802fb7b7c2b0b3ef39746f37fe1d4dd20b7c86080d02acb7c51673e'),
  (267, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '9', 'Swalot', null, 'Aya Kusube', 'rare_holo', null, 'pl4', 'pl4-9', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'aa05dd483ac0c13a9aebeda0281d214a47e13923bb9da8e715e937ddf20b707f'),
  (268, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '10', 'Tangrowth', null, 'Masakazu Fukuda', 'rare_holo', null, 'pl4', 'pl4-10', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'ddfd456a2b432625bff7e000ec9a8dcfced24645ac881e2a63288d4b8ec099a9'),
  (269, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '11', 'Toxicroak', null, 'Kouki Saitou', 'rare_holo', null, 'pl4', 'pl4-11', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'c875dac982cffa03bb0af97aa64749731673ce769e02fa0d7a599ab4f55b1478'),
  (270, 'pl4', 'Arceus', '2009-11-04'::date, 99, 111, '12', 'Zapdos G', null, 'Ryota Saito', 'rare_holo', null, 'pl4', 'pl4-12', 'cards/en/pl4.json', '4172f430a190b9777e856a461f231cf6bf35e6addc626cedf23ee198d111535a', 'f48e514162351aaea33db9e4d466641ca218f427fd40c609bb40212f283b3192'),
  (271, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '1', 'Venusaur', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-1', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '3ada9bb1462fe96a234a58090840e438bcf7370184900e7c8b914eade212a9cb'),
  (272, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '2', 'Cherrim', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-2', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'a04778b355a90aadf7a1c7e0e8ce01ae68937575133d81056082baa95ad6d1ce'),
  (273, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '3', 'Ninetales', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-3', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '4c30343af2c1e771ed4c1b1dd9e17caf6b97a2546c1338ac216147bcac8be236'),
  (274, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '4', 'Heatran', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-4', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '403c730100fa77c5dfd98e33f9c3b4e51eb7676aec35917650c952a6445cf3ee'),
  (275, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '5', 'Starmie', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-5', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '006ae4da56ebc5a771724509c07d91c8261323581cbd332fdb43bbf802c5747e'),
  (276, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '6', 'Gyarados', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-6', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'c7cf3f89ea85e8eb8e697db4b72d4333004a107a69fa69b226e212f52e2bb778'),
  (277, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '7', 'Pikachu', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-7', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'b0f5b25d863cc5380795ef7a06be6ee259b2109258947568b99dc7df05548dc9'),
  (278, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '8', 'Zapdos', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-8', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '0dab68e330ca850aa772d19b1b3a716b432962c1a8a5b706c039d492fb423953'),
  (279, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '9', 'Mewtwo', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-9', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'b699b74c679c04998efc98edadd8cb8a0664daf2652e34b535fa7897acb69b7f'),
  (280, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '10', 'Mew', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-10', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'f0e133096fea09e7dc5313a3cc6842f9f1b4067e9b7173b7b50fd63d6cf1f245'),
  (281, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '11', 'Diglett', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-11', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '8e16be69b3bf208ea16e871753aeba2ddb8448482e59602f1451babfd2e02bba'),
  (282, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '12', 'Lucario', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-12', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '8de110a6339f3131d35716fbafa40593d5bfa2a0f1464aaad6dd6e4c60a80c7b'),
  (283, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '13', 'Skuntank', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-13', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'a4e4d0913695878bf72eb6be5c9a6aa59390963e41c586fe69db80f077c2b347'),
  (284, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '14', 'Bastiodon', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-14', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '8c2952f7ae590f7fccff740966410b5eb395797ca920882cfc96c41ea0db44a8'),
  (285, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '15', 'Rattata', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-15', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', '0cea0da2d45e49902ab668da32a8e409843f7eba786d9fd45a85bb2e66600ac8'),
  (286, 'ru1', 'Pokémon Rumble', '2009-12-02'::date, 16, 16, '16', 'Bibarel', null, null, null, 'Pokemon Rumble', 'ru1', 'ru1-16', 'cards/en/ru1.json', '319f85c04ca1ab2baf7dd74887a29db6151703e4273cf2868ee15d686d3bec9d', 'f8a143f8ba5b2c17c91262f64c89b560e2c3fc1f3ea89e69d38d8725b8fcbf2d'),
  (287, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG01', 'Braixen', null, 'Naoki Saito', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG01', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '607ddd6c5055e25db3f333367f5f2f0508e18dd518f48b61b7a46ab99437e692'),
  (288, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG02', 'Milotic', null, 'chibi', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG02', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'c3ebaf22d880bac2d8bf1a758eda5026a1e7d28793e8e40c57c486d3d7d6b917'),
  (289, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG03', 'Flaaffy', null, 'saino misaki', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG03', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'c19b66dc511a7b9697101733a0faf3bb975799c59ef66558a986fabdc6d3e023'),
  (290, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG04', 'Jynx', null, 'HYOGONOSUKE', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG04', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '0c8ee06f737c4475fc6b512f56ff422572551be33f51caab84fb37240aedf4d3'),
  (291, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG05', 'Gardevoir', null, 'AKIRA EGAWA', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG05', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'fee5590009a6cedeeebb6f74f88a1b85ac2b4a9f406cb8d54ffe4636e12212c0'),
  (292, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG06', 'Malamar', null, 'Fumie Kittaka', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG06', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '674e2d7e61714bbbf17141cfa3a7d8a5eb7f6ee067f29b5c4b93d9295955fcee'),
  (293, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG07', 'Rockruff', null, 'Hideki Ishikawa', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG07', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '0d63125897a09b7533f728dccf99b434396b464b776fac6996b030428188ba45'),
  (294, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG08', 'Passimian', null, 'nagimiso', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG08', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '6c5f3388800a53b9b01594672b90d9ce04e65bd745cd2fb499c2805ac17bbd50'),
  (295, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG09', 'Druddigon', null, 'Teeziro', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG09', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '7948811857ce305ce8563c54fb1b09f8a8e739c24101a7a33e9e47b8cb77dc80'),
  (296, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG10', 'Smeargle', null, 'KIYOTAKA OSHIYAMA', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG10', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '07f49c8c8726cec2eb294e71d54f9f304d751a8bed9bf8f704872ac753926c12'),
  (297, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG11', 'Altaria', null, 'Yuu Nishida', 'trainer_gallery_rare_holo', null, 'swsh12tg', 'swsh12tg-TG11', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'c94287b14c31a76ba36aad54e4306dd383909da5e138a53ea83f62fdec0838c3'),
  (298, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG12', 'Kricketune V', null, 'HYOGONOSUKE', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG12', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '4bce15d372be81481f5dc95666dcef9373ea47f4696d5a9f7801d42b414a1682'),
  (299, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG13', 'Serperior V', null, 'Teeziro', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG13', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'd5572b720b3399c7f47a783e93ad8a990b3d41626951f0e9185cf9cd85d1cc9b'),
  (300, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG14', 'Blaziken V', null, 'nagimiso', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG14', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'ca60beaf27b6beb941bcc7b693e5365ef31dd87847c46cb13efc3f85d4d0f261'),
  (301, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG15', 'Blaziken VMAX', null, 'KIYOTAKA OSHIYAMA', 'holo_rare_vmax', null, 'swsh12tg', 'swsh12tg-TG15', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '9f25815883cce506a6c9c5933a9121422d76010cf6056b8252e497754bba3798'),
  (302, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG16', 'Zeraora V', null, 'yuu', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG16', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'a39167b537cb0062516dc87bda3d50994cf45415e990da309da96f605414dfe5'),
  (303, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG17', 'Mawile V', null, 'saino misaki', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG17', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '41487e3457dca6e2af2a67f6f10f43b91e9214cf2edafe2acc691cc78ec69adb'),
  (304, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG18', 'Corviknight V', null, 'KIYOTAKA OSHIYAMA', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG18', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'c5000227aadd96cd585a31c407c224ae718dde4333097feee3eec2fcf6a04aca'),
  (305, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG19', 'Corviknight VMAX', null, 'Shigenori Negishi', 'holo_rare_vmax', null, 'swsh12tg', 'swsh12tg-TG19', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'c91f01a2b5105bf11d1eda270efb9e5ba891e399a0acbc693543d82c0581464d'),
  (306, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG20', 'Rayquaza VMAX', null, 'Hideki Ishikawa', 'holo_rare_vmax', null, 'swsh12tg', 'swsh12tg-TG20', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'ccfe8b96cf955cb7701db8da9b9b21703a44f7e4ecf8fcff9b885d75348e9a06'),
  (307, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG21', 'Duraludon VMAX', null, 'AKIRA EGAWA', 'holo_rare_vmax', null, 'swsh12tg', 'swsh12tg-TG21', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'ffc1514e43f3797df16dfeb70c3a12d8a7c31874176c0ef05bf2b3dd25642cc2'),
  (308, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG22', 'Blissey V', null, 'You Iribi', 'holo_rare_v', null, 'swsh12tg', 'swsh12tg-TG22', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'e5884e2331c33fbc1a0ebbe5070dc1f9a321a2da0d12c2c50e7bc4df96797591'),
  (309, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG23', 'Friends in Galar', null, 'Sanosuke Sakuma', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG23', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '6fd020a905f79e390946854dab1d10ac00c40d193c3405a993d4489595a0db96'),
  (310, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG24', 'Gordie', null, 'Ryuta Fuse', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG24', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'a93a5bbf6d7eb65fb047e5b81f84ebe4b189795404c856f4d41a1a3708fb556b'),
  (311, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG25', 'Judge', null, 'Ryuta Fuse', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG25', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '727c3559d9db50cb2fba50846ad479debfeb7f6da624ca1c0a2c64bbd3701616'),
  (312, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG26', 'Professor Burnet', null, 'kirisAki', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG26', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', 'cbcdd77b30bf91254e391bf36ba574d4b9b27cbf4b9df5128751bfd842590ee9'),
  (313, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG27', 'Raihan', null, 'take', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG27', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '33d84744f38849174da02e7685a7e29ff588c2158fad37612fa6bf32104c553a'),
  (314, 'swsh12tg', 'Silver Tempest Trainer Gallery', '2022-11-11'::date, 30, 30, 'TG28', 'Sordward & Shielbert', null, 'nagimiso', 'ultra_rare', null, 'swsh12tg', 'swsh12tg-TG28', 'cards/en/swsh12tg.json', '19b1740686f815a2f4c5f12be6f3158b5b39da2b047b5c4c2c9f2c76a7b8fa46', '72a4e362aaf7289c6a421a4f1840f79f53e6af15a453ddedbaf299ab3754f377'),
  (315, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH062', 'Pikachu VMAX', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH062', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd4ad107c47d13e4a95ae5db52feb137a62ee6e27470d23bbb0ecf28b08170ae9'),
  (316, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH137', 'Light Toxtricity', 'promo', null, null, 'Naoyo Kimura', 'swshp', 'swshp-SWSH137', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e128618baf9b9bcb84d1ed403785ba4770125a8fe6cacfd67f9c0573deb5457f'),
  (317, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH138', 'Hydreigon C', 'promo', null, null, 'kawayoo', 'swshp', 'swshp-SWSH138', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '228b02b006e90429eb77f9a85e767b2714365250132a1f8c801b3cf990c2c26a'),
  (318, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH143', 'Pikachu V', 'promo', null, null, 'HYOGONOSUKE', 'swshp', 'swshp-SWSH143', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'b32a6236a69dbca65e32ef74e49f46ec91d761705b9e087ca4a212cc5c8f4a3f'),
  (319, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH145', 'Pikachu V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH145', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e5eb389d470d2746dc0c698226684f170cdcd1180894babc77249fc738aefa66'),
  (320, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH146', 'Poké Ball', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH146', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd80338b5254d1d33f7a76196646c32acc08add7c2f7d04b0ffab7fc353973fbb'),
  (321, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH152', 'Professor''s Research', 'promo', null, null, 'Yuu Nishida', 'swshp', 'swshp-SWSH152', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '4fd99245482de9033c6196a76b4685256e08387f9055b13055011c71fd669f8d'),
  (322, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH153', 'Pikachu', 'promo', null, null, 'sowsow', 'swshp', 'swshp-SWSH153', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '0ccb96839c62ef2953e955af5f84f28cace9d071c76d8594271915b8f8368105'),
  (323, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH154', 'Dragonite V', 'promo', null, null, 'Saki Hayashiro', 'swshp', 'swshp-SWSH154', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1ad67477d076d2b28f307075217934e47aafbd85055e7f45b65f09fcf0cb9fed'),
  (324, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH168', 'Oricorio', 'promo', null, null, 'otumami', 'swshp', 'swshp-SWSH168', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '141a3bf9817459d0197d7cf6e12fb73ff8bcf3b15733a299dbc095f630369715'),
  (325, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH169', 'Pyukumuku', 'promo', null, null, 'Narumi Sato', 'swshp', 'swshp-SWSH169', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6ad8949cd943509921167aaa42a9cf403380e96b9cf818566ec71fed0382d28f'),
  (326, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH170', 'Deoxys', 'promo', null, null, 'Souichirou Gunjima', 'swshp', 'swshp-SWSH170', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '11e84185535ab2909a8dbee54e5475bf2fadc13e0b578915fa60203eaf007ae6'),
  (327, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH171', 'Latias', 'promo', null, null, 'takuyoa', 'swshp', 'swshp-SWSH171', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '871cfe616a0e70e422fff6454bd489daacdb28d732530bcc42e21951cd8832b6'),
  (328, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH172', 'Tepig', 'promo', null, null, 'Eri Yamaki', 'swshp', 'swshp-SWSH172', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '0083c9628ce954f75af5478fda8b9cf7c3740731f43c6dab065f33e5227d0c68'),
  (329, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH173', 'Blitzle', 'promo', null, null, 'Oswaldo KATO', 'swshp', 'swshp-SWSH173', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '91d85d507a909c788a8baae67179f45fa75cb4cae0dc8edaa0337b683e0e7ddd'),
  (330, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH174', 'Espeon', 'promo', null, null, 'Tika Matsuno', 'swshp', 'swshp-SWSH174', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '4d53d3cea157c8e586fca1b060fe71fa4d499effd459e0cd8d558452e2883a88'),
  (331, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH175', 'Eevee', 'promo', null, null, 'Tika Matsuno', 'swshp', 'swshp-SWSH175', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '995763f735b1a63627e1071927db9fe113a79ef2b72246a5b60fe634242ebc56'),
  (332, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH176', 'Hoopa V', 'promo', null, null, 'takuyoa', 'swshp', 'swshp-SWSH176', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'b3b865a2ec0c830cd8df9a09a6fbfadf15aed91312e8ac009779aaf494f6fd6c'),
  (333, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH179', 'Flareon V', 'promo', null, null, 'Souichirou Gunjima', 'swshp', 'swshp-SWSH179', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '9883745b276f1bcd9d19bccd567ad45966433e8d04a5d9382192ccfd3cdd44be'),
  (334, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH180', 'Flareon VMAX', 'promo', null, null, 'OKACHEKE', 'swshp', 'swshp-SWSH180', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '381f9ae1e635312fa598a6180892c24506c12f303f807bc35e4438cdad9ec1f3'),
  (335, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH181', 'Vaporeon V', 'promo', null, null, 'Tika Matsuno', 'swshp', 'swshp-SWSH181', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ceb1cfc64125e38e35caa3ac158af59ad9c27264526efb028ae2cdda0a4a94cd'),
  (336, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH182', 'Vaporeon VMAX', 'promo', null, null, 'Atsushi Furusawa', 'swshp', 'swshp-SWSH182', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd60dfc44b0dcc203ac01ad37725413e027cc462ff90e06d4a29cab93a7075bc3'),
  (337, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH183', 'Jolteon V', 'promo', null, null, 'nagimiso', 'swshp', 'swshp-SWSH183', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '9149fec8413ff53decc9b31c00dd39b94db06a04089e04b7271846d2ab999022'),
  (338, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH184', 'Jolteon VMAX', 'promo', null, null, 'Hasuno', 'swshp', 'swshp-SWSH184', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '17dc8ebf19772ed2c0176277486b37db3acddff840f9cfd97fb42b3a89e126f9'),
  (339, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH185', 'Moltres', 'promo', null, null, 'Shinji Kanda', 'swshp', 'swshp-SWSH185', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'b383e3e6ac8c909db38e78231790dade826842cbc607e89e4c98824db8006cd0'),
  (340, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH186', 'Lucario', 'promo', null, null, 'NC Empire', 'swshp', 'swshp-SWSH186', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'a4435aeaca4683f620d3693e3a2499ae05572255373b0c42e9024408462bdf24'),
  (341, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH187', 'Liepard', 'promo', null, null, 'saino misaki', 'swshp', 'swshp-SWSH187', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6b64a0bb7d8d1773b8c5896b59261007e6959f064ea7006b34aa3daead93b13f'),
  (342, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH188', 'Bibarel', 'promo', null, null, 'Misa Tsutsui', 'swshp', 'swshp-SWSH188', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '528a49a7f4d2fb9f4df0a7893158cd2e8e4164d50c167c62350f0390e8b23f4b'),
  (343, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH189', 'Flapple', 'promo', null, null, 'nagimiso', 'swshp', 'swshp-SWSH189', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '09d970f76d476a67a13617086735b1a21fc14b28ffc2c004dfc2e83989c9aa71'),
  (344, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH190', 'Eevee', 'promo', null, null, 'OKACHEKE', 'swshp', 'swshp-SWSH190', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '26b89ca06d43b5f3c0b6d7e382d6241b1938b253be6e570d6328d7fae10894c6'),
  (345, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH191', 'Leafeon', 'promo', null, null, 'OKACHEKE', 'swshp', 'swshp-SWSH191', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1459c5975640d7d205bcfe5b673a7dc20b2e5841081efd12cf0ef34cba88dd42'),
  (346, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH192', 'Glaceon', 'promo', null, null, 'OKACHEKE', 'swshp', 'swshp-SWSH192', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7fdea49d1c1c6ff366e0d313604f61b606d7ca108df33acd764990edbb5b0d32'),
  (347, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH193', 'Galarian Obstagoon', 'promo', null, null, 'Megumi Higuchi', 'swshp', 'swshp-SWSH193', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '62ef8f9553aedae5eed4c63b972c05dbd2779718ad6a4d91742601da297d308f'),
  (348, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH194', 'Leafeon V', 'promo', null, null, 'PLANETA Yamashita', 'swshp', 'swshp-SWSH194', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ccc7ac8871ee746a2df4dd2cac06965032d8f548232a51c7b9eaf31d99543f41'),
  (349, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH195', 'Leafeon VSTAR', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH195', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '66073b9e53c5512d8cb5385de68e3edd1d7934dcec352055e44a907c1ce332fe'),
  (350, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH196', 'Glaceon V', 'promo', null, null, 'PLANETA Yamashita', 'swshp', 'swshp-SWSH196', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '243631761a7f5377df024b287bb6e21415604bd188ed4bd0a855f34b6fbb769b'),
  (351, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH197', 'Glaceon VSTAR', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH197', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'f50dd9e28f8d28afce55477e654182d7c9928e8dc0150f0e437aabd7e472f4e3'),
  (352, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH198', 'Pikachu V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH198', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7ec1067e4b2f9618124fb33ddd787d6655ae4f6fde80b40145bdbaec33e1601e'),
  (353, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH199', 'Lycanroc V', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH199', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '4986694aa74b515ebbb27029545209eafaf35c53fa99c425b394e85a484020f3'),
  (354, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH200', 'Corviknight V', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH200', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '69a1d5014f3e418e2636f51da555aabc2f8c031782392087d110e3c8e9cfb51e'),
  (355, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH201', 'Espeon V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH201', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7fff443365c9130881d13a6958f0a04913352c3402d5ce3214b0325f7d27daa7'),
  (356, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH202', 'Sylveon V', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH202', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '054ad1c5f4369f1c60b192ba3b2d898d95e0c5eb78c94b9fc40218d3922aa834'),
  (357, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH203', 'Umbreon V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH203', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '615fa343fc0f486bc83a7bb895d84b7bd5d27aff386cb29243ccd789d865e985'),
  (358, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH204', 'Arceus V', 'promo', null, null, 'Atsushi Furusawa', 'swshp', 'swshp-SWSH204', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1d517c4b28741ad9c841b2670a74b47e33a84a67181f308d2bb7bcc3a9d360b6'),
  (359, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH205', 'Hisuian Basculegion', 'promo', null, null, 'Pani Kobayashi', 'swshp', 'swshp-SWSH205', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'b4c3b1f24aadd7ec0c43771e376b5e2affbaac48b0fcb683105693982c5988f1'),
  (360, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH206', 'Wyrdeer', 'promo', null, null, 'Eri Yamaki', 'swshp', 'swshp-SWSH206', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6665031c6bf6187f91a78f98a2c51d819337930960d417482049f26cedd3d488'),
  (361, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH207', 'Hisuian Samurott', 'promo', null, null, 'Oswaldo KATO', 'swshp', 'swshp-SWSH207', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '34145154a3f5de1de4970fe8b84a68ffb2a7a45619236734dd67279affa76cbc'),
  (362, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH208', 'Magnezone', 'promo', null, null, 'zig', 'swshp', 'swshp-SWSH208', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '3c9fcdfbf509fcf9788d1837e395c48101a98e8cb0e97a983a6cfb80a9b5ac10'),
  (363, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH209', 'Toxel', 'promo', null, null, 'Souichirou Gunjima', 'swshp', 'swshp-SWSH209', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '0c190a3d27ebe944befaba8ba2a67c238464b5dd576288ee6d8d73e8a970a1c5'),
  (364, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH210', 'Oricorio', 'promo', null, null, 'Ryuta Fuse', 'swshp', 'swshp-SWSH210', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '5179342967555eef8b47bba3fd6aa005d6ec6460e7c02e737ce3b0f4022cbe6f'),
  (365, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH211', 'Sylveon', 'promo', null, null, 'Mizue', 'swshp', 'swshp-SWSH211', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'c0013b91a0b5ac649a3c43970a834af3b854bb6171be03d9f13497c8247b2f54'),
  (366, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH212', 'Eevee', 'promo', null, null, 'Mizue', 'swshp', 'swshp-SWSH212', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'fd0acbd921b65b7a160acbdc394618254515c4d90cf5d023bdae57054d38ef2c'),
  (367, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH213', 'Lucario V', 'promo', null, null, 'takuyoa', 'swshp', 'swshp-SWSH213', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '350da543e968a691599821de1705ea53483098cb0e49464bc936d3b4a71ccaa5'),
  (368, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH214', 'Lucario VSTAR', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH214', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7cb628ffd311e2b4c35e5baa73878e40f5543bb241d903f0d63628f01d4d17b3'),
  (369, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH215', 'Morpeko V-UNION', 'promo', null, null, 'Mitsuhiro Arita', 'swshp', 'swshp-SWSH215', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '40c789544eb39538fb77a970c7555d1e088ac74725be09cd078af5cf1ea7ccfb'),
  (370, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH216', 'Morpeko V-UNION', 'promo', null, null, 'Mitsuhiro Arita', 'swshp', 'swshp-SWSH216', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7838a8c2181cb08c39ed57b5e3407c818dbe4d1a97af3bf5723a82d92361be64'),
  (371, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH217', 'Morpeko V-UNION', 'promo', null, null, 'Mitsuhiro Arita', 'swshp', 'swshp-SWSH217', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1ecaa5e7b0521ee4ddb20697a10eb557f9a8838e4815c4f871ccb7e07897b3b0'),
  (372, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH218', 'Morpeko V-UNION', 'promo', null, null, 'Mitsuhiro Arita', 'swshp', 'swshp-SWSH218', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'faef8d20d79e42c7d2f657424bf9d4e0e98690629b537034ee99d4996d83805f'),
  (373, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH219', 'Boltund V', 'promo', null, null, 'Ayaka Yoshida', 'swshp', 'swshp-SWSH219', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '063cbad8fd35984e0795f489ff84c3ae5f521a8504ca7522119ed47d251a850b'),
  (374, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH220', 'Rowlet', 'promo', null, null, 'sowsow', 'swshp', 'swshp-SWSH220', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1a4e08d4613002786448dcccf0b1e87700285b6ab95a191cdf13b21c8d20b7b6'),
  (375, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH221', 'Cyndaquil', 'promo', null, null, 'Teeziro', 'swshp', 'swshp-SWSH221', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'f7c3e858b7c5c158015de5446a63a9b08bac8ae65d5cd42b893a50491070b160'),
  (376, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH222', 'Oshawott', 'promo', null, null, 'kurumitsu', 'swshp', 'swshp-SWSH222', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6223e7c994fb19214c64bab6e8fd2c795ac21972ae8c4d8a8a8741ce56e49e9b'),
  (377, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH223', 'Mewtwo V', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH223', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '343e82bd5f8b7e0da0fcda5e66aec03e6791f7690f2f7cb946bfed49b24c0991'),
  (378, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH224', 'Melmetal V', 'promo', null, null, 'sadaji', 'swshp', 'swshp-SWSH224', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '4304307ba72a4852531a4f3af22f16ba543476207e8a000d4123a01d7b5f7d14'),
  (379, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH225', 'Alolan Exeggutor V', 'promo', null, null, 'MUGENUP', 'swshp', 'swshp-SWSH225', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '17241767863457e3bb6ca7dca3ebd6f1278042c92c12db416f40ce5b6bc325e2'),
  (380, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH226', 'Spark', 'promo', null, null, 'Naoki Saito', 'swshp', 'swshp-SWSH226', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ca99cd81716ed34aad8bcdde5c9038abab670350f3630f80f87d258b9828a070'),
  (381, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH227', 'Blanche', 'promo', null, null, 'Anesaki Dynamic', 'swshp', 'swshp-SWSH227', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '2f0439e583099df371948bf83cb2426cfe015435d46fd0b84ff97e725526a56f'),
  (382, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH228', 'Candela', 'promo', null, null, 'Ryuta Fuse', 'swshp', 'swshp-SWSH228', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '191ed030c5c0e213810c292ebc4befa3834e70bda508348ad05a37f2b6250f3e'),
  (383, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH229', 'Mewtwo V', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH229', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '20130861c7a90dd982db128d9d253483e7085635a156607559fb3558c39c00ad'),
  (384, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH230', 'Radiant Eevee', 'ultra_rare', null, null, 'Souichirou Gunjima', 'swshp', 'swshp-SWSH230', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ae7884bca78f34a30ee21fd542be1d615a83ebd1a9d7104b3bfd99311c8dcfa6'),
  (385, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH231', 'Bulbasaur', 'promo', null, null, 'Shibuzoh.', 'swshp', 'swshp-SWSH231', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '0a8a82af0443816de82b636de716af92a605d53a3bc230151feefd66b7072f20'),
  (386, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH232', 'Charmander', 'promo', null, null, 'Saya Tsuruta', 'swshp', 'swshp-SWSH232', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '57f89560f05ef24a86c8a942ea9496129cb97c2027f7d022b6da07c939a7998f'),
  (387, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH233', 'Squirtle', 'promo', null, null, 'kurumitsu', 'swshp', 'swshp-SWSH233', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'c4913332a2cbcc7f51180802bc7328913b1eebd80670825a97b5af6d0b382aa7'),
  (388, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH234', 'Pikachu', 'promo', null, null, 'Ryota Murayama', 'swshp', 'swshp-SWSH234', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'bd1c65bc4dda4377f6836ce44be039f332fa613ef89dbad29e03dd976b01d24e'),
  (389, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH235', 'Dragonite V', 'promo', null, null, 'kawayoo', 'swshp', 'swshp-SWSH235', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '319807281449d447e5b614019e25d51151cf99eda5a03c9aafe3a79ebcdfff88'),
  (390, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH236', 'Dragonite VSTAR', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH236', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '8e2422ecb1c4e98a58f8ea37925b440976f0a2a2ef19604c179cba519dbf6a39'),
  (391, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH237', 'Hisuian Typhlosion V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH237', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '080c25ccaf5530f53389df81b0e68037f00ac65dde828dd3717c856b52aaff01'),
  (392, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH238', 'Hisuian Decidueye V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH238', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '978bfeb34c7119f8795c634a6500fb56fafac0ad94bcd17c853eb687a7f41411'),
  (393, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH239', 'Hisuian Samurott V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH239', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'a44626f0335d41026353d3182bf68675d52c7325c57b07b9a493612a47a5b349'),
  (394, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH240', 'Finneon', 'promo', null, null, 'OKACHEKE', 'swshp', 'swshp-SWSH240', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '7da2f3f8e9c3723ee9affef37165fa370dac90eb25fbabd166bcbfd12916d608'),
  (395, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH241', 'Gengar', 'promo', null, null, 'Uta', 'swshp', 'swshp-SWSH241', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'c6ad93b09e69a71cf192e158d507345769f082ed3d426de37f1b7d56e4dc9dbf'),
  (396, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH242', 'Comfey', 'promo', null, null, 'Teeziro', 'swshp', 'swshp-SWSH242', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '9f0c7a639f70448385e08d98865d1a6bb831460f9c7508570f2151e2a1d6bc4f'),
  (397, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH243', 'Machamp', 'promo', null, null, 'GOSSAN', 'swshp', 'swshp-SWSH243', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'a49ce30ee379df22ab3094c58ee3d7488fdc1b37fda7f499b44235b20fa1aa1b'),
  (398, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH244', 'Scorbunny', 'promo', null, null, 'Taira Akitsu', 'swshp', 'swshp-SWSH244', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '799acdf9aa601d3aa722ce55b3a8a67f3320627e0a6dab4bfac28e9519ef0c27'),
  (399, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH245', 'Croagunk', 'promo', null, null, 'Yuya Oka', 'swshp', 'swshp-SWSH245', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd81be4f442875e8ce5a06cd4a7867925c7e00bdd7f9b2d4aa7e169b2b6ebcb88'),
  (400, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH246', 'Weavile', 'promo', null, null, 'Shin Nagasawa', 'swshp', 'swshp-SWSH246', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6490b109e70ba2d24dd14cfd4abd42265767a3bf36ff1285052f8bb867c7e740'),
  (401, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH247', 'Regigigas', 'promo', null, null, 'GOSSAN', 'swshp', 'swshp-SWSH247', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'fc42f9c77e65c7be4a28ee5acd34e1d7434fea0ebdd95937a901f36d6116e353'),
  (402, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH248', 'Kleavor V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH248', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '25064db57cf1ce4bdb0d5975cef0a69a637621db8c6df42a0a00a793aa66a535'),
  (403, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH249', 'Kleavor VSTAR', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH249', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '2f72c0ccc339d43ca73d43d552afda048abe322816ef086bf30b1c51972f08e3'),
  (404, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH250', 'Lumineon V', 'promo', null, null, 'PLANETA Tsuji', 'swshp', 'swshp-SWSH250', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e83cc61c68d26c0689cbf18ff4381a2963c7da63066aa4addeb18e5b9f621fff'),
  (405, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH252', 'Infernape V', 'promo', null, null, 'Ayaka Yoshida', 'swshp', 'swshp-SWSH252', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '12d1b8cffae51e379c98df6932ad107e39fe1901234f7c70e7cf7209d7b13786'),
  (406, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH253', 'Origin Forme Palkia V', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH253', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'cb7ff1da3d0237fedd7a06bc7f5550a908a99e3359e776e090b300d0d7c4358a'),
  (407, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH254', 'Origin Forme Palkia VSTAR', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH254', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e42b33635faf540815bfdc0fb82d627cddd17606a8d88f711a27a5efe9f7d6b1'),
  (408, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH255', 'Origin Forme Dialga V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH255', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '46f1497d6f44c5968d84b92353035971bd881512aabb90a4bc025572a094f2cb'),
  (409, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH256', 'Origin Forme Dialga VSTAR', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH256', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '90f05f9446b3f7eca9c6a6922fc0222320faa37ebb2a0157cd92337e1d91f400'),
  (410, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH257', 'Rotom V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH257', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '025729eb09e7afdc9f09562e9bf66b54a54af16681d8741ba81065e48ef7ac4c'),
  (411, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH258', 'Gallade V', 'promo', null, null, 'Ryota Murayama', 'swshp', 'swshp-SWSH258', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1ad5b6f71d566843754fc15300d7b05bc719dbb927658ef836c34282197da93a'),
  (412, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH259', 'Giratina V', 'promo', null, null, 'PLANETA Mochizuki', 'swshp', 'swshp-SWSH259', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'c811de344227747463367d3df0e9176ef03b915c499d20446e31d5c17a513008'),
  (413, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH260', 'Charizard V', 'promo', null, null, 'Oswaldo KATO', 'swshp', 'swshp-SWSH260', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '763f05e025e35095bfda6646fa5f3f7cf046fefe78ccacb5ca6bc6f64386d2ae'),
  (414, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH261', 'Charizard VMAX', 'promo', null, null, 'Shiburingaru', 'swshp', 'swshp-SWSH261', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e23f08aaf5ae45e3b61775adf47df18e0416033f389e872ddec615c0c2d1a0fc'),
  (415, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH262', 'Charizard VSTAR', 'promo', null, null, 'KIYOTAKA OSHIYAMA', 'swshp', 'swshp-SWSH262', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '10ec6424f2f1e6bac177f5991a3801322fa15a96b9e5bd875b204b0ec1b45117'),
  (416, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH263', 'Zeraora V', 'promo', null, null, 'N-DESIGN Inc.', 'swshp', 'swshp-SWSH263', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd5a2685509f46ee7c0776350b26fb6c6b19f2fe094144fd7e2634fe55b61ab96'),
  (417, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH264', 'Zeraora VMAX', 'promo', null, null, 'N-DESIGN Inc.', 'swshp', 'swshp-SWSH264', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'e50598afc4fd6cf64a3c422b15cf2a209c21fee5e121a53f5f6380912c7567f5'),
  (418, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH265', 'Zeraora VSTAR', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH265', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'dd73bab503a522059e6e0686d848da8c8e1c09511bfec3c3b523ac6c497296d7'),
  (419, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH266', 'Deoxys V', 'promo', null, null, 'N-DESIGN Inc.', 'swshp', 'swshp-SWSH266', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'f0e65ff5a1b5dd4271fc22c824823656052943895b0bdbab298303432ecca528'),
  (420, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH267', 'Deoxys VMAX', 'promo', null, null, 'N-DESIGN Inc.', 'swshp', 'swshp-SWSH267', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '69509d166cc09d6e942e9ffa4cec1f78a278d3c50c33484e52c0b348a957e00e'),
  (421, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH268', 'Deoxys VSTAR', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH268', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '03385748818521352d66bf4439388ddbc0bbdda308d05d460e6c5f5ff3ed454b'),
  (422, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH269', 'Sunflora', 'promo', null, null, 'Shigenori Negishi', 'swshp', 'swshp-SWSH269', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '59132d40b9dc4d888706750ad70d045595bf5692fe8a2cdfc54f7ef017ca8c0f'),
  (423, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH270', 'Rapidash', 'promo', null, null, 'aoki', 'swshp', 'swshp-SWSH270', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'f448fa5fe3b37c2a65b98f72168867a30373cdf866943fc329b262aaebd2aa44'),
  (424, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH271', 'Kirlia', 'promo', null, null, 'Taira Akitsu', 'swshp', 'swshp-SWSH271', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'd6d2cde152938afdf5bbe38f618d4afff56fa4afd94c73095a9edb7cb4f5b279'),
  (425, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH272', 'Archeops', 'promo', null, null, 'Nisota Niso', 'swshp', 'swshp-SWSH272', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '005db6000a4c51e52f7528e81dbf3375ab8532f9353879a46c88a1e3d3e25106'),
  (426, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH273', 'Hisuian Basculin', 'promo', null, null, 'Shin Nagasawa', 'swshp', 'swshp-SWSH273', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '1d1aabd7afb42e49c9215731df84a15bd6c2429cd91b807b801e50a24c72fcfb'),
  (427, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH274', 'Cranidos', 'promo', null, null, 'GIDORA', 'swshp', 'swshp-SWSH274', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '37d4139a08420bf41b093ee98808143d063100a5d16296ae364993432f687625'),
  (428, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH275', 'Manaphy', 'promo', null, null, 'NC Empire', 'swshp', 'swshp-SWSH275', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '220c100e7a359d98d4f689e0b3f38a77471eea01fd6e70a3459f3322da9edb27'),
  (429, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH276', 'Togetic', 'promo', null, null, 'Narumi Sato', 'swshp', 'swshp-SWSH276', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'f99430102de6771fa7c642971899909054b7cfdb27d167d654422ead27f4923b'),
  (430, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH277', 'Rillaboom', 'promo', null, null, 'DOM', 'swshp', 'swshp-SWSH277', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '90aebe83a78f2b962dc5dc06f710f3ba6d8c2a61cd2247df10f7d221278ba4d2'),
  (431, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH278', 'Cinderace', 'promo', null, null, 'Yuya Oka', 'swshp', 'swshp-SWSH278', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ad5ee2b29c28466d5653f1dd64a8b87d90f314e898ca82de387916614aac6ba0'),
  (432, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH279', 'Inteleon', 'promo', null, null, 'GOSSAN', 'swshp', 'swshp-SWSH279', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '22491e275224bfd80cf1b0f8453ce63a2f67945aacb3ac9975a6b2938587a6f2'),
  (433, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH280', 'Regieleki V', 'promo', null, null, 'Eske Yoshinob', 'swshp', 'swshp-SWSH280', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '2e7c538415be924ce9443b41879ac2eb0c57e4ea5abb1ab0eae943333e768c8e'),
  (434, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH281', 'Regidrago V', 'promo', null, null, 'PLANETA Hiiragi', 'swshp', 'swshp-SWSH281', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'ef4b94c9c0fc10f2d2084584d3a294b9db7a8ff2eb0680b95a6742460aae2a88'),
  (435, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH285', 'Pikachu V', 'promo', null, null, 'You Iribi', 'swshp', 'swshp-SWSH285', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '6e56f2ae5ff6ebfbe4c348bde0f569e29ae954feacb30174a922c60ae7c632f2'),
  (436, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH286', 'Pikachu VMAX', 'promo', null, null, 'AKIRA EGAWA', 'swshp', 'swshp-SWSH286', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '64573ae63f22416e013faea5b0797dcc0f2c2284a5e47f33c2dde5ec6de7e900'),
  (437, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH291', 'Lucario VSTAR', 'promo', null, null, 'hncl', 'swshp', 'swshp-SWSH291', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '954f3fcbb1c20ec27846bf4e2c1a8ad4e0881bc3fad55e5d655cdb811ddb7819'),
  (438, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH294', 'Hisuian Electrode V', 'promo', null, null, '5ban Graphics', 'swshp', 'swshp-SWSH294', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '956fe379fef7be659d3f2cda5bc4e76e12d7eee8d083d0d5a977113a81b8a7ef'),
  (439, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH295', 'Virizion V', 'promo', null, null, 'Saki Hayashiro', 'swshp', 'swshp-SWSH295', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'a8500e833e9839a8b9b18295751f2f0c9c6193f9cae365190da574b0760d06ed'),
  (440, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH296', 'Champions Festival', 'promo', null, null, 'Naoki Saito', 'swshp', 'swshp-SWSH296', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', '0ff81162691aeddbf04aa3f31438e829646043597a11ca1cd66fdb44236eca3d'),
  (441, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH297', 'Hisuian Zoroark V', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH297', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'a026e51de09732352ddea87bf0c79055323016bc66a46e45faf7b4c171387e02'),
  (442, 'swshp', 'SWSH Black Star Promos', '2019-11-15'::date, 307, 307, 'SWSH298', 'Hisuian Zoroark VSTAR', 'promo', null, null, 'aky CG Works', 'swshp', 'swshp-SWSH298', 'cards/en/swshp.json', '5699a444bc8444310e2c3df8ed1b0f9c97ea5e8ee4b8baddbe30fc978e990eb8', 'bf885f7e50fbf7c8fbe91ebac086534d6b0062258b4deb7b408af405d85ced7e'),
  (443, 'tk-ex-m', 'EX trainer Kit 2 (Minun)', '2006-03-01'::date, 12, 12, '3', 'Charmeleon', null, 'Kouki Saitou', 'uncommon', null, 'tk2b', 'tk2b-3', 'cards/en/tk2b.json', 'f916275ef4aeb0f3416ad2b2aa5f9d3417a243a4433ed22407fcbb1fa530f23a', '34c110e4c047309cdcbed44d4fb06a7ba81e25e47e5120517b1b343106cb602b'),
  (444, 'xy8', 'BREAKthrough', '2015-11-04'::date, 162, 165, '146a', 'Professor''s Letter', null, null, 'uncommon', 'Yoshinobu Saito', 'xy8', 'xy8-146a', 'cards/en/xy8.json', 'c493a5ab8ffa8deb1532b5f486c606c06699165ab2e6ad256c3efa8e0067b8e7', '22781e53f5d9c7d05eaf8341c6081a19ef1a934e0ff2ea367e1a10ba9a16770c');

do $facts_precondition$
declare
  fact_count integer;
  rarity_field_count integer;
  artist_field_count integer;
  facts_sha256 text;
begin
  select
    count(*)::integer,
    count(*) filter (where proposed_rarity_code is not null)::integer,
    count(*) filter (where proposed_artist is not null)::integer,
    encode(extensions.digest(string_agg(concat_ws('|',
      ordinal::text,
      canonical_set_code,
      canonical_set_name,
      canonical_set_release_date::text,
      coalesce(canonical_printed_total::text, '∅'),
      coalesce(canonical_set_total::text, '∅'),
      collector_number,
      canonical_card_name,
      coalesce(expected_existing_rarity_code, '∅'),
      coalesce(expected_existing_artist, '∅'),
      coalesce(proposed_rarity_code, '∅'),
      coalesce(proposed_artist, '∅'),
      provider_set_id,
      provider_card_id,
      provider_card_file,
      provider_card_file_sha256,
      provider_card_payload_sha256
    ), E'\n' order by ordinal), 'sha256'), 'hex')
  into fact_count, rarity_field_count, artist_field_count, facts_sha256
  from _stackr_pokemontcg_english_metadata_facts;

  if fact_count <> 444
     or rarity_field_count <> 261
     or artist_field_count <> 184
     or facts_sha256 <> '1405e0ddebc405f3ebfd460acbc13cba9ea419f5c4e8a5308b83d29abe1d6456'
  then
    raise exception 'Pokemon TCG English metadata fact precondition failed: %, %, %, %',
      fact_count, rarity_field_count, artist_field_count, facts_sha256;
  end if;

  if (select count(distinct provider_card_id) from _stackr_pokemontcg_english_metadata_facts) <> 444 then
    raise exception 'Pokemon TCG English metadata provider cards are not one-to-one';
  end if;
end
$facts_precondition$;

create temporary table _stackr_pokemontcg_english_metadata_resolved on commit drop as
select
  fact.*,
  set_row.id as set_id,
  printing.id as printing_id,
  existing_rarity.code as existing_rarity_code,
  proposed_rarity.id as proposed_rarity_id
from _stackr_pokemontcg_english_metadata_facts fact
join catalog.sets set_row
  on set_row.game_code='pokemon'
 and set_row.language_code='en'
 and set_row.set_code=fact.canonical_set_code
 and set_row.english_display_name=fact.canonical_set_name
 and set_row.release_date=fact.canonical_set_release_date
 and set_row.printed_total is not distinct from fact.canonical_printed_total
 and set_row.total is not distinct from fact.canonical_set_total
 and set_row.deprecated_at is null
join catalog.card_printings printing
  on printing.game_code='pokemon'
 and printing.language_code='en'
 and printing.set_id=set_row.id
 and printing.collector_number=fact.collector_number
 and printing.english_display_name=fact.canonical_card_name
 and printing.deprecated_at is null
left join catalog.rarities existing_rarity on existing_rarity.id=printing.rarity_id
left join catalog.rarities proposed_rarity
  on proposed_rarity.game_code='pokemon'
 and proposed_rarity.code=fact.proposed_rarity_code
 and proposed_rarity.deprecated_at is null;

do $canonical_precondition$
declare
  missing_rarity_before integer;
  missing_artist_before integer;
begin
  if (select count(*) from _stackr_pokemontcg_english_metadata_resolved) <> 444
     or (select count(distinct printing_id) from _stackr_pokemontcg_english_metadata_resolved) <> 444
  then
    raise exception 'Pokemon TCG English metadata facts do not resolve one-to-one to canonical printings';
  end if;

  if exists (
    select 1
    from _stackr_pokemontcg_english_metadata_resolved
    where existing_rarity_code is distinct from expected_existing_rarity_code
       or (proposed_rarity_code is not null and proposed_rarity_id is null)
  ) then
    raise exception 'Pokemon TCG English metadata rarity precondition failed';
  end if;

  if exists (
    select 1
    from _stackr_pokemontcg_english_metadata_resolved resolved
    join catalog.card_printings printing on printing.id=resolved.printing_id
    where printing.artist is distinct from resolved.expected_existing_artist
  ) then
    raise exception 'Pokemon TCG English metadata artist precondition failed';
  end if;

  if exists (
    select 1
    from _stackr_pokemontcg_english_metadata_resolved
    where (proposed_rarity_code is not null and expected_existing_rarity_code is not null)
       or (proposed_artist is not null and expected_existing_artist is not null)
  ) then
    raise exception 'Pokemon TCG English metadata backfill is not null-only';
  end if;

  select
    count(*) filter (where printing.rarity_id is null)::integer,
    count(*) filter (where printing.artist is null)::integer
  into missing_rarity_before, missing_artist_before
  from catalog.card_printings printing
  join catalog.sets set_row on set_row.id=printing.set_id
  where printing.language_code='en'
    and printing.deprecated_at is null
    and set_row.deprecated_at is null;

  if missing_rarity_before <> 814 or missing_artist_before <> 728 then
    raise exception 'English metadata baseline changed: missing rarity %, missing artist %',
      missing_rarity_before, missing_artist_before;
  end if;
end
$canonical_precondition$;

create temporary table _stackr_pokemontcg_english_metadata_changes (
  printing_id uuid primary key,
  set_id uuid not null,
  canonical_set_code text not null,
  collector_number text not null,
  canonical_card_name text not null,
  proposed_rarity_code text,
  proposed_artist text,
  provider_set_id text not null,
  provider_card_id text not null,
  provider_card_file text not null,
  provider_card_file_sha256 text not null,
  provider_card_payload_sha256 text not null
) on commit drop;

with updated as (
  update catalog.card_printings printing
  set
    rarity_id=case
      when resolved.proposed_rarity_code is not null then resolved.proposed_rarity_id
      else printing.rarity_id
    end,
    artist=coalesce(resolved.proposed_artist, printing.artist),
    updated_at=now()
  from _stackr_pokemontcg_english_metadata_resolved resolved
  where printing.id=resolved.printing_id
  returning
    printing.id,
    printing.set_id,
    resolved.canonical_set_code,
    resolved.collector_number,
    resolved.canonical_card_name,
    resolved.proposed_rarity_code,
    resolved.proposed_artist,
    resolved.provider_set_id,
    resolved.provider_card_id,
    resolved.provider_card_file,
    resolved.provider_card_file_sha256,
    resolved.provider_card_payload_sha256
)
insert into _stackr_pokemontcg_english_metadata_changes
select * from updated;

do $update_precondition$
begin
  if (select count(*) from _stackr_pokemontcg_english_metadata_changes) <> 444 then
    raise exception 'Pokemon TCG English metadata change count mismatch';
  end if;
end
$update_precondition$;

insert into audit.catalogue_events (
  request_id,
  actor_role,
  event_type,
  entity_schema,
  entity_table,
  entity_id,
  canonical_key,
  event_payload,
  internal_notes
)
select
  'catalogue-en-pokemontcg-metadata:2026-08-21:8b51a1b66f2044bf',
  'catalogue_migration',
  'catalogue_printing_metadata_backfilled',
  'catalog',
  'card_printings',
  change.printing_id,
  concat('pokemon:en:', change.canonical_set_code, ':', change.collector_number),
  jsonb_build_object(
    'setId', change.set_id,
    'setCode', change.canonical_set_code,
    'collectorNumber', change.collector_number,
    'cardName', change.canonical_card_name,
    'rarityCode', change.proposed_rarity_code,
    'artist', change.proposed_artist,
    'sourceCode', 'pokemon_tcg_api',
    'sourceRepository', 'https://github.com/PokemonTCG/pokemon-tcg-data',
    'sourceCommit', '8b4e387930ead7be6595b4d4c59b7ba7a3a79f08',
    'providerSetId', change.provider_set_id,
    'providerCardId', change.provider_card_id,
    'providerCardFile', change.provider_card_file,
    'providerCardFileSha256', change.provider_card_file_sha256,
    'providerCardPayloadSha256', change.provider_card_payload_sha256,
    'candidateSha256', '8b51a1b66f2044bf82c16da1fcf86797d78f9f007bb6d46d2a2b2ed5354857af',
    'evidenceSha256', '58f0297b4da5670883c497adbf8929a2c1d8c52f97f32d182ddfc71ed8d03559'
  ),
  'Exact set/date/total plus collector-number/name match; null-only owner-authorized metadata backfill.'
from _stackr_pokemontcg_english_metadata_changes change;

insert into catalog.catalogue_change_log (
  entity_schema,
  entity_table,
  entity_id,
  change_type,
  mobile_syncable,
  public_change_summary
)
select
  'catalog',
  'card_printings',
  change.printing_id,
  'update',
  true,
  jsonb_build_object(
    'languageCode', 'en',
    'setCode', change.canonical_set_code,
    'collectorNumber', change.collector_number,
    'rarityBackfilled', change.proposed_rarity_code is not null,
    'artistBackfilled', change.proposed_artist is not null
  )
from _stackr_pokemontcg_english_metadata_changes change;

do $postcondition$
declare
  missing_rarity_after integer;
  missing_artist_after integer;
begin
  if exists (
    select 1
    from _stackr_pokemontcg_english_metadata_resolved resolved
    join catalog.card_printings printing on printing.id=resolved.printing_id
    left join catalog.rarities rarity on rarity.id=printing.rarity_id
    where (resolved.proposed_rarity_code is not null and rarity.code is distinct from resolved.proposed_rarity_code)
       or (resolved.proposed_artist is not null and printing.artist is distinct from resolved.proposed_artist)
  ) then
    raise exception 'Pokemon TCG English metadata postcondition failed';
  end if;

  select
    count(*) filter (where printing.rarity_id is null)::integer,
    count(*) filter (where printing.artist is null)::integer
  into missing_rarity_after, missing_artist_after
  from catalog.card_printings printing
  join catalog.sets set_row on set_row.id=printing.set_id
  where printing.language_code='en'
    and printing.deprecated_at is null
    and set_row.deprecated_at is null;

  if missing_rarity_after <> 553
     or missing_artist_after <> 544
  then
    raise exception 'English metadata postcondition totals failed: missing rarity %, missing artist %',
      missing_rarity_after, missing_artist_after;
  end if;
end
$postcondition$;
