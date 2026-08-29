#!/usr/bin/env node
import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVerifiedSupabasePostgresClient } from './deploy/verified-supabase-postgres.mjs';

export const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
export const FOUR_LANGUAGE_CODES = Object.freeze(['en', 'ja', 'zh-cn', 'ko']);

const REPORT_SCHEMA_VERSION = 'stackr-four-language-catalogue-progress-v1.0.0';
const PHYSICAL_STORAGE_PROVIDERS = "'supabase_storage', 's3_compatible', 'local_dev'";
const LANGUAGE_VALUES_SQL = "values ('en', 1), ('ja', 2), ('zh-cn', 3), ('ko', 4)";

export const LANGUAGE_PROGRESS_SQL = `
with requested_languages(language_code, sort_order) as (
  ${LANGUAGE_VALUES_SQL}
), active_printing_rows as (
  select
    cp.language_code,
    cp.game_code,
    cp.set_id,
    cp.collector_number
  from catalog.card_printings cp
  join requested_languages requested on requested.language_code = cp.language_code
  where cp.deprecated_at is null
), active_printing_identities as (
  select distinct language_code, game_code, set_id, collector_number
  from active_printing_rows
), active_variant_rows as (
  select
    cv.id,
    cv.language_code,
    cv.canonical_key
  from catalog.card_variants cv
  join requested_languages requested on requested.language_code = cv.language_code
  where cv.deprecated_at is null
), active_variant_identities as (
  select distinct language_code, canonical_key
  from active_variant_rows
), image_identity_flags as (
  select
    variant.language_code,
    variant.canonical_key,
    bool_or(
      asset.rights_status = 'approved'
      and asset.permission_status = 'approved'
      and asset.publicly_servable = true
      and asset.deprecated_at is null
      and asset.deleted_at is null
      and asset.source_id is not null
      and source.source_type in ('catalogue', 'image')
      and coalesce(nullif(asset.original_source_url, ''), nullif(asset.url, '')) is not null
    ) as has_approved_provider_reference,
    bool_or(
      asset.rights_status = 'approved'
      and asset.permission_status = 'approved'
      and asset.publicly_servable = true
      and asset.deprecated_at is null
      and asset.deleted_at is null
      and asset.storage_provider in (${PHYSICAL_STORAGE_PROVIDERS})
      and asset.storage_bucket is not null
      and asset.storage_key is not null
      and asset.content_sha256 is not null
    ) as is_physically_mirrored,
    bool_or(
      asset.rights_status = 'approved'
      and asset.permission_status = 'approved'
      and asset.publicly_servable = true
      and asset.deprecated_at is null
      and asset.deleted_at is null
      and asset.storage_provider in (${PHYSICAL_STORAGE_PROVIDERS})
      and asset.storage_bucket is not null
      and asset.storage_key is not null
      and asset.content_sha256 is not null
      and asset.derivative_list @> '[
        {"role":"card-grid"},
        {"role":"search-result"},
        {"role":"detail-page"}
      ]'::jsonb
    ) as is_stackr_ready
  from active_variant_rows variant
  join catalog.assets asset
    on asset.variant_id = variant.id
   and asset.asset_type = 'card_image'
  left join ingest.sources source on source.id = asset.source_id
  group by variant.language_code, variant.canonical_key
), printing_row_counts as (
  select
    requested.language_code,
    count(printing_row.collector_number)::bigint as active_printing_rows
  from requested_languages requested
  left join active_printing_rows printing_row
    on printing_row.language_code = requested.language_code
  group by requested.language_code
), printing_identity_counts as (
  select
    requested.language_code,
    count(printing_identity.collector_number)::bigint as active_printing_identities
  from requested_languages requested
  left join active_printing_identities printing_identity
    on printing_identity.language_code = requested.language_code
  group by requested.language_code
), variant_counts as (
  select
    requested.language_code,
    count(variant_row.*)::bigint as active_variant_rows,
    count(distinct variant_row.canonical_key)::bigint as active_variant_identities
  from requested_languages requested
  left join active_variant_rows variant_row
    on variant_row.language_code = requested.language_code
  group by requested.language_code
), image_counts as (
  select
    requested.language_code,
    count(*) filter (where image.has_approved_provider_reference)::bigint
      as approved_provider_image_references,
    count(*) filter (where image.is_physically_mirrored)::bigint
      as physically_mirrored_images,
    count(*) filter (where image.is_stackr_ready)::bigint
      as stackr_ready_images
  from requested_languages requested
  left join image_identity_flags image on image.language_code = requested.language_code
  group by requested.language_code
)
select
  requested.language_code,
  printing_rows.active_printing_rows,
  printing_identities.active_printing_identities,
  variant.active_variant_rows,
  variant.active_variant_identities,
  images.approved_provider_image_references,
  images.physically_mirrored_images,
  images.stackr_ready_images
from requested_languages requested
join printing_row_counts printing_rows using (language_code)
join printing_identity_counts printing_identities using (language_code)
join variant_counts variant using (language_code)
join image_counts images using (language_code)
order by requested.sort_order;
`;

