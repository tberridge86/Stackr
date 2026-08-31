#!/usr/bin/env node
import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './deploy/prepare-postgres-urls.mjs';
import { createVerifiedSupabasePostgresClient } from './deploy/verified-supabase-postgres.mjs';

export const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
export const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
export const EXPECTED_EVIDENCE_DIGEST = 'ea75baffe78189b9b77a09219c04755d28144bd61783b2ae859db358108f2717';
export const EXPECTED_SCOPE = Object.freeze({
  total: 9_147,
  en: 8_388,
  ja: 618,
  zhCn: 141,
  targetAssets: 8_885,
  initiallyNotPublic: 1,
});
export const MAX_BATCH_SIZE = 500;
export const DEFAULT_BATCH_SIZE = 100;

export const COPIED_OBJECT_FIELDS = Object.freeze([
  'url',
  'storage_provider',
  'storage_bucket',
  'storage_key',
  'storage_path',
  'content_sha256',
  'sha256',
  'perceptual_hash',
  'mime_type',
  'width',
  'height',
  'byte_size',
  'derivative_list',
  'cache_control',
  'archival_storage_key',
  'last_verified_at',
]);

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const DUPLICATE_REASON_PATTERN = `^duplicate_content:${UUID_PATTERN}$`;
const REQUIRED_DERIVATIVE_ROLES_SQL = "(values ('card-grid'), ('search-result'), ('detail-page'))";
const EVENT_TYPE = 'catalogue_card_image_duplicate_alias_resolved';
const REQUEST_ID = `catalogue-card-image-alias-repair:${EXPECTED_EVIDENCE_DIGEST.slice(0, 16)}`;

export const EXPECTED_STORAGE_INDEX_DEFINITION =
  'CREATE INDEX assets_storage_object_idx ON catalog.assets USING btree (storage_provider, storage_bucket, storage_key) WHERE ((storage_key IS NOT NULL) AND (deleted_at IS NULL))';
export const EXPECTED_STORAGE_TRIGGER_DEFINITION =
  'CREATE TRIGGER enforce_shared_asset_storage_object_identity BEFORE INSERT OR UPDATE OF asset_type, url, storage_provider, storage_bucket, storage_key, storage_path, content_sha256, sha256, perceptual_hash, mime_type, width, height, byte_size, derivative_list, cache_control, archival_storage_key, deleted_at ON catalog.assets FOR EACH ROW EXECUTE FUNCTION catalog.enforce_shared_asset_storage_object_identity()';
export const EXPECTED_STORAGE_TRIGGER_FUNCTION_SHA256 =
  '487169d68be3a5271a4ac0aa6baea37835c4c5ee656c74ddb40c4141fb0e57ba';

