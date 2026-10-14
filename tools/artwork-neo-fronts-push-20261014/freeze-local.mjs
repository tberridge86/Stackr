// Offline preparation only. The production workflow never invokes this file.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

const root = process.argv[2];
check(root, 'Authoritative local handoff directory required');
const inputsBytes = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(inputsBytes) === '33fb649e8886f173e7d4d85134c82e82db4672010fc09d2fb6f919d523a5539c', 'Frozen input descriptor changed');
const inputs = JSON.parse(inputsBytes);
const sourceBytes = await readFile(`${root}/${inputs.source_manifest_file}`);
check(digest(sourceBytes) === inputs.source_manifest_sha256, 'Authoritative source manifest changed');
const source = JSON.parse(sourceBytes);
const packageBytes = await readFile(`${root}/${inputs.package_receipt_file}`);
check(digest(packageBytes) === inputs.package_receipt_sha256, 'Verified package receipt changed');
const packageReceipt = JSON.parse(packageBytes);
check(packageReceipt.fronts === 25 && packageReceipt.verifiedImageReferences === 100 && packageReceipt.productionWrites === 0, 'Wrong prepared package scope');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
check(digest(savedBytes) === inputs.saved_targets_sha256, 'Saved fixed batch identities changed');
const saved = JSON.parse(savedBytes);
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const result = JSON.parse(await readFile(`${root}/publish-review/${inputs.binding_prefix}-${environment}-bindings.json`));
  check(result.length === 1 && result[0].snapshot.cards.length === 25, 'Wrong current binding scope');
  snapshots[environment] = result[0].snapshot;
  const before = JSON.parse(await readFile(`${root}/publish-review/${inputs.binding_prefix}-${environment}-before.json`));
  const metadata = before.filter(row => ['printings', 'variants', 'names', 'sets'].includes(row.scope));
  check(metadata.length === 101 && before.filter(row => row.scope === 'assets').length === 2, 'Existing metadata/set mark scope changed');
  check(before.filter(row => row.scope === 'assets').every(row => ['set_logo', 'set_symbol'].includes(row.payload.asset_type)), 'Unexpected existing card image; review required');
}
check(source.fronts === 25 && source.entries.length === 25 && source.object_references === 100 && saved.length === 25, 'Wrong fixed batch size');
check(source.approval.ownerFiniteStoreResizeDisplayDecision === true && source.approval.vendorLicenceVerified === false && source.approval.sourcewideApproval === false && source.approval.physicalEditionVerified === false && source.approval.physicalFinishVerified === false, 'Unsupported finite decision');
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
const scope = { printings: 25, variants: 25, names: 50, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.queue_id, source_manifest_sha256: digest(sourceBytes), package_receipt_sha256: digest(packageBytes), saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), archive: inputs.archive, archive_metadata: inputs.metadata, rows,
  source_counts: { scrydex: 25 }, delivery_scope: { fixed_batch_id: 'JP-CARDS-003', eligible_fronts: 25, whole_batch_completion_asserted: false },
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [], staging: existing },
};
check(inputs.archive.file_count === indexObjects(rows).size + inputs.metadata.length, 'Wrong exact archive members');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const inherited = JSON.parse(await readFile(new URL('../artwork-next-push-20261013/approval.json', import.meta.url)));
const approval = { ...inherited, fronts: 25, language_code: 'ja', approved_at: '2026-10-14', cohort_sha256: digest(planBytes), source_counts: { scrydex: 25 }, scope: 'Store, resize and display exactly 25 inspected Japanese Neo1 originals and 75 derivatives. Preserve canonical aliases, current native labels, 20 normal and 5 holo metadata bindings and staging-only catalogue version difference. Printed National Dex numbers are separate from catalogue aliases. No native-name corrections, inferred copyright year, physical edition/foil certification, independent vendor licence or source-wide activation. Existing immutable set logo/symbol assets and links remain.' };
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [file, bytes] of [['identity-table.json', tableBytes], ['plan.json', planBytes], ['approval.json', approvalBytes]]) await writeFile(new URL(`./${file}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes) })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = '${value}';`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = "[^"]+"/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ cohort_sha256: digest(planBytes), approval_sha256: digest(approvalBytes), identity_table_sha256: digest(tableBytes), archive_id: inputs.archive.id, fronts: 25, database_requests: 0, network_requests: 0 }));
