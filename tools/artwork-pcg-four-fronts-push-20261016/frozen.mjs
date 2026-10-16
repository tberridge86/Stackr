import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "d79fd3367b40be0d0a852ec774c761c7276ac4b8f4b10343a05de5b9134eae04";
export const APPROVAL_SHA = "cfa62dea549f2444706b6502918c3e48710660a1fa4c54d4de7ca0836562c6d9";
export const IDENTITY_TABLE_SHA = "0b6499c290c9fa0cf22d5cb09cb14110c4fd6e316d9f19e178994355f0085299";
export const SAVED_TARGETS_SHA = "8b9679c99d31b7ce6f9f3f44f57a63b4a5bccd2ca4f1c916663201d77aef130a";
export const SOURCE_MANIFEST_SHA = "a2c5e3647ad5f74ca2f19d958af2c2b807b22407ffe4f2a1b025cff7712dcc63";
export const ARCHIVE_SHA = "b8a5112200e40f5be101f602263e14ef165595cdc380df2e8fa5ca83f06f6635";
export const ARCHIVE_ID = 646214227;
export const ARCHIVE_BYTES = 2977622;
export const FRONTS = 4;
export const QUEUE_ID = "PCG1234-EXACT4-SHARED-FRONTS-20261016";
export const METADATA_FILES = ['manifest.json','receipts/preparation-summary.json','receipts/current-card-bindings.json','receipts/finite-decision.json'];
export const IDENTITY_FIELDS = [
  "printing_id",
  "set_id",
  "set_code",
  "language_code",
  "collector_number",
  "card_native_name",
  "catalogue_version_id",
  "variant_ids",
  "batch_id",
  "work_type",
  "source_code",
  "provider_id",
  "image_url"
];
export const SOURCE_EVIDENCE = {
  "approvedProjectionFileByteSha256": "5976b3017578cbe04a0c6d57f54f8b98f3c857de37894ad5f2381e021e973b23",
  "finiteDecisionFileByteSha256": "7608cc5c480280744f3c8f8c503b3f0f94c7c23ff9f1a23aa897d419888e3007",
  "rootPrivateContextFileByteSha256": "d7ee6bd2932672edb17c93611e17bebef2c9bb8dd924b80482b81093eeddeaf5",
  "sourceHandoffFileByteSha256s": [
    "9bfccf1ad8d67f40bbee23cb683ce073555151142493acfd7df1ef22eb594741",
    "8d4a2bcc569e1e292dba7b037bb5f7ca92ea50aace028ce48812ce04c6397580"
  ],
  "independentSourceReviewFileByteSha256s": [
    "5bb022cd60e4d1ef02aef359a49c428bd6e7adc1ffc0340d129d1faec6e45d8a",
    "fac11c6626a96324944e88a21a161fc6c4650d4335c6675c8d3aa87382da10aa"
  ],
  "fourSourceCheckpointFileByteSha256": "9e93a6ebf16895b0cd71bd24bd7a9e6742d3f9819b163640cfc27f3771c05c8f",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "3d1478238a990fa8b4ac72c3eb9008dc6fe219535a842beec184f1abefd1fe24",
  "independentPrivatePackageReviewSha256": "55fcfbfa0178b8beab4866b3a978b0e432c801b3278a3eac6340abfc35d4bf63",
  "rootPrivatePackageValidationSha256": "0a32f4e1ea07f73fc1bad71c051984e44c22f14b70a474c42c30771f9b739fe5",
  "rootSourceArchiveBindingSha256": "954276417a26bf7100c247fce8a58897fa4b31235d2c154694ee520b6922fa55",
  "rootUploadReceiptSha256": "ef9bb9fea382852f4b0209e1b0cd5972067c54798227a5b40e65a83cf34f8b39",
  "rootUploadRecordFormatCorrectionSha256": "b89038ce239ddd9bd00ed6844a7029c26c8a5c79db6556c466ea9c8fdb22a608",
  "rootPublisherContextSha256": "12dd3e078e6dd482f95c036b50d7f433e72cfd8e6bc48f2047463c0dd5c2495c"
};
export const SOURCE_CODES = ['scrydex','pokellector','tcgcollector','pricecharting'];
export const SOURCE_FIELDS = [
  "code",
  "display_name",
  "source_type",
  "base_url",
  "licence_status",
  "attribution_required",
  "active",
  "internal_notes",
  "deprecated_at"
];
export const SOURCE_CHECKPOINT_SHA = '9e93a6ebf16895b0cd71bd24bd7a9e6742d3f9819b163640cfc27f3771c05c8f';
export const EXISTING_SOURCE_ROW_HASHES = {
  "pricecharting": "b4b74f69cac37abeee008806f6d8dd8ea63a0f0ce43fa065dce9261b428b421b",
  "pokellector": "4a2a381f7146c0bfa0201c62e91e7682f18da6597c4743f23414f3606a942a71",
  "tcgcollector": "f1f01d1b094986ad0a9f5efcf1e98fe7388e0e1c5452d23da6cf7cab97a1ca29",
  "scrydex": "25af5b50521e6fd0942764536f62b0c53c3e72c69c874916241af47735407929"
};
export const STAGING_FIXTURE_POLICY = {
  "code": "pricecharting",
  "display_name": "PriceCharting (owner supplied card fronts)",
  "source_type": "image",
  "base_url": "https://www.pricecharting.com",
  "licence_status": "under_review",
  "attribution_required": true,
  "active": false,
  "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged.",
  "deprecated_at": null
};
const existingPolicies = {
  "production": [
    {
      "code": "pokellector",
      "display_name": "Pokellector (owner supplied Japanese card fronts)",
      "source_type": "image",
      "base_url": "https://jp.pokellector.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
      "deprecated_at": null
    },
    {
      "code": "pricecharting",
      "display_name": "PriceCharting (owner supplied card fronts)",
      "source_type": "image",
      "base_url": "https://www.pricecharting.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged.",
      "deprecated_at": null
    },
    {
      "code": "scrydex",
      "display_name": "Scrydex",
      "source_type": "image",
      "base_url": "https://scrydex.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
      "deprecated_at": null
    },
    {
      "code": "tcgcollector",
      "display_name": "TCGCollector (owner supplied Japanese card fronts)",
      "source_type": "image",
      "base_url": "https://www.tcgcollector.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
      "deprecated_at": null
    }
  ],
  "staging": []
};
const bindingHashes = {
  "production": "ac487e9aa6c1ec89b547ad3e72b793ab5123072be28a033e173b80feac8f89d3",
  "staging": "523aa267738343bc680d942223e4068409113194e648c610ea2b74e72fa20b7e"
};
const baselineHashes = {
  "production": "95470dc9496ea2ee9c78b67e79771da34cfd0be7759ef2129db2be6d4cabbe31",
  "staging": "7a721cb6069dc339fefc03e0314297958b4a11d2090efea11cd46ba774c21cfa"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-019",
    "JP-CARDS-021",
    "JP-CARDS-025",
    "JP-CARDS-026"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 4,
  "eligible_set_aliases": [
    "PCG1-034",
    "PCG2-023",
    "PCG3-030",
    "PCG3-060"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "3c83ecfe-306a-4f64-8003-e455fb4be4f9",
      "category": "Pokemon"
    },
    {
      "printingId": "aec39508-e7ed-4d3d-a876-51dc5f7c258e",
      "category": "Pokemon"
    },
    {
      "printingId": "db02f454-b7b4-497d-b2a0-a9e5ab074665",
      "category": "Pokemon"
    },
    {
      "printingId": "bd47b01b-2694-4e7a-a446-9c2f7a5cbba7",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact four changed'); const saved = JSON.parse(bytes); check(saved.length === 4 && new Set(saved.map(row => row.printing_id)).size === 4, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 4 && saved.length === 4, 'Identity scope changed');
  for (const row of table) check(same(selectFields(row, IDENTITY_FIELDS.filter(field => !['source_code','provider_id','image_url'].includes(field))), saved.find(item => item.printing_id === row.printing_id)), 'Saved/table identity changed');
  return table;
}
export function validateSourcePlan(plan) {
  check(plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA && same(plan.source_evidence, SOURCE_EVIDENCE), 'Fresh source/authority checkpoint changed');
  check(same(plan.existing_source_row_hashes, EXISTING_SOURCE_ROW_HASHES), 'Staging absence or old full17 pins changed');
  check(same(plan.source_policies, existingPolicies) && same(plan.new_sources, {production:[],staging:[STAGING_FIXTURE_POLICY]}) && plan.production_source_changes_allowed === 0, 'Production source writes forbidden; only temporary stage PriceCharting fixture allowed');
  check(STAGING_FIXTURE_POLICY.code === 'pricecharting' && STAGING_FIXTURE_POLICY.source_type === 'image' && STAGING_FIXTURE_POLICY.active === false && STAGING_FIXTURE_POLICY.licence_status === 'under_review' && STAGING_FIXTURE_POLICY.attribution_required === true && STAGING_FIXTURE_POLICY.deprecated_at === null && canonicalHash(STAGING_FIXTURE_POLICY) === '514a1411733d2af6b3a62b5e45b688fbeab270a0527dab44d3d44192b172be0b', 'Exact finite PriceCharting nine-field policy required');
}
export function validateRows(plan, table) {
  check(plan.rows.length === 4 && new Set(plan.rows.map(row => row.printing_id)).size === 4 && table.length === 4, 'Exact four front scope required');
  check(same(plan.source_counts, {pricecharting:4}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese PCG1/PCG2/PCG3 four shared fronts required');
    const identity = table.find(item => item.printing_id === row.printing_id);
    check(identity && same(selectFields(row, IDENTITY_FIELDS), selectFields(identity, IDENTITY_FIELDS)), 'Identity table mismatch');
    check(row.evidence.artwork_scope === 'printing_front' && row.evidence.delivery_kind === 'shared' && row.evidence.asset_variant_id === null && row.evidence.exact_finish_verified === false && row.evidence.physical_edition_verified === false && row.evidence.vendor_licence_verified === false && row.evidence.owner_business_decision.kind === DECISION, 'Shared artwork/authority changed');
    validatePublishedWitness(row.evidence.source_body, row);
    check(row.objects.length === 4 && row.objects.every((object,index) => object.role === roles[index]), 'Complete original plus three derivatives required');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && object.width <= known.original.width && object.height <= known.original.height && object.byte_size > 0 && object.byte_size < 12000000, 'Object identity or enlargement changed');
      check(object.mime_type === (object.role === 'original' ? 'image/jpeg' : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${object.role === 'original' ? 'jpg' : 'webp'}`, 'Actual JPEG/display MIME or path changed');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 4 && indexObjects(plan.rows).size === 16, 'Four exact current variants/sixteen images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 4, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:4,variants:4,names:8,sets:3}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === '9d36b349ab10567f5368964c44c69556fbfedd38b5186563d3bfbe663e9e4442' && canonicalHash(plan.canonical_schema_qualification) === 'ad27f573436bec1c0b2cc93a982335655d04a2cee6d449e1ccdd2c88777d74e7', 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 20 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 4 && approval.variants === 4 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 646214227 && FRONTS === 4 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:4,derivative_references:12,object_references:16,unique_image_members:16,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
