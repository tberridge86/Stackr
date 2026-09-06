-- Sold-market provenance is deliberately fail-closed.  Existing imported rows
-- remain `unknown`, but may not be represented as a proven last sale.

alter table market.sold_observations
  add column if not exists provider_query text,
  add column if not exists provider_search_id text,
  add column if not exists provider_result_position integer,
  add column if not exists evidence_sha256 text,
  add column if not exists sale_verification_state text not null default 'unknown',
  add column if not exists final_price_confirmed boolean not null default false,
  add column if not exists canonical_match_verified boolean not null default false,
  add column if not exists transaction_status text not null default 'unknown',
  add column if not exists provenance_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'market.sold_observations'::regclass
      and conname = 'sold_observations_sale_verification_state_check'
  ) then
    alter table market.sold_observations
      add constraint sold_observations_sale_verification_state_check
      check (sale_verification_state in ('unknown', 'provider_observed', 'confirmed', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'market.sold_observations'::regclass
      and conname = 'sold_observations_transaction_status_check'
  ) then
    alter table market.sold_observations
      add constraint sold_observations_transaction_status_check
      check (transaction_status in ('unknown', 'completed', 'cancelled', 'refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'market.sold_observations'::regclass
      and conname = 'sold_observations_result_position_check'
  ) then
    alter table market.sold_observations
      add constraint sold_observations_result_position_check
      check (provider_result_position is null or provider_result_position >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'market.sold_observations'::regclass
      and conname = 'sold_observations_provenance_check'
  ) then
    alter table market.sold_observations
      add constraint sold_observations_provenance_check
      check (
        sale_verification_state not in ('provider_observed', 'confirmed')
        or (
          nullif(btrim(source_item_id), '') is not null
          and nullif(btrim(source_url), '') is not null
          and source_url ~* '^https://'
          and sold_price > 0
          and nullif(btrim(raw_title), '') is not null
          and nullif(btrim(currency_code), '') is not null
          and transaction_status = 'completed'
          and final_price_confirmed
          and canonical_match_verified
          and parsed_match_confidence >= 0.85
          and raw_record_id is not null
          and sold_at <= observed_at
          and evidence_sha256 ~* '^[0-9a-f]{64}$'
          and nullif(btrim(provenance_version), '') is not null
        )
      );
  end if;
end $$;

create or replace function market.is_authorised_sold_provider(p_provider_code text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from market.source_providers sp
    where sp.code = p_provider_code
      and sp.active
      and sp.supports_sold_observations
      and sp.data_licence_status = 'approved'
      and (sp.provider_kind = 'manual_import' or sp.automated_refresh_allowed)
  );
$$;

revoke all on function market.is_authorised_sold_provider(text) from public, anon, authenticated;
grant execute on function market.is_authorised_sold_provider(text) to service_role;

create or replace function market.is_proven_sold_observation(p_observation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from market.sold_observations so
    join ingest.raw_source_records raw_record on raw_record.id = so.raw_record_id
    join ingest.sources ingest_source on ingest_source.id = raw_record.source_id
    where so.id = p_observation_id
      and market.is_authorised_sold_provider(so.provider_code)
      and so.sale_verification_state in ('provider_observed', 'confirmed')
      and so.transaction_status = 'completed'
      and so.final_price_confirmed
      and so.canonical_match_verified
      and nullif(btrim(so.source_item_id), '') is not null
      and nullif(btrim(so.source_url), '') is not null
      and so.source_url ~* '^https://'
      and nullif(btrim(so.raw_title), '') is not null
      and so.evidence_sha256 ~* '^[0-9a-f]{64}$'
      and nullif(btrim(so.provenance_version), '') is not null
      and so.sold_at <= so.observed_at
      and so.observed_at <= pg_catalog.now()
      and so.sold_price > 0
      and so.parsed_match_confidence >= 0.85
      and raw_record.record_type = 'price'
      and ingest_source.code = so.provider_code
      and ingest_source.source_type in ('pricing', 'manual')
      and ingest_source.active
      and ingest_source.licence_status = 'approved'
      and ingest_source.deprecated_at is null
      and raw_record.licence_status = 'approved'
      and raw_record.validation_status = 'valid'
      and raw_record.deprecated_at is null
      and lower(raw_record.payload_hash) = lower(so.evidence_sha256)
      -- PokeTrace ingestion hashes the canonical PostgreSQL jsonb text. Check
      -- the retained bytes again so a modified payload cannot keep its proof
      -- merely by leaving the two stored hash labels unchanged.
      and (so.provider_code <> 'poketrace_sold' or lower(so.evidence_sha256) =
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(raw_record.raw_payload::text, 'UTF8')), 'hex'))
      and coalesce(raw_record.provider_record_id, raw_record.external_id) = so.source_item_id
      and raw_record.source_url is not distinct from so.source_url
  );
