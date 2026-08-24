-- Controlled, service-role-only writer for reviewed canonical market estimates.
-- This migration is intentionally additive: it does not create estimates itself.

create unique index if not exists market_price_estimates_active_scope_uidx
  on market.price_estimates (
    market_identity_id,
    estimate_version_id,
    product_kind,
    variant_id,
    sealed_product_variant_id,
    condition_code,
    grader_code,
    grade_id,
    display_currency_code
  ) nulls not distinct
  where superseded_at is null;

create or replace function api.apply_canonical_price_estimate_batch(
  p_estimate_version_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  requested_count integer;
  written_count integer;
  decision_count integer;
  invalid_count integer;
begin
  if pg_catalog.current_user <> 'service_role' then
    raise exception 'Canonical pricing writes require service_role.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Canonical estimate rows must be a JSON array.' using errcode = '22023';
  end if;
  requested_count := jsonb_array_length(p_rows);
  if requested_count < 1 or requested_count > 25 then
    raise exception 'Canonical estimate batches must contain between 1 and 25 rows.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from market.price_estimate_versions
    where id = p_estimate_version_id
      and status = 'active'
  ) then
    raise exception 'Estimate version is not active.' using errcode = 'P0001';
  end if;

  -- Convert once so every validation and the eventual upsert see precisely the
  -- same bounded request. A temporary table is transaction-local and vanishes
  -- on either success or rollback.
  create temporary table if not exists pg_temp.stackr_canonical_price_rows (
    market_identity_id uuid not null,
    product_kind text not null,
    variant_id uuid,
    sealed_product_variant_id uuid,
    condition_code text,
    grader_code text,
    grade_id uuid,
    display_currency_code text not null,
    evidence_status text not null,
    sample_count integer not null,
    sold_sample_count integer not null,
    active_listing_count integer not null,
    source_count integer not null,
    date_range_start timestamptz,
    date_range_end timestamptz,
    low_estimate numeric,
    central_estimate numeric,
    high_estimate numeric,
    confidence_score numeric not null,
    confidence_label text not null,
    freshness text not null,
    recency_weight numeric,
    source_breakdown jsonb not null,
    outlier_summary jsonb not null,
    calculated_at timestamptz not null,
    stale_after timestamptz,
    included_sold_observation_ids jsonb not null
  ) on commit drop;
  truncate pg_temp.stackr_canonical_price_rows;

  insert into pg_temp.stackr_canonical_price_rows
  select *
  from jsonb_to_recordset(p_rows) as row (
    market_identity_id uuid,
    product_kind text,
    variant_id uuid,
    sealed_product_variant_id uuid,
    condition_code text,
    grader_code text,
    grade_id uuid,
    display_currency_code text,
    evidence_status text,
    sample_count integer,
    sold_sample_count integer,
    active_listing_count integer,
    source_count integer,
    date_range_start timestamptz,
    date_range_end timestamptz,
    low_estimate numeric,
    central_estimate numeric,
    high_estimate numeric,
    confidence_score numeric,
    confidence_label text,
    freshness text,
    recency_weight numeric,
    source_breakdown jsonb,
    outlier_summary jsonb,
    calculated_at timestamptz,
    stale_after timestamptz,
    included_sold_observation_ids jsonb
  );

  select count(*)::integer into invalid_count
  from pg_temp.stackr_canonical_price_rows r
  left join market.market_identities mi
    on mi.id = r.market_identity_id
   and mi.deprecated_at is null
   and mi.product_kind = r.product_kind
   and mi.variant_id is not distinct from r.variant_id
   and mi.sealed_product_variant_id is not distinct from r.sealed_product_variant_id
   and mi.condition_code is not distinct from r.condition_code
   and mi.grader is not distinct from r.grader_code
  left join market.conditions c
    on c.code = r.condition_code
   and c.product_kind = r.product_kind
   and c.active
   and c.deprecated_at is null
  where mi.id is null
     or c.code is null
     or r.product_kind <> 'raw_card'
     or r.display_currency_code <> 'GBP'
     or r.evidence_status not in ('recent_sold_value', 'thin_sold_value')
     or r.variant_id is null
     or r.sealed_product_variant_id is not null
     or r.grader_code is not null
     or r.grade_id is not null
     or r.sample_count < 3
     or r.sold_sample_count < 3
     or r.active_listing_count <> 0
     or r.source_count < 1
     or r.low_estimate is null
     or r.central_estimate is null
     or r.high_estimate is null
     or r.low_estimate < 0
     or r.central_estimate < r.low_estimate
     or r.high_estimate < r.central_estimate
     or r.confidence_score < 0
     or r.confidence_score > 100
     or r.confidence_label not in ('high', 'medium', 'low')
     or r.freshness not in ('fresh', 'stale')
     or r.date_range_start is null
     or r.date_range_end is null
     or r.date_range_end < r.date_range_start
     or r.stale_after is null
     or r.source_breakdown is null
     or jsonb_typeof(r.source_breakdown) <> 'array'
     or r.outlier_summary is null
     or jsonb_typeof(r.outlier_summary) <> 'object'
     or jsonb_typeof(r.included_sold_observation_ids) <> 'array'
     or jsonb_array_length(r.included_sold_observation_ids) <> r.sold_sample_count;
  if invalid_count <> 0 then
    raise exception 'One or more estimate rows violate canonical pricing constraints.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.stackr_canonical_price_rows r
    group by r.market_identity_id, r.product_kind, r.variant_id,
      r.sealed_product_variant_id, r.condition_code, r.grader_code,
      r.grade_id, r.display_currency_code
    having count(*) > 1
  ) then
    raise exception 'Canonical estimate batches cannot contain duplicate scopes.' using errcode = '22023';
  end if;

  -- Every claimed evidence row must remain an exact, canonical sold observation
  -- for this identity/variant/condition. This stops an estimate plan from being
  -- replayed against a changed or mismatched evidence set.
  select count(*)::integer into invalid_count
  from pg_temp.stackr_canonical_price_rows r
  cross join lateral jsonb_array_elements_text(r.included_sold_observation_ids) claimed(id_text)
  left join market.sold_observations so
    on so.id = claimed.id_text::uuid
   and so.market_identity_id = r.market_identity_id
   and so.variant_id is not distinct from r.variant_id
   and so.sealed_product_variant_id is not distinct from r.sealed_product_variant_id
   and so.condition_code is not distinct from r.condition_code
   and so.grader_code is not distinct from r.grader_code
   and so.grade_id is not distinct from r.grade_id
   and so.currency_code = r.display_currency_code
   and so.sold_price >= 0
   and so.parsed_match_confidence >= 0.85
  where so.id is null;
  if invalid_count <> 0 then
    raise exception 'A claimed sold observation is not exact, current canonical evidence.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_temp.stackr_canonical_price_rows r
    cross join lateral jsonb_array_elements_text(r.included_sold_observation_ids) claimed(id_text)
    group by r.market_identity_id, claimed.id_text
    having count(*) > 1
  ) then
    raise exception 'A sold observation may support only one estimate in a batch.' using errcode = '22023';
  end if;

  with upserted as (
    insert into market.price_estimates (
      market_identity_id, estimate_version_id, product_kind, variant_id,
      sealed_product_variant_id, condition_code, grader_code, grade_id,
      display_currency_code, evidence_status, unavailable_reason, sample_count,
      sold_sample_count, active_listing_count, source_count, date_range_start,
      date_range_end, low_estimate, central_estimate, high_estimate,
      confidence_score, confidence_label, freshness, recency_weight,
      source_breakdown, outlier_summary, fallback_identity_key, fallback_reason,
      calculated_at, stale_after, public_notes, internal_notes, superseded_at
    )
    select
      r.market_identity_id, p_estimate_version_id, r.product_kind, r.variant_id,
      r.sealed_product_variant_id, r.condition_code, r.grader_code, r.grade_id,
      r.display_currency_code, r.evidence_status, null, r.sample_count,
      r.sold_sample_count, r.active_listing_count, r.source_count, r.date_range_start,
      r.date_range_end, r.low_estimate, r.central_estimate, r.high_estimate,
      r.confidence_score, r.confidence_label, r.freshness, r.recency_weight,
      r.source_breakdown, r.outlier_summary, null, null,
      r.calculated_at, r.stale_after, null, 'Controlled canonical sold-evidence batch', null
    from pg_temp.stackr_canonical_price_rows r
    on conflict (market_identity_id, estimate_version_id, product_kind, variant_id,
      sealed_product_variant_id, condition_code, grader_code, grade_id,
      display_currency_code) where superseded_at is null
    do update set
      evidence_status = excluded.evidence_status,
      sample_count = excluded.sample_count,
      sold_sample_count = excluded.sold_sample_count,
      active_listing_count = excluded.active_listing_count,
      source_count = excluded.source_count,
      date_range_start = excluded.date_range_start,
      date_range_end = excluded.date_range_end,
      low_estimate = excluded.low_estimate,
      central_estimate = excluded.central_estimate,
      high_estimate = excluded.high_estimate,
      confidence_score = excluded.confidence_score,
      confidence_label = excluded.confidence_label,
      freshness = excluded.freshness,
      recency_weight = excluded.recency_weight,
      source_breakdown = excluded.source_breakdown,
      outlier_summary = excluded.outlier_summary,
      calculated_at = excluded.calculated_at,
      stale_after = excluded.stale_after,
      internal_notes = excluded.internal_notes,
      updated_at = now()
    returning id, market_identity_id, product_kind, variant_id,
      sealed_product_variant_id, condition_code, grader_code, grade_id,
      display_currency_code
  ), cleared as (
    delete from market.outlier_decisions od
    using upserted u
    where od.price_estimate_id = u.id
    returning od.id
  ), decisions as (
    insert into market.outlier_decisions (
      price_estimate_id, sold_observation_id, decision, method, observed_price,
      median_price, mad_score, reason, decided_by
    )
    select
      u.id, so.id, 'included', 'canonical_sold_evidence_v1', so.sold_price,
      r.central_estimate, null, 'Exact sold observation accepted by reviewed estimate plan.',
      'pricing_service'
    from upserted u
    join pg_temp.stackr_canonical_price_rows r
      on r.market_identity_id = u.market_identity_id
     and r.product_kind = u.product_kind
     and r.variant_id is not distinct from u.variant_id
     and r.sealed_product_variant_id is not distinct from u.sealed_product_variant_id
     and r.condition_code is not distinct from u.condition_code
     and r.grader_code is not distinct from u.grader_code
     and r.grade_id is not distinct from u.grade_id
     and r.display_currency_code = u.display_currency_code
    cross join lateral jsonb_array_elements_text(r.included_sold_observation_ids) claimed(id_text)
    join market.sold_observations so on so.id = claimed.id_text::uuid
    returning id
  )
  select (select count(*) from upserted)::integer,
         (select count(*) from decisions)::integer
  into written_count, decision_count;

  if written_count <> requested_count then
    raise exception 'Canonical estimate batch did not write every requested row.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'estimateVersionId', p_estimate_version_id,
    'requestedCount', requested_count,
    'writtenCount', written_count,
    'includedSoldDecisionCount', decision_count
  );
end;
$$;

revoke all on function api.apply_canonical_price_estimate_batch(uuid, jsonb) from public;
revoke all on function api.apply_canonical_price_estimate_batch(uuid, jsonb) from anon, authenticated;
grant execute on function api.apply_canonical_price_estimate_batch(uuid, jsonb) to service_role;

comment on function api.apply_canonical_price_estimate_batch(uuid, jsonb) is
  'Bounded, service-role-only, idempotent writer for reviewed raw-card GBP sold-evidence estimates.';
