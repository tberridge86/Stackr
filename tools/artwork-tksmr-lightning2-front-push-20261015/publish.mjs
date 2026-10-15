import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assetId, createTransferPolicy, publishFrozenCohort } from '../artwork3303-publish-20260928/publish.mjs';
import { COHORT_SHA, APPROVAL_SHA, loadFrozen, validateSourcePlan } from './frozen.mjs';
import { assertSourcePolicies, createMetadataGuard, readSourceRows, recordSourceCreations } from './metadata-guard.mjs';

export function assertConfig(env) {
  check(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Protected manual workflow required');
  check(env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_CONFIRMATION === 'PUBLISH ARTWORK TKSMR LIGHTNING2 FRONT', 'Exact English Energy-front confirmation required');
  baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' });
  check(env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PACKAGES && env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_OUTPUT, 'Package and receipt directories required');
  if (env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PRIVATE_OUTPUT) {
    const publicOutput = path.resolve(env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_OUTPUT);
    const privateOutput = path.resolve(env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PRIVATE_OUTPUT);
    check(privateOutput !== publicOutput && !privateOutput.startsWith(publicOutput + path.sep), 'Private before images must stay outside public receipts');
  }
}

export function createSourceResolver(plan) {
  validateSourcePlan(plan);
  return async (db, _receipt, environment) => {
    check(environment === 'production' || environment === 'staging', 'Known environment required');
    const existing = await readSourceRows(db);
    assertSourcePolicies(plan, existing, environment, false);
    if (environment === 'production') {
      check(plan.new_sources.production.length === 0, 'Production source creation is prohibited');
      recordSourceCreations(db, [], existing, 0);
      return new Map(existing.map(source => [source.code, source.id]));
    }
    const created = [];
    for (const source of plan.new_sources[environment]) {
      const inserted = await db.query('insert into ingest.sources as source(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing returning to_jsonb(source) as payload', [source.code, source.display_name, source.source_type, source.base_url, source.licence_status, source.attribution_required, source.active, source.internal_notes]);
      check(inserted.rows.length === 1 && inserted.rows[0].payload?.code === source.code, 'Planned source already exists or concurrent source creation; no adoption');
      created.push(inserted.rows[0].payload);
    }
    const sources = await readSourceRows(db);
    assertSourcePolicies(plan, sources, environment, true);
    recordSourceCreations(db, created, sources, plan.new_sources[environment].length);
    return new Map(sources.map(source => [source.code, source.id]));
  };
}

export function rollbackReceipt(journal, plan) {
  check(journal.status === 'published_manifest_and_public_bytes_verified', 'Rollback receipt requires verified publication');
  const provenance = journal.preservation?.created_provenance_sources;
  check(Array.isArray(provenance) && provenance.length === 0, 'Exact created inactive source receipt required for rollback');
  const created = journal.assets.filter(a => a.created).map(a => {
    const row = plan.rows.find(r => r.printing_id === a.printing_id);
    check(row && /^[a-f0-9-]{36}$/u.test(a.id), 'Invalid rollback asset binding');
    return { id: a.id, printing_id: a.printing_id, asset_id: assetId(row), sha256: row.objects[0].sha256 };
  });
  return { status: 'prepared_not_executed', cohort_sha256: COHORT_SHA, publication_revision: journal.revision, publication_verified_at: journal.verified_at, action: 'Hide only assets created by this successful publication; retain immutable objects, existing metadata, set marks, links and inactive provenance.', assets: created, retained_inactive_provenance_sources: provenance.map(source => ({ ...source, active: false, licence_status: 'under_review', attribution_required: true })), object_deletion: false, ownership_changes: 0, pricing_changes: 0, metadata_changes: 0, existing_source_policy_changes: 0, source_policy_changes: 0 };
}

export function rollbackSql(receipt) {
  if (!receipt.assets.length) return '-- Idempotent publication created no assets; no rollback writes are required.\n';
  const values = receipt.assets.map(a => `('${a.id}'::uuid,'${a.printing_id}'::uuid,'${a.asset_id}','${a.sha256}')`).join(',\n    ');
  return `-- Prepared only. Review current rows before executing; immutable objects, links and inactive provenance remain.\nBEGIN;\nSET LOCAL statement_timeout='20s';\nSET LOCAL lock_timeout='5s';\nSELECT pg_advisory_xact_lock(hashtext('stackr-artwork3303-publication'));\nCREATE TEMP TABLE artwork_rollback_expected(id uuid,printing_id uuid,asset_id text,sha256 text) ON COMMIT DROP;\nINSERT INTO artwork_rollback_expected VALUES\n    ${values};\nDO $$\nBEGIN\n  IF (SELECT count(*) FROM catalog.assets a JOIN artwork_rollback_expected e USING(id) WHERE a.printing_id=e.printing_id AND a.asset_id=e.asset_id AND a.content_sha256=e.sha256 AND a.variant_id IS NULL AND a.asset_type='card_image' AND a.publicly_servable=true AND a.licensing_review_notes::jsonb->>'cohort_sha256'='${COHORT_SHA}') <> ${receipt.assets.length} THEN\n    RAISE EXCEPTION 'Rollback bindings changed; no assets hidden';\n  END IF;\nEND $$;\nUPDATE catalog.assets a SET publicly_servable=false FROM artwork_rollback_expected e WHERE a.id=e.id;\nCOMMIT;\n`;
}

async function main() {
  assertConfig(process.env);
  check(process.argv.includes('--execute'), 'Explicit workflow execution required');
  const { plan, rows, approval, receipt } = await loadFrozen();
  const output = process.env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_OUTPUT;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'release-decision.json'), JSON.stringify({ cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, approval, existing_source_policy_changes: 0, new_inactive_provenance_sources: [], physical_finish_verified: false, catalogue_changes: 0 }, null, 2));
  await publishFrozenCohort({ rows, receipt, approval, root: process.env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PACKAGES, output, sourceResolver: createSourceResolver(plan), transferPolicy: createTransferPolicy(), metadataGuard: createMetadataGuard(plan, { privateOutput: process.env.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PRIVATE_OUTPUT }) });
  const journal = JSON.parse(await readFile(path.join(output, 'receipt.json')));
  const rollback = rollbackReceipt(journal, plan);
  await writeFile(path.join(output, 'rollback-receipt.json'), JSON.stringify(rollback, null, 2));
  await writeFile(path.join(output, 'rollback.sql'), rollbackSql(rollback));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
