-- PokeTrace Scale exposes a documented provider API for individual completed eBay
-- listings. Registration is deliberately inactive and unapproved: deployment
-- must not enable automated use until Stackr has written commercial permission.

insert into ingest.sources (
  code,
  display_name,
  source_type,
  base_url,
  terms_url,
  licence_status,
  attribution_required,
  robots_policy,
  rate_limit_config,
  active,
  internal_notes
) values (
  'poketrace_sold',
  'PokeTrace Scale completed eBay listings',
  'pricing',
  'https://api.poketrace.com/v1',
  'https://poketrace.com/terms',
  'under_review',
  true,
  'official_api_only',
  '{"listingsBurstRequests":30,"listingsBurstWindowSeconds":30,"maxListingsPerRequest":20}'::jsonb,
  false,
  'Keep inactive until written commercial data rights are recorded. Terapeak and 130point scraping is not permitted.'
)
on conflict (code) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  terms_url = excluded.terms_url,
  licence_status = excluded.licence_status,
  attribution_required = excluded.attribution_required,
  robots_policy = excluded.robots_policy,
  rate_limit_config = excluded.rate_limit_config,
  active = excluded.active,
  internal_notes = excluded.internal_notes,
  updated_at = now();

insert into market.source_providers (
  code,
  display_name,
  provider_kind,
  active,
  official_api_required,
  oauth_required,
  supports_active_listings,
  supports_sold_observations,
  supports_raw_cards,
  supports_graded_cards,
  supports_sealed_products,
  supported_marketplaces,
  supported_currencies,
  terms_url,
  data_licence_status,
  automated_refresh_allowed,
  credential_env_names,
  health_status
) values (
  'poketrace_sold',
  'PokeTrace Scale completed eBay listings',
  'secondary_market',
  false,
  true,
  false,
  false,
  true,
  true,
  true,
  false,
  array['ebay'],
  array['GBP','USD','EUR','JPY','CAD','AUD'],
  'https://poketrace.com/terms',
  'unreviewed',
  false,
  array['POKETRACE_API_KEY'],
  'disabled'
)
on conflict (code) do update set
  display_name = excluded.display_name,
  provider_kind = excluded.provider_kind,
  active = excluded.active,
  official_api_required = excluded.official_api_required,
  supports_active_listings = excluded.supports_active_listings,
  supports_sold_observations = excluded.supports_sold_observations,
  supports_raw_cards = excluded.supports_raw_cards,
  supports_graded_cards = excluded.supports_graded_cards,
  supports_sealed_products = excluded.supports_sealed_products,
  supported_marketplaces = excluded.supported_marketplaces,
  supported_currencies = excluded.supported_currencies,
  terms_url = excluded.terms_url,
  data_licence_status = excluded.data_licence_status,
  automated_refresh_allowed = excluded.automated_refresh_allowed,
  credential_env_names = excluded.credential_env_names,
  health_status = excluded.health_status,
  updated_at = now();

create table if not exists audit.provider_data_rights_approvals (
  provider_code text primary key references market.source_providers(code) on delete restrict,
  usage_scope text not null,
  evidence_reference text not null,
  operating_boundary_reference text not null default 'docs/stackrtcg-ip-operating-boundary.md (effective 2026-09-04)',
  review_details jsonb not null default '{}'::jsonb,
  approval_status text not null check (approval_status in ('approved', 'revoked')),
  approved_by text not null,
  approved_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (usage_scope <> '' and evidence_reference <> '' and approved_by <> ''),
  check (expires_at is null or expires_at > approved_at)
);

alter table audit.provider_data_rights_approvals
  add column if not exists operating_boundary_reference text not null
    default 'docs/stackrtcg-ip-operating-boundary.md (effective 2026-09-04)',
  add column if not exists review_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'audit.provider_data_rights_approvals'::pg_catalog.regclass
      and conname = 'provider_data_rights_approvals_amber_review_check'
  ) then
    alter table audit.provider_data_rights_approvals
      add constraint provider_data_rights_approvals_amber_review_check
      check (
        approval_status = 'revoked'
        or (
          nullif(pg_catalog.btrim(operating_boundary_reference), '') is not null
          and pg_catalog.jsonb_typeof(review_details) = 'object'
          and review_details ?& array[
            'dataAsset', 'source', 'ownerOrLicensor', 'permittedPurpose',
            'territory', 'term', 'transformationRights', 'storageRights',
            'deletionRequirements', 'attribution', 'downstreamDeliveryRights',
            'approvingPerson'
          ]
          and nullif(pg_catalog.btrim(review_details ->> 'dataAsset'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'source'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'ownerOrLicensor'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'permittedPurpose'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'territory'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'term'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'transformationRights'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'storageRights'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'deletionRequirements'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'attribution'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'downstreamDeliveryRights'), '') is not null
          and nullif(pg_catalog.btrim(review_details ->> 'approvingPerson'), '') is not null
        )
      );
  end if;
