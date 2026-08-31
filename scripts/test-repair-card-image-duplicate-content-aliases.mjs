import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALIAS_REPAIR_PLAN_SQL,
  APPLY_ALIAS_REPAIR_SQL,
  COPIED_OBJECT_FIELDS,
  EXPECTED_EVIDENCE_DIGEST,
  EXPECTED_SCOPE,
  EXPECTED_STORAGE_INDEX_DEFINITION,
  EXPECTED_STORAGE_TRIGGER_DEFINITION,
  EXPECTED_STORAGE_TRIGGER_FUNCTION_SHA256,
  MAX_BATCH_SIZE,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  STORAGE_SHARING_PREFLIGHT_SQL,
  assertExactAliasEvidence,
  assertStagingAliasRepairTarget,
  assertStorageSharingContract,
  executeAliasRepairTransaction,
  parseAliasRepairOptions,
  summarisePendingPage,
} from './repair-card-image-duplicate-content-aliases.mjs';

const GOOD_DB_URL = `postgresql://postgres.${STAGING_PROJECT_REF}:staging-password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require`;

function exactContract() {
  return {
    index_definition: EXPECTED_STORAGE_INDEX_DEFINITION,
    unique_index_present: false,
    trigger_definition: EXPECTED_STORAGE_TRIGGER_DEFINITION,
    trigger_enabled: 'O',
    trigger_function_sha256: EXPECTED_STORAGE_TRIGGER_FUNCTION_SHA256,
  };
}

function exactEvidence(overrides = {}) {
  return {
    total: String(EXPECTED_SCOPE.total),
    en: String(EXPECTED_SCOPE.en),
    ja: String(EXPECTED_SCOPE.ja),
    zh_cn: String(EXPECTED_SCOPE.zhCn),
    target_assets: String(EXPECTED_SCOPE.targetAssets),
    initially_not_public: String(EXPECTED_SCOPE.initiallyNotPublic),
    pending_total: String(EXPECTED_SCOPE.total),
    evidence_digest: EXPECTED_EVIDENCE_DIGEST,
    ...overrides,
  };
}

function candidate(id, targetId) {
  return {
    duplicate_asset_id: id,
    target_asset_id: targetId,
    language_code: 'en',
    canonical_key: `pokemon:en:test:${id}:normal`,
    duplicate_updated_at: '2026-08-31T00:00:00.000Z',
    target_updated_at: '2026-08-31T00:01:00.000Z',
    previous_unavailable_reason: `duplicate_content:${targetId}`,
    previous_publicly_servable: true,
    duplicate_sha256: 'a'.repeat(64),
    storage_bucket: 'stackr-catalogue-public',
    storage_key: `public/card_image/${id}/original.jpg`,
  };
}

