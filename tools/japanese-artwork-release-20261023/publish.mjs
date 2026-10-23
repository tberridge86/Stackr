import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assetId, createTransferPolicy, publishFrozenCohort } from '../artwork3303-publish-20260928/publish.mjs';
import { createMetadataGuard, createSourceResolver } from './metadata-guard.mjs';
export { createSourceResolver } from './metadata-guard.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const isWithin = (child, parent) => child === parent || child.startsWith(parent + path.sep);

export function assertConfig(env) {
  check(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Protected manual workflow required');
  check(env.STACKR_JAPANESE_ARTWORK_CONFIRMATION === 'PUBLISH JAPANESE ARTWORK', 'Exact Japanese artwork confirmation required');
  baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' });
  check(env.STACKR_JAPANESE_ARTWORK_PACKAGES && env.STACKR_JAPANESE_ARTWORK_OUTPUT, 'Prepared package and receipt directories required');
  if (env.STACKR_JAPANESE_ARTWORK_PRIVATE_OUTPUT) {
    const publicOutput = path.resolve(env.STACKR_JAPANESE_ARTWORK_OUTPUT), privateOutput = path.resolve(env.STACKR_JAPANESE_ARTWORK_PRIVATE_OUTPUT);
    check(!isWithin(privateOutput, publicOutput) && !isWithin(publicOutput, privateOutput), 'Private before images must be separate from public receipts');
  }
}

export function rollbackReceipt(journal, plan, cohortSha256) {
  check(SHA256.test(cohortSha256 ?? '') && journal.cohort_sha256 === cohortSha256 && journal.status === 'published_manifest_and_public_bytes_verified', 'Rollback requires the exact successfully verified cohort');
  check(journal.preservation?.status === 'all_existing_scoped_rows_preserved' && journal.preservation.metadata_changes === 0 && journal.preservation.existing_source_policy_changes === 0 && journal.preservation.source_policy_changes === 0 && Array.isArray(journal.preservation.created_provenance_sources) && journal.preservation.created_provenance_sources.length === 0, 'Production preservation receipt required; source rollback is prohibited');
  check(journal.ownership_changes === 0 && journal.pricing_changes === 0 && journal.metadata_changes === 0 && /^[a-f0-9]{40}$/u.test(journal.revision ?? '') && typeof journal.verified_at === 'string' && Number.isFinite(Date.parse(journal.verified_at)), 'Verified production publication identity required');
  check(Array.isArray(journal.assets) && journal.assets.length === plan.rows.length && new Set(journal.assets.map(asset => asset.id)).size === journal.assets.length && new Set(journal.assets.map(asset => asset.printing_id)).size === journal.assets.length, 'Complete unique published asset journal required');
  check(journal.preservation.created_assets === journal.assets.filter(asset => asset.created).length, 'Rollback asset creations differ from preservation receipt');
  const bound = journal.assets.map(asset => {
    const row = plan.rows.find(item => item.printing_id === asset.printing_id);
    check(row && UUID.test(asset.id) && UUID.test(asset.printing_id) && typeof asset.created === 'boolean' && SHA256.test(row.objects[0].sha256), 'Invalid rollback asset binding');
    return { ...asset, asset_id: assetId(row), sha256: row.objects[0].sha256 };
  });
  return { status: 'prepared_not_executed', cohort_sha256: cohortSha256, publication_revision: journal.revision, publication_verified_at: journal.verified_at, action: 'Hide only assets created by this successful publication; retain immutable objects, existing metadata, set marks, links and inactive provenance.', assets: bound.filter(asset => asset.created).map(({ id, printing_id, asset_id, sha256 }) => ({ id, printing_id, asset_id, sha256 })), retained_inactive_provenance_sources: [], object_deletion: false, ownership_changes: 0, pricing_changes: 0, metadata_changes: 0, existing_source_policy_changes: 0, source_policy_changes: 0 };
}

export function rollbackSql(receipt) {
  check(receipt.status === 'prepared_not_executed' && SHA256.test(receipt.cohort_sha256 ?? '') && receipt.object_deletion === false && Array.isArray(receipt.assets), 'Prepared rollback receipt required');
  check(new Set(receipt.assets.map(asset => asset.id)).size === receipt.assets.length, 'Duplicate rollback asset');
  for (const asset of receipt.assets) check(UUID.test(asset.id ?? '') && UUID.test(asset.printing_id ?? '') && SHA256.test(asset.sha256 ?? '') && asset.asset_id === assetId({ printing_id: asset.printing_id, objects: [{ sha256: asset.sha256 }] }), 'Unsafe rollback binding');
  if (!receipt.assets.length) return '-- Publication created no assets; no rollback writes are required.\n';
  const values = receipt.assets.map(asset => `('${asset.id}'::uuid,'${asset.printing_id}'::uuid,'${asset.asset_id}','${asset.sha256}')`).join(',\n    ');
  return `-- Prepared only. Immutable objects, existing metadata, links and inactive provenance remain.\nBEGIN;\nSET LOCAL statement_timeout='20s';\nSET LOCAL lock_timeout='5s';\nSELECT pg_advisory_xact_lock(hashtext('stackr-artwork3303-publication'));\nCREATE TEMP TABLE artwork_rollback_expected(id uuid,printing_id uuid,asset_id text,sha256 text) ON COMMIT DROP;\nINSERT INTO artwork_rollback_expected VALUES\n    ${values};\nDO $$\nBEGIN\n  PERFORM a.id FROM catalog.assets a JOIN artwork_rollback_expected e USING(id) FOR UPDATE OF a;\n  IF (SELECT count(*) FROM catalog.assets a JOIN artwork_rollback_expected e USING(id) WHERE a.printing_id=e.printing_id AND a.asset_id=e.asset_id AND a.content_sha256=e.sha256 AND a.variant_id IS NULL AND a.asset_type='card_image' AND a.publicly_servable=true AND a.licensing_review_notes::jsonb->>'cohort_sha256'='${receipt.cohort_sha256}') <> ${receipt.assets.length} THEN\n    RAISE EXCEPTION 'Rollback bindings changed; no assets hidden';\n  END IF;\nEND $$;\nUPDATE catalog.assets a SET publicly_servable=false FROM artwork_rollback_expected e WHERE a.id=e.id;\nCOMMIT;\n`;
}

async function main() {
  assertConfig(process.env);
  check(process.argv.includes('--execute'), 'Explicit protected workflow execution required');
  const { COHORT_SHA, APPROVAL_SHA, loadFrozen } = await import('./frozen.mjs');
  const { plan, rows, approval, receipt } = await loadFrozen();
  const output = process.env.STACKR_JAPANESE_ARTWORK_OUTPUT;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'release-decision.json'), JSON.stringify({ cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, approval, fronts: rows.length, existing_source_policy_changes: 0, production_source_creations: 0, source_activation: false, physical_finish_verified: false, catalogue_changes: 0 }, null, 2));
  await publishFrozenCohort({ rows, receipt, approval, root: process.env.STACKR_JAPANESE_ARTWORK_PACKAGES, output, sourceResolver: createSourceResolver(plan), transferPolicy: createTransferPolicy(), metadataGuard: createMetadataGuard(plan, { privateOutput: process.env.STACKR_JAPANESE_ARTWORK_PRIVATE_OUTPUT }) });
  const journal = JSON.parse(await readFile(path.join(output, 'receipt.json')));
  const rollback = rollbackReceipt(journal, plan, COHORT_SHA);
  await writeFile(path.join(output, 'rollback-receipt.json'), JSON.stringify(rollback, null, 2));
  await writeFile(path.join(output, 'rollback.sql'), rollbackSql(rollback));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