end $$;

alter table audit.provider_data_rights_approvals enable row level security;
revoke all on table audit.provider_data_rights_approvals from public, anon, authenticated, service_role;
grant select on table audit.provider_data_rights_approvals to service_role;

comment on table audit.provider_data_rights_approvals is
  'Database-admin amber-rights ledger under docs/stackrtcg-ip-operating-boundary.md. Runtime service credentials can read but cannot create or alter reviews.';

create or replace function api.is_poketrace_data_use_authorised()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from ingest.sources source
    join market.source_providers provider on provider.code = source.code
    join audit.provider_data_rights_approvals rights on rights.provider_code = provider.code
    where source.code = 'poketrace_sold'
      and source.active
      and source.licence_status = 'approved'
      and source.deprecated_at is null
      and provider.active
      and provider.supports_sold_observations
      and provider.data_licence_status = 'approved'
      and provider.automated_refresh_allowed
      and provider.deprecated_at is null
      and rights.usage_scope = 'commercial_card_identity_price_history_and_sold_listing_use'
      and rights.approval_status = 'approved'
      and nullif(pg_catalog.btrim(rights.evidence_reference), '') is not null
      and nullif(pg_catalog.btrim(rights.operating_boundary_reference), '') is not null
      and rights.review_details ?& array[
        'dataAsset', 'source', 'ownerOrLicensor', 'permittedPurpose',
        'territory', 'term', 'transformationRights', 'storageRights',
        'deletionRequirements', 'attribution', 'downstreamDeliveryRights',
        'approvingPerson'
      ]
      and rights.approved_at <= pg_catalog.now()
      and (rights.expires_at is null or rights.expires_at > pg_catalog.now())
  );
$$;

revoke all on function api.is_poketrace_data_use_authorised() from public, anon, authenticated;
grant execute on function api.is_poketrace_data_use_authorised() to service_role;

create or replace function market.normalise_pokemon_collector_number(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.string_agg(
    case
      when cleaned ~ '^[0-9]+$' then coalesce(nullif(pg_catalog.ltrim(cleaned, '0'), ''), '0')
      else cleaned
    end,
    '/' order by ordinal
  )
  from (
    select
      ordinal,
      pg_catalog.regexp_replace(lower(part), '[^a-z0-9-]', '', 'g') as cleaned
    from pg_catalog.unnest(pg_catalog.string_to_array(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '^#', ''),
        '[[:space:]]+', '', 'g'
      ),
      '/'
    )) with ordinality as parts(part, ordinal)
  ) normalized_parts;
$$;

revoke all on function market.normalise_pokemon_collector_number(text) from public, anon, authenticated;
grant execute on function market.normalise_pokemon_collector_number(text) to service_role;