const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const FIRST_TARGET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THIRD_TARGET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function assertOptionAndTargetGuards() {
  assert.deepEqual(parseAliasRepairOptions(['--target=staging']), {
    help: false,
    target: 'staging',
    apply: false,
    afterId: null,
    limit: 100,
  });
  assert.deepEqual(
    parseAliasRepairOptions([
      '--target=staging',
      '--apply',
      `--after-id=${FIRST_ID}`,
      `--limit=${MAX_BATCH_SIZE}`,
    ]),
    {
      help: false,
      target: 'staging',
      apply: true,
      afterId: FIRST_ID,
      limit: MAX_BATCH_SIZE,
    },
  );
  assert.throws(
    () => parseAliasRepairOptions(['--apply', '--dry-run']),
    /cannot be combined/,
  );
  assert.throws(() => parseAliasRepairOptions(['--limit=501']), /1 to 500/);
  assert.throws(() => parseAliasRepairOptions(['--after-id=not-a-uuid']), /must be a UUID/);

  const normalized = assertStagingAliasRepairTarget({
    target: 'staging',
    projectRef: STAGING_PROJECT_REF,
    connectionString: GOOD_DB_URL,
  });
  assert.match(normalized, new RegExp(`postgres\\.${STAGING_PROJECT_REF}`));
  const transactionPooler = assertStagingAliasRepairTarget({
    target: 'staging',
    projectRef: STAGING_PROJECT_REF,
    connectionString: GOOD_DB_URL.replace(':6543/', ':5432/'),
  });
  assert.equal(new URL(transactionPooler).port, '6543');
  assert.throws(() => assertStagingAliasRepairTarget({
    target: 'production',
    projectRef: STAGING_PROJECT_REF,
    connectionString: GOOD_DB_URL,
  }), /explicit --target=staging/);
  assert.throws(() => assertStagingAliasRepairTarget({
    target: 'staging',
    projectRef: PRODUCTION_PROJECT_REF,
    connectionString: GOOD_DB_URL,
  }), /SUPABASE_PROJECT_REF/);
  assert.throws(() => assertStagingAliasRepairTarget({
    target: 'staging',
    projectRef: STAGING_PROJECT_REF,
    connectionString: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  }), /refuses production/);
  assert.throws(() => assertStagingAliasRepairTarget({
    target: 'staging',
    projectRef: STAGING_PROJECT_REF,
    connectionString: `postgresql://postgres.${STAGING_PROJECT_REF}:password@pooler.supabase.com.evil.invalid:6543/postgres`,
  }), /failed closed/);
}

function assertEvidenceAndCursorGuards() {
  assert.deepEqual(assertExactAliasEvidence(exactEvidence()), {
    total: EXPECTED_SCOPE.total,
    en: EXPECTED_SCOPE.en,
    ja: EXPECTED_SCOPE.ja,
    zhCn: EXPECTED_SCOPE.zhCn,
    targetAssets: EXPECTED_SCOPE.targetAssets,
    initiallyNotPublic: EXPECTED_SCOPE.initiallyNotPublic,
    pendingTotal: EXPECTED_SCOPE.total,
    evidenceDigest: EXPECTED_EVIDENCE_DIGEST,
  });
  assert.throws(
    () => assertExactAliasEvidence(exactEvidence({ en: '8387' })),
    /evidence drift for en/,
  );
  assert.throws(
    () => assertExactAliasEvidence(exactEvidence({ evidence_digest: '0'.repeat(64) })),
    /evidence digest drift/,
  );
  assert.throws(
    () => assertExactAliasEvidence(exactEvidence({ pending_total: '9148' })),
    /exceeds the pinned scope/,
  );

  const rows = [
    candidate(FIRST_ID, FIRST_TARGET_ID),
    candidate(SECOND_ID, SECOND_TARGET_ID),
    candidate(THIRD_ID, THIRD_TARGET_ID),
  ];
  assert.deepEqual(summarisePendingPage(rows, 2), {
    candidates: rows.slice(0, 2),
    cursor: { nextAfterId: SECOND_ID, exhausted: false },
  });
  assert.deepEqual(summarisePendingPage(rows.slice(0, 2), 2).cursor, {
    nextAfterId: SECOND_ID,
    exhausted: true,
  });
  assert.throws(
    () => summarisePendingPage([rows[1], rows[0]], 2),
    /deterministic UUID order/,
  );
  assert.throws(
    () => summarisePendingPage([rows[0], rows[0]], 2),
    /missing or duplicate/,
  );
}