function argument(argv, name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function boundedInteger(value, fallback, min, max, label) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function optionalUuid(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (!new RegExp(`^${UUID_PATTERN}$`).test(normalized)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return normalized;
}

export function parseAliasRepairOptions(argv = []) {
  if (hasFlag(argv, 'apply') && (hasFlag(argv, 'dry-run') || hasFlag(argv, 'dryRun'))) {
    throw new Error('--apply cannot be combined with a dry-run flag.');
  }
  return {
    help: hasFlag(argv, 'help') || hasFlag(argv, 'h'),
    target: argument(argv, 'target'),
    apply: hasFlag(argv, 'apply'),
    afterId: optionalUuid(
      argument(argv, 'after-id', argument(argv, 'afterId')),
      '--after-id',
    ),
    limit: boundedInteger(
      argument(argv, 'limit', String(DEFAULT_BATCH_SIZE)),
      DEFAULT_BATCH_SIZE,
      1,
      MAX_BATCH_SIZE,
      '--limit',
    ),
  };
}

export function assertStagingAliasRepairTarget({ target, projectRef, connectionString }) {
  if (target !== 'staging') {
    throw new Error('Card-image alias repair requires explicit --target=staging.');
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`SUPABASE_PROJECT_REF must equal staging project ${STAGING_PROJECT_REF}.`);
  }
  const rawConnectionString = String(connectionString ?? '').trim();
  if (rawConnectionString.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`Card-image alias repair refuses production project ${PRODUCTION_PROJECT_REF}.`);
  }
  try {
    const normalized = new URL(normalizePostgresUrl(rawConnectionString, STAGING_PROJECT_REF).normalized);
    if (normalized.hostname.endsWith('.pooler.supabase.com')
      && (!normalized.port || normalized.port === '5432')) {
      normalized.port = '6543';
    }
    return normalized.toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Staging database URL failed closed: ${message}.`);
  }
}

function derivativeVerificationSql(assetAlias) {
  return `
    jsonb_typeof(${assetAlias}.derivative_list) = 'array'
    and not exists (
      select 1
      from ${REQUIRED_DERIVATIVE_ROLES_SQL} required(role)
      where not exists (
        select 1
        from jsonb_array_elements(${assetAlias}.derivative_list) derivative
        join storage.objects derivative_object
          on derivative_object.bucket_id = derivative->>'storageBucket'
         and derivative_object.name = derivative->>'storageKey'
        where derivative->>'role' = required.role
          and derivative->>'storageProvider' = 'supabase_storage'
          and derivative->>'storageBucket' = 'stackr-catalogue-public'
          and coalesce(derivative->>'storageKey', '') <> ''
          and coalesce(derivative->>'mimeType', '') <> ''
          and coalesce((derivative->>'width')::integer, 0) > 0
          and coalesce((derivative->>'height')::integer, 0) > 0
          and coalesce((derivative->>'byteSize')::bigint, 0) > 0
          and derivative->>'contentSha256' ~ '^[0-9a-f]{64}$'
          and coalesce(derivative->>'cacheControl', '') <> ''
      )
    )`;
}

function targetVerificationSql(targetAlias, contentHashSql) {
  return `
    ${targetAlias}.asset_type = 'card_image'
    and ${targetAlias}.deprecated_at is null
    and ${targetAlias}.deleted_at is null
    and ${targetAlias}.storage_provider = 'supabase_storage'
    and ${targetAlias}.storage_bucket = 'stackr-catalogue-public'
    and ${targetAlias}.storage_key is not null
    and ${targetAlias}.storage_path is not null
    and ${targetAlias}.url is not null
    and ${targetAlias}.content_sha256 = ${contentHashSql}
    and ${targetAlias}.sha256 is not null
    and ${targetAlias}.perceptual_hash is not null
    and ${targetAlias}.mime_type is not null
    and ${targetAlias}.width is not null
    and ${targetAlias}.height is not null
    and ${targetAlias}.byte_size is not null
    and ${targetAlias}.cache_control is not null
    and ${targetAlias}.archival_storage_key is not null
    and ${targetAlias}.last_verified_at is not null
    and ${targetAlias}.rights_status = 'approved'
    and ${targetAlias}.permission_status = 'approved'
    and ${targetAlias}.publicly_servable = true
    and ${targetAlias}.asset_visibility = 'public_catalogue'
    and ${targetAlias}.retention_status = 'active'
    and exists (
      select 1
      from storage.objects original_object
      where original_object.bucket_id = ${targetAlias}.storage_bucket
        and original_object.name = ${targetAlias}.storage_key
    )
    and ${derivativeVerificationSql(targetAlias)}`;
}

function verifiedPendingCteSql({ planned = false } = {}) {
  const plannedJoin = planned
    ? `join planned plan
        on plan.duplicate_asset_id = duplicate.id
       and plan.target_asset_id = target.id
       and plan.duplicate_updated_at = duplicate.updated_at
       and plan.target_updated_at = target.updated_at
       and plan.previous_unavailable_reason = duplicate.unavailable_reason`
    : '';
  return `
verified_pending as (
  select
    duplicate.id as duplicate_asset_id,
    target.id as target_asset_id,
    variant.language_code,
    variant.canonical_key,
    duplicate.updated_at as duplicate_updated_at,
    target.updated_at as target_updated_at,
    duplicate.unavailable_reason as previous_unavailable_reason,
    duplicate.publicly_servable as previous_publicly_servable,
    duplicate.content_sha256 as duplicate_sha256,
    target.url,
    target.storage_provider,
    target.storage_bucket,
    target.storage_key,
    target.storage_path,
    target.content_sha256,
    target.sha256,
    target.perceptual_hash,
    target.mime_type,
    target.width,
    target.height,
    target.byte_size,
    target.derivative_list,
    target.cache_control,
    target.archival_storage_key,
    target.last_verified_at
  from catalog.assets duplicate
  join catalog.card_variants variant
    on variant.id = duplicate.variant_id
   and variant.language_code in ('en', 'ja', 'zh-cn')
   and variant.deprecated_at is null
   and variant.native_image_status = 'available'
   and variant.same_artwork_as_variant_id is null
  join ingest.sources source
    on source.id = duplicate.source_id
   and source.code = 'tcgdex'
   and source.active = true
   and source.deprecated_at is null
  join catalog.assets target
    on target.id::text = substring(
      duplicate.unavailable_reason
      from '^duplicate_content:(${UUID_PATTERN})$'
    )
  ${plannedJoin}
  where duplicate.asset_type = 'card_image'
    and duplicate.deprecated_at is null
    and duplicate.deleted_at is null
    and duplicate.storage_provider = 'unavailable'
    and duplicate.unavailable_reason ~ '${DUPLICATE_REASON_PATTERN}'
    and duplicate.content_sha256 is not null
    and duplicate.rights_status = 'approved'
    and duplicate.permission_status = 'approved'
    and duplicate.asset_visibility = 'public_catalogue'
    and duplicate.retention_status = 'unavailable'
    and duplicate.externally_referenced = false
    and duplicate.publicly_servable is not null
    and ${targetVerificationSql('target', 'duplicate.content_sha256')}
    and not exists (
      select 1
      from catalog.assets ready
      join catalog.card_variants ready_variant
        on ready_variant.id = ready.variant_id
       and ready_variant.deprecated_at is null
       and ready_variant.language_code = variant.language_code
       and ready_variant.canonical_key = variant.canonical_key
      where ready.asset_type = 'card_image'
        and ready.deprecated_at is null
        and ready.deleted_at is null
        and ready.rights_status = 'approved'
        and ready.permission_status = 'approved'
        and ready.publicly_servable = true
        and ready.storage_provider = 'supabase_storage'
        and ready.storage_bucket is not null
        and ready.storage_key is not null
        and ready.content_sha256 is not null
        and ready.derivative_list @> '[
          {"role":"card-grid"},
          {"role":"search-result"},
          {"role":"detail-page"}
        ]'::jsonb
    )
)`;
}

function completedScopeCteSql() {
  return `
latest_completed_events as (
  select distinct on (event.entity_id)
    event.entity_id,
    event.event_payload
  from audit.catalogue_events event
  where event.entity_schema = 'catalog'
    and event.entity_table = 'assets'
    and event.event_type = '${EVENT_TYPE}'
    and event.event_payload->>'repairEvidenceDigest' = '${EXPECTED_EVIDENCE_DIGEST}'
    and event.event_payload->>'targetAssetId' ~ '^${UUID_PATTERN}$'
  order by event.entity_id, event.created_at desc, event.id desc
),
completed_scope as (
  select
    duplicate.id as duplicate_asset_id,
    target.id as target_asset_id,
    variant.language_code,
    variant.canonical_key,
    duplicate.content_sha256 as duplicate_sha256,
    target.storage_bucket,
    target.storage_key,
    case latest_event.event_payload->>'previousPubliclyServable'
      when 'true' then true
      when 'false' then false
      else null
    end as previous_publicly_servable
  from catalog.assets duplicate
  join catalog.card_variants variant
    on variant.id = duplicate.variant_id
   and variant.language_code in ('en', 'ja', 'zh-cn')
   and variant.deprecated_at is null
   and variant.native_image_status = 'available'
   and variant.same_artwork_as_variant_id is null
  join ingest.sources source
    on source.id = duplicate.source_id
   and source.code = 'tcgdex'
   and source.active = true
   and source.deprecated_at is null
  join latest_completed_events latest_event on latest_event.entity_id = duplicate.id
  join catalog.assets target
    on target.id = (latest_event.event_payload->>'targetAssetId')::uuid
  where duplicate.asset_type = 'card_image'
    and duplicate.deprecated_at is null
    and duplicate.deleted_at is null
    and duplicate.storage_provider = 'supabase_storage'
    and duplicate.unavailable_reason is null
    and duplicate.rights_status = 'approved'
    and duplicate.permission_status = 'approved'
    and duplicate.publicly_servable = true
    and duplicate.asset_visibility = 'public_catalogue'
    and duplicate.retention_status = 'active'
    and duplicate.externally_referenced = false
    and latest_event.event_payload->>'previousUnavailableReason' = concat('duplicate_content:', target.id::text)
    and latest_event.event_payload->>'previousPubliclyServable' in ('true', 'false')
    and ${targetVerificationSql('target', 'duplicate.content_sha256')}
    and duplicate.url is not distinct from target.url
    and duplicate.storage_provider is not distinct from target.storage_provider
    and duplicate.storage_bucket is not distinct from target.storage_bucket
    and duplicate.storage_key is not distinct from target.storage_key
    and duplicate.storage_path is not distinct from target.storage_path
    and duplicate.content_sha256 is not distinct from target.content_sha256
    and duplicate.sha256 is not distinct from target.sha256
    and duplicate.perceptual_hash is not distinct from target.perceptual_hash
    and duplicate.mime_type is not distinct from target.mime_type
    and duplicate.width is not distinct from target.width
    and duplicate.height is not distinct from target.height
    and duplicate.byte_size is not distinct from target.byte_size
    and duplicate.derivative_list is not distinct from target.derivative_list
    and duplicate.cache_control is not distinct from target.cache_control
    and duplicate.archival_storage_key is not distinct from target.archival_storage_key
)`;
}

export const STORAGE_SHARING_PREFLIGHT_SQL = `
select
  coalesce((
    select indexdef
    from pg_indexes
    where schemaname = 'catalog'
      and tablename = 'assets'
      and indexname = 'assets_storage_object_idx'
  ), '') as index_definition,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'catalog'
      and tablename = 'assets'
      and indexname = 'assets_storage_object_uidx'
  ) as unique_index_present,
  coalesce((
    select pg_get_triggerdef(trigger.oid)
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'catalog'
      and relation.relname = 'assets'
      and trigger.tgname = 'enforce_shared_asset_storage_object_identity'
      and not trigger.tgisinternal
  ), '') as trigger_definition,
  coalesce((
    select trigger.tgenabled::text
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'catalog'
      and relation.relname = 'assets'
      and trigger.tgname = 'enforce_shared_asset_storage_object_identity'
      and not trigger.tgisinternal
  ), '') as trigger_enabled,
  encode(digest(
    pg_get_functiondef('catalog.enforce_shared_asset_storage_object_identity()'::regprocedure),
    'sha256'
  ), 'hex') as trigger_function_sha256;