export const RAW_DUPLICATION_SQL = `
with requested_languages(language_code) as (
  values ('en'), ('ja'), ('zh-cn'), ('ko')
), ranked_revision_keys as (
  select
    raw_record.id,
    first_value(raw_record.id) over (
      partition by
        raw_record.source_id,
        raw_record.record_type,
        raw_record.provider_record_id,
        coalesce(raw_record.language_code, ''),
        raw_record.payload_hash
      order by raw_record.retrieved_at, raw_record.id
    ) as representative_id,
    row_number() over (
      partition by
        raw_record.source_id,
        raw_record.record_type,
        raw_record.provider_record_id,
        coalesce(raw_record.language_code, ''),
        raw_record.payload_hash
      order by raw_record.retrieved_at, raw_record.id
    ) as hash_revision_number
  from ingest.raw_source_records raw_record
  join requested_languages requested on requested.language_code = raw_record.language_code
  where raw_record.deprecated_at is null
), duplicate_revision_checks as (
  select
    duplicate_record.raw_payload = representative_record.raw_payload as payload_is_exact,
    pg_column_size(duplicate_record.raw_payload)::bigint as payload_bytes
  from ranked_revision_keys ranked
  join ingest.raw_source_records duplicate_record on duplicate_record.id = ranked.id
  join ingest.raw_source_records representative_record on representative_record.id = ranked.representative_id
  where ranked.hash_revision_number > 1
)
select
  count(*) filter (where payload_is_exact)::bigint as extra_rows,
  coalesce(sum(payload_bytes) filter (where payload_is_exact), 0)::bigint as repeated_payload_bytes,
  count(*) filter (where not payload_is_exact)::bigint as payload_hash_collision_rows
from duplicate_revision_checks;
`;

export const LOGICAL_ASSET_DUPLICATION_SQL = `
with ranked_assets as (
  select
    asset.id,
    asset.byte_size,
    row_number() over (
      partition by asset.content_sha256
      order by asset.created_at, asset.id
    ) as exact_content_number
  from catalog.assets asset
  where asset.storage_provider in (${PHYSICAL_STORAGE_PROVIDERS})
    and asset.content_sha256 is not null
    and asset.deprecated_at is null
    and asset.deleted_at is null
)
select
  count(*) filter (where exact_content_number > 1)::bigint as extra_rows,
  coalesce(sum(byte_size) filter (where exact_content_number > 1), 0)::bigint
    as estimated_repeated_logical_bytes
from ranked_assets;
`;

export const STORAGE_OBJECT_DUPLICATION_SQL = `
with scoped_objects as (
  select
    object.id,
    object.bucket_id,
    object.name,
    coalesce(object.metadata ->> 'eTag', object.metadata ->> 'etag') as etag,
    case
      when object.metadata ->> 'size' ~ '^[0-9]+$'
        then (object.metadata ->> 'size')::bigint
      else 0::bigint
    end as object_bytes
  from storage.objects object
  where object.bucket_id = 'stackr-catalogue-public'
), ranked_objects as (
  select
    scoped.*,
    row_number() over (
      partition by scoped.etag, scoped.object_bytes
      order by scoped.bucket_id, scoped.name, scoped.id
    ) as exact_content_number
  from scoped_objects scoped
  where scoped.etag is not null
)
select
  count(*) filter (where exact_content_number > 1)::bigint as extra_objects,
  coalesce(sum(object_bytes) filter (where exact_content_number > 1), 0)::bigint
    as repeated_object_bytes
from ranked_objects;
`;

const REPORT_QUERIES = Object.freeze([
  LANGUAGE_PROGRESS_SQL,
  RAW_DUPLICATION_SQL,
  LOGICAL_ASSET_DUPLICATION_SQL,
  STORAGE_OBJECT_DUPLICATION_SQL,
]);