function assertStorageContractAndSqlScope() {
  assert.doesNotThrow(() => assertStorageSharingContract(exactContract()));
  assert.throws(
    () => assertStorageSharingContract({ ...exactContract(), unique_index_present: true }),
    /production unique Storage-object index/,
  );
  assert.throws(
    () => assertStorageSharingContract({ ...exactContract(), trigger_enabled: 'D' }),
    /missing, changed, or disabled/,
  );
  assert.throws(
    () => assertStorageSharingContract({ ...exactContract(), trigger_function_sha256: 'changed' }),
    /function has changed/,
  );

  assert.match(ALIAS_REPAIR_PLAN_SQL, /source\.code = 'tcgdex'/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /variant\.language_code in \('en', 'ja', 'zh-cn'\)/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /duplicate\.storage_provider = 'unavailable'/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /duplicate_content:/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /from storage\.objects original_object/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /join storage\.objects derivative_object/);
  for (const role of ['card-grid', 'search-result', 'detail-page']) {
    assert.match(ALIAS_REPAIR_PLAN_SQL, new RegExp(role));
  }
  assert.match(ALIAS_REPAIR_PLAN_SQL, /not exists \(\s*select 1\s*from catalog\.assets ready/s);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /order by duplicate_asset_id/);
  assert.match(ALIAS_REPAIR_PLAN_SQL, /limit \(\$2::integer \+ 1\)/);

  const updateSet = APPLY_ALIAS_REPAIR_SQL.match(/update catalog\.assets duplicate\s+set([\s\S]*?)\s+from verified_pending repair/i)?.[1] ?? '';
  for (const field of COPIED_OBJECT_FIELDS) {
    assert.match(updateSet, new RegExp(`\\b${field}\\s*=`), `${field} must be copied`);
  }
  for (const protectedField of [
    'source_id',
    'original_source_url',
    'original_source_identifier',
    'source_attribution',
    'acquisition_source',
    'variant_id',
    'asset_id',
  ]) {
    assert.doesNotMatch(updateSet, new RegExp(`\\b${protectedField}\\s*=`), `${protectedField} must be preserved`);
  }
  assert.match(APPLY_ALIAS_REPAIR_SQL, /duplicate\.updated_at = repair\.duplicate_updated_at/);
  assert.match(APPLY_ALIAS_REPAIR_SQL, /plan\.target_updated_at = target\.updated_at/);
  assert.match(APPLY_ALIAS_REPAIR_SQL, /previousUnavailableReason/);
  assert.match(APPLY_ALIAS_REPAIR_SQL, /insert into audit\.catalogue_events/);
  assert.match(APPLY_ALIAS_REPAIR_SQL, /insert into catalog\.catalogue_change_log/);
  assert.match(APPLY_ALIAS_REPAIR_SQL, /storageObjectBytesRewritten', false/);

  const source = readFileSync(new URL('./repair-card-image-duplicate-content-aliases.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createClient\s*\(/);
  assert.doesNotMatch(source, /\.storage\.from\s*\(/);
  assert.doesNotMatch(source, /\bdownload\s*\(/);
  assert.doesNotMatch(source, /\bupload\s*\(/);

  const workflow = readFileSync(
    new URL('../.github/workflows/staging-card-image-alias-repair.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /github\.event\.issue\.number == 74/);
  assert.match(workflow, /github\.actor == 'tberridge86'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/apply-stackr-staging-card-image-aliases'/);
  assert.match(workflow, /REPAIR_MAX_BATCHES:.*'20'/);
  assert.match(workflow, /REPAIR_LIMIT:.*'500'/);
  assert.match(
    workflow,
    /SUPABASE_STAGING_DB_URL: \$\{\{ secrets\.SUPABASE_STAGING_DB_URL \|\| secrets\.SUPABASE_DB_URL \}\}/,
  );
  assert.match(workflow, /\[\[ "\$SUPABASE_STAGING_DB_URL" != \*'oakdbbzdqwurpjnoqhmu'\* \]\]/);
  assert.doesNotMatch(workflow, /SUPABASE_PRODUCTION_DB_URL|SUPABASE_PROD_DB_URL/);
}

class FakeDatabase {
  constructor({ page, applyResult, lockAcquired = true }) {
    this.page = page;
    this.applyResult = applyResult;
    this.lockAcquired = lockAcquired;
    this.calls = [];
  }

  async query(text, values) {
    this.calls.push({ text, values });
    if (text === STORAGE_SHARING_PREFLIGHT_SQL) return { rows: [exactContract()] };
    if (text === ALIAS_REPAIR_PLAN_SQL) {
      return { rows: [{ evidence: exactEvidence(), pending_page: this.page }] };
    }
    if (text === APPLY_ALIAS_REPAIR_SQL) return { rows: [this.applyResult] };
    if (String(text).includes('pg_try_advisory_xact_lock')) {
      return { rows: [{ acquired: this.lockAcquired }] };
    }
    return { rows: [] };
  }
}

function successfulApplyResult(count) {
  return {
    planned_count: String(count),
    updated_count: String(count),
    audit_count: String(count),
    change_log_count: String(count),
    postcondition_failures: '0',
  };
}

async function assertTransactionModesAndOptimisticRollback() {
  const page = [candidate(FIRST_ID, FIRST_TARGET_ID)];
  const dryRunDatabase = new FakeDatabase({ page, applyResult: successfulApplyResult(1) });
  const dryRun = await executeAliasRepairTransaction(dryRunDatabase, { apply: false, limit: 100 });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.applied.updated, 0);
  assert.equal(dryRun.pendingAfterExpected, EXPECTED_SCOPE.total);
  assert.equal(dryRunDatabase.calls[0].text, 'begin transaction isolation level repeatable read read only');
  assert.equal(dryRunDatabase.calls.at(-1).text, 'commit');
  assert.equal(dryRunDatabase.calls.some((call) => call.text === APPLY_ALIAS_REPAIR_SQL), false);
  assert.equal(dryRunDatabase.calls.some((call) => String(call.text).includes('pg_try_advisory')), false);

  const applyDatabase = new FakeDatabase({ page, applyResult: successfulApplyResult(1) });
  const applied = await executeAliasRepairTransaction(applyDatabase, { apply: true, limit: 100 });
  assert.equal(applied.dryRun, false);
  assert.equal(applied.applied.updated, 1);
  assert.equal(applied.pendingAfterExpected, EXPECTED_SCOPE.total - 1);
  assert.equal(applyDatabase.calls[0].text, 'begin transaction isolation level repeatable read');
  assert.equal(applyDatabase.calls.at(-1).text, 'commit');
  const applyCall = applyDatabase.calls.find((call) => call.text === APPLY_ALIAS_REPAIR_SQL);
  assert.ok(applyCall);
  assert.deepEqual(JSON.parse(applyCall.values[0]), [{
    duplicate_asset_id: FIRST_ID,
    target_asset_id: FIRST_TARGET_ID,
    duplicate_updated_at: page[0].duplicate_updated_at,
    target_updated_at: page[0].target_updated_at,
    previous_unavailable_reason: page[0].previous_unavailable_reason,
  }]);

  const staleDatabase = new FakeDatabase({
    page,
    applyResult: { ...successfulApplyResult(1), updated_count: '0' },
  });
  await assert.rejects(
    () => executeAliasRepairTransaction(staleDatabase, { apply: true, limit: 100 }),
    /optimistic apply mismatch/,
  );
  assert.equal(staleDatabase.calls.at(-1).text, 'rollback');
  assert.equal(staleDatabase.calls.some((call) => call.text === 'commit'), false);

  const lockedDatabase = new FakeDatabase({
    page,
    applyResult: successfulApplyResult(1),
    lockAcquired: false,
  });
  await assert.rejects(
    () => executeAliasRepairTransaction(lockedDatabase, { apply: true, limit: 100 }),
    /Another staging alias repair transaction is active/,
  );
  assert.equal(lockedDatabase.calls.at(-1).text, 'rollback');
}

async function main() {
  assertOptionAndTargetGuards();
  assertEvidenceAndCursorGuards();
  assertStorageContractAndSqlScope();
  await assertTransactionModesAndOptimisticRollback();
  console.log('Card-image duplicate-content alias repair tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