create or replace function api.ingest_poketrace_sold_evidence_batch(p_rows jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_source_id uuid;
  v_item jsonb;
  v_listing jsonb;
  v_provider_card jsonb;
  v_variant_id uuid;
  v_product_kind text;
  v_condition_code text;
  v_grader_code text;
  v_grade_value text;
  v_grade_id uuid;
  v_language_code text;
  v_source_item_id text;
  v_sold_price numeric;
  v_shipping_price numeric;
  v_currency_code text;
  v_sold_at timestamptz;
  v_observed_at timestamptz;
  v_source_url text;
  v_raw_listing_url text;
  v_raw_title text;
  v_match_confidence numeric;
  v_provider_search_id text;
  v_provider_result_position integer;
  v_raw_payload jsonb;
  v_evidence_sha256 text;
  v_market_identity_id uuid;
  v_identity_count integer;
  v_raw_record_id uuid;
  v_observation_id uuid;
  v_raw_condition_token text;
  v_canonical_collector_number text;
  v_canonical_card_native_name text;
  v_canonical_card_english_name text;
  v_canonical_set_id uuid;
  v_canonical_set_code text;
  v_canonical_provider_set_code text;
  v_canonical_set_native_name text;
  v_canonical_set_english_name text;
  v_canonical_variant_code text;
  v_expected_provider_variant text;
  v_expected_provider_game text;
  v_provider_card_name text;
  v_provider_card_number text;
  v_provider_card_variant text;
  v_provider_card_game text;
  v_provider_card_market text;
  v_provider_card_product_type text;
  v_provider_card_product_family text;
  v_provider_card_set jsonb;
  v_result jsonb := '[]'::jsonb;
  v_requested_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'PokeTrace sold evidence ingestion requires service_role.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'PokeTrace sold evidence rows must be a JSON array.' using errcode = '22023';
  end if;
  v_requested_count := jsonb_array_length(p_rows);
  if v_requested_count < 1 or v_requested_count > 20 then
    raise exception 'PokeTrace sold evidence batches must contain between 1 and 20 rows.' using errcode = '22023';
  end if;
  if octet_length(p_rows::text) > 2097152 then
    raise exception 'PokeTrace sold evidence exceeds the 2 MiB batch limit.' using errcode = '22023';
  end if;

  select source.id into v_source_id
  from ingest.sources source
  join market.source_providers provider on provider.code = source.code
  join audit.provider_data_rights_approvals rights on rights.provider_code = provider.code
  where source.code = 'poketrace_sold'
    and source.source_type = 'pricing'
    and source.active
    and source.licence_status = 'approved'
    and source.deprecated_at is null
    and provider.active
    and provider.supports_sold_observations
    and provider.data_licence_status = 'approved'
    and provider.automated_refresh_allowed
    and provider.deprecated_at is null
    and market.is_authorised_sold_provider(provider.code)
    and api.is_poketrace_data_use_authorised()
    and rights.usage_scope = 'commercial_card_identity_price_history_and_sold_listing_use'
    and rights.approval_status = 'approved'
    and nullif(btrim(rights.evidence_reference), '') is not null
    and rights.approved_at <= now()
    and (rights.expires_at is null or rights.expires_at > now())
  -- The approval ledger is deliberately SELECT-only to service_role. Lock the
  -- mutable source/provider switches, but do not request a row lock on rights.
  for share of source, provider;
  if v_source_id is null then
    raise exception 'PokeTrace sold ingestion is not active with approved source and provider rights.' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (select count(*) <> 17 or coalesce(bool_or(not (key = any(array[
        'conditionCode','currencyCode','gradeValue','graderCode','matchConfidence',
        'observedAt','productKind','providerResultPosition','providerSearchId','rawPayload',
        'rawTitle','shippingPrice','soldAt','soldPrice','sourceItemId','sourceUrl','variantId'
      ]::text[]))), false) from jsonb_object_keys(v_item) key) then
      raise exception 'PokeTrace sold evidence row has unsupported or missing fields.' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'variantId') <> 'string'
      or jsonb_typeof(v_item -> 'productKind') <> 'string'
      or jsonb_typeof(v_item -> 'sourceItemId') <> 'string'
      or jsonb_typeof(v_item -> 'soldPrice') <> 'number'
      or jsonb_typeof(v_item -> 'currencyCode') <> 'string'
      or jsonb_typeof(v_item -> 'soldAt') <> 'string'
      or jsonb_typeof(v_item -> 'observedAt') <> 'string'
      or jsonb_typeof(v_item -> 'sourceUrl') <> 'string'
      or jsonb_typeof(v_item -> 'rawTitle') <> 'string'
      or jsonb_typeof(v_item -> 'matchConfidence') <> 'number'
      or jsonb_typeof(v_item -> 'providerSearchId') <> 'string'
      or jsonb_typeof(v_item -> 'providerResultPosition') <> 'number'
      or jsonb_typeof(v_item -> 'rawPayload') <> 'object'
      or jsonb_typeof(v_item -> 'conditionCode') not in ('string', 'null')
      or jsonb_typeof(v_item -> 'graderCode') not in ('string', 'null')
      or jsonb_typeof(v_item -> 'gradeValue') not in ('string', 'null')
      or jsonb_typeof(v_item -> 'shippingPrice') not in ('number', 'null') then
      raise exception 'PokeTrace sold evidence row has invalid field types.' using errcode = '22023';
    end if;

    if v_item ->> 'variantId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'PokeTrace sold evidence variantId is not a UUID.' using errcode = '22023';
    end if;
    v_variant_id := (v_item ->> 'variantId')::uuid;
    v_product_kind := btrim(v_item ->> 'productKind');
    v_condition_code := nullif(btrim(v_item ->> 'conditionCode'), '');
    v_grader_code := nullif(upper(btrim(v_item ->> 'graderCode')), '');
    v_grade_value := nullif(btrim(v_item ->> 'gradeValue'), '');
    v_source_item_id := btrim(v_item ->> 'sourceItemId');
    v_sold_price := (v_item ->> 'soldPrice')::numeric;
    v_shipping_price := case when jsonb_typeof(v_item -> 'shippingPrice') = 'number'
      then (v_item ->> 'shippingPrice')::numeric else null end;
    v_currency_code := upper(btrim(v_item ->> 'currencyCode'));
    v_sold_at := (v_item ->> 'soldAt')::timestamptz;
    v_observed_at := (v_item ->> 'observedAt')::timestamptz;
    v_source_url := btrim(v_item ->> 'sourceUrl');
    v_raw_title := btrim(v_item ->> 'rawTitle');
    v_match_confidence := (v_item ->> 'matchConfidence')::numeric;
    v_provider_search_id := btrim(v_item ->> 'providerSearchId');
    v_provider_result_position := (v_item ->> 'providerResultPosition')::integer;
    v_raw_payload := v_item -> 'rawPayload';
    v_listing := v_raw_payload -> 'listing';
    v_provider_card := v_raw_payload -> 'providerCard';
    v_raw_listing_url := btrim(coalesce(
      v_listing ->> 'listingUrl', v_listing ->> 'listing_url',
      v_listing ->> 'url', v_listing ->> 'sourceUrl', v_listing ->> 'source_url'
    ));

    if v_product_kind not in ('raw_card', 'graded_card')
      or v_source_item_id = '' or length(v_source_item_id) > 128
      or v_source_item_id !~ '^[A-Za-z0-9_-]+$'
      or v_sold_price <= 0
      or (v_shipping_price is not null and v_shipping_price < 0)
      or v_currency_code !~ '^[A-Z]{3}$'
      or v_sold_at > v_observed_at
      or v_observed_at > now() + interval '5 minutes'
      or v_match_confidence < 0.85 or v_match_confidence > 1
      or v_provider_result_position < 0
      or v_provider_search_id = '' or length(v_provider_search_id) > 128
      or v_provider_search_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or v_raw_title = '' or length(v_raw_title) > 1000
      or v_source_url !~* '^https://([a-z0-9-]+\.)*(ebay\.com|ebay\.co\.uk|ebay\.de|ebay\.fr|ebay\.it|ebay\.es|ebay\.ca|ebay\.com\.au|ebay\.at|ebay\.be|ebay\.ch|ebay\.ie|ebay\.nl|ebay\.pl|ebay\.com\.sg|ebay\.com\.hk|ebay\.com\.my|ebay\.ph)/itm/'
      or pg_catalog.regexp_replace(pg_catalog.split_part(v_source_url, '?', 1), '/+$', '') not like '%/' || v_source_item_id
      or jsonb_typeof(v_listing) <> 'object'
      or jsonb_typeof(v_provider_card) <> 'object'
      or v_raw_payload ->> 'provider' is distinct from 'poketrace'
      or v_raw_payload ->> 'apiVersion' is distinct from '1.7.0'
      or btrim(v_provider_card ->> 'id') is distinct from v_provider_search_id
      or btrim(coalesce(v_listing ->> 'sourceItemId', v_listing ->> 'source_item_id', v_listing ->> 'ebayItemId', v_listing ->> 'ebay_item_id')) is distinct from v_source_item_id
      or btrim(coalesce(v_listing ->> 'title', v_listing ->> 'listing_title', v_listing ->> 'name')) is distinct from v_raw_title
      or jsonb_typeof(coalesce(v_listing -> 'price', v_listing -> 'soldPrice', v_listing -> 'sold_price', v_listing -> 'finalPrice', v_listing -> 'final_price')) <> 'number'
      or coalesce(v_listing ->> 'price', v_listing ->> 'soldPrice', v_listing ->> 'sold_price', v_listing ->> 'finalPrice', v_listing ->> 'final_price')::numeric is distinct from v_sold_price
      or upper(btrim(coalesce(v_listing ->> 'currency', v_listing ->> 'priceCurrency', v_listing ->> 'price_currency'))) is distinct from v_currency_code
      or coalesce(v_listing ->> 'soldAt', v_listing ->> 'sold_at')::timestamptz is distinct from v_sold_at
      -- /cards/{id}/listings is the provider's sold-only endpoint. Its optional
      -- listingType is a mechanism such as auction, not a completion flag.
      -- Accept an absent/mechanism value, but reject any contradictory state.
      or lower(btrim(coalesce(v_listing ->> 'listingType', v_listing ->> 'listing_type', ''))) in (
        'active', 'active_listing', 'unsold', 'ended_unsold', 'cancelled', 'canceled'
      )
      or coalesce(v_listing -> 'anomalyFlag', v_listing -> 'anomaly_flag') is distinct from 'false'::jsonb
      or v_raw_listing_url !~* '^https://([a-z0-9-]+\.)*(ebay\.com|ebay\.co\.uk|ebay\.de|ebay\.fr|ebay\.it|ebay\.es|ebay\.ca|ebay\.com\.au|ebay\.at|ebay\.be|ebay\.ch|ebay\.ie|ebay\.nl|ebay\.pl|ebay\.com\.sg|ebay\.com\.hk|ebay\.com\.my|ebay\.ph)/itm/'
      or pg_catalog.regexp_replace(pg_catalog.split_part(v_raw_listing_url, '?', 1), '/+$', '') not like '%/' || v_source_item_id then
      raise exception 'PokeTrace sold evidence does not match one complete, non-anomalous provider listing.' using errcode = '22023';
    end if;

    if v_product_kind = 'raw_card' then
      v_raw_condition_token := pg_catalog.regexp_replace(lower(btrim(coalesce(v_listing ->> 'condition', v_listing ->> 'raw_condition'))), '[^a-z0-9]+', '_', 'g');
      if v_condition_code is null
        or v_condition_code is distinct from (case v_raw_condition_token
          when 'mint' then 'raw_mint'
          when 'near_mint' then 'raw_near_mint'
          when 'lightly_played' then 'raw_lightly_played'
          when 'moderately_played' then 'raw_moderately_played'
          when 'heavily_played' then 'raw_heavily_played'
          when 'damaged' then 'raw_damaged'
          else null
        end)
        or v_grader_code is not null or v_grade_value is not null
        or nullif(btrim(coalesce(v_listing ->> 'grader', v_listing ->> 'gradingCompany', v_listing ->> 'grading_company')), '') is not null
        or nullif(btrim(coalesce(v_listing ->> 'grade', v_listing ->> 'gradeValue', v_listing ->> 'grade_value')), '') is not null then
        raise exception 'PokeTrace raw evidence condition or grading scope is not exact.' using errcode = '22023';
      end if;
      perform 1 from market.conditions condition
      where condition.code = v_condition_code
        and condition.product_kind = 'raw_card'
        and condition.active and condition.deprecated_at is null;
      if not found then
        raise exception 'PokeTrace raw evidence uses an inactive condition.' using errcode = 'P0001';
      end if;
      v_grade_id := null;
    else
      if v_condition_code is not null or v_grader_code is null or v_grade_value is null
        or upper(btrim(coalesce(v_listing ->> 'grader', v_listing ->> 'gradingCompany', v_listing ->> 'grading_company'))) is distinct from v_grader_code
        or btrim(coalesce(v_listing ->> 'grade', v_listing ->> 'gradeValue', v_listing ->> 'grade_value')) is distinct from v_grade_value then
        raise exception 'PokeTrace graded evidence does not match the exact grader and grade.' using errcode = '22023';
      end if;
      select grade.id into v_grade_id
      from market.grades grade
      join market.graders grader on grader.code = grade.grader_code
      where grade.grader_code = v_grader_code
        and grade.grade_value = v_grade_value
        and grade.active and grader.active and grader.deprecated_at is null;
      if v_grade_id is null then
        raise exception 'PokeTrace graded evidence uses an inactive or unknown grade.' using errcode = 'P0001';
      end if;
    end if;

    select
      variant.language_code,
      variant.collector_number,
      printing.native_name,
      printing.english_display_name,
      set_row.id,
      set_row.set_code,
      set_row.provider_set_code,
      set_row.native_name,
      set_row.english_display_name,
      variant.variant_code
    into
      v_language_code,
      v_canonical_collector_number,
      v_canonical_card_native_name,
      v_canonical_card_english_name,
      v_canonical_set_id,
      v_canonical_set_code,
      v_canonical_provider_set_code,
      v_canonical_set_native_name,
      v_canonical_set_english_name,
      v_canonical_variant_code
    from catalog.card_variants variant
    join catalog.card_printings printing on printing.id = variant.printing_id
    join catalog.sets set_row on set_row.id = variant.set_id
    where variant.id = v_variant_id
      and variant.game_code = 'pokemon'
      and variant.deprecated_at is null
      and printing.deprecated_at is null
      and set_row.deprecated_at is null;
    -- Canonical catalogue rows are read-only to service_role. A single SELECT
    -- already has a consistent statement snapshot, so do not require catalogue
    -- write/lock privilege merely to validate identity.
    if v_language_code is null then
      raise exception 'PokeTrace sold evidence target is not an active canonical variant.' using errcode = 'P0001';
    end if;

    v_provider_card_name := btrim(v_provider_card ->> 'name');
    v_provider_card_number := btrim(coalesce(
      v_provider_card ->> 'cardNumber', v_provider_card ->> 'number', v_provider_card ->> 'collectorNumber'
    ));
    v_provider_card_variant := pg_catalog.regexp_replace(
      lower(btrim(v_provider_card ->> 'variant')), '[^a-z0-9]+', '_', 'g'
    );
    v_provider_card_game := lower(btrim(v_provider_card ->> 'game'));
    v_provider_card_market := upper(btrim(v_provider_card ->> 'market'));
    v_provider_card_product_type := lower(btrim(v_provider_card ->> 'productType'));
    v_provider_card_product_family := lower(btrim(v_provider_card ->> 'productFamily'));
    v_provider_card_set := v_provider_card -> 'set';
    v_expected_provider_game := case v_language_code
      when 'en' then 'pokemon'
      when 'ja' then 'pokemon-japanese'
      when 'zh-Hans' then 'pokemon-chinese'
      when 'zh-Hant' then 'pokemon-chinese'
      else null
    end;
    v_expected_provider_variant := case v_canonical_variant_code
      when 'normal' then 'normal'
      when 'holo' then 'holofoil'
      when 'reverse_holo' then 'reverse_holofoil'
      when 'first_edition' then '1st_edition'
      when 'first_edition_holofoil' then '1st_edition_holofoil'
      when 'unlimited' then 'unlimited'
      else null
    end;

    if v_provider_card_name is null
      or lower(pg_catalog.regexp_replace(v_provider_card_name, '[[:space:]]+', ' ', 'g')) not in (
        lower(pg_catalog.regexp_replace(v_canonical_card_native_name, '[[:space:]]+', ' ', 'g')),
        lower(pg_catalog.regexp_replace(coalesce(v_canonical_card_english_name, v_canonical_card_native_name), '[[:space:]]+', ' ', 'g'))
      )
      or market.normalise_pokemon_collector_number(v_provider_card_number)
        is distinct from market.normalise_pokemon_collector_number(v_canonical_collector_number)
      or jsonb_typeof(v_provider_card_set) <> 'object'
      or not (
        (nullif(lower(btrim(v_provider_card_set ->> 'id')), '') is not null
          and lower(btrim(v_provider_card_set ->> 'id')) = lower(v_canonical_set_id::text))
        or (nullif(lower(btrim(v_provider_card_set ->> 'slug')), '') is not null
          and ((v_canonical_set_code is not null
              and lower(btrim(v_provider_card_set ->> 'slug')) = lower(v_canonical_set_code))
            or (v_canonical_provider_set_code is not null
              and lower(btrim(v_provider_card_set ->> 'slug')) = lower(v_canonical_provider_set_code))))
        or (nullif(lower(btrim(v_provider_card_set ->> 'code')), '') is not null
          and ((v_canonical_set_code is not null
              and lower(btrim(v_provider_card_set ->> 'code')) = lower(v_canonical_set_code))
            or (v_canonical_provider_set_code is not null
              and lower(btrim(v_provider_card_set ->> 'code')) = lower(v_canonical_provider_set_code))))
        or (nullif(btrim(v_provider_card_set ->> 'name'), '') is not null
          and lower(pg_catalog.regexp_replace(btrim(v_provider_card_set ->> 'name'), '[[:space:]]+', ' ', 'g')) in (
            lower(pg_catalog.regexp_replace(v_canonical_set_native_name, '[[:space:]]+', ' ', 'g')),
            lower(pg_catalog.regexp_replace(coalesce(v_canonical_set_english_name, v_canonical_set_native_name), '[[:space:]]+', ' ', 'g'))
          ))
      )
      or v_expected_provider_variant is null
      or v_provider_card_variant is distinct from v_expected_provider_variant
      or v_expected_provider_game is null
      or v_provider_card_game is distinct from v_expected_provider_game
      or v_provider_card_market is distinct from 'US'
      or v_provider_card_product_type is distinct from 'single'
      or v_provider_card_product_family is distinct from 'card' then
      raise exception 'PokeTrace provider card does not exactly match the active canonical card, set, number, language, and variant.' using errcode = '22023';
    end if;
    perform 1 from market.currencies currency
    where currency.code = v_currency_code and currency.active;
    if not found then
      raise exception 'PokeTrace sold evidence currency is not active.' using errcode = 'P0001';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'stackr:poketrace:' || v_variant_id::text || ':' || coalesce(v_condition_code, '') || ':' ||
      coalesce(v_grader_code, '') || ':' || coalesce(v_grade_value, '') || ':' || v_source_item_id,
      0
    ));

    select count(*), (array_agg(identity.id order by identity.id))[1]
    into v_identity_count, v_market_identity_id
    from market.market_identities identity
    where identity.product_kind = v_product_kind
      and identity.variant_id = v_variant_id
      and identity.sealed_product_variant_id is null
      and identity.condition_code is not distinct from v_condition_code
      and identity.grader is not distinct from v_grader_code
      and identity.grade is not distinct from v_grade_value
      and identity.deprecated_at is null;
    if v_identity_count > 1 then
      raise exception 'Canonical market identity scope is ambiguous.' using errcode = 'P0001';
    end if;
    if v_market_identity_id is null then
      insert into market.market_identities (
        identity_key, product_kind, variant_id, condition_code, grader, grade, language_code
      ) values (
        'stackr-market-v1|' || v_product_kind || '|' || v_variant_id::text || '|' ||
          coalesce(v_condition_code, '_') || '|' || coalesce(v_grader_code, '_') || '|' || coalesce(v_grade_value, '_'),
        v_product_kind, v_variant_id, v_condition_code, v_grader_code, v_grade_value, v_language_code
      )
      returning id into v_market_identity_id;
    end if;

    v_evidence_sha256 := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(v_raw_payload::text, 'UTF8')),
      'hex'
    );

    update market.sold_observations observation
    set
      sale_verification_state = 'rejected',
      final_price_confirmed = false,
      canonical_match_verified = false,
      transaction_status = 'unknown',
      updated_at = now()
    where observation.provider_code = 'poketrace_sold'
      and observation.source_item_id = v_source_item_id
      and (observation.evidence_sha256 is distinct from v_evidence_sha256
        or observation.market_identity_id is distinct from v_market_identity_id)
      and observation.sale_verification_state in ('provider_observed', 'confirmed');

    update ingest.raw_source_records raw_record
    set
      deprecated_at = now(),
      deprecated_reason = 'superseded_poketrace_listing_revision',
      updated_at = now()
    where raw_record.source_id = v_source_id
      and raw_record.record_type = 'price'
      and raw_record.provider_record_id = v_source_item_id
      and raw_record.deprecated_at is null
      and (raw_record.payload_hash is distinct from v_evidence_sha256
        or raw_record.source_url is distinct from v_source_url);

    select raw_record.id into v_raw_record_id
    from ingest.raw_source_records raw_record
    where raw_record.source_id = v_source_id
      and raw_record.record_type = 'price'
      and raw_record.provider_record_id = v_source_item_id
      and raw_record.payload_hash = v_evidence_sha256
      and raw_record.source_url = v_source_url
      and raw_record.licence_status = 'approved'
      and raw_record.validation_status = 'valid'
      and raw_record.deprecated_at is null
    order by raw_record.retrieved_at desc
    limit 1;
    if v_raw_record_id is null then
      insert into ingest.raw_source_records (
        source_id, record_type, external_id, provider_record_id, language_code,
        source_url, source_endpoint, retrieved_at, licence_status,
        attribution_text, payload_hash, raw_payload, validation_status,
        validation_errors, internal_notes
      ) values (
        v_source_id, 'price', v_source_item_id, v_source_item_id, v_language_code,
        v_source_url, '/cards/' || v_provider_search_id || '/listings', v_observed_at, 'approved',
        'PokeTrace Scale — completed eBay listing evidence', v_evidence_sha256,
        v_raw_payload, 'valid', '[]'::jsonb,
        'Provider-observed completed sale. Refund, cancellation, and later eBay reversal state are not exposed by the source.'
      ) returning id into v_raw_record_id;
    end if;

    select observation.id into v_observation_id
    from market.sold_observations observation
    where observation.provider_code = 'poketrace_sold'
      and observation.source_item_id = v_source_item_id
      and observation.sold_at = v_sold_at
    for update;
    if v_observation_id is null then
      insert into market.sold_observations (
        market_identity_id, variant_id, provider_code, source_item_id,
        sold_price, shipping_price, currency_code, sale_type, condition_code,
        grader_code, grade_id, observed_at, sold_at, source_url, raw_title,
        parsed_match_confidence, raw_record_id, provider_search_id,
        provider_result_position, evidence_sha256, sale_verification_state,
        final_price_confirmed, canonical_match_verified, transaction_status,
        provenance_version
      ) values (
        v_market_identity_id, v_variant_id, 'poketrace_sold', v_source_item_id,
        v_sold_price, v_shipping_price, v_currency_code, 'provider_sold_observation', v_condition_code,
        v_grader_code, v_grade_id, v_observed_at, v_sold_at, v_source_url, v_raw_title,
        v_match_confidence, v_raw_record_id, v_provider_search_id,
        v_provider_result_position, v_evidence_sha256, 'provider_observed',
        true, true, 'completed', 'poketrace-scale-v1.7.0'
      ) returning id into v_observation_id;
    else
      update market.sold_observations observation
      set
        market_identity_id = v_market_identity_id,
        variant_id = v_variant_id,
        sealed_product_variant_id = null,
        sold_price = v_sold_price,
        shipping_price = v_shipping_price,
        currency_code = v_currency_code,
        sale_type = 'provider_sold_observation',
        condition_code = v_condition_code,
        grader_code = v_grader_code,
        grade_id = v_grade_id,
        observed_at = greatest(observation.observed_at, v_observed_at),
        source_url = v_source_url,
        raw_title = v_raw_title,
        provider_result_position = v_provider_result_position,
        parsed_match_confidence = greatest(observation.parsed_match_confidence, v_match_confidence),
        raw_record_id = v_raw_record_id,
        provider_search_id = v_provider_search_id,
        evidence_sha256 = v_evidence_sha256,
        sale_verification_state = 'provider_observed',
        final_price_confirmed = true,
        canonical_match_verified = true,
        transaction_status = 'completed',
        provenance_version = 'poketrace-scale-v1.7.0',
        updated_at = now()
      where observation.id = v_observation_id;
    end if;

    if not market.is_proven_sold_observation(v_observation_id) then
      raise exception 'PokeTrace observation failed the canonical provenance boundary.' using errcode = 'P0001';
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'observationId', v_observation_id,
      'marketIdentityId', v_market_identity_id,
      'rawRecordId', v_raw_record_id,
      'sourceItemId', v_source_item_id,
      'verificationState', 'provider_observed',
      'evidenceSha256', v_evidence_sha256
    ));
  end loop;

  return jsonb_build_object(
    'status', 'applied',
    'requestedCount', v_requested_count,
    'writtenCount', jsonb_array_length(v_result),
    'observations', v_result
  );
end;
$$;

revoke all on function api.ingest_poketrace_sold_evidence_batch(jsonb) from public, anon, authenticated;
grant execute on function api.ingest_poketrace_sold_evidence_batch(jsonb) to service_role;

comment on function api.ingest_poketrace_sold_evidence_batch(jsonb) is
  'Service-role-only, rights-gated ingestion of up to 20 exact PokeTrace Scale completed eBay listing records. Rows remain provider_observed because reversal/refund state is not exposed.';
