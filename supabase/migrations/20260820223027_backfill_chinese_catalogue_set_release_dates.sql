-- Exact, audited TCGdex release-date backfill for existing Simplified and Traditional Chinese sets.
-- Evidence: catalogue/tcgdex-set-release-date-evidence-chinese-2026-08-20.json
-- evidence-row-count: 61
-- evidence-rows-sha256: 609958b28410893af89f379ee8636cf91fb278377a70bb270aa815f1c01a1f92
-- sql-rows-sha256: b3d3dbc50b8a6ba5d172c740ae6df459e28dd98342037563d77198a6e65da6fb
-- Safety: match existing current exact TCGdex identifiers only; fill NULL dates only;
-- reject missing/ambiguous/conflicting targets; create no catalogue identities.

create temporary table _stackr_tcgdex_chinese_set_release_dates (
  language_code text not null,
  external_id text not null,
  release_date date not null,
  source_url text not null,
  provider_payload_sha256 text not null,
  primary key (language_code, external_id),
  check (language_code in ('zh-tw', 'zh-cn')),
  check (provider_payload_sha256 ~ '^[0-9a-f]{64}$')
) on commit drop;

insert into _stackr_tcgdex_chinese_set_release_dates (
  language_code, external_id, release_date, source_url, provider_payload_sha256
) values
  ('zh-cn', 'SV10', '2025-05-02', 'https://api.tcgdex.net/v2/zh-cn/sets/SV10', 'f87c961cb2af14b5402e92d0eb51d86d0c022217d1164755947b84e3ec19e798'),
  ('zh-tw', 'S10a', '2022-05-27', 'https://api.tcgdex.net/v2/zh-tw/sets/S10a', 'bf05d9603727107695ed961e9276a9feed14fb2ff035a21998b2109576abb06c'),
  ('zh-tw', 'S10b', '2022-06-17', 'https://api.tcgdex.net/v2/zh-tw/sets/S10b', '7146c85e3929130b07217f1e9e6bd92ea99eac6f1a3dfc3108c0266089b1868e'),
  ('zh-tw', 'S10D', '2022-04-22', 'https://api.tcgdex.net/v2/zh-tw/sets/S10D', '57560d5b37de665760c8a17774e889ce4224ae19f38263889a7a30c3810aa903'),
  ('zh-tw', 'S10P', '2022-04-22', 'https://api.tcgdex.net/v2/zh-tw/sets/S10P', 'bfdc7b521860ade1586b8f5828108fd844c186ee287ac7cd776011d5ca8c2fd6'),
  ('zh-tw', 'S11', '2022-07-29', 'https://api.tcgdex.net/v2/zh-tw/sets/S11', '9176d34249c1d85f18d802367c0b4ed3b98f27c3ec601c981bb19a81a428670f'),
  ('zh-tw', 'S11a', '2022-09-16', 'https://api.tcgdex.net/v2/zh-tw/sets/S11a', 'df6cca3618827bf422fa27126863fc2217c7bce94156e30dd987f5f03123d14d'),
  ('zh-tw', 'S12', '2022-11-04', 'https://api.tcgdex.net/v2/zh-tw/sets/S12', '92969a6597b51822d26a2d1ebc2172ad198e9f34ec809282326bda6fab390448'),
  ('zh-tw', 'S12a', '2022-12-02', 'https://api.tcgdex.net/v2/zh-tw/sets/S12a', '7927cb67dffefc26e0aa873d67c3f482987a1d245c08907c9f44a0ff9158f5b3'),
  ('zh-tw', 'S4', '2020-10-09', 'https://api.tcgdex.net/v2/zh-tw/sets/S4', '7622c79abfae44b8101bfef40e2f0310fc43eae77f43c7c73c6887743f32900f'),
  ('zh-tw', 'S4a', '2020-11-27', 'https://api.tcgdex.net/v2/zh-tw/sets/S4a', 'f6991718c65657fffeeb96bec935e8cd86edf6eb5654a678bdd9890ee25a524a'),
  ('zh-tw', 'S5a', '2021-04-02', 'https://api.tcgdex.net/v2/zh-tw/sets/S5a', '5f6052339fcd88b5ef0d8f2f45933dc14a05c0f08c6ab62d8b93da78c02beb14'),
  ('zh-tw', 'S5I', '2021-01-29', 'https://api.tcgdex.net/v2/zh-tw/sets/S5I', '5b4140f98cfc9902d2f5096cc9234a91d2712f8288f8491309ed90d0a850c543'),
  ('zh-tw', 'S5R', '2021-01-29', 'https://api.tcgdex.net/v2/zh-tw/sets/S5R', 'e699cf7a164d77542741a275cbee8b3220b3824f006079605fe4bb8cde4178b0'),
  ('zh-tw', 'S6a', '2021-06-11', 'https://api.tcgdex.net/v2/zh-tw/sets/S6a', '7b99fc30ec8584905c8f53ce02566af1e33d46f23e499c60bd3f362763718509'),
  ('zh-tw', 'S6H', '2021-05-07', 'https://api.tcgdex.net/v2/zh-tw/sets/S6H', '2cf45499f15e5d4db1e646179027c8956cc85bee6c4e491b14b3a07f298b888f'),
  ('zh-tw', 'S6K', '2021-05-07', 'https://api.tcgdex.net/v2/zh-tw/sets/S6K', '2a855bd64c0299f6ebc405b297acdc125ec89260591dd12029f3b71f6043a74b'),
  ('zh-tw', 'S7D', '2021-07-23', 'https://api.tcgdex.net/v2/zh-tw/sets/S7D', '92621534430b4e72c27d77e2ea7644ff6af6fab7287297bbe82d9f82fcf54ad6'),
  ('zh-tw', 'S7R', '2021-07-23', 'https://api.tcgdex.net/v2/zh-tw/sets/S7R', '8c20f04a90b85df5f775014d97996043a8a3697c44697c2662b3df54fd696b55'),
  ('zh-tw', 'S8', '2021-10-01', 'https://api.tcgdex.net/v2/zh-tw/sets/S8', '32ef423d85babb0d4735031b2ef95a8f6d9baa0e429d2d300018d0726c69dd08'),
  ('zh-tw', 'S8a', '2021-10-20', 'https://api.tcgdex.net/v2/zh-tw/sets/S8a', 'cbc196d9c07c280b3bf15512a80f612bbe319dca55fefc7dad40d2288566857b'),
  ('zh-tw', 'S8b', '2021-12-17', 'https://api.tcgdex.net/v2/zh-tw/sets/S8b', 'fcb0ef5cc163777a9f4075ff702d9a33ef07476b060369c1a65af618a5c3e400'),
  ('zh-tw', 'S9', '2022-01-28', 'https://api.tcgdex.net/v2/zh-tw/sets/S9', 'aebcadd72b35dfb47af38c7627f163ee3e1df2708cb73182eb765e23ec005810'),
  ('zh-tw', 'S9a', '2022-03-11', 'https://api.tcgdex.net/v2/zh-tw/sets/S9a', '0f94e65f48c0c8201a8f5483728f14badcbbb725a0aa44d9e0b910163a5fcd0b'),
  ('zh-tw', 'SC1a', '2020-06-19', 'https://api.tcgdex.net/v2/zh-tw/sets/SC1a', '2eaf79c5402528925189548c266034235aaab13fb07d78a41bbb7e8fa644a03f'),
  ('zh-tw', 'SC1b', '2020-06-19', 'https://api.tcgdex.net/v2/zh-tw/sets/SC1b', 'fc35a34ab249d8c0b124dbc2f1c7d511b5e76a743f76a2596ccb16c4238e9ce1'),
  ('zh-tw', 'SC1D', '2020-06-19', 'https://api.tcgdex.net/v2/zh-tw/sets/SC1D', 'b29d75a31de299b99ed74ffe1c20ced808ac43adf3d06252c24692579090720a'),
  ('zh-tw', 'SC2a', '2020-08-21', 'https://api.tcgdex.net/v2/zh-tw/sets/SC2a', '7bdca6f4643ea3ed550d9c4a88ef5f7d40a3e48cc6d40b6e40d227bb8830b247'),
  ('zh-tw', 'SC2b', '2020-08-21', 'https://api.tcgdex.net/v2/zh-tw/sets/SC2b', 'af47204a58d130e9b1d6d7145f2bb24bb0cda19a86033d8685c8604f84c6ae0a'),
  ('zh-tw', 'SC2D', '2020-08-21', 'https://api.tcgdex.net/v2/zh-tw/sets/SC2D', '5e3d38a2fa66dc2727cab4db9c5ba2758badcbe99ba9a6165bffe26f58636bdd'),
  ('zh-tw', 'SCA', '2020-11-27', 'https://api.tcgdex.net/v2/zh-tw/sets/SCA', '1a45fba99ac88658bde0fe23ddc25a8582951e4c7d7ee26bfc44755b02fedd94'),
  ('zh-tw', 'SCB', '2021-01-29', 'https://api.tcgdex.net/v2/zh-tw/sets/SCB', '7a4d1e200183d4d0df3a5998d9f72d543c1dfcf21e73566525d91c98ab234409'),
  ('zh-tw', 'SCC', '2021-06-11', 'https://api.tcgdex.net/v2/zh-tw/sets/SCC', '4d7a8b5c1fdf6329a337c75f79858446ec3d39ee1937976e9400687429476b32'),
  ('zh-tw', 'SCD', '2021-10-01', 'https://api.tcgdex.net/v2/zh-tw/sets/SCD', 'f4241024037c31c00eb7fef52b597780a9bd893bb403ff161ea9834d239be5ac'),
  ('zh-tw', 'SDL', '2022-11-04', 'https://api.tcgdex.net/v2/zh-tw/sets/SDL', '9e7a3fd7504fd9b45525942526be15f3971f993439477cdc0d545514fd1a190f'),
  ('zh-tw', 'SDM', '2022-11-04', 'https://api.tcgdex.net/v2/zh-tw/sets/SDM', '496b14931ab81eab8f08df834e29b52e091099e843233beeee45a25c538fa096'),
  ('zh-tw', 'SDP', '2022-11-04', 'https://api.tcgdex.net/v2/zh-tw/sets/SDP', '96cc5622d10bb866da104aa6f4ceb52cd34e228ffdc22814f455adf4b1ff69d4'),
  ('zh-tw', 'SH', '2021-06-28', 'https://api.tcgdex.net/v2/zh-tw/sets/SH', 'c6e0d4ce894308d6e6d70326fd701947b6f9de05754cfa654bdbaa24c44512ce'),
  ('zh-tw', 'SI', '2022-02-18', 'https://api.tcgdex.net/v2/zh-tw/sets/SI', '144daa94c34a4ef3944a598d6d53606e19a8b9be59c6ef02ab9aa2ac17de87fc'),
  ('zh-tw', 'SJ', '2022-01-28', 'https://api.tcgdex.net/v2/zh-tw/sets/SJ', '5daeeaae04714c2bb20b70b4eb0c1c8a9c300d23b4ee0f028f7fe15dceeb034c'),
  ('zh-tw', 'SK', '2022-01-28', 'https://api.tcgdex.net/v2/zh-tw/sets/SK', 'b408504952bb6606f162f6b36187395ce3a8ad856ca28cd74e3f9c433987206b'),
  ('zh-tw', 'SLD', '2022-03-11', 'https://api.tcgdex.net/v2/zh-tw/sets/SLD', '90c33655ac23069bc1375f435ae62adcfda9267895b83e41b3611c2cdc82c901'),
  ('zh-tw', 'SLL', '2022-03-11', 'https://api.tcgdex.net/v2/zh-tw/sets/SLL', '76d1a9e939146580ccdc25ec49f93bb8a835e7a4be3a08c23977db55c668fb5e'),
  ('zh-tw', 'SN', '2022-10-02', 'https://api.tcgdex.net/v2/zh-tw/sets/SN', 'abd0821154e52db70b2214fa882e601153b4ca1bf44f3a6b68a9b42e411af34c'),
  ('zh-tw', 'SP5', '2021-08-27', 'https://api.tcgdex.net/v2/zh-tw/sets/SP5', 'a938b7822d9fa9e84eb0248b3198a10ad8d1a302958d4ba29ae659d4b55f859e'),
  ('zh-tw', 'SP6', '2022-08-26', 'https://api.tcgdex.net/v2/zh-tw/sets/SP6', '35c45084725e2db9787962b221bc95fdc019ab10ff43bbf5588fd6038c7f4f14'),
  ('zh-tw', 'SPD', '2022-08-26', 'https://api.tcgdex.net/v2/zh-tw/sets/SPD', 'd2f2630fee100ff799338b076a00f07e9998c0a5904e1cd18ac4324654dbee7f'),
  ('zh-tw', 'SPZ', '2022-08-26', 'https://api.tcgdex.net/v2/zh-tw/sets/SPZ', 'cbbecea75743259c9ffc733a681768e10e746b352658c242181dde286a5f840a'),
  ('zh-tw', 'SV10', '2025-05-02', 'https://api.tcgdex.net/v2/zh-tw/sets/SV10', 'a3171d2fdac14a064b7d9c1f2d0b434d2b51222bb447be830de83567d58babc3'),
  ('zh-tw', 'SV1a', '2023-03-24', 'https://api.tcgdex.net/v2/zh-tw/sets/SV1a', 'bb8aa2e8393b0dc4c048caa48385ab5b70de311928bc4b991794855b9e7785f5'),
  ('zh-tw', 'SV1S', '2023-02-03', 'https://api.tcgdex.net/v2/zh-tw/sets/SV1S', '5e6d6991b3216c7d449f08650271c3138b2fbe9ab7df2807caf3cafe81a1a66c'),
  ('zh-tw', 'SV3', '2023-08-11', 'https://api.tcgdex.net/v2/zh-tw/sets/SV3', '8c4235ce22f54d725a70443f80c5a68fe3f46ba79e3a894992633ab01551eacc'),
  ('zh-tw', 'SVB', '2023-03-03', 'https://api.tcgdex.net/v2/zh-tw/sets/SVB', '29ffcc7cdb6a7e467d24d2982659a40f63f3afd53b6bdeba7ae68dd59279b498'),
  ('zh-tw', 'SVC', '2023-04-28', 'https://api.tcgdex.net/v2/zh-tw/sets/SVC', 'becd72ea6485f421985153beefa8e746f7f427a4c747f35d74bc93e3e16fa7dd'),
  ('zh-tw', 'SVD', '2023-07-21', 'https://api.tcgdex.net/v2/zh-tw/sets/SVD', 'd0d53d5b0da9b6aadbc6264ad9cdc5323f3f7903afd1a16fffc4b378ad61d2a4'),
  ('zh-tw', 'SVEL', '2023-09-29', 'https://api.tcgdex.net/v2/zh-tw/sets/SVEL', 'b31e28ce02d2e3a49395339e8b8c8176b5238dc61d74e647705cbaf8246d1c81'),
  ('zh-tw', 'SVEM', '2023-09-29', 'https://api.tcgdex.net/v2/zh-tw/sets/SVEM', '8440834c2fad51a289a722d1e4d55bc46be03d589226db3c82cf946c3e47dfbe'),
  ('zh-tw', 'SVF', '2023-08-11', 'https://api.tcgdex.net/v2/zh-tw/sets/SVF', '1ec2e97c7d41ea24ce1dacd3c26b19e78715ef1817b71d2761caa56755537b8a'),
  ('zh-tw', 'SVHK', '2024-02-02', 'https://api.tcgdex.net/v2/zh-tw/sets/SVHK', '037172a51996d21299ce33c8d0a30ac0847c8451737a1ebb3f2b5403a35597ca'),
  ('zh-tw', 'SVHM', '2024-02-02', 'https://api.tcgdex.net/v2/zh-tw/sets/SVHM', '5753e783aa806db7fe73090b81a923f1d5b7edbf1da0609c4514a5706776c361'),
  ('zh-tw', 'SVP1', '2023-06-02', 'https://api.tcgdex.net/v2/zh-tw/sets/SVP1', '3a64724635277faa66350ace92fdb435465839e0e9c916d3ea99bd880c5877ff');

