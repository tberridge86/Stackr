-- Atomically create only genuinely missing official Japanese normal-card
-- identities. Existing catalogue metadata is never updated by this function.

set lock_timeout = '5s';
set statement_timeout = '2min';

create or replace function ingest.bootstrap_official_japanese_card_identity(
  p_source_id uuid,
  p_import_run_id uuid,
  p_raw_record_id uuid,
  p_external_id text,
  p_set_id uuid,
  p_collector_number text,
  p_collector_number_prefix text,
  p_collector_number_sort integer,
  p_collector_number_suffix text,
  p_collector_number_sort_key text,
  p_native_name text,
  p_normalized_name text,
  p_artwork_key text,
  p_source_confidence numeric,
  p_source_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '2min'
as $$
declare
  source_row ingest.sources%rowtype;
  set_row catalog.sets%rowtype;
  scanned_identifier ingest.external_identifiers%rowtype;
  identifier_row ingest.external_identifiers%rowtype;
  verified_identifier ingest.external_identifiers%rowtype;
  canonical_variant catalog.card_variants%rowtype;
  external_variant catalog.card_variants%rowtype;
  target_variant catalog.card_variants%rowtype;
  printing_row catalog.card_printings%rowtype;
  sibling_row catalog.card_variants%rowtype;
  expected_canonical_key text;
  identifier_found boolean := false;
  identifier_count integer := 0;
  invalid_identifier_language boolean := false;
  canonical_found boolean := false;
  printing_found boolean := false;
  printing_created boolean := false;
  variant_created boolean := false;
  sibling_count integer := 0;
begin
  if p_source_id is null
    or p_import_run_id is null
    or p_raw_record_id is null
    or p_set_id is null
    or nullif(pg_catalog.btrim(p_external_id), '') is null
    or nullif(pg_catalog.btrim(p_collector_number), '') is null
    or nullif(pg_catalog.btrim(p_collector_number_sort_key), '') is null
    or nullif(pg_catalog.btrim(p_native_name), '') is null
    or nullif(pg_catalog.btrim(p_normalized_name), '') is null
    or nullif(pg_catalog.btrim(p_artwork_key), '') is null
    or p_source_confidence is null
    or p_source_confidence < 0
    or p_source_confidence > 1
  then
    raise exception using
      errcode = '22023',
      message = 'official_japanese_bootstrap_requires_complete_identity_inputs';
  end if;

  if p_artwork_key <> 'pokemon_card_jp_official:' || p_external_id then
    raise exception using
      errcode = '22023',
      message = 'official_japanese_bootstrap_artwork_identity_mismatch';
  end if;

  select source.*
  into source_row
  from ingest.sources source
  where source.id = p_source_id
  for key share;

  if source_row.id is null
    or source_row.code <> 'pokemon_card_jp_official'
    or source_row.licence_status <> 'approved'
    or not source_row.active
    or source_row.deprecated_at is not null
  then
    raise exception using
      errcode = '22023',
      message = 'official_japanese_bootstrap_source_not_approved';
  end if;

  if not exists (
    select 1
    from ingest.import_runs import_run
    join ingest.raw_source_record_observations observation
      on observation.import_run_id = import_run.id
     and observation.raw_record_id = p_raw_record_id
    join ingest.raw_source_records raw_record
      on raw_record.id = observation.raw_record_id
    where import_run.id = p_import_run_id
      and import_run.source_id = p_source_id
      and import_run.status = 'running'
      and raw_record.source_id = p_source_id
      and raw_record.record_type = 'card'
      and raw_record.external_id = p_external_id
      and raw_record.provider_record_id = p_external_id
      and raw_record.language_code = 'ja'
      and raw_record.licence_status = 'approved'
      and raw_record.validation_status = 'valid'
      and raw_record.deprecated_at is null
      and observation.licence_status = 'approved'
      and observation.validation_status = 'valid'
  ) then
    raise exception using
      errcode = '22023',
      message = 'official_japanese_bootstrap_raw_provenance_not_valid';
  end if;

  select set_record.*
  into set_row
  from catalog.sets set_record
  where set_record.id = p_set_id
    and set_record.game_code = 'pokemon'
    and set_record.language_code = 'ja'
    and set_record.deprecated_at is null
  for key share;

  if set_row.id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'active_japanese_set_not_found'
    );
  end if;

  expected_canonical_key := pg_catalog.lower(
    'pokemon:ja:' || p_set_id::text || ':' || p_collector_number || ':normal'
  );

  -- Every caller takes locks in the same order: provider identity first, then
  -- the schema-defined canonical variant key. This makes retries deterministic
  -- while all set and opaque collector comparisons below remain exact.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(p_source_id, 'card', p_external_id)::text,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    expected_canonical_key,
    0
  ));

  -- The official Japanese source is language-scoped. Lock every live provider
  -- identity before choosing a target so an old NULL/wrong-language link or
  -- historical multiplicity cannot be hidden by a `language_code = 'ja'`
  -- filter and amplified into another current identity.
  for scanned_identifier in
    select identifier.*
    from ingest.external_identifiers identifier
    where identifier.source_id = p_source_id
      and identifier.source_entity_type = 'card'
      and identifier.external_id = p_external_id
      and identifier.is_current
      and identifier.deprecated_at is null
    order by identifier.id
    for update
  loop
    identifier_count := identifier_count + 1;
    identifier_row := scanned_identifier;
    if scanned_identifier.language_code is distinct from 'ja' then
      invalid_identifier_language := true;
    end if;
  end loop;

  if identifier_count > 1 then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'multiple_live_official_provider_identities'
    );
  end if;

  if invalid_identifier_language then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'official_provider_identity_language_mismatch'
    );
  end if;

  identifier_found := identifier_count = 1;

  select variant.*
  into canonical_variant
  from catalog.card_variants variant
  where variant.canonical_key = expected_canonical_key
  for update;
  canonical_found := found;

  if canonical_found and canonical_variant.deprecated_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'canonical_variant_is_deprecated',
      'canonicalKey', expected_canonical_key
    );
  end if;

  if identifier_found then
    if identifier_row.variant_id is null then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'official_identifier_is_not_a_variant',
        'canonicalKey', expected_canonical_key
      );
    end if;

    select variant.*
    into external_variant
    from catalog.card_variants variant
    where variant.id = identifier_row.variant_id
    for update;

    if external_variant.id is null
      or external_variant.deprecated_at is not null
      or external_variant.game_code <> 'pokemon'
      or external_variant.language_code <> 'ja'
      or external_variant.set_id <> p_set_id
      or external_variant.collector_number <> p_collector_number
      or external_variant.variant_code <> 'normal'
      or coalesce(external_variant.finish_code, 'normal') <> 'normal'
      or external_variant.canonical_key <> expected_canonical_key
      or (
        external_variant.artwork_key is not null
        and external_variant.artwork_key <> p_artwork_key
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'official_identifier_target_mismatch',
        'canonicalKey', expected_canonical_key
      );
    end if;
  end if;

  if identifier_found
    and canonical_found
    and identifier_row.variant_id <> canonical_variant.id
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'official_and_canonical_identity_disagree',
      'canonicalKey', expected_canonical_key
    );
  end if;

  if identifier_found then
    target_variant := external_variant;
  elsif canonical_found then
    target_variant := canonical_variant;
  end if;

  if target_variant.id is not null then
    -- A canonical-key hit without a provider identifier must pass the same
    -- structural checks as an identifier hit before the official ID is linked.
    -- Null artwork/finish values are preserved and remain compatible; a
    -- contradictory value is never overwritten by this bootstrap.
    if target_variant.deprecated_at is not null
      or target_variant.game_code <> 'pokemon'
      or target_variant.language_code <> 'ja'
      or target_variant.set_id <> p_set_id
      or target_variant.collector_number <> p_collector_number
      or target_variant.variant_code <> 'normal'
      or coalesce(target_variant.finish_code, 'normal') <> 'normal'
      or target_variant.canonical_key <> expected_canonical_key
      or (
        target_variant.artwork_key is not null
        and target_variant.artwork_key <> p_artwork_key
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'canonical_variant_identity_mismatch',
        'canonicalKey', expected_canonical_key
      );
    end if;

    select printing.*
    into printing_row
    from catalog.card_printings printing
    where printing.id = target_variant.printing_id
    for update;

    if printing_row.id is null
      or printing_row.deprecated_at is not null
      or printing_row.game_code <> 'pokemon'
      or printing_row.language_code <> 'ja'
      or printing_row.set_id <> p_set_id
      or printing_row.collector_number <> p_collector_number
    then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'canonical_printing_identity_mismatch',
        'canonicalKey', expected_canonical_key
      );
    end if;
    printing_found := true;
  else
    select printing.*
    into printing_row
    from catalog.card_printings printing
    where printing.game_code = 'pokemon'
      and printing.language_code = 'ja'
      and printing.set_id = p_set_id
      and printing.collector_number = p_collector_number
      and printing.deprecated_at is null
    order by printing.id
    limit 1
    for update;
    printing_found := found;

    if printing_found then
      for sibling_row in
        select variant.*
        from catalog.card_variants variant
        where variant.printing_id = printing_row.id
          and variant.deprecated_at is null
        order by variant.id
        for update
      loop
        sibling_count := sibling_count + 1;
      end loop;

      if sibling_count > 0 then
        return pg_catalog.jsonb_build_object(
          'status', 'conflict',
          'reason', 'existing_printing_has_noncanonical_active_variant',
          'canonicalKey', expected_canonical_key,
          'printingId', printing_row.id
        );
      end if;
    else
      insert into catalog.card_printings (
        game_code,
        set_id,
        language_code,
        collector_number,
        collector_number_prefix,
        collector_number_sort,
        collector_number_suffix,
        collector_number_sort_key,
        native_name,
        source_updated_at
      ) values (
        'pokemon',
        p_set_id,
        'ja',
        p_collector_number,
        p_collector_number_prefix,
        p_collector_number_sort,
        p_collector_number_suffix,
        p_collector_number_sort_key,
        p_native_name,
        p_source_updated_at
      )
      on conflict (game_code, language_code, set_id, collector_number)
        where deprecated_at is null
      do nothing
      returning * into printing_row;

      if printing_row.id is null then
        select printing.*
        into printing_row
        from catalog.card_printings printing
        where printing.game_code = 'pokemon'
          and printing.language_code = 'ja'
          and printing.set_id = p_set_id
          and printing.collector_number = p_collector_number
          and printing.deprecated_at is null
        for update;
      else
        printing_created := true;
      end if;

      if printing_row.id is null then
        raise exception using
          errcode = '40001',
          message = 'official_japanese_bootstrap_printing_race_not_resolved';
      end if;
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
      printing_row.id,
      'pokemon',
      p_set_id,
      'ja',
      p_collector_number,
      'normal',
      'normal',
      expected_canonical_key,
      p_artwork_key,
      true,
      p_source_confidence,
      p_source_updated_at
    )
    returning * into target_variant;
    variant_created := true;
  end if;

  -- Preserve every existing native-name value. A missing name row may be
  -- created, but a different existing name is never supplemented or replaced.
  if not exists (
    select 1
    from catalog.card_names card_name
    where card_name.variant_id = target_variant.id
      and card_name.language_code = 'ja'
      and card_name.name_type = 'native'
      and card_name.deprecated_at is null
  ) then
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
      printing_row.id,
      target_variant.id,
      'ja',
      'native',
      p_native_name,
      p_normalized_name,
      p_source_confidence,
      p_source_updated_at
    )
    on conflict do nothing;
  end if;

  if not identifier_found then
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
      p_source_id,
      p_raw_record_id,
      'card',
      p_external_id,
      'ja',
      target_variant.id,
      p_source_confidence,
      p_source_updated_at
    )
    on conflict do nothing;
  end if;

  select identifier.*
  into verified_identifier
  from ingest.external_identifiers identifier
  where identifier.source_id = p_source_id
    and identifier.source_entity_type = 'card'
    and identifier.external_id = p_external_id
    and identifier.language_code = 'ja'
    and identifier.is_current
    and identifier.deprecated_at is null
  order by identifier.id
  limit 1
  for update;

  if verified_identifier.id is null
    or verified_identifier.variant_id <> target_variant.id
  then
    raise exception using
      errcode = '23505',
      message = 'official_japanese_bootstrap_external_identity_race';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', case when variant_created then 'created' else 'existing' end,
    'reason', case
      when variant_created then 'missing_official_japanese_identity_created'
      else 'exact_official_japanese_identity_preserved'
    end,
    'setId', p_set_id,
    'printingId', printing_row.id,
    'variantId', target_variant.id,
    'canonicalKey', expected_canonical_key,
    'printingCreated', printing_created,
    'variantCreated', variant_created
  );
end;
$$;

revoke all on function ingest.bootstrap_official_japanese_card_identity(
  uuid, uuid, uuid, text, uuid, text, text, integer, text, text, text, text,
  text, numeric, timestamptz
) from public, anon, authenticated;

grant execute on function ingest.bootstrap_official_japanese_card_identity(
  uuid, uuid, uuid, text, uuid, text, text, integer, text, text, text, text,
  text, numeric, timestamptz
) to service_role;

comment on function ingest.bootstrap_official_japanese_card_identity(
  uuid, uuid, uuid, text, uuid, text, text, integer, text, text, text, text,
  text, numeric, timestamptz
) is
  'Atomically creates only a missing official Japanese normal printing, variant, native name and provider identity; exact existing metadata is preserved.';

reset lock_timeout;
reset statement_timeout;