`;

export const ALIAS_REPAIR_PLAN_SQL = `
with
${verifiedPendingCteSql()},
${completedScopeCteSql()},
evidence_rows as (
  select
    duplicate_asset_id,
    target_asset_id,
    language_code,
    canonical_key,
    duplicate_sha256,
    storage_bucket,
    storage_key,
    previous_publicly_servable,
    true as pending
  from verified_pending
  union all
  select
    duplicate_asset_id,
    target_asset_id,
    language_code,
    canonical_key,
    duplicate_sha256,
    storage_bucket,
    storage_key,
    previous_publicly_servable,
    false as pending
  from completed_scope
), evidence_summary as (
  select
    count(*)::bigint as total,
    count(*) filter (where language_code = 'en')::bigint as en,
    count(*) filter (where language_code = 'ja')::bigint as ja,
    count(*) filter (where language_code = 'zh-cn')::bigint as zh_cn,
    count(distinct target_asset_id)::bigint as target_assets,
    count(*) filter (where not previous_publicly_servable)::bigint as initially_not_public,
    count(*) filter (where pending)::bigint as pending_total,
    encode(digest(string_agg(
      duplicate_asset_id::text || '|' || target_asset_id::text || '|' || language_code || '|' ||
      canonical_key || '|' || duplicate_sha256 || '|' || storage_bucket || '|' || storage_key,
      E'\\n' order by duplicate_asset_id
    ), 'sha256'), 'hex') as evidence_digest
  from evidence_rows
), pending_page as (
  select
    duplicate_asset_id,
    target_asset_id,
    language_code,
    canonical_key,
    duplicate_updated_at,
    target_updated_at,
    previous_unavailable_reason,
    previous_publicly_servable,
    duplicate_sha256,
    storage_bucket,
    storage_key
  from verified_pending
  where ($1::uuid is null or duplicate_asset_id > $1::uuid)
  order by duplicate_asset_id
  limit ($2::integer + 1)
)
select
  to_jsonb(evidence_summary) as evidence,
  coalesce((
    select jsonb_agg(to_jsonb(pending_page) order by duplicate_asset_id)
    from pending_page
  ), '[]'::jsonb) as pending_page