do $evidence$
declare actual_count integer; actual_sha256 text;
begin
  select count(*)::integer into actual_count from _stackr_tcgdex_chinese_set_release_dates;
  if actual_count <> 61 then
    raise exception 'Chinese TCGdex release-date evidence row count mismatch: expected %, got %', 61, actual_count;
  end if;
  select encode(extensions.digest(string_agg(concat_ws('|', language_code, external_id, release_date::text, source_url, provider_payload_sha256), E'\n' order by language_code, external_id), 'sha256'), 'hex')
    into actual_sha256 from _stackr_tcgdex_chinese_set_release_dates;
  if actual_sha256 <> 'b3d3dbc50b8a6ba5d172c740ae6df459e28dd98342037563d77198a6e65da6fb' then
    raise exception 'Chinese TCGdex release-date evidence SHA-256 mismatch: expected %, got %', 'b3d3dbc50b8a6ba5d172c740ae6df459e28dd98342037563d77198a6e65da6fb', actual_sha256;
  end if;
end
$evidence$;

create temporary table _stackr_tcgdex_chinese_release_targets on commit drop as
select evidence.language_code, evidence.external_id, evidence.release_date, evidence.source_url,
  evidence.provider_payload_sha256, catalogue_set.id as set_id, catalogue_set.set_code, catalogue_set.native_name
