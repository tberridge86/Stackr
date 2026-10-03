-- Issue #304: expose truthful catalogue-price coverage and allow genuine,
-- comparable partial collection valuations to accumulate history.
-- Service-only. No catalogue, holding, price or provider data is mutated here.

create or replace function api.catalogue_price_coverage_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with catalogue as (
    select
      c.variant_id,
      c.language_code,
      c.variant_code,
      c.finish_code,
      (
        (c.variant_code in ('normal','standard','default')
          and c.finish_code in ('normal','standard','default','non_holo'))
        or (
          c.language_code = 'en'
          and c.variant_code in ('holo','reverse_holo')
          and c.finish_code = c.variant_code
        )
      ) as eligible
    from api.catalogue_cards c
  ),
  facts as (
    select
      c.*,
      p.calculated_at,
      p.stale_after,
      p.price_type,
      p.market_value,
      s.outcome,
      s.last_error,
      s.checked_at,
      case
        when s.last_error in ('provider_access_denied','provider_unauthorized','provider_forbidden') then true
        else false
      end as access_denied
    from catalogue c
    left join public.catalogue_price_state s on s.variant_id = c.variant_id
    left join lateral (
      select
        snap.calculated_at,
        snap.stale_after,
        snap.price_type,
        coalesce(snap.tcg_mid,snap.tcgdex_price,snap.cardmarket_trend,snap.ebay_average) as market_value
      from public.market_price_snapshots snap
      where snap.user_id is null
        and snap.card_id = c.variant_id::text
        and coalesce(
          snap.pricing_identity_json->>'canonicalVariantId',
          snap.pricing_identity_json->>'canonical_variant_id'
        ) = c.variant_id::text
        and coalesce(snap.pricing_identity_json->>'productType','raw_card') = 'raw_card'
        and coalesce(
          snap.pricing_identity_json->>'rawCondition',
          snap.pricing_identity_json->>'condition',
          'raw_near_mint'
        ) = 'raw_near_mint'
      order by snap.calculated_at desc nulls last, snap.id desc
      limit 1
    ) p on true
  ),
  grouped as (
    select
      language_code as language,
      variant_code as variant,
      finish_code as finish,
      count(*) filter (where eligible) as eligible,
      count(*) filter (
        where eligible and market_value is not null and coalesce(price_type,'') <> 'unavailable'
      ) as priced,
      count(*) filter (
        where eligible and market_value is not null and stale_after is not null and stale_after <= now()
      ) as stale,
      count(*) filter (
        where eligible and not access_denied
          and outcome = 'no_provider_quote'
          and (market_value is null or coalesce(price_type,'') = 'unavailable')
      ) as unavailable,
      count(*) filter (
        where eligible and access_denied
      ) as access_denied,
      count(*) filter (
        where eligible and not access_denied
          and outcome = 'retrying'
          and last_error is not null
      ) as failed,
      count(*) filter (
        where eligible
          and market_value is null
          and outcome is null
      ) as never_checked,
      min(calculated_at) filter (where eligible and market_value is not null) as oldest_price_at,
      max(calculated_at) filter (where eligible and market_value is not null) as latest_price_at,
      max(checked_at) filter (where eligible) as latest_check_at
    from facts
    group by language_code,variant_code,finish_code
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'groups', coalesce(jsonb_agg(to_jsonb(grouped) order by language,variant,finish),'[]'::jsonb),
    'totals', jsonb_build_object(
      'eligible', coalesce(sum(eligible),0),
      'priced', coalesce(sum(priced),0),
      'stale', coalesce(sum(stale),0),
      'unavailable', coalesce(sum(unavailable),0),
      'accessDenied', coalesce(sum(access_denied),0),
      'failed', coalesce(sum(failed),0),
      'neverChecked', coalesce(sum(never_checked),0)
    )
  )
  from grouped;
$$;

revoke all on function api.catalogue_price_coverage_status() from public, anon, authenticated;
grant execute on function api.catalogue_price_coverage_status() to service_role;

