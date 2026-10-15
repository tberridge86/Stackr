// Offline final freeze only. Final postLegacy8 source checkpoint is mandatory.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, indexObjects, validateSourcePlan } from './frozen.mjs';
import { canonicalHash, publicationBody } from './source-proof.mjs';
const root = process.argv[2]; check(root, 'Authoritative continuation root required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === '0dba537dfa64e271f2e14005084044b54e37c563ec8dbd421f773c230f7978f9', 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
check(inputs.archive.id > 0 && inputs.source_checkpoint?.sha256 && inputs.before_snapshots && inputs.bindings, 'Immutable release and final postLegacy8 full-source checkpoint required');
const pinned = async (file, expected) => { const bytes = await readFile(`${root}/${file}`); check(digest(bytes) === expected, `Immutable input changed: ${file}`); return { bytes, value: JSON.parse(bytes) }; };
const checkpoint = (await pinned(inputs.source_checkpoint.file, inputs.source_checkpoint.sha256)).value;
const supplement = (await pinned(inputs.publication_supplement.file, inputs.publication_supplement.sha256)).value;
const finite = (await pinned(inputs.base_finite_decision.file, inputs.base_finite_decision.sha256)).value;
const approvedProjection = (await pinned(inputs.approved_projection.file, inputs.approved_projection.sha256)).value;
await pinned(inputs.private_source_contract.file, inputs.private_source_contract.sha256);
await pinned(inputs.root_upload_receipt.file, inputs.root_upload_receipt.sha256);
check(supplement.publicationApproved === true && supplement.printingCount === 100 && supplement.expectedProductionBeforeRows === 409 && supplement.expectedProductionAfterRows === 609 && supplement.expectedStagingRowsBeforeAndAfterRollback === 402 && supplement.newProductionSourceRowsAllowed === 0 && supplement.existingSourcePolicyUpdatesAllowed === 0 && supplement.sourcePolicyCheckpointSha256 === inputs.source_checkpoint.sha256 && supplement.baseFiniteDecisionSha256 === inputs.base_finite_decision.sha256, 'Exact additive3-source preservation authority required');
check(finite.preparationApproved && finite.publicationApproved && finite.printingCount === 100 && finite.contextOnlyEnergyDecision.count === 7 && finite.contextOnlyEnergyDecision.genericPrintedScriptGateSatisfied === false && approvedProjection.rows.length === 100, 'Exact finite100 and7context-only source authority required');
const source = await pinned(inputs.source_manifest_file, inputs.source_manifest_sha256);
const packageReceipt = await pinned(inputs.package_receipt_file, inputs.package_receipt_sha256);
const captured = await pinned('expansion100-private-capture-receipt.json', inputs.private_capture_receipt_sha256);
check(source.value.fronts === 100 && source.value.entries.length === 100 && source.value.object_references === 400 && packageReceipt.value.fullyDecodedImageFiles === 400 && packageReceipt.value.files === 404 && captured.value.rows.length === 100 && packageReceipt.value.productionWrites === 0, 'Exact100 immutable package required');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
check(digest(savedBytes) === inputs.saved_targets_sha256, 'Saved fixed identities changed');
const saved = JSON.parse(savedBytes), snapshots = {}, before = {};
for (const environment of ['production', 'staging']) {
  snapshots[environment] = (await pinned(inputs.bindings[environment].file, inputs.bindings[environment].sha256)).value;
  before[environment] = (await pinned(inputs.before_snapshots[environment].file, inputs.before_snapshots[environment].sha256)).value;
  check(snapshots[environment].cards.length === 100 && before[environment].length === inputs.before_snapshots[environment].rows, 'Exact100 fresh checkpoint count changed');
  for (const [scope, count] of Object.entries({ printings: 100, variants: 100, names: 200, sets: 1 })) check(before[environment].filter(row => row.scope === scope).length === count, `Full checkpoint scope changed: ${scope}`);
  check(before[environment].filter(row => row.scope === 'assets').every(row => ['set_logo', 'set_symbol'].includes(row.payload.asset_type)), 'Current predecessor card image requires separate approval');
}
const rows = source.value.entries.map(entry => {
  const c = entry.catalogue;
  const identity = { printing_id: entry.printing_id, set_id: c.set_id, set_code: c.set_code, language_code: 'ja', collector_number: c.collector_alias, card_native_name: c.current_native_label, catalogue_version_id: c.production_catalogue_version_id, variant_ids: [entry.variant_id], batch_id: entry.batch_id };
  check(same(saved.find(row => row.printing_id === entry.printing_id), identity), 'Source outside saved exact97');
  for (const environment of ['production', 'staging']) {
    const card = snapshots[environment].cards.find(row => row.printing_id === entry.printing_id);
    check(card && card.variant_id === entry.variant_id && card.catalogue_version_id === c[`${environment}_catalogue_version_id`] && card.finish_code === c.current_finish_code && card.variant_code === c.current_variant_code && card.same_artwork_as_variant_id === null, 'Fresh singleton variant/finish/version changed');
    for (const field of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === identity[field], `Fresh current canonical field changed: ${field}`);
  }
  return { ...identity, source_code: 'pokellector', provider_id: entry.source.source_card_id, image_url: entry.source.observed_image_url, objects: entry.objects.map(object => ({ ...object, artifact_id: inputs.archive.id })), evidence: {
    source_url: entry.source.observed_image_url, source_page_url: entry.source.source_page_url, provider_id: entry.source.source_card_id,
    source_metadata_sha256: entry.source.metadata_sha256, source_body: publicationBody(entry.source.body), artwork_scope: 'printing_front', source_kind: 'third_party_original', exact_finish_verified: false, vendor_licence_verified: false, physical_edition_verified: false,
    owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false },
  } };
});
const fields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const table = rows.map(row => ({ ...selectFields(row, fields), original_sha256: row.objects[0].sha256, original_width: row.objects[0].width, original_height: row.objects[0].height, body_sha256: digest(Buffer.from(JSON.stringify(row.evidence.source_body))), evidence_sha256: digest(Buffer.from(JSON.stringify(row.evidence))) })).sort((a, b) => a.printing_id.localeCompare(b.printing_id));
const tableBytes = Buffer.from(JSON.stringify(table, null, 2) + '\n');
const fullSources = Object.fromEntries(['production', 'staging'].map(environment => [environment, before[environment].filter(row => row.scope === 'sources').map(row => row.payload)]));
const policies = Object.fromEntries(['production', 'staging'].map(environment => [environment, fullSources[environment].map(row => selectFields(row, SOURCE_FIELDS)).sort((a, b) => a.code.localeCompare(b.code))]));
check(policies.production.length === 3 && policies.production.some(row => row.code === 'scrydex') && policies.production.some(row => row.code === 'pokellector'), 'All3 existing full17 source rows required');
const photoSource = policies.production.find(row => row.code === 'pokellector');
const fixtures = policies.staging.some(row => row.code === 'pokellector') ? [] : [photoSource];
const sourceHashes = Object.fromEntries(fullSources.production.map(row => [row.code, canonicalHash(row)]));
check(same(sourceHashes, checkpoint.sourceHashes) && same(sourceHashes, supplement.sourceFull17Hashes) && fullSources.production.every(row => Object.keys(row).length === 17), 'All3 immutable full17 source rows must match fresh checkpoint');
const bindings = Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(row => selectFields(row, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))]));
const scope = { printings: 100, variants: 100, names: 200, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.value.queue_id, source_manifest_sha256: digest(source.bytes), package_receipt_sha256: digest(packageReceipt.bytes), saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), source_evidence: inputs.source_evidence,
  source_policy_checkpoint_sha256: inputs.source_checkpoint.sha256, existing_source_row_hashes: sourceHashes,
  private_capture_receipt_sha256: inputs.private_capture_receipt_sha256,
  archive: inputs.archive, archive_metadata: inputs.metadata, rows, source_counts: { pokellector: 100 }, delivery_scope: source.value.delivery_scope,
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope }, source_policies: policies, new_sources: { production: [], staging: fixtures },
};
validateSourcePlan(plan);
check(indexObjects(rows).size === 400, 'Exact400 frozen image objects required');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const approval = { schemaVersion: 1, approved: true, fronts: 100, store_resize_display: true, decision_type: DECISION, language_code: 'ja', source_wide_approval: false, human_review_required: false, vendor_licence_verified: false, approved_at: '2026-10-15', cohort_sha256: digest(planBytes), source_counts: { pokellector: 100 }, source_evidence: inputs.source_evidence, source_policy_checkpoint_sha256: inputs.source_checkpoint.sha256, scope: 'Exactly100 Japanese Expansion Pack fronts67Pokemon26Trainer7context-onlyEnergy,86normal14holo;057058finishheld.4PNG96WebP originalbytes plus300no-enlargement derivatives. Finite contextual Japanese/set basis for Energy096–102, no printed script/name/rule/artist/collector or setmark claim. Exact091TRAINERHP10/noDex exception. Preserve all3 existing full17 source rows including unusedTCG, all canonical metadata and old assets/links.409→609production,402stage rollback;0 new production sources or policy edits. Archive408/two-source history unchanged, additive supplement current.' };
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [file, bytes] of [['plan.json', planBytes], ['approval.json', approvalBytes], ['identity-table.json', tableBytes]]) await writeFile(new URL(`./${file}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), SAVED_TARGETS_SHA: digest(savedBytes), SOURCE_MANIFEST_SHA: digest(source.bytes), ARCHIVE_SHA: inputs.archive.sha256 })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = '${value}';`);
for (const [name, value] of Object.entries({ ARCHIVE_ID: inputs.archive.id, ARCHIVE_BYTES: inputs.archive.byte_size })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${value};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = (?:(?:"[^"]+")|None)/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ plan: digest(planBytes), approval: digest(approvalBytes), table: digest(tableBytes), fronts: 100, sourceRowsInserted: 0, databaseRequests: 0 }));