from evidence_summary;
`;

export const APPLY_ALIAS_REPAIR_SQL = `
with
planned as (
  select *
  from jsonb_to_recordset($1::jsonb) as planned_row(
    duplicate_asset_id uuid,
    target_asset_id uuid,
    duplicate_updated_at timestamptz,
    target_updated_at timestamptz,
    previous_unavailable_reason text
  )
),
${verifiedPendingCteSql({ planned: true })},
updated as (
  update catalog.assets duplicate
  set
    url = repair.url,
    storage_provider = repair.storage_provider,
    storage_bucket = repair.storage_bucket,
    storage_key = repair.storage_key,
    storage_path = repair.storage_path,
    content_sha256 = repair.content_sha256,
    sha256 = repair.sha256,
    perceptual_hash = repair.perceptual_hash,
    mime_type = repair.mime_type,
    width = repair.width,
    height = repair.height,
    byte_size = repair.byte_size,
    derivative_list = repair.derivative_list,
    cache_control = repair.cache_control,
    archival_storage_key = repair.archival_storage_key,
    last_verified_at = repair.last_verified_at,
    externally_referenced = false,
    publicly_servable = true,
    unavailable_reason = null,
    retention_status = 'active',
    asset_visibility = 'public_catalogue',
    updated_at = clock_timestamp()
  from verified_pending repair
  where duplicate.id = repair.duplicate_asset_id
    and duplicate.updated_at = repair.duplicate_updated_at
    and duplicate.unavailable_reason = repair.previous_unavailable_reason
  returning
    duplicate.id,
    duplicate.url,
    duplicate.storage_provider,
    duplicate.storage_bucket,
    duplicate.storage_key,
    duplicate.storage_path,
    duplicate.content_sha256,
    duplicate.sha256,
    duplicate.perceptual_hash,
    duplicate.mime_type,
    duplicate.width,
    duplicate.height,
    duplicate.byte_size,
    duplicate.derivative_list,
    duplicate.cache_control,
    duplicate.archival_storage_key,
    duplicate.last_verified_at,
    duplicate.externally_referenced,
    duplicate.publicly_servable,
    duplicate.unavailable_reason,
    duplicate.retention_status,
    duplicate.asset_visibility
), audit_insert as (
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
    '${REQUEST_ID}',
    'catalogue_repair_cli',
    '${EVENT_TYPE}',
    'catalog',
    'assets',
    repair.duplicate_asset_id,
    repair.canonical_key,
    jsonb_build_object(
      'targetAssetId', repair.target_asset_id,
      'languageCode', repair.language_code,
      'contentSha256', repair.content_sha256,
      'storageBucket', repair.storage_bucket,
      'storageKey', repair.storage_key,
      'previousUnavailableReason', repair.previous_unavailable_reason,
      'previousPubliclyServable', repair.previous_publicly_servable,
      'repairEvidenceDigest', '${EXPECTED_EVIDENCE_DIGEST}',
      'storageObjectReused', true,
      'storageObjectBytesRewritten', false,
      'copiedFields', to_jsonb(array[
        ${COPIED_OBJECT_FIELDS.map((field) => `'${field}'`).join(', ')}
      ]::text[])
    ),
    'Exact duplicate card image now reuses a verified immutable staging Storage object; source provenance remains on the alias asset.'
  from verified_pending repair
  join updated on updated.id = repair.duplicate_asset_id
  returning entity_id
), change_insert as (
  insert into catalog.catalogue_change_log (
    entity_schema,
    entity_table,
    entity_id,
    change_type,
    mobile_syncable,
    public_change_summary
  )
  select
    'catalog',
    'assets',
    repair.duplicate_asset_id,
    'update',
    true,
    jsonb_build_object(
      'languageCode', repair.language_code,
      'storageObjectReused', true,
      'repairEvidenceDigest', '${EXPECTED_EVIDENCE_DIGEST}'
    )
  from verified_pending repair
  join updated on updated.id = repair.duplicate_asset_id
  returning entity_id
), postconditions as (
  select count(*) filter (where
    updated.url is distinct from repair.url
    or updated.storage_provider is distinct from repair.storage_provider
    or updated.storage_bucket is distinct from repair.storage_bucket
    or updated.storage_key is distinct from repair.storage_key
    or updated.storage_path is distinct from repair.storage_path
    or updated.content_sha256 is distinct from repair.content_sha256
    or updated.sha256 is distinct from repair.sha256
    or updated.perceptual_hash is distinct from repair.perceptual_hash
    or updated.mime_type is distinct from repair.mime_type
    or updated.width is distinct from repair.width
    or updated.height is distinct from repair.height
    or updated.byte_size is distinct from repair.byte_size
    or updated.derivative_list is distinct from repair.derivative_list
    or updated.cache_control is distinct from repair.cache_control
    or updated.archival_storage_key is distinct from repair.archival_storage_key
    or updated.last_verified_at is distinct from repair.last_verified_at
    or updated.externally_referenced
    or not updated.publicly_servable
    or updated.unavailable_reason is not null
    or updated.retention_status <> 'active'
    or updated.asset_visibility <> 'public_catalogue'
  )::bigint as failures
  from updated
  join verified_pending repair on repair.duplicate_asset_id = updated.id
)
select
  (select count(*)::bigint from planned) as planned_count,
  (select count(*)::bigint from updated) as updated_count,
  (select count(*)::bigint from audit_insert) as audit_count,
  (select count(*)::bigint from change_insert) as change_log_count,
  (select failures from postconditions) as postcondition_failures;
