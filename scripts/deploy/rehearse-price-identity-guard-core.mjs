import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { orderedRemoteStatementLedgerSha256, orderedVersionNameMd5 } from './staging-migration-ledger.mjs';
import { findUnsafeTopLevelMigrationStatements } from './migration-transaction-safety.mjs';

export const PRICE_GUARD_STAGING_PROJECT = 'lmwfhvexfcoyeuoyrlco';
const defaultSignature = 'api.english_exact_price_set_is_current(bigint,uuid)';
export const CARDMARKET_LEDGER_SIGNATURE = 'api.list_reviewed_cardmarket_printing_mappings(bigint,integer)';
const allowedSignatures = new Set([defaultSignature, CARDMARKET_LEDGER_SIGNATURE]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export async function readPriceGuardState(client, signature = defaultSignature) {
  assert(allowedSignatures.has(signature), 'price_guard_unreviewed_function');
  const ledger = (await client.query(`
    select version,name,cardinality(statements)::int as statement_count,
      encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') as "remoteStatementsSha256"
    from supabase_migrations.schema_migrations order by version
  `)).rows;
  const guard = (await client.query(`
    select md5(replace(pg_get_functiondef($1::regprocedure),E'\\r\\n',E'\\n')) as hash,
      has_function_privilege('anon',$1,'EXECUTE') as anon,
      has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,
      has_function_privilege('service_role',$1,'EXECUTE') as service
  `, [signature])).rows[0];
  return { ledger, guard };
}

function verifyBaseline(state, baseline, expectedGuard) {
  assert.equal(state.ledger.length, baseline.count, 'price_guard_ledger_count_drift');
  assert.equal(orderedVersionNameMd5(state.ledger), baseline.orderedVersionNameMd5, 'price_guard_ledger_key_drift');
  assert.equal(orderedRemoteStatementLedgerSha256(state.ledger), baseline.orderedStatementLedgerSha256, 'price_guard_ledger_statement_drift');
  assert.equal(state.guard.hash, expectedGuard, 'price_guard_function_drift');
  assert.equal(state.guard.anon, false, 'price_guard_anon_access_drift');
  assert.equal(state.guard.authenticated, false, 'price_guard_authenticated_access_drift');
  assert.equal(state.guard.service, true, 'price_guard_service_access_drift');
}

// A rehearsal can never commit or register a migration. The caller provides
// read-only API controls; the CLI runner fixes the reviewed live controls.
export async function rehearsePriceIdentityGuard({ client, projectRef, candidate, baseline, migrationSql, readCanary, signature = defaultSignature }) {
  assert(allowedSignatures.has(signature), 'price_guard_unreviewed_function');
  assert.equal(projectRef, PRICE_GUARD_STAGING_PROJECT, 'price_guard_requires_staging');
  assert.equal(baseline.project, projectRef, 'price_guard_baseline_target_mismatch');
  assert.equal(sha256(migrationSql.replaceAll('\r\n', '\n')), candidate.sourceLfSha256, 'price_guard_source_hash_drift');
  assert.equal(findUnsafeTopLevelMigrationStatements(migrationSql).length, 0, 'price_guard_unsafe_transaction_sql');
  let transactionOpen = false;
  try {
    await client.exec('begin isolation level repeatable read; set local lock_timeout=\'5s\'; set local statement_timeout=\'8s\';');
    transactionOpen = true;
    const before = await readPriceGuardState(client, signature);
    verifyBaseline(before, baseline, candidate.predecessorDefinitionMd5);
    assert(!before.ledger.some(row => row.version === candidate.migrationVersion), 'price_guard_already_recorded');
    const beforeCanary = await readCanary(client);
    assert(beforeCanary.length > 0 && beforeCanary.length <= 100, 'price_guard_empty_or_oversized_canary');
    await client.exec(migrationSql);
    // The existing migration has its own DDL deadline. Every control/read
    // still uses the same eight-second deadline as the production diagnosis.
    await client.exec("set local statement_timeout='8s'");
    const inside = await readPriceGuardState(client, signature);
    verifyBaseline(inside, baseline, candidate.candidateDefinitionMd5);
    const afterCanary = await readCanary(client);
    assert.equal(stable(afterCanary), stable(beforeCanary), 'price_guard_api_response_drift');
    await client.exec('rollback');
    transactionOpen = false;
    const restored = await readPriceGuardState(client, signature);
    verifyBaseline(restored, baseline, candidate.predecessorDefinitionMd5);
    return { ok: true, projectRef, signature, rollbackOnly: true, migrationVersion: candidate.migrationVersion,
      sourceLfSha256: candidate.sourceLfSha256, ledgerCount: baseline.count, canaryCount: afterCanary.length,
      beforeHash: before.guard.hash, insideHash: inside.guard.hash, restoredHash: restored.guard.hash,
      sourceApiParity: true, accessPreserved: true, unchangedLedger: true, rollbackVerified: true,
      persistedCandidate: false, ownerHttpOrPhoneProof: false };
  } finally {
    if (transactionOpen) await client.exec('rollback');
  }
}