from _stackr_tcgdex_chinese_set_release_dates evidence
join ingest.sources source on source.code='tcgdex' and source.active and source.deprecated_at is null
join ingest.external_identifiers external_identifier
  on external_identifier.source_id=source.id
 and external_identifier.source_entity_type='set'
 and external_identifier.external_id=evidence.external_id
 and external_identifier.language_code=evidence.language_code
 and external_identifier.is_current
 and external_identifier.deprecated_at is null
 and external_identifier.set_id is not null
join catalog.sets catalogue_set
  on catalogue_set.id=external_identifier.set_id
 and catalogue_set.game_code='pokemon'
 and catalogue_set.language_code=evidence.language_code
 and catalogue_set.deprecated_at is null;

create temporary table _stackr_tcgdex_chinese_release_changes (
  set_id uuid primary key, language_code text not null, external_id text not null, set_code text,
  native_name text not null, release_date date not null, source_url text not null,
  provider_payload_sha256 text not null
) on commit drop;

do $backfill$
declare target_count integer; distinct_set_count integer; expected_update_count integer; updated_count integer;
begin
  select count(*)::integer, count(distinct set_id)::integer into target_count, distinct_set_count
  from _stackr_tcgdex_chinese_release_targets;
  if target_count <> 61 or distinct_set_count <> 61 then
    raise exception 'Chinese TCGdex release-date target reconciliation failed: expected % exact targets, got % rows / % sets',
      61, target_count, distinct_set_count;
  end if;

  perform catalogue_set.id
  from catalog.sets catalogue_set
  join _stackr_tcgdex_chinese_release_targets target on target.set_id=catalogue_set.id
  order by catalogue_set.id
  for update of catalogue_set;

  if exists (
    select 1
    from _stackr_tcgdex_chinese_release_targets target
    join catalog.sets catalogue_set on catalogue_set.id=target.set_id
    where catalogue_set.release_date is not null and catalogue_set.release_date <> target.release_date
  ) then
    raise exception 'Chinese TCGdex release-date backfill refused a conflicting non-null canonical date';
  end if;

  select count(*)::integer into expected_update_count
  from _stackr_tcgdex_chinese_release_targets target
  join catalog.sets catalogue_set on catalogue_set.id=target.set_id
  where catalogue_set.release_date is null;

  with changed as (
    update catalog.sets catalogue_set
    set release_date=target.release_date, updated_at=now()
    from _stackr_tcgdex_chinese_release_targets target
    where catalogue_set.id=target.set_id and catalogue_set.release_date is null
    returning catalogue_set.id, target.language_code, target.external_id, target.set_code,
      target.native_name, target.release_date, target.source_url, target.provider_payload_sha256
  )
  insert into _stackr_tcgdex_chinese_release_changes (
    set_id, language_code, external_id, set_code, native_name, release_date, source_url, provider_payload_sha256
  )
  select id, language_code, external_id, set_code, native_name, release_date, source_url, provider_payload_sha256 from changed;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_update_count then
    raise exception 'Chinese TCGdex release-date update count mismatch: expected %, got %', expected_update_count, updated_count;
  end if;
