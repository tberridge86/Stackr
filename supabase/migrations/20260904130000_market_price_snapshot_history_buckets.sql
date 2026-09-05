-- Bounded, public snapshot history for the home value chart.  This function
-- deliberately uses the caller's privileges: only the backend service role is
-- granted execution, while direct table access remains unavailable to clients.

create index if not exists market_price_snapshots_public_card_snapshot_idx
  on public.market_price_snapshots (card_id, snapshot_at desc)
  where user_id is null;

create or replace function api.market_price_snapshot_history(
  p_card_ids text[],
  p_range_days integer
)
returns setof public.market_price_snapshots
language sql
security invoker
set search_path = ''
stable
as $$
  with request as (
    select
      case p_range_days when 7 then interval '7 days' when 30 then interval '30 days' end as range_interval,
      case p_range_days when 7 then interval '30 minutes' when 30 then interval '1 day' end as bucket_interval,
      pg_catalog.now() as requested_at
    where cardinality(p_card_ids) between 1 and 120
      and p_range_days in (7, 30)
  ),
  bucketed as (
    select distinct on (
      snapshot.card_id,
      snapshot.language,
      coalesce(
        nullif(btrim(snapshot.canonical_identity_key), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonicalVariantId'), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonical_variant_id'), ''),
        '__legacy_printing_scope__'
      ),
      pg_catalog.date_bin(request.bucket_interval, snapshot.snapshot_at, timestamptz '2000-01-01 00:00:00+00')
    ) snapshot.id
    from public.market_price_snapshots as snapshot
    cross join request
    where snapshot.user_id is null
      and snapshot.card_id = any (p_card_ids)
      and snapshot.snapshot_at >= request.requested_at - request.range_interval
      and snapshot.snapshot_at <= request.requested_at
      -- Filter the source boundary before choosing a bucket winner. A newer
      -- source-null historical row must never displace a labelled estimate.
      and (
        lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), ''))) in (
          'tcgdex', 'tcgdex_tcgplayer', 'tcgdex_cardmarket'
        )
        or (
          lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), ''))) in (
            'poketrace_sold', 'ebay_active', 'ebay_sold', 'ebay',
            'existing_stackr_source', 'manual_verified_comp', 'manual_verified_import'
          )
          and snapshot.methodology_version like 'pricing-v2.%'
          and exists (
            select 1
            from jsonb_array_elements(case
              when jsonb_typeof(snapshot.source_breakdown) = 'array' then snapshot.source_breakdown
              else '[]'::jsonb
            end) as source_row
            where lower(coalesce(
              nullif(btrim(source_row ->> 'sourceId'), ''),
              nullif(btrim(source_row ->> 'source'), '')
            )) = lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), '')))
          )
        )
      )
    order by
      snapshot.card_id,
      snapshot.language,
      coalesce(
        nullif(btrim(snapshot.canonical_identity_key), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonicalVariantId'), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonical_variant_id'), ''),
        '__legacy_printing_scope__'
      ),
      pg_catalog.date_bin(request.bucket_interval, snapshot.snapshot_at, timestamptz '2000-01-01 00:00:00+00'),
      snapshot.snapshot_at desc,
      snapshot.id desc
  ),
  baselines as (
    select distinct on (
      snapshot.card_id,
      snapshot.language,
      coalesce(
        nullif(btrim(snapshot.canonical_identity_key), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonicalVariantId'), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonical_variant_id'), ''),
        '__legacy_printing_scope__'
      )
    ) snapshot.id
    from public.market_price_snapshots as snapshot
    cross join request
    where snapshot.user_id is null
      and snapshot.card_id = any (p_card_ids)
      and snapshot.snapshot_at < request.requested_at - request.range_interval
      and snapshot.snapshot_at <= request.requested_at
      and (
        lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), ''))) in (
          'tcgdex', 'tcgdex_tcgplayer', 'tcgdex_cardmarket'
        )
        or (
          lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), ''))) in (
            'poketrace_sold', 'ebay_active', 'ebay_sold', 'ebay',
            'existing_stackr_source', 'manual_verified_comp', 'manual_verified_import'
          )
          and snapshot.methodology_version like 'pricing-v2.%'
          and exists (
            select 1
            from jsonb_array_elements(case
              when jsonb_typeof(snapshot.source_breakdown) = 'array' then snapshot.source_breakdown
              else '[]'::jsonb
            end) as source_row
            where lower(coalesce(
              nullif(btrim(source_row ->> 'sourceId'), ''),
              nullif(btrim(source_row ->> 'source'), '')
            )) = lower(coalesce(nullif(btrim(snapshot.primary_source), ''), nullif(btrim(snapshot.price_source), '')))
          )
        )
      )
    order by
      snapshot.card_id,
      snapshot.language,
      coalesce(
        nullif(btrim(snapshot.canonical_identity_key), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonicalVariantId'), ''),
        nullif(btrim(snapshot.pricing_identity_json ->> 'canonical_variant_id'), ''),
        '__legacy_printing_scope__'
      ),
      snapshot.snapshot_at desc,
      snapshot.id desc
  )
  select snapshot.*
  from public.market_price_snapshots as snapshot
  join (
    select id from bucketed
    union all
    select id from baselines
  ) as selected on selected.id = snapshot.id;
$$;

revoke all on function api.market_price_snapshot_history(text[], integer) from public, anon, authenticated;
grant execute on function api.market_price_snapshot_history(text[], integer) to service_role;

comment on function api.market_price_snapshot_history(text[], integer) is
  'Returns newest labelled public snapshot per fixed bucket, language, and canonical identity plus one pre-range baseline for at most 120 card aliases.';