`;

export function assertStorageSharingContract(row) {
  if (!row || row.index_definition !== EXPECTED_STORAGE_INDEX_DEFINITION) {
    throw new Error('Staging shared-Storage index contract does not match the audited non-unique index.');
  }
  if (row.unique_index_present !== false) {
    throw new Error('Staging unexpectedly has the production unique Storage-object index.');
  }
  if (row.trigger_definition !== EXPECTED_STORAGE_TRIGGER_DEFINITION || row.trigger_enabled !== 'O') {
    throw new Error('Staging shared-Storage identity trigger is missing, changed, or disabled.');
  }
  if (row.trigger_function_sha256 !== EXPECTED_STORAGE_TRIGGER_FUNCTION_SHA256) {
    throw new Error('Staging shared-Storage identity trigger function has changed.');
  }
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}.`);
  return parsed;
}

export function assertExactAliasEvidence(rawEvidence) {
  const evidence = {
    total: integer(rawEvidence?.total, 'total evidence count'),
    en: integer(rawEvidence?.en, 'English evidence count'),
    ja: integer(rawEvidence?.ja, 'Japanese evidence count'),
    zhCn: integer(rawEvidence?.zh_cn, 'Simplified Chinese evidence count'),
    targetAssets: integer(rawEvidence?.target_assets, 'target asset count'),
    initiallyNotPublic: integer(rawEvidence?.initially_not_public, 'initial non-public count'),
    pendingTotal: integer(rawEvidence?.pending_total, 'pending evidence count'),
    evidenceDigest: String(rawEvidence?.evidence_digest ?? ''),
  };
  for (const field of ['total', 'en', 'ja', 'zhCn', 'targetAssets', 'initiallyNotPublic']) {
    if (evidence[field] !== EXPECTED_SCOPE[field]) {
      throw new Error(`Alias-repair evidence drift for ${field}: expected ${EXPECTED_SCOPE[field]}, got ${evidence[field]}.`);
    }
  }
  if (evidence.evidenceDigest !== EXPECTED_EVIDENCE_DIGEST) {
    throw new Error(`Alias-repair evidence digest drift: ${evidence.evidenceDigest || 'missing'}.`);
  }
  if (evidence.pendingTotal > evidence.total) throw new Error('Pending alias count exceeds the pinned scope.');
  return evidence;
}

