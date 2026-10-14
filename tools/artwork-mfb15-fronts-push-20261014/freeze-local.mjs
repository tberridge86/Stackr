// Offline only. Never called by the production workflow.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { NEW_SOURCE } from './frozen.mjs';

const root = process.argv[2];
check(root, 'Local continuation directory required');
const inputBytes = await readFile(new URL('./freeze-inputs.json', import.meta.url));
check(digest(inputBytes) === 'bfb2d7ccab169b3554e1778314f60e1065f7679bde1cc949170654a16bd8ebb4', 'Frozen input descriptor changed');
const inputs = JSON.parse(inputBytes);
const pinned = async (file, sha) => {
  const bytes = await readFile(`${root}/${file}`);
  check(digest(bytes) === sha, 'Frozen local evidence changed: ' + file);
  return { bytes, value: JSON.parse(bytes) };
};
const source = await pinned(inputs.source_manifest_file, inputs.source_manifest_sha256);
const pkg = await pinned(inputs.package_receipt_file, inputs.package_receipt_sha256);
const decision = await pinned(inputs.finite_decision_file, inputs.finite_decision_sha256);
const correction = await pinned(inputs.observation_correction_file, inputs.observation_correction_sha256);
check(source.value.metadata_revision === 2 && source.value.authoritative_evidence.observation_correction_sha256 === inputs.observation_correction_sha256 && correction.value.approved === true && correction.value.correctObservedPrintedNationalDexText === '0082' && correction.value.originalByteChanges === 0 && correction.value.canonicalMetadataChanges === 0, 'Exact current observation correction required');
check(pkg.value.fronts === 15 && pkg.value.files === 64 && pkg.value.verifiedImageReferences === 60 && pkg.value.productionWrites === 0, 'Exact locally decoded package required');
check(source.value.entries.length === 15 && source.value.fronts === 15 && decision.value.approved === true && decision.value.scope.fronts === 15, 'Exact finite source decision required');
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const binding = await pinned(`publish-review/mfb15-${environment}-bindings.json`, inputs.binding_snapshots[environment].sha256);
  const before = await pinned(`publish-review/mfb15-${environment}-before.json`, inputs.before_snapshots[environment].sha256);
  snapshots[environment] = binding.value[0].snapshot;
  check(snapshots[environment].cards.length === 15 && before.value.length === (environment === 'production' ? 64 : 61), 'Full private baseline size changed');
  check(before.value.filter(row => ['printings', 'variants', 'names', 'sets'].includes(row.scope)).length === 61, 'Exact identity/name/set scope changed');
  for (const scope of ['assets', 'links', 'sources']) check(before.value.filter(row => row.scope === scope).length === (environment === 'production' ? 1 : 0), 'Old asset/link/full-source scope changed');
  check(!before.value.some(row => row.scope === 'assets' && row.payload.asset_type === 'card_image'), 'Existing card image requires review');
}
check(isDeepStrictEqual(snapshots.production.cards, snapshots.staging.cards), 'English bindings must match both environments');
const rows = source.value.entries.map(entry => {
  const c = entry.catalogue;
  const identity = { printing_id: entry.printing_id, set_id: c.set_id, set_code: c.set_code, language_code: c.language_code, collector_number: c.collector_alias, card_native_name: c.current_native_label, catalogue_version_id: c.production_catalogue_version_id, variant_ids: [entry.variant_id], batch_id: entry.batch_id };
  const current = snapshots.production.cards.find(card => card.printing_id === entry.printing_id);
  check(current && current.variant_id === entry.variant_id && current.variant_code === 'normal' && current.finish_code === 'normal', 'Current singleton normal variant changed');
  for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(current[field] === identity[field], 'Current canonical identity changed: ' + field);
  return {
    ...identity, source_code: 'bulbapedia', provider_id: entry.source.source_card_id, image_url: entry.source.observed_image_url,
    objects: entry.objects.map(object => ({ ...object, artifact_id: inputs.archive.id })),
    evidence: { source_url: entry.source.observed_image_url, source_page_url: entry.source.source_page_url,
      source_file_description_url: entry.source.source_file_description_url, provider_id: entry.source.source_card_id,
      source_metadata_sha256: entry.source.metadata_sha256, retained_source_signature_sha256: entry.source.retained_signature_sha256,
      actual_structured_signature_sha256: entry.source.actual_structured_signature_sha256,
      source_body: entry.source.body, printed_identity: entry.source.printed_identity, source_rights: entry.source.rights,
      identity_limits: entry.identity_limits, source_has_hd_dimensions: entry.source.source_has_hd_dimensions,
      artwork_scope: 'printing_front', source_kind: 'third_party_original',
      identity_checks: { savedMetadataMatched: true, currentProductionCardBindingMatched: true, printedCollectorOpticallyVerified: false, canonicalAliasIsInternalOnly: true, physicalFinishVerified: false },
      exact_finish_verified: false, vendor_licence_verified: false, physical_edition_verified: false,
      owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false } },
  };
});
const identityFields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id'];
const saved = rows.map(row => selectFields(row, identityFields));
const savedBytes = Buffer.from(JSON.stringify(saved, null, 2) + '\n');
const table = rows.map(row => ({ ...selectFields(row, [...identityFields, 'source_code', 'provider_id', 'image_url']),
  source_metadata_sha256: row.evidence.source_metadata_sha256,
  source_body_sha256: digest(Buffer.from(JSON.stringify(row.evidence.source_body))),
  evidence_sha256: digest(Buffer.from(JSON.stringify(row.evidence))), original_sha256: row.objects[0].sha256,
  original_width: row.objects[0].width, original_height: row.objects[0].height,
})).sort((a, b) => a.printing_id.localeCompare(b.printing_id));
const tableBytes = Buffer.from(JSON.stringify(table, null, 2) + '\n');
const existing = snapshots.production.sources.map(policy => selectFields(policy, SOURCE_FIELDS));
check(existing.length === 1 && existing[0].code === 'scrydex' && !(snapshots.staging.sources ?? []).length, 'Existing provenance scope changed');
const bindings = Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(card => selectFields(card, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))]));
const scope = { printings: 15, variants: 15, names: 30, sets: 1 };
const plan = {
  schemaVersion: 1, queue_id: source.value.queue_id, source_manifest_sha256: digest(source.bytes),
  metadata_revision: 2, observation_correction_sha256: digest(correction.bytes),
  prior_unpublished_metadata: source.value.prior_unpublished_metadata,
  held_original_observation_reconciliation: source.value.held_original_observation_reconciliation,
  package_receipt_sha256: digest(pkg.bytes), original_handoff_sha256: source.value.authoritative_evidence.original_handoff_sha256,
  finite_decision_sha256: digest(decision.bytes), owner_permission_attestation_sha256: source.value.authoritative_evidence.owner_permission_attestation_sha256,
  magneton_inline_glyph_sha256: source.value.authoritative_evidence.magneton_inline_glyph_sha256,
  saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), archive: inputs.archive,
  archive_metadata: inputs.metadata, rows, source_counts: { bulbapedia: 15 }, delivery_scope: source.value.delivery_scope,
  binding_expectations: bindings, scope_counts: { production: scope, staging: scope },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [NEW_SOURCE], staging: [existing[0], NEW_SOURCE] },
};
check(indexObjects(rows).size === 60 && inputs.archive.file_count === 64, 'Archive member scope changed');
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const approval = {
  schemaVersion: 1, approved: true, fronts: 15, store_resize_display: true, decision_type: DECISION,
  language_code: 'en', source_counts: { bulbapedia: 15 }, source_wide_approval: false, human_review_required: false,
  vendor_licence_verified: false, underlying_copyright_licence_verified: false, owner_website_permission_attested: true,
  approved_at: '2026-10-14', cohort_sha256: digest(planBytes), finite_decision_sha256: digest(decision.bytes),
  metadata_revision: 2, observation_correction_sha256: digest(correction.bytes),
  owner_permission_attestation_sha256: plan.owner_permission_attestation_sha256,
  owner_instructions: ['all the missing images i gave links to', 'i have permission from the 4 websites - all the links i sent shopuld bridge majoprity of the missings cards'],
  scope: 'Store, resize and display exactly fifteen inspected English unnumbered My First Battle source fronts and forty-five derivatives. Retain nineteen unresolved canonical tasks (nine captured candidates with historical holds (including one hold observation under reconciliation) and ten source-choice ambiguities). Canonical aliases are internal catalogue keys, not printed collector numbers or National Dex numbers. Preserve all names, metadata, variants, old immutable set artwork/links and full Scrydex source row. Create only one new inactive under_review attribution-required Bulbapedia provenance source for this finite cohort. Staging fixtures roll back. Per-file TCG Collector/artist attribution and artwork-specific fair-use tags remain; generic footer licence is not an artwork licence. Independent vendor/underlying copyright licence, physical edition/finish and source-wide activation remain false.',
};
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
for (const [name, bytes] of [['saved-targets.json', savedBytes], ['identity-table.json', tableBytes], ['plan.json', planBytes], ['approval.json', approvalBytes]]) await writeFile(new URL(`./${name}`, import.meta.url), bytes);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
const pins = { COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), SAVED_TARGETS_SHA: digest(savedBytes), SOURCE_MANIFEST_SHA: digest(source.bytes), ARCHIVE_SHA: inputs.archive.sha256, ARCHIVE_ID: inputs.archive.id, ARCHIVE_BYTES: inputs.archive.byte_size };
for (const [name, value] of Object.entries(pins)) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${typeof value === 'number' ? value : `'${value}'`};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = "[^"]+"/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ ...pins, databaseRequests: 0, networkRequests: 0 }));