$$;

revoke all on function market.is_proven_sold_observation(uuid) from public, anon, authenticated;
grant execute on function market.is_proven_sold_observation(uuid) to service_role;

create index if not exists sold_observations_provenance_lookup_idx
  on market.sold_observations (
    variant_id,
    condition_code,
    grader_code,
    sold_at desc
  )
  where sale_verification_state in ('provider_observed', 'confirmed')
    and transaction_status = 'completed'
    and final_price_confirmed
    and canonical_match_verified;

alter table public.market_price_snapshots
  add column if not exists proven_last_sold boolean not null default false,
  add column if not exists last_sold_observation_id uuid references market.sold_observations(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_price_snapshots'::regclass
      and conname = 'market_price_snapshots_proven_last_sold_check'
  ) then
    alter table public.market_price_snapshots
      add constraint market_price_snapshots_proven_last_sold_check
      check (not proven_last_sold or last_sold_observation_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_price_snapshots'::regclass
      and conname = 'market_price_snapshots_proven_last_sold_identity_check'
  ) then
    alter table public.market_price_snapshots
      add constraint market_price_snapshots_proven_last_sold_identity_check
      check (
        not proven_last_sold
        or (
          nullif(btrim(canonical_identity_key), '') is not null
          and price_type = 'recent_sold_value'
        )
      );
  end if;
end $$;

create or replace function market.enforce_snapshot_last_sold_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not new.proven_last_sold then
    new.last_sold_observation_id := null;
    return new;
  end if;

  if new.price_type is distinct from 'recent_sold_value' then
    raise exception 'A proven last-sold snapshot must use recent_sold_value.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from market.sold_observations so
    join market.market_identities mi on mi.id = so.market_identity_id
    where so.id = new.last_sold_observation_id
      and market.is_proven_sold_observation(so.id)
      and mi.identity_key = new.canonical_identity_key
      and market.is_authorised_sold_provider(so.provider_code)
      and so.sale_verification_state in ('provider_observed', 'confirmed')
      and so.transaction_status = 'completed'
      and so.final_price_confirmed
      and so.canonical_match_verified
      and nullif(btrim(so.source_item_id), '') is not null
      and nullif(btrim(so.source_url), '') is not null
      and so.source_url ~* '^https://'
      and nullif(btrim(so.raw_title), '') is not null
      and so.raw_record_id is not null
      and so.evidence_sha256 ~* '^[0-9a-f]{64}$'
      and nullif(btrim(so.provenance_version), '') is not null
      and so.sold_at <= so.observed_at
      and so.sold_price > 0
      and so.parsed_match_confidence >= 0.85
  ) then
    raise exception 'Snapshot last-sold evidence is missing or is not provenance-complete.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists market_price_snapshots_enforce_last_sold_provenance
  on public.market_price_snapshots;
create trigger market_price_snapshots_enforce_last_sold_provenance
before insert or update of proven_last_sold, last_sold_observation_id, price_type, canonical_identity_key
on public.market_price_snapshots
for each row execute function market.enforce_snapshot_last_sold_provenance();

revoke all on function market.enforce_snapshot_last_sold_provenance() from public, anon, authenticated;
grant execute on function market.enforce_snapshot_last_sold_provenance() to service_role;

