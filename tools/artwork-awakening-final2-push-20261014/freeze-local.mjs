// Offline freezing only; the production workflow never invokes this helper.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { publicationBody } from './source-proof.mjs';

const root = process.argv[2];
check(root, 'Authoritative local source directory required');
const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(descriptor) === 'cb8d79d38d1ed429a1d645d778669a6cf8b1de5d90bb22c5f35717412bb312d5', 'Frozen input descriptor changed');
const inputs = JSON.parse(descriptor);
check(inputs.archive.id > 0, 'Immutable exact-two asset ID is required before final freeze');
const sourceBytes = await readFile(`${root}/${inputs.source_manifest_file}`);
const receiptBytes = await readFile(`${root}/${inputs.package_receipt_file}`);
check(digest(sourceBytes) === inputs.source_manifest_sha256 && digest(receiptBytes) === inputs.package_receipt_sha256, 'Verified source package changed');
const source = JSON.parse(sourceBytes);
const packageReceipt = JSON.parse(receiptBytes);
check(source.fronts === 2 && source.entries.length === 2 && source.object_references === 8 && packageReceipt.fronts === 2 && packageReceipt.fullyDecodedImageFiles === 8 && packageReceipt.files === 12 && packageReceipt.productionWrites === 0 && isDeepStrictEqual(source.authoritative_evidence, inputs.source_evidence), 'Exact accepted package scope changed');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
check(digest(savedBytes) === inputs.saved_targets_sha256, 'Saved fixed source targets changed');
const saved = JSON.parse(savedBytes);
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const bindingBytes = await readFile(`${root}/publish-review/awakening-final2-${environment}-bindings.json`);
  const beforeBytes = await readFile(`${root}/publish-review/awakening-final2-${environment}-before.json`);
  check(digest(bindingBytes) === inputs.bindings[environment].sha256 && digest(beforeBytes) === inputs.before_snapshots[environment].sha256, 'Fresh private baseline/binding changed');
  const result = JSON.parse(bindingBytes);
  check(result.length === 1 && result[0].snapshot.cards.length === 2, 'Wrong exact current binding count');
  snapshots[environment] = result[0].snapshot;
  const before = JSON.parse(beforeBytes);
  const expected = { printings: 2, variants: 2, names: 4, sets: 1, assets: 2, links: environment === 'production' ? 2 : 0, sources: environment === 'production' ? 1 : 0 };
  check(before.length === (environment === 'production' ? 14 : 11), 'Full private baseline count changed');
  for (const [scope, count] of Object.entries(expected)) check(before.filter(row => row.scope === scope).length === count, `Private baseline scope changed: ${scope}`);
  check(before.filter(row => row.scope === 'assets').every(row => ['set_logo', 'set_symbol'].includes(row.payload.asset_type)), 'Existing card images need separate predecessor review');
}
const rows = source.entries.map(entry => {
  const catalogue = entry.catalogue;
  const identity = { printing_id: entry.printing_id, set_id: catalogue.set_id, set_code: catalogue.set_code, language_code: catalogue.language_code, collector_number: catalogue.collector_alias, card_native_name: catalogue.current_native_label, catalogue_version_id: catalogue.production_catalogue_version_id, variant_ids: [entry.variant_id], batch_id: entry.batch_id };
  check(isDeepStrictEqual(saved.find(row => row.printing_id === entry.printing_id), identity), 'Source outside saved exact subset');
  for (const environment of ['production', 'staging']) {
    const card = snapshots[environment].cards.find(card => card.printing_id === identity.printing_id);
    check(card && card.variant_id === entry.variant_id && card.finish_code === catalogue.current_finish_code && card.variant_code === catalogue.current_variant_code && card.catalogue_version_id === catalogue[`${environment}_catalogue_version_id`] && card.same_artwork_as_variant_id === null, 'Singleton variant/finish/version binding changed');
    for (const field of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === identity[field], `Current canonical metadata changed: ${field}`);
  }
  return {
    ...identity, source_code: 'scrydex', provider_id: entry.source.source_card_id, image_url: entry.source.observed_image_url,
    objects: entry.objects.map(object => ({ ...object, artifact_id: inputs.archive.id })),
    evidence: {
      source_url: entry.source.observed_image_url, source_page_url: entry.source.source_page_url,
      provider_id: entry.source.source_card_id, source_metadata_sha256: entry.source.metadata_sha256,
      source_body: publicationBody(entry.source.body), artwork_scope: 'printing_front', source_kind: 'third_party_original',
      exact_finish_verified: false, vendor_licence_verified: false, physical_edition_verified: false,
      owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false },
    },
  };
});
const identityFields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const table = rows.map(row => ({
  ...selectFields(row, identityFields), original_sha256: row.objects[0].sha256,
  original_width: row.objects[0].width, original_height: row.objects[0].height,
  body_sha256: digest(Buffer.from(JSON.stringify(row.evidence.source_body))),
  evidence_sha256: digest(Buffer.from(JSON.stringify(row.evidence))),
})).sort((a, b) => a.printing_id.localeCompare(b.printing_id));
const tableBytes = Buffer.from(JSON.stringify(table, null, 2) + '\n');
const existing = (snapshots.production.sources ?? []).map(policy => selectFields(policy, SOURCE_FIELDS));
check(existing.length === 1 && existing[0].code === 'scrydex' && !(snapshots.staging.sources ?? []).length, 'Exact inactive source policy scope changed');
const bindings = Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(card => selectFields(card, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))]));
const scope = { printings: 2, variants: 2, names: 4, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.queue_id, source_manifest_sha256: digest(sourceBytes),
  package_receipt_sha256: digest(receiptBytes), saved_targets_sha256: digest(savedBytes),
  identity_table_sha256: digest(tableBytes), source_evidence: source.authoritative_evidence,
  archive: inputs.archive, archive_metadata: inputs.metadata, rows,
  source_counts: { scrydex: 2 }, delivery_scope: source.delivery_scope,
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [], staging: existing },
};
check(indexObjects(rows).size === 8 && inputs.archive.file_count === 12, 'Immutable archive member scope changed');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const approval = {
  schemaVersion: 1, approved: true, fronts: 2, store_resize_display: true,
  decision_type: DECISION, language_code: 'ja', source_wide_approval: false,
  human_review_required: false, vendor_licence_verified: false, approved_at: '2026-10-14',
  cohort_sha256: digest(planBytes), source_counts: { scrydex: 2 }, source_evidence: source.authoritative_evidence,
  scope: 'Store, resize and display exactly two independently accepted Japanese Awakening Pokemon fronts and six derivatives. Preserve five unbound Trainer holds, the separate Shining finish holds, both current holo variants and native labels, full provider/native translation evidence, actual non-Colorless constraint and printed Blissey retreat two. No source policy activation, metadata edits, physical edition/finish or independent licence certification.',
};
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [file, bytes] of [['plan.json', planBytes], ['approval.json', approvalBytes], ['identity-table.json', tableBytes]]) await writeFile(new URL(`./${file}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), SAVED_TARGETS_SHA: digest(savedBytes), SOURCE_MANIFEST_SHA: digest(sourceBytes), ARCHIVE_SHA: inputs.archive.sha256 })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = '${value}';`);
for (const [name, value] of Object.entries({ ARCHIVE_ID: inputs.archive.id, ARCHIVE_BYTES: inputs.archive.byte_size })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${value};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = (?:"[^"]+"|None)/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ cohort_sha256: digest(planBytes), approval_sha256: digest(approvalBytes), identity_table_sha256: digest(tableBytes), fronts: 2, database_requests: 0, provider_requests: 0 }));
