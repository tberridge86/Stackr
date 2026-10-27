import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const BUCKET = 'stackr-catalogue-public';
const PUBLIC_BASE = 'https://assets.stackrtcg.com';
const CLIENT_OPTIONS = Object.freeze({ connectionTimeoutMillis: 15000, statement_timeout: 30000, query_timeout: 45000 });
const COUNTS = ['eligible_total', 'remaining_source', 'migrated_total', 'malformed_original_rows',
  'malformed_derivative_rows', 'malformed_migrated_rows'];
const FAILURE_CODES = new Set(['08000', '08001', '08003', '08004', '08006', '08P01', '53300', '57P01', '57P02',
  '57P03', '57014', '55P03', '40P01', '40001', '25P02', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function safeKey(expression) {
  return `(${expression} is not null and length(${expression}) between 1 and 1024
    and ${expression} like 'public/%' and position(chr(92) in ${expression}) = 0
    and ${expression} !~ '[[:cntrl:]?#%]'
    and not exists (select 1 from unnest(string_to_array(${expression}, '/')) part
      where part in ('', '.', '..')))`;
}
const derivativeAliases = Object.entries({ storage_provider: "d->>'storageProvider'", storage_bucket: "d->>'storageBucket'",
  storage_key: "d->>'storageKey'", storage_path: "d->>'storageKey'", key: "d->>'storageKey'", path: "d->>'storageKey'",
  content_sha256: "d->>'contentSha256'", sha256: "d->>'contentSha256'", delivery_url: "d->>'deliveryUrl'" })
  .map(([key, expected]) => `(not (d ? '${key}') or d->>'${key}' = ${expected})`).join('\n      and ');

// Only the eligibility scope used by the frozen migrator is counted. Keys may
// use another legitimate R2 acquisition layout; their public URLs must still be
// exact, unsigned, safe-key pointers. No catalogue-wide artwork claim is made.
export const FINAL_COVERAGE_SQL = `with eligible as (
  select a.* from catalog.assets a
  where a.storage_bucket = $1 and a.storage_provider in ('supabase_storage', 's3_compatible')
    and a.rights_status = 'approved' and a.permission_status = 'approved'
    and a.asset_visibility = 'public_catalogue' and a.publicly_servable
    and a.retention_status = 'active' and a.deleted_at is null and a.deprecated_at is null
), inspected as (
  select a.storage_provider,
    coalesce(${safeKey('a.storage_key')}
      and a.storage_path = a.storage_key and a.url = $2 || '/' || a.storage_key
      and a.content_sha256 ~ '^[a-f0-9]{64}$' and a.sha256 = a.content_sha256
      and a.byte_size > 0 and a.byte_size <= 9007199254740991
      and a.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml')
      and (a.archival_storage_key is null or a.archival_storage_key = a.storage_key), false) as original_ok,
    coalesce(jsonb_typeof(a.derivative_list) = 'array'
      and jsonb_array_length(case when jsonb_typeof(a.derivative_list) = 'array' then a.derivative_list else '[]'::jsonb end) <= 16
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(a.derivative_list) = 'array' then a.derivative_list else '[]'::jsonb end) d
        where not coalesce(jsonb_typeof(d) = 'object'
          and jsonb_typeof(d->'role') = 'string' and d->>'role' ~ '^[A-Za-z0-9_-]{1,128}$' and d->>'role' <> 'original'
          and d->>'storageProvider' = 's3_compatible' and d->>'storageBucket' = $1
          and ${safeKey("d->>'storageKey'")}
          and d->>'url' = $2 || '/' || (d->>'storageKey') and d->>'deliveryUrl' = d->>'url'
          and jsonb_typeof(d->'contentSha256') = 'string' and d->>'contentSha256' ~ '^[a-f0-9]{64}$'
          and coalesce(d->>'mimeType', d->>'mime_type') in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml')
          and (not (d ? 'mimeType') or not (d ? 'mime_type') or d->>'mimeType' = d->>'mime_type')
          and case when jsonb_typeof(d->'byteSize') = 'number' then
            (d->>'byteSize')::numeric > 0 and (d->>'byteSize')::numeric <= 9007199254740991
            and trunc((d->>'byteSize')::numeric) = (d->>'byteSize')::numeric else false end
          and (not (d ? 'byte_size') or d->'byte_size' = d->'byteSize')
          and ${derivativeAliases}, false)
      ) and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(a.derivative_list) = 'array' then a.derivative_list else '[]'::jsonb end) d
        group by d->>'role' having count(*) > 1
      ), false) as derivatives_ok
  from eligible a
)
select count(*)::text as eligible_total,
  count(*) filter (where storage_provider = 'supabase_storage')::text as remaining_source,
  count(*) filter (where storage_provider = 's3_compatible')::text as migrated_total,
  count(*) filter (where storage_provider = 's3_compatible' and not original_ok)::text as malformed_original_rows,
  count(*) filter (where storage_provider = 's3_compatible' and not derivatives_ok)::text as malformed_derivative_rows,
  count(*) filter (where storage_provider = 's3_compatible' and not (original_ok and derivatives_ok))::text as malformed_migrated_rows
from inspected`;

async function runtimeDependencies() {
  const source = name => pathToFileURL(path.resolve(process.cwd(), 'scripts', name)).href;
  const [runner, inspector, postgres] = await Promise.all([
    import(source('run-r2-catalogue-migration.mjs')), import(source('inspect-r2-bulk-run.mjs')),
    import(source('deploy/verified-supabase-postgres.mjs')),
  ]);
  return { assertUid: inspector.assertBulkInspectionUid, assertProject: runner.assertRunnerProject,
    assertHost: runner.assertHostedRunner, createClient: postgres.createVerifiedSupabasePostgresClient,
    stripTls: postgres.stripPostgresTlsParameters };
}
function count(value) {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'coverage_invalid_aggregate');
  const parsed = Number(value); check(Number.isSafeInteger(parsed) && parsed >= 0, 'coverage_invalid_aggregate');
  return parsed;
}
export function createR2FinalCoverageVerifier(dependencies) {
  for (const name of ['assertUid', 'assertProject', 'assertHost', 'createClient', 'stripTls'])
    check(typeof dependencies?.[name] === 'function', 'coverage_dependencies_required');
  return options => verifyR2FinalCoverage20261026b({ ...options, dependencies });
}

/** Never starts a migration. All DB reads are scoped, bounded and rolled back. */
export async function verifyR2FinalCoverage20261026b({ traversalResult, env = process.env, createClient,
  dependencies } = {}) {
  check(traversalResult?.status === 'traversal_complete', 'coverage_traversal_complete_required');
  const deps = dependencies ?? await runtimeDependencies();
  const scope = { sourceBucket: BUCKET, destinationBucket: BUCKET, providers: ['supabase_storage', 's3_compatible'],
    rightsStatus: 'approved', permissionStatus: 'approved', assetVisibility: 'public_catalogue', publiclyServable: true,
    retentionStatus: 'active', deleted: false, deprecated: false, expectedPublicBaseUrl: PUBLIC_BASE };
  let client; let rollbackNeeded = false; let phase = 'guards'; let counts; let failed = null;
  try {
    deps.assertUid(); deps.assertProject(env); await deps.assertHost(env);
    check(env.RAILWAY_SERVICE_ID === SERVICE && env.RAILWAY_ENVIRONMENT_ID === ENVIRONMENT
      && env.RAILWAY_PROJECT_ID === PROJECT && env.SUPABASE_URL?.replace(/\/$/, '') === 'https://' + REF + '.supabase.co',
      'coverage_host_mismatch');
    const factory = createClient ?? deps.createClient;
    check(typeof factory === 'function', 'coverage_client_required');
    phase = 'connect';
    client = factory(deps.stripTls(env.SUPABASE_DB_URL), 'stackr-r2-final-coverage', { ...CLIENT_OPTIONS });
    await client.connect();
    phase = 'begin'; rollbackNeeded = true;
    await client.query('begin isolation level repeatable read read only');
    phase = 'aggregate';
    const result = await client.query(FINAL_COVERAGE_SQL, [BUCKET, PUBLIC_BASE]);
    check(result.rows?.length === 1 && Object.keys(result.rows[0]).sort().join(',') === [...COUNTS].sort().join(','), 'coverage_invalid_aggregate');
    counts = Object.fromEntries(COUNTS.map(key => [key, count(result.rows[0][key])]));
    check(counts.eligible_total === counts.remaining_source + counts.migrated_total
      && counts.malformed_original_rows <= counts.malformed_migrated_rows
      && counts.malformed_derivative_rows <= counts.malformed_migrated_rows
      && counts.malformed_migrated_rows <= counts.migrated_total
      && counts.malformed_migrated_rows <= counts.malformed_original_rows + counts.malformed_derivative_rows,
      'coverage_invalid_aggregate');
    phase = 'rollback'; await client.query('rollback'); rollbackNeeded = false;
  } catch (error) {
    failed = { code: 'coverage_verification_failed', phase,
      databaseCode: FAILURE_CODES.has(error?.code) ? error.code : null };
    if (client && rollbackNeeded) {
      try { await client.query('rollback'); rollbackNeeded = false; }
      catch { failed.rollbackFailed = true; }
    }
  } finally {
    if (client) try { await client.end(); } catch { failed ??= { code: 'coverage_verification_failed', phase: 'close', databaseCode: null }; }
  }
  const complete = !failed && counts.eligible_total > 0 && counts.remaining_source === 0 && counts.malformed_migrated_rows === 0;
  return { schemaVersion: 1, kind: 'stackr-r2-eligible-final-coverage',
    status: complete ? 'coverage_complete' : 'coverage_incomplete', runId: traversalResult.runId ?? null,
    scope, counts: counts ?? null, ...(failed ? { failure: failed } : {}),
    ...(counts?.eligible_total === 0 ? { reason: 'eligible_scope_empty' } : {}),
    eligibleCoverageVerified: complete, transactionRolledBack: Boolean(client) && !rollbackNeeded && phase !== 'connect',
    databaseReadOnly: true, evidenceModified: false, runnerStarted: false, sourceObjectsDeleted: 0,
    allCatalogueImagesCovered: false };
}