-- Missing exact prices are claimed first, then stale prices, then already-fresh
-- identities. Attempts remains ahead of ordinal inside each class so a retrying
-- identity cannot monopolise the worker ahead of untouched catalogue rows.
create or replace function api.claim_catalogue_prices(p_cycle uuid,p_limit integer default 12)
returns setof public.catalogue_price_items
language sql
security invoker
set search_path = ''
as $
  with candidates as (
    select
      i.cycle_id,
      i.variant_id,
      i.attempts,
      i.ordinal,
      case
        when p.market_value is null then 0
        when p.stale_after is null or p.stale_after <= now() then 1
        else 2
      end as price_priority
    from public.catalogue_price_items i
    left join lateral (
      select
        snap.stale_after,
        coalesce(snap.tcg_mid,snap.tcgdex_price,snap.cardmarket_trend,snap.ebay_average) as market_value
      from public.market_price_snapshots snap
      where snap.user_id is null
        and snap.card_id=i.variant_id::text
        and coalesce(
          snap.pricing_identity_json->>'canonicalVariantId',
          snap.pricing_identity_json->>'canonical_variant_id'
        )=i.variant_id::text
      order by snap.calculated_at desc nulls last,snap.id desc
      limit 1
    ) p on true
    where i.cycle_id=p_cycle
      and i.outcome in ('pending','retrying')
      and i.next_attempt_at<=now()
      and (i.lease_until is null or i.lease_until<=now())
    order by price_priority,i.attempts,i.ordinal
    for update of i skip locked
    limit greatest(0,least(p_limit,100))
  ), selected as (
    select cycle_id,variant_id from candidates
  )
  update public.catalogue_price_items i
  set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=i.attempts+1
  from selected s
  where i.cycle_id=s.cycle_id and i.variant_id=s.variant_id
  returning i.*;
$;

revoke all on function api.claim_catalogue_prices(uuid,integer) from public,anon,authenticated;
grant execute on function api.claim_catalogue_prices(uuid,integer) to service_role;

create or replace function api.publish_collection_valuation(
  p_owner uuid,
  p_lease uuid,
  p_revision text,
  p_summary jsonb,
  p_refresh_completed timestamptz default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if api.collection_valuation_inputs(p_owner)->>'collectionRevision' <> p_revision then
    update public.collection_valuation_generations
    set lease_token=null,lease_until=null
    where owner_id=p_owner and lease_token=p_lease;
    return false;
  end if;

  update public.collection_valuation_generations
  set collection_revision=p_revision,
      valuation_revision=(p_summary->>'valuationRevision')::uuid,
      summary=p_summary,
      calculated_at=now(),
      lease_token=null,
      lease_until=null,
      refresh_completed_at=coalesce(p_refresh_completed,refresh_completed_at)
  where owner_id=p_owner and lease_token=p_lease and lease_until>now();
  if not found then return false; end if;

  -- A point is genuine when it is a successful stored-price valuation for at
  -- least one priced owned unit. The trend scope fixes holdings, exact priced
  -- identities, currency, source, basis and methodology. Coverage or holdings
  -- changes therefore start a different series instead of backfilling today's
  -- collection into the past. Stale/partial evidence remains explicitly
  -- labelled by the summary and is never converted to zero.
  if p_summary->'trend'->>'eligible'='true'
     and (p_summary->>'totalUnits')::integer>0
     and (p_summary->>'pricedUnits')::integer>0
     and p_summary->>'total' is not null then
    insert into public.collection_valuation_history(owner_id,scope,bucket_at,point_at,total,evidence)
    select
      p_owner,
      p_summary->'trend'->>'scope',
      date_bin(interval '30 minutes',now(),timestamptz '1970-01-01'),
      now(),
      (p_summary->>'total')::numeric,
      p_summary->'trend'->>'evidence'
    where (
      select evidence
      from public.collection_valuation_history
      where owner_id=p_owner and scope=p_summary->'trend'->>'scope'
      order by point_at desc
      limit 1
    ) is distinct from p_summary->'trend'->>'evidence'
    on conflict(owner_id,scope,bucket_at)
    do update set point_at=excluded.point_at,total=excluded.total,evidence=excluded.evidence;
  end if;

  delete from public.collection_valuation_history
  where owner_id=p_owner and bucket_at<now()-interval '90 days';
  return true;
end $$;

revoke all on function api.publish_collection_valuation(uuid,uuid,text,jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function api.publish_collection_valuation(uuid,uuid,text,jsonb,timestamptz)
  to service_role;