function compareUuid(left, right) {
  return left.localeCompare(right, 'en');
}

export function summarisePendingPage(rawRows, limit) {
  if (!Array.isArray(rawRows)) throw new Error('Pending page must be an array.');
  const seen = new Set();
  for (let index = 0; index < rawRows.length; index += 1) {
    const id = optionalUuid(rawRows[index]?.duplicate_asset_id, 'duplicate asset ID');
    if (!id || seen.has(id)) throw new Error('Pending page contains a missing or duplicate asset ID.');
    if (index > 0 && compareUuid(rawRows[index - 1].duplicate_asset_id, id) >= 0) {
      throw new Error('Pending page is not in deterministic UUID order.');
    }
    seen.add(id);
  }
  const candidates = rawRows.slice(0, limit);
  return {
    candidates,
    cursor: {
      nextAfterId: candidates.at(-1)?.duplicate_asset_id ?? null,
      exhausted: rawRows.length <= limit,
    },
  };
}

function plannedPayload(candidates) {
  return candidates.map((candidate) => ({
    duplicate_asset_id: candidate.duplicate_asset_id,
    target_asset_id: candidate.target_asset_id,
    duplicate_updated_at: candidate.duplicate_updated_at,
    target_updated_at: candidate.target_updated_at,
    previous_unavailable_reason: candidate.previous_unavailable_reason,
  }));
}

