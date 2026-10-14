// Offline preparation only. The production workflow never invokes this file.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

const root = process.argv[2];
check(root, 'Authoritative local handoff directory required');
const inputsBytes = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(inputsBytes) === '5162bd46eee684084f5cb7cab51784d999b0ca7bd29c679173882c02912ff20b', 'Frozen input descriptor changed');
const inputs = JSON.parse(inputsBytes);
const sourceBytes = await readFile(`${root}/${inputs.source_manifest_file}`);
check(digest(sourceBytes) === inputs.source_manifest_sha256, 'Authoritative source manifest changed');
const source = JSON.parse(sourceBytes);
const packageBytes = await readFile(`${root}/${inputs.package_receipt_file}`);
check(digest(packageBytes) === inputs.package_receipt_sha256, 'Verified package receipt changed');
const packageReceipt = JSON.parse(packageBytes);
check(packageReceipt.fronts === 22 && packageReceipt.verifiedImageReferences === 88 && packageReceipt.productionWrites === 0, 'Wrong prepared package scope');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
check(digest(savedBytes) === inputs.saved_targets_sha256, 'Saved fixed batch identities changed');
const saved = JSON.parse(savedBytes);
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const bindingBytes = await readFile(`${root}/publish-review/${inputs.binding_prefix}-${environment}-bindings.json`);
  check(digest(bindingBytes) === inputs.binding_snapshots[environment].sha256, 'Fresh exact binding snapshot changed');
  const result = JSON.parse(bindingBytes);
  check(result.length === 1 && result[0].snapshot.cards.length === 22, 'Wrong current binding scope');
  snapshots[environment] = result[0].snapshot;
  const beforeBytes = await readFile(`${root}/publish-review/${inputs.binding_prefix}-${environment}-before.json`);
  check(digest(beforeBytes) === inputs.before_snapshots[environment].sha256, 'Private baseline changed');
  const before = JSON.parse(beforeBytes);
  check(before.filter(row => row.scope === 'sources').length === (environment === 'production' ? 1 : 0), 'Full baseline source scope changed');
  const metadata = before.filter(row => ['printings', 'variants', 'names', 'sets'].includes(row.scope));
  check(metadata.length === 89 && before.length === (environment === 'production' ? 94 : 91) && before.filter(row => row.scope === 'assets').length === 2 && before.filter(row => row.scope === 'links').length === (environment === 'production' ? 2 : 0), 'Existing metadata/set mark scope changed');
  check(before.filter(row => row.scope === 'assets').every(row => ['set_logo', 'set_symbol'].includes(row.payload.asset_type)), 'Unexpected existing card image; review required');
}
check(isDeepStrictEqual(source.authoritative_evidence, { original_handoff_sha256: inputs.original_handoff_sha256, exact_metadata_targets_sha256: inputs.exact_metadata_targets_sha256, finite_decision_sha256: inputs.finite_decision_sha256, root_request_scope_sha256: inputs.root_request_scope_sha256, reader_recovery_decision_sha256: inputs.reader_recovery_decision_sha256 }), 'New exact source/decision evidence changed');
check(source.fronts === 22 && source.entries.length === 22 && source.object_references === 88 && saved.length === 22, 'Wrong fixed batch size');
check(source.approval.ownerFiniteStoreResizeDisplayDecision === true && source.approval.vendorLicenceVerified === false && source.approval.sourcewideApproval === false && source.approval.physicalEditionVerified === false && source.approval.physicalFinishVerified === false, 'Unsupported finite decision');
check(isDeepStrictEqual(source.delivery_scope, { fixed_batch_id: 'JP-CARDS-005', saved_batch_tasks: 25, eligible_fronts: 22, excluded_aliases: ['073', '074', '075'], exclusion_reason: 'Three Trainer aliases lack exact canonical-to-source identity evidence', whole_batch_completion_asserted: false }), 'Saved partial batch scope changed');
const rows = source.entries.map(entry => {
  const catalogue = entry.catalogue;
  const previous = saved.find(row => row.printing_id === entry.printing_id);
  const identity = { printing_id: entry.printing_id, set_id: catalogue.set_id, set_code: catalogue.set_code, language_code: catalogue.language_code, collector_number: catalogue.collector_alias, card_native_name: catalogue.current_native_label, catalogue_version_id: catalogue.production_catalogue_version_id, variant_ids: [entry.variant_id], batch_id: entry.batch_id };
  check(previous && isDeepStrictEqual(identity, previous), 'Source outside saved fixed batch');
  for (const environment of ['production', 'staging']) {
    const cards = snapshots[environment].cards.filter(card => card.printing_id === entry.printing_id);
    check(cards.length === 1 && cards[0].variant_id === entry.variant_id, 'Current singleton variant changed');
    const card = cards[0];
    for (const key of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[key] === identity[key], `Current identity changed: ${key}`);
    check(card.catalogue_version_id === catalogue[`${environment}_catalogue_version_id`] && card.variant_code === catalogue.current_variant_code && card.finish_code === catalogue.current_finish_code && card.same_artwork_as_variant_id === null, 'Current version or finish changed');
  }
  return {
    ...identity, source_code: 'scrydex', provider_id: entry.source.source_card_id, image_url: entry.source.observed_image_url,
    objects: entry.objects.map(object => ({ ...object, artifact_id: inputs.archive.id })),
    evidence: {
      source_url: entry.source.observed_image_url, source_page_url: entry.source.source_page_url, provider_id: entry.source.source_card_id,
      source_metadata_sha256: entry.source.metadata_sha256, source_signature: entry.source.signature,
      source_body: entry.source.body, printed_identity: entry.source.printed_identity, pixel_identity: entry.source.pixel_observations,
      identity_limits: entry.identity_limits, artwork_scope: 'printing_front', source_kind: 'third_party_original',
      identity_checks: { savedMetadataMatched: true, currentProductionCardBindingMatched: true, printedNationalDexOpticallyVerified: true, canonicalAliasIsNotPrintedNationalDex: true, physicalFinishVerified: false },
      exact_finish_verified: false, vendor_licence_verified: false, physical_edition_verified: false,
      owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false },
    },
  };
});
const table = rows.map(row => ({
  ...selectFields(row, ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url']),
  printed_native_name: row.evidence.source_body.printed_name, printed_national_dex: row.evidence.source_body.printed_dex_number,
  evidence_sha256: digest(Buffer.from(JSON.stringify(row.evidence))), original_sha256: row.objects[0].sha256,
  original_width: row.objects[0].width, original_height: row.objects[0].height,
})).sort((a, b) => a.printing_id.localeCompare(b.printing_id));
const tableBytes = Buffer.from(JSON.stringify(table, null, 2) + '\n');
const existing = (snapshots.production.sources ?? []).map(policy => selectFields(policy, SOURCE_FIELDS));
check(existing.length === 1 && existing[0].code === 'scrydex' && !(snapshots.staging.sources ?? []).length, 'Existing source policy scope changed');
const bindings = Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(card => selectFields(card, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))]));
for (const card of bindings.production) {
  const staging = bindings.staging.find(other => other.variant_id === card.variant_id);
  check(isDeepStrictEqual({ ...card, catalogue_version_id: staging.catalogue_version_id }, staging), 'Only staging catalogue version may differ');
}
const scope = { printings: 22, variants: 22, names: 44, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.queue_id, original_handoff_sha256: inputs.original_handoff_sha256, exact_metadata_targets_sha256: inputs.exact_metadata_targets_sha256, finite_decision_sha256: inputs.finite_decision_sha256, root_request_scope_sha256: inputs.root_request_scope_sha256, reader_recovery_decision_sha256: inputs.reader_recovery_decision_sha256, source_manifest_sha256: digest(sourceBytes), package_receipt_sha256: digest(packageBytes), saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), archive: inputs.archive, archive_metadata: inputs.metadata, rows,
  source_counts: { scrydex: 22 }, delivery_scope: { fixed_batch_id: 'JP-CARDS-005', saved_batch_tasks: 25, eligible_fronts: 22, excluded_printing_ids: ['60c39900-94fe-420b-b997-60e9c64f3491', '56ae4a00-656c-4564-8d7a-831db2900857', '331a9eb6-75c4-47f1-97c8-ad2c55884ba3'], excluded_aliases: ['073', '074', '075'], exclusion_reason: 'Three Trainer aliases lack exact canonical-to-source identity evidence', whole_batch_completion_asserted: false },
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [], staging: existing },
};
check(inputs.archive.file_count === indexObjects(rows).size + inputs.metadata.length, 'Wrong exact archive members');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const decisionBytes = await readFile(`${root}/${inputs.finite_decision_file}`);
check(digest(decisionBytes) === inputs.finite_decision_sha256, 'New exact finite decision changed');
const decision = JSON.parse(decisionBytes);
check(decision.approved === true && decision.storeResizeDisplay === true && decision.scope.batchId === 'JP-CARDS-005' && decision.scope.fronts === 22 && decision.extraOwnerBatchReviewRequired === false, 'New exact finite decision required');
const approval = {
  schemaVersion: 1, approved: true, fronts: 22, store_resize_display: true,
  decision_type: DECISION, language_code: 'ja', source_wide_approval: false,
  human_review_required: false, vendor_licence_verified: false,
  approved_at: '2026-10-14', cohort_sha256: digest(planBytes),
  owner_instructions: decision.ownerInstructions, finite_decision_sha256: digest(decisionBytes),
  root_request_scope_sha256: decision.targetScopeSha256, reader_recovery_decision_sha256: inputs.reader_recovery_decision_sha256, source_counts: { scrydex: 22 },
  scope: 'Store, resize and display exactly 22 acquired and inspected Japanese Neo1 originals and 66 derivatives from JP-CARDS-005. The fixed batch has 25 tasks; three unbound Trainer aliases 073-075 remain excluded. Whole-batch completion is false. Preserve canonical aliases, current native labels, 18 normal and 4 holo metadata bindings and staging-only catalogue version difference. Printed National Dex numbers remain separate. No native-name corrections, inferred copyright year, physical edition/foil certification, independent vendor licence or source-wide activation. Existing immutable set logo/symbol assets, links and full source policies remain.',
};
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [file, bytes] of [['identity-table.json', tableBytes], ['plan.json', planBytes], ['approval.json', approvalBytes]]) await writeFile(new URL(`./${file}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), SAVED_TARGETS_SHA: digest(savedBytes), SOURCE_MANIFEST_SHA: digest(sourceBytes), ARCHIVE_SHA: inputs.archive.sha256 })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = '${value}';`);
for (const [name, value] of Object.entries({ ARCHIVE_ID: inputs.archive.id, ARCHIVE_BYTES: inputs.archive.byte_size })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${value};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = "[^"]+"/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ cohort_sha256: digest(planBytes), approval_sha256: digest(approvalBytes), identity_table_sha256: digest(tableBytes), archive_id: inputs.archive.id, fronts: 22, database_requests: 0, network_requests: 0 }));