function safeInteger(value, fieldName) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid non-negative integer for ${fieldName}.`);
  }
  return number;
}

export function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export function equalWeightPercent(values) {
  if (values.length !== FOUR_LANGUAGE_CODES.length) {
    throw new Error(`Equal-weight progress requires exactly ${FOUR_LANGUAGE_CODES.length} language percentages.`);
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function oneRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`${label} must return exactly one row.`);
  }
  return rows[0];
}

export function buildFourLanguageCatalogueProgressReport(input) {
  const rowsByLanguage = new Map(input.languageRows.map((row) => [row.language_code, row]));
  const unexpectedLanguages = [...rowsByLanguage.keys()].filter((code) => !FOUR_LANGUAGE_CODES.includes(code));
  if (unexpectedLanguages.length > 0
    || rowsByLanguage.size !== FOUR_LANGUAGE_CODES.length
    || input.languageRows.length !== FOUR_LANGUAGE_CODES.length) {
    throw new Error('Catalogue progress data must contain exactly en, ja, zh-cn and ko.');
  }

  const languages = FOUR_LANGUAGE_CODES.map((languageCode) => {
    const row = rowsByLanguage.get(languageCode);
    const activePrintingRows = safeInteger(row.active_printing_rows, `${languageCode}.active_printing_rows`);
    const activePrintingIdentities = safeInteger(
      row.active_printing_identities,
      `${languageCode}.active_printing_identities`,
    );
    const activeVariantRows = safeInteger(row.active_variant_rows, `${languageCode}.active_variant_rows`);
    const activeVariantIdentities = safeInteger(
      row.active_variant_identities,
      `${languageCode}.active_variant_identities`,
    );
    if (activePrintingIdentities > activePrintingRows || activeVariantIdentities > activeVariantRows) {
      throw new Error(`${languageCode} distinct identity counts exceed active row counts.`);
    }
    const approvedProviderImageReferences = safeInteger(
      row.approved_provider_image_references,
      `${languageCode}.approved_provider_image_references`,
    );
    const physicallyMirroredImages = safeInteger(
      row.physically_mirrored_images,
      `${languageCode}.physically_mirrored_images`,
    );
    const stackrReadyImages = safeInteger(row.stackr_ready_images, `${languageCode}.stackr_ready_images`);
    for (const [field, count] of [
      ['approved_provider_image_references', approvedProviderImageReferences],
      ['physically_mirrored_images', physicallyMirroredImages],
      ['stackr_ready_images', stackrReadyImages],
    ]) {
      if (count > activeVariantIdentities) {
        throw new Error(`${languageCode}.${field} exceeds distinct active variants.`);
      }
    }

    return {
      languageCode,
      activePrintingIdentities,
      duplicatePrintingRows: activePrintingRows - activePrintingIdentities,
      printingIdentityUniquenessPercent: percent(activePrintingIdentities, activePrintingRows),
      activeVariantIdentities,
      duplicateVariantRows: activeVariantRows - activeVariantIdentities,
      variantIdentityUniquenessPercent: percent(activeVariantIdentities, activeVariantRows),
      approvedProviderImageReferences,
      approvedProviderImageReferencePercent: percent(
        approvedProviderImageReferences,
        activeVariantIdentities,
      ),
      physicallyMirroredImages,
      physicallyMirroredPercent: percent(physicallyMirroredImages, activeVariantIdentities),
      stackrReadyImages,
      stackrMirroredDerivativeReadyPercent: percent(stackrReadyImages, activeVariantIdentities),
    };
  });

  const rawDuplicates = oneRow(input.rawDuplicateRows, 'Raw duplication query');
  const logicalAssetDuplicates = oneRow(input.logicalAssetDuplicateRows, 'Logical asset duplication query');
  const storageObjectDuplicates = oneRow(input.storageObjectDuplicateRows, 'Storage object duplication query');
  const sum = (field) => languages.reduce((total, language) => total + language[field], 0);
  const average = (field) => equalWeightPercent(languages.map((language) => language[field]));
  const payloadHashCollisionRows = safeInteger(
    rawDuplicates.payload_hash_collision_rows,
    'raw_duplicates.payload_hash_collision_rows',
  );
  if (payloadHashCollisionRows !== 0) {
    throw new Error('Raw payload hash collision detected; exact duplicate totals are intentionally withheld.');
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
    target: 'staging',
    projectRef: STAGING_PROJECT_REF,
    languages: FOUR_LANGUAGE_CODES,
    readOnly: true,
    productionModified: false,
    releaseEligible: false,
    percentageMethod: 'Equal arithmetic mean across en, ja, zh-cn and ko; card volume cannot hide a missing language.',
    overall: {
      activePrintingIdentities: sum('activePrintingIdentities'),
      duplicatePrintingRows: sum('duplicatePrintingRows'),
      printingIdentityUniquenessPercent: average('printingIdentityUniquenessPercent'),
      activeVariantIdentities: sum('activeVariantIdentities'),
      duplicateVariantRows: sum('duplicateVariantRows'),
      variantIdentityUniquenessPercent: average('variantIdentityUniquenessPercent'),
      approvedProviderImageReferences: sum('approvedProviderImageReferences'),
      approvedProviderImageReferencePercent: average('approvedProviderImageReferencePercent'),
      physicallyMirroredImages: sum('physicallyMirroredImages'),
      physicallyMirroredPercent: average('physicallyMirroredPercent'),
      stackrReadyImages: sum('stackrReadyImages'),
      stackrMirroredDerivativeReadyPercent: average('stackrMirroredDerivativeReadyPercent'),
    },
    perLanguage: languages,
    duplication: {
      scope: 'Raw revisions are limited to the four workstream languages; logical assets and physical objects cover the whole staging catalogue repository.',
      exactRawRevisions: {
        extraRows: safeInteger(rawDuplicates.extra_rows, 'raw_duplicates.extra_rows'),
        repeatedPayloadBytes: safeInteger(
          rawDuplicates.repeated_payload_bytes,
          'raw_duplicates.repeated_payload_bytes',
        ),
        payloadHashCollisionRows,
        note: 'These are intentionally retained provider revisions; exact repetition is measurable but rows are not automatically deletable waste.',
      },
      exactLogicalAssetContent: {
        extraRows: safeInteger(logicalAssetDuplicates.extra_rows, 'asset_duplicates.extra_rows'),
        estimatedRepeatedLogicalBytes: safeInteger(
          logicalAssetDuplicates.estimated_repeated_logical_bytes,
          'asset_duplicates.estimated_repeated_logical_bytes',
        ),
        note: 'Whole staging catalogue. Logical aliases are not automatically deletable and do not prove duplicate stored objects.',
      },
      exactStorageObjects: {
        extraObjects: safeInteger(storageObjectDuplicates.extra_objects, 'storage_duplicates.extra_objects'),
        repeatedObjectBytes: safeInteger(
          storageObjectDuplicates.repeated_object_bytes,
          'storage_duplicates.repeated_object_bytes',
        ),
        note: 'Whole stackr-catalogue-public staging bucket; eTag and object size must both match.',
      },
    },
  };
}

export async function collectFourLanguageCatalogueProgress(queryable, options = {}) {
  if (!queryable || typeof queryable.query !== 'function') {
    throw new Error('A read-only PostgreSQL query client is required.');
  }
  const results = [];
  for (const sql of REPORT_QUERIES) {
    results.push(await queryable.query(sql));
  }
  return buildFourLanguageCatalogueProgressReport({
    languageRows: results[0].rows,
    rawDuplicateRows: results[1].rows,
    logicalAssetDuplicateRows: results[2].rows,
    storageObjectDuplicateRows: results[3].rows,
    generatedAt: options.generatedAt,
  });
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? '';
}

export function assertStagingReportTarget({ target, projectRef, connectionString }) {
  if (target !== 'staging') throw new Error('Catalogue progress reporting is restricted to --target=staging.');
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`SUPABASE_PROJECT_REF must be the canonical staging project ${STAGING_PROJECT_REF}.`);
  }
  if (!connectionString || !connectionString.includes(STAGING_PROJECT_REF)) {
    throw new Error('Staging database URL does not match the canonical staging project.');
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('node scripts/four-language-catalogue-progress.mjs --target=staging');
    return;
  }
  const connectionString = process.env.SUPABASE_STAGING_DB_URL
    ?? process.env.STACKR_SOURCE_DB_URL
    ?? process.env.SUPABASE_DB_URL
    ?? '';
  assertStagingReportTarget({
    target: argument('target'),
    projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
    connectionString,
  });

  const database = createVerifiedSupabasePostgresClient(
    connectionString,
    'stackr-four-language-catalogue-progress',
  );
  await database.connect();
  try {
    await database.query('begin transaction isolation level repeatable read read only');
    const report = await collectFourLanguageCatalogueProgress(database);
    await database.query('commit');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await database.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await database.end();
  }
}

const isCli = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