function assertApplyResult(row, expectedCount) {
  const result = {
    planned: integer(row?.planned_count, 'planned apply count'),
    updated: integer(row?.updated_count, 'updated apply count'),
    audited: integer(row?.audit_count, 'audit insert count'),
    changeLogged: integer(row?.change_log_count, 'change-log insert count'),
    postconditionFailures: integer(row?.postcondition_failures, 'postcondition failure count'),
  };
  if (
    result.planned !== expectedCount
    || result.updated !== expectedCount
    || result.audited !== expectedCount
    || result.changeLogged !== expectedCount
    || result.postconditionFailures !== 0
  ) {
    throw new Error(`Alias repair optimistic apply mismatch: ${JSON.stringify(result)}.`);
  }
  return result;
}

export async function executeAliasRepairTransaction(database, { apply = false, afterId = null, limit = DEFAULT_BATCH_SIZE } = {}) {
  let transactionOpen = false;
  try {
    await database.query(apply
      ? 'begin transaction isolation level repeatable read'
      : 'begin transaction isolation level repeatable read read only');
    transactionOpen = true;
    await database.query("set local lock_timeout = '5s'");
    await database.query("set local statement_timeout = '180s'");

    if (apply) {
      const lock = await database.query(
        "select pg_try_advisory_xact_lock(hashtextextended('stackr-card-image-duplicate-alias-repair-v1', 0)) as acquired",
      );
      if (lock.rows[0]?.acquired !== true) throw new Error('Another staging alias repair transaction is active.');
    }

    const contractResult = await database.query(STORAGE_SHARING_PREFLIGHT_SQL);
    assertStorageSharingContract(contractResult.rows[0]);

    const planResult = await database.query(ALIAS_REPAIR_PLAN_SQL, [afterId, limit]);
    const evidence = assertExactAliasEvidence(planResult.rows[0]?.evidence);
    const page = summarisePendingPage(planResult.rows[0]?.pending_page ?? [], limit);

    let applied = {
      planned: page.candidates.length,
      updated: 0,
      audited: 0,
      changeLogged: 0,
      postconditionFailures: 0,
    };
    if (apply && page.candidates.length > 0) {
      const applyResult = await database.query(
        APPLY_ALIAS_REPAIR_SQL,
        [JSON.stringify(plannedPayload(page.candidates))],
      );
      applied = assertApplyResult(applyResult.rows[0], page.candidates.length);
    }

    await database.query('commit');
    transactionOpen = false;
    return {
      schemaVersion: 1,
      ok: true,
      command: 'repair-card-image-duplicate-content-aliases',
      projectRef: STAGING_PROJECT_REF,
      target: 'staging',
      dryRun: !apply,
      storageBytesRead: 0,
      storageBytesWritten: 0,
      range: { afterId },
      limit,
      evidence,
      candidates: page.candidates,
      cursor: page.cursor,
      applied,
      pendingAfterExpected: evidence.pendingTotal - applied.updated,
    };
  } catch (error) {
    if (transactionOpen) await database.query('rollback').catch(() => undefined);
    throw error;
  }
}

