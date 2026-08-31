-- Atomically bootstrap only missing official Japanese card metadata while
-- preserving every existing canonical row byte-for-byte.

-- Supersede the staging-only draft RPC whose caller supplied canonical
-- identity fields directly. The replacement below derives every fact from
-- the approved retained observation and accepts only run/raw provenance IDs.
drop function if exists ingest.bootstrap_official_japanese_card_identity(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz
);

create or replace function ingest.bootstrap_preserved_official_japanese_card(
  p_import_run_id uuid,
  p_raw_record_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  context_row record;
  current_identifier ingest.external_identifiers%rowtype;
  canonical_variant record;

  source_id uuid;
  provider_card_id text;
  provider_set_code text;
  collector_number text;
  collector_match text[];
  collector_digits text;
  collector_numeric numeric;
  collector_number_prefix text;
  collector_number_sort integer;
  collector_number_suffix text;
  collector_number_sort_key text;
  native_name text;
  normalized_name text;
  concept_key text;
  rarity_code text;
  rarity_id uuid;
  image_url text;
  expected_artwork_key text;
  inserted_artwork_key text;
  resolved_set_id uuid;
  rechecked_set_id uuid;
  canonical_key text;
  concept_id uuid;
  printing_id uuid;
  variant_id uuid;

  external_set_match_count integer := 0;
  valid_external_set_match_count integer := 0;
  set_match_count integer := 0;
  printing_match_count integer := 0;
  has_current_identifier boolean := false;
  inserted_concept boolean := false;
begin
  if p_import_run_id is null or p_raw_record_id is null then
    raise exception using
      errcode = '22023',
      message = 'bootstrap_preserved_official_japanese_card requires non-null run and raw-record UUIDs';
  end if;

  -- Lock the current observation, its immutable raw revision, the run and the
  -- source for the duration of the RPC. A reused raw revision may have been
  -- first captured by a different run, so its import_run_id is deliberately
  -- not compared with p_import_run_id.
  select
    source_record.id as source_id,
    source_record.code as source_code,
    source_record.source_type,
    source_record.active as source_active,
    source_record.licence_status as source_licence_status,
    source_record.deprecated_at as source_deprecated_at,
    import_run.source_id as run_source_id,
    import_run.status as run_status,
    import_run.request_id,
    import_run.metadata as run_metadata,
    observation.source_updated_at as observation_source_updated_at,
    observation.licence_status as observation_licence_status,
    observation.validation_status as observation_validation_status,
    raw_record.source_id as raw_source_id,
    raw_record.record_type,
    raw_record.external_id,
    raw_record.provider_record_id,
    raw_record.language_code,
    raw_record.deprecated_at as raw_deprecated_at,
    raw_record.raw_payload
  into context_row
  from ingest.raw_source_record_observations observation
  join ingest.raw_source_records raw_record
    on raw_record.id = observation.raw_record_id
  join ingest.import_runs import_run
    on import_run.id = observation.import_run_id
  join ingest.sources source_record
    on source_record.id = raw_record.source_id
  where observation.import_run_id = p_import_run_id
    and observation.raw_record_id = p_raw_record_id
  for share of observation, raw_record, import_run, source_record;

  if not found then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'current_observation_not_found',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  source_id := context_row.source_id;

  if context_row.run_source_id is distinct from source_id
    or context_row.raw_source_id is distinct from source_id
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'observation_source_mismatch',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if context_row.run_status is distinct from 'running' then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'import_run_not_running',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if context_row.run_metadata -> 'preserveExistingMetadata' is distinct from 'true'::jsonb
    or context_row.run_metadata ->> 'language' is distinct from 'ja'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'import_run_scope_invalid',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if context_row.source_code is distinct from 'pokemon_card_jp_official'
    or context_row.source_type is distinct from 'catalogue'
    or context_row.source_active is distinct from true
    or context_row.source_licence_status is distinct from 'approved'
    or context_row.source_deprecated_at is not null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'official_source_not_approved',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  -- Rights and validation are intentionally read from the current observation.
  -- The retained raw revision is immutable and may have been first captured by
  -- an older run before that run's evidence was approved.
  if context_row.observation_licence_status is distinct from 'approved'
    or context_row.observation_validation_status is distinct from 'valid'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'current_observation_not_approved',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if context_row.raw_deprecated_at is not null
    or context_row.record_type is distinct from 'card'
    or context_row.language_code is distinct from 'ja'
    or pg_catalog.jsonb_typeof(context_row.raw_payload) is distinct from 'object'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'raw_card_revision_invalid',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  provider_card_id := nullif(
    pg_catalog.btrim(context_row.raw_payload ->> 'cardID'),
    ''
  );

  if provider_card_id is null
    or context_row.external_id is distinct from provider_card_id
    or context_row.provider_record_id is distinct from provider_card_id
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'provider_card_identity_invalid',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if context_row.raw_payload ->> 'detailParserVersion'
      is distinct from 'pokemon-card-jp-html-v1'
    or context_row.raw_payload ->> 'variant' is distinct from 'normal'
    or context_row.raw_payload ->> 'finish' is distinct from 'normal'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'official_parser_contract_invalid',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  if pg_catalog.jsonb_typeof(context_row.raw_payload -> 'cardID')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(context_row.raw_payload -> 'name')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(context_row.raw_payload -> 'detailParserVersion')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(context_row.raw_payload -> 'variant')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(context_row.raw_payload -> 'finish')
      is distinct from 'string'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'official_payload_scalar_type_invalid',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  provider_set_code := nullif(pg_catalog.btrim(coalesce(
    case
      when pg_catalog.jsonb_typeof(context_row.raw_payload -> 'set') = 'object'
        then context_row.raw_payload #>> '{set,code}'
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(context_row.raw_payload -> 'set') = 'object'
        then context_row.raw_payload #>> '{set,id}'
      else null
    end,
    context_row.raw_payload ->> 'setCode'
  )), '');

  collector_number := nullif(pg_catalog.btrim(coalesce(
    context_row.raw_payload ->> 'localId',
    context_row.raw_payload ->> 'number'
  )), '');
  native_name := nullif(
    pg_catalog.btrim(context_row.raw_payload ->> 'name'),
    ''
  );

  if provider_set_code is null or collector_number is null or native_name is null then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'required_official_card_metadata_missing',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  normalized_name := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.normalize(native_name, 'NFKC'),
    '[[:space:]]+',
    ' ',
    'g'
  )));
  concept_key := 'pokemon:' || normalized_name;

  if normalized_name = '' then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'normalized_native_name_empty',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  collector_match := pg_catalog.regexp_match(
    collector_number,
    '^([^0-9]*)([0-9]+)(.*)$'
  );

  if collector_match is null then
    collector_number_prefix := null;
    collector_number_sort := null;
    collector_number_suffix := collector_number;
    collector_number_sort_key := pg_catalog.lower(collector_number);
  else
    collector_number_prefix := nullif(collector_match[1], '');
    collector_digits := collector_match[2];
    collector_number_suffix := nullif(collector_match[3], '');
    collector_numeric := collector_digits::numeric;

    if collector_numeric > 2147483647 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'collector_number_sort_overflow',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;

    collector_number_sort := collector_numeric::integer;
    collector_number_sort_key := pg_catalog.lower(
      coalesce(collector_number_prefix, '')
      || pg_catalog.repeat(
        '0',
        greatest(12 - pg_catalog.char_length(collector_digits), 0)
      )
      || collector_digits
      || coalesce(collector_number_suffix, '')
    );
  end if;

  rarity_code := nullif(
    pg_catalog.btrim(context_row.raw_payload ->> 'rarity'),
    ''
  );
  if rarity_code is null or rarity_code ~* '^none$' then
    rarity_code := null;
  else
    rarity_code := nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.lower(rarity_code),
      '[^a-z0-9]+',
      '_',
      'g'
    ), '_'), '');
  end if;

  expected_artwork_key := 'pokemon_card_jp_official:' || provider_card_id;
  image_url := nullif(pg_catalog.btrim(coalesce(
    context_row.raw_payload ->> 'image_url',
    context_row.raw_payload ->> 'imageUrl',
    context_row.raw_payload ->> 'image'
  )), '');
  if image_url ~* '^https://www[.]pokemon-card[.]com(?:/|$)' then
    inserted_artwork_key := expected_artwork_key;
  else
    inserted_artwork_key := null;
  end if;

  -- Lock the provider identity before resolving the canonical set. Calls with
  -- divergent set/collector facts for one provider card cannot proceed to
  -- different canonical locks concurrently.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(source_id, provider_card_id)::text,
    0
  ));

  -- Prefer the current provider set identity. If it does not exist, accept
  -- only one active Pokemon/JA set matching the provider code. Sets are never
  -- created by this function.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where canonical_set.id is not null
        and canonical_set.game_code = 'pokemon'
        and canonical_set.language_code = 'ja'
        and canonical_set.deprecated_at is null
    )::integer,
    (pg_catalog.array_agg(canonical_set.id order by canonical_set.id))[
      1
    ]
  into
    external_set_match_count,
    valid_external_set_match_count,
    resolved_set_id
  from ingest.external_identifiers set_identifier
  left join catalog.sets canonical_set
    on canonical_set.id = set_identifier.set_id
  where set_identifier.source_id = source_id
    and set_identifier.source_entity_type = 'set'
    and set_identifier.external_id = provider_set_code
    and set_identifier.language_code = 'ja'
    and set_identifier.is_current
    and set_identifier.deprecated_at is null;

  if external_set_match_count > 0 then
    if external_set_match_count <> 1 or valid_external_set_match_count <> 1 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_ambiguous',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;

    perform 1
    from ingest.external_identifiers set_identifier
    where set_identifier.source_id = source_id
      and set_identifier.source_entity_type = 'set'
      and set_identifier.external_id = provider_set_code
      and set_identifier.language_code = 'ja'
      and set_identifier.set_id = resolved_set_id
      and set_identifier.is_current
      and set_identifier.deprecated_at is null
    for share;
    if not found then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_ambiguous',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;
  else
    select
      pg_catalog.count(*)::integer,
      (pg_catalog.array_agg(canonical_set.id order by canonical_set.id))[1]
    into set_match_count, resolved_set_id
    from catalog.sets canonical_set
    where canonical_set.game_code = 'pokemon'
      and canonical_set.language_code = 'ja'
      and canonical_set.deprecated_at is null
      and (
        canonical_set.set_code = provider_set_code
        or canonical_set.provider_set_code = provider_set_code
      );

    if set_match_count = 0 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_missing',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;

    if set_match_count <> 1 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_ambiguous',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;
  end if;

  canonical_key := pg_catalog.lower(
    'pokemon:ja:' || resolved_set_id::text || ':' || collector_number || ':normal'
  );

  -- The second lock serializes the canonical natural identity. The provider
  -- lock above is always acquired first.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      'pokemon',
      'ja',
      resolved_set_id,
      collector_number,
      'normal'
    )::text,
    0
  ));

  if external_set_match_count = 0 then
    select
      pg_catalog.count(*)::integer,
      (pg_catalog.array_agg(canonical_set.id order by canonical_set.id))[1]
    into set_match_count, rechecked_set_id
    from catalog.sets canonical_set
    where canonical_set.game_code = 'pokemon'
      and canonical_set.language_code = 'ja'
      and canonical_set.deprecated_at is null
      and (
        canonical_set.set_code = provider_set_code
        or canonical_set.provider_set_code = provider_set_code
      );

    if set_match_count = 0 then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_missing',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;

    if set_match_count <> 1 or rechecked_set_id is distinct from resolved_set_id then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'set_ambiguous',
        'printingId', null,
        'variantId', null,
        'canonicalKey', null
      );
    end if;
  end if;

  -- Recheck the selected set under the identity locks and hold it stable while
  -- the bundle is created.
  perform 1
  from catalog.sets canonical_set
  where canonical_set.id = resolved_set_id
    and canonical_set.game_code = 'pokemon'
    and canonical_set.language_code = 'ja'
    and canonical_set.deprecated_at is null
  for share;
  if not found then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'set_missing',
      'printingId', null,
      'variantId', null,
      'canonicalKey', null
    );
  end if;

  select identifier.*
  into current_identifier
  from ingest.external_identifiers identifier
  where identifier.source_id = source_id
    and identifier.source_entity_type = 'card'
    and identifier.external_id = provider_card_id
    and identifier.language_code = 'ja'
    and identifier.is_current
    and identifier.deprecated_at is null
  for update;
  has_current_identifier := found;

  if has_current_identifier and current_identifier.variant_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'external_identity_conflict',
      'printingId', null,
      'variantId', null,
      'canonicalKey', canonical_key
    );
  end if;

  if exists (
    select 1
    from catalog.card_variants variant
    where variant.canonical_key = canonical_key
      and variant.deprecated_at is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'deprecated_canonical_key_owner',
      'printingId', null,
      'variantId', null,
      'canonicalKey', canonical_key
    );
  end if;

  select
    variant.id,
    variant.printing_id,
    variant.game_code,
    variant.set_id,
    variant.language_code,
    variant.collector_number,
    variant.variant_code,
    variant.finish_code,
    variant.is_default,
    variant.artwork_key,
    printing.deprecated_at as printing_deprecated_at,
    printing.game_code as printing_game_code,
    printing.set_id as printing_set_id,
    printing.language_code as printing_language_code,
    printing.collector_number as printing_collector_number
  into canonical_variant
  from catalog.card_variants variant
  join catalog.card_printings printing
    on printing.id = variant.printing_id
  where variant.canonical_key = canonical_key
    and variant.deprecated_at is null
  for share of variant, printing;

  if found then
    printing_id := canonical_variant.printing_id;
    variant_id := canonical_variant.id;

    if canonical_variant.game_code is distinct from 'pokemon'
      or canonical_variant.set_id is distinct from resolved_set_id
      or canonical_variant.language_code is distinct from 'ja'
      or canonical_variant.collector_number is distinct from collector_number
      or canonical_variant.variant_code is distinct from 'normal'
      -- Historical normal variants may predate explicit finish assignment.
      -- NULL and normal are the only compatible preserved classifications.
      or (
        canonical_variant.finish_code is not null
        and canonical_variant.finish_code <> 'normal'
      )
      or canonical_variant.printing_deprecated_at is not null
      or canonical_variant.printing_game_code is distinct from 'pokemon'
      or canonical_variant.printing_set_id is distinct from resolved_set_id
      or canonical_variant.printing_language_code is distinct from 'ja'
      or canonical_variant.printing_collector_number is distinct from collector_number
      or not (
        canonical_variant.artwork_key is null
        or canonical_variant.artwork_key is not distinct from expected_artwork_key
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'canonical_variant_mismatch',
        'printingId', printing_id,
        'variantId', variant_id,
        'canonicalKey', canonical_key
      );
    end if;

    if has_current_identifier
      and current_identifier.variant_id is distinct from variant_id
    then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'external_identity_conflict',
        'printingId', printing_id,
        'variantId', variant_id,
        'canonicalKey', canonical_key
      );
    end if;

    if has_current_identifier then
      update ingest.external_identifiers identifier
      set
        raw_record_id = p_raw_record_id,
        confidence = 0.98,
        source_updated_at = context_row.observation_source_updated_at
      where identifier.id = current_identifier.id;
    else
      insert into ingest.external_identifiers (
        source_id,
        raw_record_id,
        source_entity_type,
        external_id,
        language_code,
        variant_id,
        confidence,
        source_updated_at
      ) values (
        source_id,
        p_raw_record_id,
        'card',
        provider_card_id,
        'ja',
        variant_id,
        0.98,
        context_row.observation_source_updated_at
      );
    end if;

    insert into audit.ingest_merge_decisions (
      source_id,
      import_run_id,
      raw_record_id,
      request_id,
      decision_type,
      entity_schema,
      entity_table,
      entity_id,
      canonical_key,
      confidence,
      reason,
      proposed_payload,
      existing_payload
    )
    select
      source_id,
      p_import_run_id,
      p_raw_record_id,
      context_row.request_id,
      'skipped',
      'catalog',
      'card_variants',
      variant_id,
      canonical_key,
      0.98,
      'existing_card_metadata_preserved_asset_deferred',
      context_row.raw_payload,
      pg_catalog.jsonb_build_object(
        'printingId', printing_id,
        'variantId', variant_id,
        'canonicalKey', canonical_key
      )
    where not exists (
      select 1
      from audit.ingest_merge_decisions decision
      where decision.source_id = source_id
        and decision.import_run_id = p_import_run_id
        and decision.raw_record_id = p_raw_record_id
        and decision.decision_type = 'skipped'
        and decision.entity_schema = 'catalog'
        and decision.entity_table = 'card_variants'
        and decision.entity_id = variant_id
        and decision.canonical_key = canonical_key
        and decision.reason = 'existing_card_metadata_preserved_asset_deferred'
    );

    return pg_catalog.jsonb_build_object(
      'status', 'preserved',
      'reason', 'existing_canonical_metadata_preserved',
      'printingId', printing_id,
      'variantId', variant_id,
      'canonicalKey', canonical_key
    );
  end if;

  if has_current_identifier then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'external_identity_conflict',
      'printingId', null,
      'variantId', null,
      'canonicalKey', canonical_key
    );
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(printing.id order by printing.id))[1]
  into printing_match_count, printing_id
  from catalog.card_printings printing
  where printing.game_code = 'pokemon'
    and printing.language_code = 'ja'
    and printing.set_id = resolved_set_id
    and printing.collector_number = collector_number
    and printing.deprecated_at is null;

  if printing_match_count > 1 then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'printing_identity_ambiguous',
      'printingId', null,
      'variantId', null,
      'canonicalKey', canonical_key
    );
  end if;

  if printing_id is not null then
    perform 1
    from catalog.card_printings printing
    where printing.id = printing_id
      and printing.deprecated_at is null
    for share;
    if not found then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'printing_identity_changed',
        'printingId', null,
        'variantId', null,
        'canonicalKey', canonical_key
      );
    end if;

    if exists (
      select 1
      from catalog.card_variants sibling
      where sibling.printing_id = printing_id
        and sibling.deprecated_at is null
    ) then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'active_sibling_variant_requires_review',
        'printingId', printing_id,
        'variantId', null,
        'canonicalKey', canonical_key
      );
    end if;

    if exists (
      select 1
      from catalog.card_variants sibling
      where sibling.printing_id = printing_id
        and sibling.variant_code = 'normal'
        and sibling.deprecated_at is not null
    ) then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'deprecated_normal_sibling_requires_review',
        'printingId', printing_id,
        'variantId', null,
        'canonicalKey', canonical_key
      );
    end if;
  else
    select concept.id
    into concept_id
    from catalog.card_concepts concept
    where concept.game_code = 'pokemon'
      and concept.concept_key = concept_key
      and concept.deprecated_at is null
    for share;

    if not found then
      if exists (
        select 1
        from catalog.card_concepts concept
        where concept.game_code = 'pokemon'
          and concept.concept_key = concept_key
          and concept.deprecated_at is not null
      ) then
        return pg_catalog.jsonb_build_object(
          'status', 'conflict',
          'reason', 'deprecated_concept_identity',
          'printingId', null,
          'variantId', null,
          'canonicalKey', canonical_key
        );
      end if;

      insert into catalog.card_concepts (
        game_code,
        concept_key
      ) values (
        'pokemon',
        concept_key
      )
      on conflict (game_code, concept_key) do nothing
      returning id into concept_id;
      inserted_concept := found;

      if not inserted_concept then
        select concept.id
        into concept_id
        from catalog.card_concepts concept
        where concept.game_code = 'pokemon'
          and concept.concept_key = concept_key
          and concept.deprecated_at is null
        for share;

        if not found then
          return pg_catalog.jsonb_build_object(
            'status', 'conflict',
            'reason', 'deprecated_concept_identity',
            'printingId', null,
            'variantId', null,
            'canonicalKey', canonical_key
          );
        end if;
      end if;
    end if;

    if rarity_code is not null then
      select rarity.id
      into rarity_id
      from catalog.rarities rarity
      where rarity.game_code = 'pokemon'
        and rarity.code = rarity_code
        and rarity.deprecated_at is null;
    end if;

    insert into catalog.card_printings (
      game_code,
      set_id,
      language_code,
      card_concept_id,
      collector_number,
      collector_number_prefix,
      collector_number_sort,
      collector_number_suffix,
      collector_number_sort_key,
      native_name,
      english_display_name,
      rarity_id,
      source_updated_at
    ) values (
      'pokemon',
      resolved_set_id,
      'ja',
      concept_id,
      collector_number,
      collector_number_prefix,
      collector_number_sort,
      collector_number_suffix,
      collector_number_sort_key,
      native_name,
      null,
      rarity_id,
      context_row.observation_source_updated_at
    )
    returning id into printing_id;
  end if;

  insert into catalog.card_variants (
    printing_id,
    game_code,
    set_id,
    language_code,
    collector_number,
    variant_code,
    finish_code,
    canonical_key,
    artwork_key,
    is_default,
    source_confidence,
    source_updated_at
  ) values (
    printing_id,
    'pokemon',
    resolved_set_id,
    'ja',
    collector_number,
    'normal',
    'normal',
    canonical_key,
    inserted_artwork_key,
    true,
    0.98,
    context_row.observation_source_updated_at
  )
  returning id into variant_id;

  insert into catalog.card_names (
    printing_id,
    variant_id,
    language_code,
    name_type,
    name,
    normalized_name,
    source_confidence,
    source_updated_at
  ) values (
    printing_id,
    variant_id,
    'ja',
    'native',
    native_name,
    normalized_name,
    0.98,
    context_row.observation_source_updated_at
  );

  insert into ingest.external_identifiers (
    source_id,
    raw_record_id,
    source_entity_type,
    external_id,
    language_code,
    variant_id,
    confidence,
    source_updated_at
  ) values (
    source_id,
    p_raw_record_id,
    'card',
    provider_card_id,
    'ja',
    variant_id,
    0.98,
    context_row.observation_source_updated_at
  );

  insert into audit.ingest_merge_decisions (
    source_id,
    import_run_id,
    raw_record_id,
    request_id,
    decision_type,
    entity_schema,
    entity_table,
    entity_id,
    canonical_key,
    confidence,
    reason,
    proposed_payload,
    existing_payload
  ) values (
    source_id,
    p_import_run_id,
    p_raw_record_id,
    context_row.request_id,
    'created',
    'catalog',
    'card_variants',
    variant_id,
    canonical_key,
    0.98,
    'new_card_variant_from_safe_provider_record',
    context_row.raw_payload,
    '{}'::jsonb
  );

  return pg_catalog.jsonb_build_object(
    'status', 'inserted',
    'reason', 'official_japanese_metadata_bootstrapped',
    'printingId', printing_id,
    'variantId', variant_id,
    'canonicalKey', canonical_key
  );
end;
$function$;

revoke all on function ingest.bootstrap_preserved_official_japanese_card(uuid, uuid)
  from public, anon, authenticated;

grant execute on function ingest.bootstrap_preserved_official_japanese_card(uuid, uuid)
  to service_role;

comment on function ingest.bootstrap_preserved_official_japanese_card(uuid, uuid) is
  'Service-only atomic bootstrap for missing official Japanese normal-card metadata; existing canonical rows are never updated and no assets are created.';
