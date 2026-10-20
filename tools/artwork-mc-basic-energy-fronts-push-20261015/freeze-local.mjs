// Offline final freeze only. Final postTCGCollector3 source checkpoint is mandatory.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, indexObjects, validateSourcePlan, NEW_SOURCE_POLICY } from './frozen.mjs';
import { canonicalHash, publicationBody } from './source-proof.mjs';
const root = process.argv[2]; check(root, 'Authoritative continuation root required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === 'b9463177be4591502465ed5588a189ede11c41c009f32b55a923b56ee16cebee', 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
check(inputs.archive.id > 0 && inputs.source_checkpoint?.sha256 && inputs.before_snapshots && inputs.bindings, 'Immutable release and final postTCGCollector3 full-source checkpoint required');
const pinned = async (file, expected) => { const bytes = await readFile(`${root}/${file}`); check(digest(bytes) === expected, `Immutable input changed: ${file}`); return { bytes, value: JSON.parse(bytes) }; };
const checkpoint = (await pinned(inputs.source_checkpoint.file, inputs.source_checkpoint.sha256)).value;
const supplement = (await pinned(inputs.publication_supplement.file, inputs.publication_supplement.sha256)).value;
check(inputs.publication_supplement.sha256 === '597c96b61f46d45dcefacde19856c5659c65465dcad1b2b0b59a075e2ccef46a' && supplement.allConditionalRequirementsSatisfied === true && supplement.publisherFreezeNowAllowed === true && supplement.publicationApproved === true && supplement.newProductionSourcesAllowed === 0 && supplement.requiredPriorProductionRun === 38798480441 && supplement.priorActualApiCardsVerified === 3 && supplement.priorActualImageFilesVerified === 12, 'Verified root publication supplement required');
check(checkpoint.productionRunId === 38798480441 && same(checkpoint.sourceHashes, supplement.sourceFull17Hashes), 'Prior verified production checkpoint changed');
for (const env of ['production','staging']) for (const kind of ['before_snapshots','bindings']) check(supplement.snapshotPins.some(pin=>pin.file === inputs[kind][env].file && pin.sha256 === inputs[kind][env].sha256), 'Fresh snapshot pins required');
const source = await pinned(inputs.source_manifest_file, inputs.source_manifest_sha256);
const packageReceipt = await pinned(inputs.package_receipt_file, inputs.package_receipt_sha256);
const captured = await pinned('mc8-private-capture-receipt.json', inputs.private_capture_receipt_sha256);
check(source.value.fronts === 8 && source.value.entries.length === 8 && source.value.object_references === 32 && packageReceipt.value.fullyDecodedImageFiles === 32 && packageReceipt.value.files === 36 && captured.value.records.length === 8 && packageReceipt.value.productionWrites === 0, 'Exact8 immutable package required');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
check(digest(savedBytes) === inputs.saved_targets_sha256, 'Saved fixed identities changed');
const saved = JSON.parse(savedBytes), snapshots = {}, before = {};
for (const environment of ['production', 'staging']) {
  snapshots[environment] = (await pinned(inputs.bindings[environment].file, inputs.bindings[environment].sha256)).value;
  before[environment] = (await pinned(inputs.before_snapshots[environment].file, inputs.before_snapshots[environment].sha256)).value;
  check(snapshots[environment].cards.length === 8 && before[environment].length === inputs.before_snapshots[environment].rows, 'Exact8 fresh checkpoint count changed');
  for (const [scope, count] of Object.entries({ printings: 8, variants: 8, names: 16, sets: 1 })) check(before[environment].filter(row => row.scope === scope).length === count, `Full checkpoint scope changed: ${scope}`);
  check(before[environment].filter(row => row.scope === 'assets').every(row => ['set_logo', 'set_symbol'].includes(row.payload.asset_type)), 'Current predecessor card image requires separate approval');
}
const rows = source.value.entries.map(entry => {
  const c = entry.catalogue;
  const identity = { printing_id: entry.printing_id, set_id: c.set_id, set_code: c.set_code, language_code: 'ja', collector_number: c.collector_alias, card_native_name: c.current_native_label, catalogue_version_id: c.production_catalogue_version_id, variant_ids: [entry.variant_id], batch_id: entry.batch_id };
  check(same(saved.find(row => row.printing_id === entry.printing_id), identity), 'Source outside saved exact8');
  for (const environment of ['production', 'staging']) {
    const card = snapshots[environment].cards.find(row => row.printing_id === entry.printing_id);
    check(card && card.variant_id === entry.variant_id && card.catalogue_version_id === c[`${environment}_catalogue_version_id`] && card.finish_code === c.current_finish_code && card.variant_code === c.current_variant_code && card.same_artwork_as_variant_id === null, 'Fresh singleton variant/finish/version changed');
    for (const field of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === identity[field], `Fresh current canonical field changed: ${field}`);
  }
  return { ...identity, source_code: 'tcgcollector', provider_id: entry.source.source_card_id, image_url: entry.source.observed_image_url, objects: entry.objects.map(object => ({ ...object, artifact_id: inputs.archive.id })), evidence: {
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
check(policies.production.length === 3 && fullSources.staging.length === 0, 'Exact three production sources and no staging source required');
check(same(inputs.finite_source_policy, NEW_SOURCE_POLICY), 'Initial finite3 TCG policy changed');
const fixtures = [NEW_SOURCE_POLICY];
const sourceHashes = Object.fromEntries(fullSources.production.map(row => [row.code, canonicalHash(row)]));
const bindings = Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(row => selectFields(row, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))]));
const scope = { printings: 8, variants: 8, names: 16, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.value.queue_id, source_manifest_sha256: digest(source.bytes), package_receipt_sha256: digest(packageReceipt.bytes), saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), source_evidence: source.value.authoritative_evidence,
  source_policy_checkpoint_sha256: inputs.source_checkpoint.sha256, existing_source_row_hashes: sourceHashes, publication_supplement_sha256: inputs.publication_supplement.sha256, publication_conditions_satisfied: true, prior_verified_production_run: 38798480441, maximum_new_production_sources: 0,
  private_capture_receipt_sha256: inputs.private_capture_receipt_sha256,
  archive: inputs.archive, archive_metadata: inputs.metadata, rows, source_counts: { tcgcollector: 8 }, delivery_scope: source.value.delivery_scope,
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope }, source_policies: policies, new_sources: { production: [], staging: fixtures },
};
validateSourcePlan(plan);
check(indexObjects(rows).size === 32, 'Exact32 frozen image objects required');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const approval = { schemaVersion: 1, approved: true, fronts: 8, store_resize_display: true, decision_type: DECISION, language_code: 'ja', source_wide_approval: false, human_review_required: false, vendor_licence_verified: false, approved_at: '2026-10-15', cohort_sha256: digest(planBytes), source_counts: { tcgcollector: 8 }, source_evidence: source.value.authoritative_evidence, source_policy_checkpoint_sha256: inputs.source_checkpoint.sha256, scope: 'Exactly8 Japanese MC Basic Energy fronts,8normal. Unchanged WEBP868x1212 originals and24no-enlargement derivatives. Fresh three-source checkpoint satisfies historical conditional approval separately from immutable private archive.0new production sources; preserve all3full17 source rows and initial finite3 TCGCollector notes. Actual type-glyph titles and printed MC/type footer codes, no numeric collector/Dex/Pokemon body, physical/vendor/source-wide certification.' };
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [file, bytes] of [['plan.json', planBytes], ['approval.json', approvalBytes], ['identity-table.json', tableBytes]]) await writeFile(new URL(`./${file}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), SAVED_TARGETS_SHA: digest(savedBytes), SOURCE_MANIFEST_SHA: digest(source.bytes), ARCHIVE_SHA: inputs.archive.sha256 })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = '${value}';`);
for (const [name, value] of Object.entries({ ARCHIVE_ID: inputs.archive.id, ARCHIVE_BYTES: inputs.archive.byte_size })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${value};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = (?:(?:"[^"]+")|None)/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ plan: digest(planBytes), approval: digest(approvalBytes), table: digest(tableBytes), fronts: 8, plannedProductionSourceRows: 0, databaseRequests: 0 }));