function printHelp() {
  console.log(`StackR staging card-image duplicate alias repair

Reuses verified, immutable Supabase Storage objects and derivative metadata for
the exact evidence-pinned duplicate_content card-image aliases. It never reads,
downloads, uploads, or rewrites Storage bytes. The default mode is read-only.

Required environment:
  SUPABASE_PROJECT_REF=${STAGING_PROJECT_REF}
  SUPABASE_STAGING_DB_URL=<canonical staging pooler URL>

Examples:
  node scripts/repair-card-image-duplicate-content-aliases.mjs --target=staging --limit=100
  node scripts/repair-card-image-duplicate-content-aliases.mjs --target=staging --apply --limit=100
  node scripts/repair-card-image-duplicate-content-aliases.mjs --target=staging --after-id=<uuid>

Options:
  --target=staging   Required fail-closed target.
  --apply            Apply one optimistic database batch; omitted means dry-run.
  --after-id=<uuid>  Deterministic cursor over duplicate asset UUIDs.
  --limit=<number>   Rows in this run, default ${DEFAULT_BATCH_SIZE}, max ${MAX_BATCH_SIZE}.
`);
}

async function main() {
  const options = parseAliasRepairOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const connectionString = assertStagingAliasRepairTarget({
    target: options.target,
    projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
    connectionString: process.env.SUPABASE_STAGING_DB_URL ?? '',
  });
  const database = createVerifiedSupabasePostgresClient(
    connectionString,
    'stackr-card-image-duplicate-alias-repair',
  );
  await database.connect();
  try {
    const report = await executeAliasRepairTransaction(database, options);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await database.end();
  }
}

const isCli = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      command: 'repair-card-image-duplicate-content-aliases',
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  });
}