create or replace view api.market_price_history
with (security_invoker = true)
as
select
  so.id as observation_id,
  'sold_observation'::text as observation_type,
  so.market_identity_id,
  so.variant_id,
  so.sealed_product_variant_id,
  mi.identity_key,
  mi.product_kind,
  mi.language_code,
  so.provider_code,
  sp.display_name as provider_name,
  so.source_item_id,
  so.sold_price as observed_price,
  so.shipping_price,
  so.currency_code,
  so.sale_type as sale_or_listing_type,
  so.condition_code,
  so.grader_code,
  gr.display_label as grade_label,
  so.observed_at,
  so.sold_at,
  so.source_url,
  so.raw_title as source_title,
  so.parsed_match_confidence,
  so.duplicate_group_id,
  so.created_at,
  so.sale_verification_state,
  so.final_price_confirmed,
  so.canonical_match_verified,
  so.transaction_status,
  so.evidence_sha256,
  so.provenance_version,
  (market.is_proven_sold_observation(so.id)
    and market.is_authorised_sold_provider(so.provider_code)
    and so.sale_verification_state in ('provider_observed', 'confirmed')
    and so.transaction_status = 'completed'
    and so.final_price_confirmed
    and so.canonical_match_verified) as proven_last_sold,
  case
    when market.is_proven_sold_observation(so.id)
      and market.is_authorised_sold_provider(so.provider_code)
      and so.sale_verification_state in ('provider_observed', 'confirmed')
      and so.transaction_status = 'completed'
      and so.final_price_confirmed
      and so.canonical_match_verified
    then jsonb_build_object(
      'observationId', so.id,
      'providerCode', so.provider_code,
      'providerName', sp.display_name,
      'sourceItemId', so.source_item_id,
      'sourceUrl', so.source_url,
      'soldAt', so.sold_at,
      'observedPrice', so.sold_price,
      'shippingPrice', so.shipping_price,
      'currency', so.currency_code,
      'saleType', so.sale_type,
      'conditionCode', so.condition_code,
      'graderCode', so.grader_code,
      'gradeLabel', gr.display_label,
      'matchConfidence', so.parsed_match_confidence,
      'verificationState', so.sale_verification_state,
      'transactionStatus', so.transaction_status,
      'evidenceSha256', so.evidence_sha256,
      'provenanceVersion', so.provenance_version
    )
    else null::jsonb
  end as last_sold_evidence
from market.sold_observations so
join market.market_identities mi on mi.id = so.market_identity_id
join market.source_providers sp on sp.code = so.provider_code
left join market.grades gr on gr.id = so.grade_id
union all
select
  al.id as observation_id,
  'active_listing'::text as observation_type,
  al.market_identity_id,
  al.variant_id,
  al.sealed_product_variant_id,
  mi.identity_key,
  mi.product_kind,
  mi.language_code,
  al.provider_code,
  sp.display_name as provider_name,
  al.source_item_id,
  al.observed_price,
  al.shipping_price,
  al.currency_code,
  al.listing_type as sale_or_listing_type,
  al.condition_code,
  al.grader_code,
  gr.display_label as grade_label,
  al.observed_at,
  null::timestamptz as sold_at,
  al.source_url,
  al.raw_title as source_title,
  al.parsed_match_confidence,
  al.duplicate_group_id,
  al.created_at,
  null::text as sale_verification_state,
  false as final_price_confirmed,
  false as canonical_match_verified,
  null::text as transaction_status,
  null::text as evidence_sha256,
  null::text as provenance_version,
  false as proven_last_sold,
  null::jsonb as last_sold_evidence
from market.active_listings al
join market.market_identities mi on mi.id = al.market_identity_id
join market.source_providers sp on sp.code = al.provider_code
left join market.grades gr on gr.id = al.grade_id;

grant select on table api.market_price_history to service_role;
revoke all on table api.market_price_history from anon, authenticated;

comment on view api.market_price_history is
  'Service-role API projection for pricing evidence history. A last_sold_evidence object is emitted only for provenance-complete sold transactions.';

-- Recreate the controlled writer with the same bounded, service-role-only
-- behaviour, but permit canonical sold estimates only from proven observations.

-- The publisher's ON CONFLICT needs a scope index that treats nullable
-- grading/sealed fields as equal. Never rely on an unshipped older migration.
-- Existing duplicate active scopes fail migration rather than being deleted.
create unique index if not exists market_price_estimates_active_scope_uidx
  on market.price_estimates (
    market_identity_id, estimate_version_id, product_kind, variant_id,
    sealed_product_variant_id, condition_code, grader_code, grade_id,
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
  if current_user <> 'service_role' then
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
   and market.is_proven_sold_observation(so.id)
   and market.is_authorised_sold_provider(so.provider_code)
   and so.sale_verification_state in ('provider_observed', 'confirmed')
   and so.transaction_status = 'completed'
   and so.final_price_confirmed
   and so.canonical_match_verified
   and nullif(btrim(so.source_item_id), '') is not null
   and nullif(btrim(so.source_url), '') is not null
   and so.source_url ~* '^https://'
   and nullif(btrim(so.raw_title), '') is not null
   and so.raw_record_id is not null
   and so.evidence_sha256 ~* '^[0-9a-f]{64}$'
   and nullif(btrim(so.provenance_version), '') is not null
   and so.sold_at <= so.observed_at
   and so.sold_price > 0
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