end
$backfill$;

insert into audit.catalogue_events (
  request_id, actor_role, event_type, entity_schema, entity_table, entity_id, canonical_key, event_payload, internal_notes
)
select 'catalogue-set-release-dates-chinese:2026-08-20:b3d3dbc50b8a6ba5', 'catalogue_migration', 'catalogue_set_release_date_backfilled',
  'catalog', 'sets', change.set_id,
  concat('pokemon:', change.language_code, ':', coalesce(change.set_code, change.external_id)),
  jsonb_build_object(
    'languageCode', change.language_code, 'externalId', change.external_id,
    'releaseDate', change.release_date, 'sourceCode', 'tcgdex', 'sourceUrl', change.source_url,
    'providerPayloadSha256', change.provider_payload_sha256,
    'evidenceRowsSha256', '609958b28410893af89f379ee8636cf91fb278377a70bb270aa815f1c01a1f92', 'sqlRowsSha256', 'b3d3dbc50b8a6ba5d172c740ae6df459e28dd98342037563d77198a6e65da6fb'
  ),
  'Exact current TCGdex identifier; null-only Chinese release-date backfill.'
from _stackr_tcgdex_chinese_release_changes change;

insert into catalog.catalogue_change_log (
  entity_schema, entity_table, entity_id, change_type, mobile_syncable, public_change_summary
)
select 'catalog', 'sets', change.set_id, 'update', true,
  jsonb_build_object('field', 'release_date', 'releaseDate', change.release_date,
    'languageCode', change.language_code, 'sourceCode', 'tcgdex')
from _stackr_tcgdex_chinese_release_changes change;

do $postcondition$
begin
  if exists (
    select 1
    from _stackr_tcgdex_chinese_release_targets target
    join catalog.sets catalogue_set on catalogue_set.id=target.set_id
    where catalogue_set.release_date is distinct from target.release_date
  ) then
    raise exception 'Chinese TCGdex release-date backfill postcondition failed';
  end if;
end
$postcondition$;
