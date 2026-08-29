-- Reconcile the only safely removable canonical metadata duplicates before
-- enforcing the active identities used by the catalogue importer.
--
-- This migration intentionally does not touch ingest.raw_source_records. Raw
-- provider snapshots have seven downstream reference paths and are handled by
-- a separate dry-run-first maintenance tool.

set lock_timeout = '5s';
set statement_timeout = '2min';

lock table catalog.card_names in share row exclusive mode;
lock table catalog.card_printings in share row exclusive mode;

do $preconditions$
declare
  unexpected_card_name_foreign_keys text;
begin
  select string_agg(
    format('%I.%I.%I', namespace.nspname, relation.relname, constraint_row.conname),
    ', ' order by namespace.nspname, relation.relname, constraint_row.conname
  )
  into unexpected_card_name_foreign_keys
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'catalog.card_names'::regclass;

  if unexpected_card_name_foreign_keys is not null then
    raise exception
      'Refusing card-name reconciliation because foreign keys now reference catalog.card_names: %',
      unexpected_card_name_foreign_keys;
  end if;

  if exists (
    select 1
    from catalog.card_names card_name
    where card_name.deprecated_at is null
    group by
      card_name.card_concept_id,
      card_name.printing_id,
      card_name.variant_id,
      card_name.language_code,
      card_name.name_type,
      card_name.normalized_name
    having count(*) > 1
       and count(distinct card_name.name) > 1
  ) then
    raise exception
      'Refusing card-name reconciliation because one active natural identity has conflicting display names.';
  end if;

  if exists (
    select 1
    from catalog.card_printings printing
    where printing.deprecated_at is null
    group by
      printing.game_code,
      printing.language_code,
      printing.set_id,
      printing.collector_number
    having count(*) > 1
  ) then
    raise exception
      'Refusing active printing identity enforcement because duplicate printings require manual reference reconciliation.';
  end if;
end;
$preconditions$;

with ranked_names as (
  select
    card_name.id as duplicate_candidate_id,
    first_value(card_name.id) over identity_window as survivor_id,
    row_number() over identity_window as identity_rank,
    card_name.card_concept_id,
    card_name.printing_id,
    card_name.variant_id,
    card_name.language_code,
    card_name.name_type,
    card_name.name,
    card_name.normalized_name,
    card_name.source_confidence,
    card_name.source_updated_at
  from catalog.card_names card_name
  where card_name.deprecated_at is null
  window identity_window as (
    partition by
      card_name.card_concept_id,
      card_name.printing_id,
      card_name.variant_id,
      card_name.language_code,
      card_name.name_type,
      card_name.normalized_name
    order by
      card_name.source_confidence desc,
      card_name.source_updated_at desc nulls last,
      card_name.updated_at desc,
      card_name.created_at asc,
      card_name.id asc
    rows between unbounded preceding and unbounded following
  )
),
duplicate_names as (
  select *
  from ranked_names
  where identity_rank > 1
),
audit_rows as (
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
    'migration:20260829163441',
    'migration',
    'catalogue_card_name_duplicate_reconciled',
    'catalog',
    'card_names',
    duplicate_name.duplicate_candidate_id,
    concat_ws(
      ':',
      'catalog.card_names',
      duplicate_name.language_code,
      duplicate_name.name_type,
      duplicate_name.normalized_name
    ),
    jsonb_build_object(
      'duplicateId', duplicate_name.duplicate_candidate_id,
      'survivorId', duplicate_name.survivor_id,
      'cardConceptId', duplicate_name.card_concept_id,
      'printingId', duplicate_name.printing_id,
      'variantId', duplicate_name.variant_id,
      'languageCode', duplicate_name.language_code,
      'nameType', duplicate_name.name_type,
      'name', duplicate_name.name,
      'normalizedName', duplicate_name.normalized_name,
      'sourceConfidence', duplicate_name.source_confidence,
      'sourceUpdatedAt', duplicate_name.source_updated_at
    ),
    'Exact active natural-identity duplicate removed after a foreign-key precondition check.'
  from duplicate_names duplicate_name
  returning entity_id
)
delete from catalog.card_names card_name
using duplicate_names duplicate_name
where card_name.id = duplicate_name.duplicate_candidate_id
  and exists (
    select 1
    from audit_rows audit_row
    where audit_row.entity_id = card_name.id
  );

do $postconditions$
begin
  if exists (
    select 1
    from catalog.card_names card_name
    where card_name.deprecated_at is null
    group by
      card_name.card_concept_id,
      card_name.printing_id,
      card_name.variant_id,
      card_name.language_code,
      card_name.name_type,
      card_name.normalized_name
    having count(*) > 1
  ) then
    raise exception 'Active card-name natural identities remain duplicated after reconciliation.';
  end if;
end;
$postconditions$;

create unique index card_printings_active_natural_identity_uidx
  on catalog.card_printings (
    game_code,
    language_code,
    set_id,
    collector_number
  )
  where deprecated_at is null;

create unique index card_names_active_natural_identity_uidx
  on catalog.card_names (
    card_concept_id,
    printing_id,
    variant_id,
    language_code,
    name_type,
    normalized_name
  ) nulls not distinct
  where deprecated_at is null;

comment on index catalog.card_printings_active_natural_identity_uidx is
  'Allows one active canonical printing per game, language, set and opaque collector number.';

comment on index catalog.card_names_active_natural_identity_uidx is
  'Allows one active normalized name per canonical target, language and name type; null targets compare as equal.';

reset lock_timeout;
reset statement_timeout;
