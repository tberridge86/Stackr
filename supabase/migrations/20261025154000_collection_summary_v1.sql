-- Compact authenticated collection summary; additive migration generated with the Supabase CLI.
-- Additive, read-only aggregate; no ownership, catalogue, pricing or RLS rows change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.collection_summary_v1(p_master_binder_ids uuid[] default '{}')
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Sign in to read your collection summary.' using errcode = '42501';
  end if;
  if p_master_binder_ids is null or cardinality(p_master_binder_ids) > 10000
    or coalesce(array_ndims(p_master_binder_ids), 1) <> 1 then
    raise exception 'Collection summary master overrides must contain at most 10000 binder IDs.' using errcode = '22023';
  end if;

  with binders as materialized (
    -- Public binder RLS intentionally admits other owners: this extra predicate is required.
    select b.id, b.type, b.source_set_id, b.card_mode, b.edition, b.default_condition, b.language,
      ((row_number() over (order by b.sort_order, b.created_at desc, b.id) - 1) / 50) as legacy_chunk,
      b.master_set_enabled is true or b.id = any(p_master_binder_ids) as wants_master
    from public.binders b where b.user_id = owner_id
  ), owned as materialized (
    select o.id, o.card_id, o.set_id, coalesce(nullif(o.variant, ''), 'normal') as variant, o.quantity, o.condition, o.grade_company, o.grade
    from public.user_card_variants o
    where o.user_id = owner_id and nullif(o.card_id, '') is not null and nullif(o.set_id, '') is not null
  ), saved as materialized (
    select c.id, c.card_id, c.set_id, c.language, c.owned_quantity, c.condition, c.grade_company, c.grade, c.slot_order,
      b.legacy_chunk, b.card_mode, b.edition, b.default_condition,
      b.language as binder_language
    from public.binder_cards c join binders b on b.id = c.binder_id where c.owned is true
  ), saved_ranked as (
    select s.*, row_number() over (
      partition by s.set_id, s.card_id,
        (coalesce(s.card_mode = 'graded', false) or nullif(s.grade_company, '') is not null or nullif(s.grade, '') is not null)
      order by s.legacy_chunk, s.slot_order, s.id
    ) as placement_rank
    from saved s where not exists (
      select 1 from owned o where o.set_id = s.set_id and o.card_id = s.card_id
    )
  ), units as materialized (
    select o.id::text as unit_id, o.card_id, o.set_id, greatest(1, coalesce(o.quantity, 1))::numeric as quantity,
      coalesce(nullif(o.variant, ''), 'normal') as variant, null::text as edition,
      coalesce(nullif(o.condition, ''), 'Near Mint') as condition,
      nullif(o.grade_company, '') is not null or nullif(o.grade, '') is not null as graded,
      null::text as language, null::text as binder_language
    from owned o
    union all
    select s.id::text, s.card_id, s.set_id, greatest(1, coalesce(s.owned_quantity, 1))::numeric,
      null::text, nullif(replace(lower(btrim(s.edition)), '_', '-'), ''),
      coalesce(nullif(s.condition, ''), nullif(s.default_condition, ''), 'Near Mint'),
      coalesce(s.card_mode = 'graded', false) or nullif(s.grade_company, '') is not null or nullif(s.grade, '') is not null,
      s.language, s.binder_language
    from saved_ranked s where s.placement_rank = 1
  ), metadata as materialized (
    select u.*, p.language as metadata_language,
      case when jsonb_typeof(p.raw_data #> '{tcgplayer,prices}') = 'object'
        then p.raw_data #> '{tcgplayer,prices}' else '{}'::jsonb end as prices,
      p.id is not null as has_metadata,
      u.graded or lower(replace(replace(btrim(u.condition), '_', ' '), '-', ' ')) not in ('near mint', 'nm', 'raw near mint') as unsupported
    from units u left join public.pokemon_cards p on p.id = u.card_id and p.set_id = u.set_id
  ), identity as materialized (
    select m.*, not exists (
      select 1 from (
        select count(distinct normalized) as languages, bool_or(normalized is null) as unknown_language
        from (
          select case lower(replace(btrim(value), '_', '-'))
            when 'en' then 'en' when 'eng' then 'en' when 'english' then 'en'
            when 'ja' then 'ja' when 'jp' then 'ja' when 'japanese' then 'ja'
            when 'ko' then 'ko' when 'kr' then 'ko' when 'korean' then 'ko'
            when 'zh-tw' then 'zh-tw' when 'zh-hant' then 'zh-tw' when 'traditional-chinese' then 'zh-tw'
            when 'zh-cn' then 'zh-cn' when 'zh-hans' then 'zh-cn' when 'simplified-chinese' then 'zh-cn'
            else null end as normalized
          from unnest(array[m.language, m.binder_language, m.metadata_language,
            substring(lower(m.card_id) from '^(en|ja|jp|ko|zh-tw|zh-cn):'),
            substring(lower(m.set_id) from '^(en|ja|jp|ko|zh-tw|zh-cn):')]) value
          where nullif(btrim(value), '') is not null
        ) languages
      ) conflicts where languages > 1 or unknown_language
    ) as language_matches
    from metadata m
  ), candidates as materialized (
    select i.*, choice.key_count, choice.price_entry
    from identity i left join lateral (
      select count(*) as key_count, jsonb_agg(i.prices -> k.key) -> 0 as price_entry
      from unnest(array['normal', 'unlimited', 'holofoil', 'unlimitedHolofoil', 'reverseHolofoil',
        'reverseHoloEnergy', 'reverseHoloPokeball', '1stEditionNormal', '1stEditionHolofoil']) k(key)
      where i.prices ? k.key and (
        (i.variant is not null and k.key = i.variant)
        or (i.variant is null and (
          i.edition is null
          or (i.edition in ('1st-edition', 'first-edition') and k.key like '1stEdition%')
          or (i.edition = 'unlimited' and k.key not like '1stEdition%')
        ))
      )
    ) choice on true
  ), quotes as (
    select c.*, coalesce(nullif(c.price_entry -> 'market', 'null'::jsonb),
      nullif(c.price_entry -> 'mid', 'null'::jsonb), nullif(c.price_entry -> 'low', 'null'::jsonb)) as usd
    from candidates c
  ), valued as materialized (
    select q.*, case when not q.unsupported and q.has_metadata and q.language_matches and q.key_count = 1
      and jsonb_typeof(q.usd) = 'number' then
        case when length(q.usd::text) <= 32 and q.usd::text::numeric between 0 and 90071992547409.91
          then round(q.usd::text::numeric * 0.79, 2) end
      end as unit_value
    from quotes q
  ), totals as (
    select coalesce(sum(quantity), 0) as total_units,
      coalesce(sum(quantity) filter (where not graded), 0) as raw_units,
      coalesce(sum(quantity) filter (where graded), 0) as graded_units,
      count(distinct (set_id, card_id)) as unique_cards,
      coalesce(sum(quantity - 1), 0) as duplicate_copies,
      coalesce(sum(quantity) filter (where unit_value is not null), 0) as priced_units,
      coalesce(sum(quantity) filter (where unit_value is null), 0) as unpriced_units,
      coalesce(sum(quantity) filter (where unsupported), 0) as unsupported_units,
      coalesce(sum(quantity) filter (where unit_value is null and not unsupported), 0) as missing_units,
      round(sum(unit_value * quantity), 2) as known_value
    from valued
  ), owned_keys as materialized (
    select o.set_id, o.card_id from owned o
    union select s.set_id, s.card_id from saved s
  ), standard_counts as (
    select k.set_id, count(*) as owned_count from owned_keys k group by k.set_id
  ), master_sets as (
    select distinct source_set_id from binders where type = 'official' and wants_master and source_set_id is not null
  ), master_cards as materialized (
    select c.id, c.set_id, case when count(k.key) > 1 then array_agg(k.key) else array['normal'] end as expected
    from public.pokemon_cards c join master_sets s on s.source_set_id = c.set_id
    left join lateral jsonb_object_keys(case when jsonb_typeof(c.raw_data #> '{tcgplayer,prices}') = 'object'
      then c.raw_data #> '{tcgplayer,prices}' else '{}'::jsonb end) k(key) on true
    group by c.id, c.set_id
  ), master_counts as (
    select c.set_id, sum(cardinality(c.expected)) as total,
      sum(coalesce(nullif((select count(*) from unnest(c.expected) expected(variant) where exists (
        select 1 from owned o where o.set_id = c.set_id and o.card_id = c.id and o.variant = expected.variant
      )), 0), case when exists (
        select 1 from owned_keys k where k.set_id = c.set_id and k.card_id = c.id
      ) then 1 else 0 end)) as owned_count
    from master_cards c group by c.set_id
  ), completion as (
    select count(distinct b.source_set_id) as completed_sets
    from binders b left join public.pokemon_sets p on p.id = b.source_set_id
    left join standard_counts s on s.set_id = b.source_set_id
    left join master_counts m on m.set_id = b.source_set_id
    where b.type = 'official' and (
      case when b.wants_master and m.total > 0 then m.total else coalesce(p.printed_total, p.total, 0) end
    ) > 0 and (
      case when b.wants_master and m.total > 0 then m.owned_count else coalesce(s.owned_count, 0) end
    ) >= (
      case when b.wants_master and m.total > 0 then m.total else coalesce(p.printed_total, p.total, 0) end
    )
  )
  select jsonb_build_object(
    'schemaVersion', 'collection-summary-v1', 'subjectUserId', owner_id,
    'totalOwnedItems', t.total_units, 'totalCardsOwned', t.raw_units + t.graded_units,
    'uniqueCards', t.unique_cards, 'rawCardsOwned', t.raw_units, 'gradedSlabsOwned', t.graded_units,
    'sealedProductsOwned', 0, 'duplicateCopies', t.duplicate_copies,
    'collectionValue', case when t.total_units = 0 then 0 else t.known_value end,
    'binderCount', (select count(*) from binders), 'completedSets', c.completed_sets,
    'updatedAt', statement_timestamp(),
    'valuation', jsonb_build_object('basis', 'stored_tcg_raw_estimate', 'currency', 'GBP', 'usdToGbp', 0.79,
      'totalUnits', t.total_units, 'pricedUnits', t.priced_units, 'unpricedUnits', t.unpriced_units,
      'unsupportedUnits', t.unsupported_units, 'missingPriceUnits', t.missing_units, 'freshness', 'unknown',
      'state', case when t.total_units = 0 then 'empty' when t.priced_units = 0 then 'unavailable'
        when t.unpriced_units > 0 then 'partial' else 'available' end)
  ) into result from totals t cross join completion c;
  return result;
end;
$$;

revoke all on function public.collection_summary_v1(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.collection_summary_v1(uuid[]) to authenticated;
comment on function public.collection_summary_v1(uuid[]) is
  'Complete caller-owned collection counts and conservative stored raw TCG estimates; no provider refresh or exact slab valuation.';
commit;
