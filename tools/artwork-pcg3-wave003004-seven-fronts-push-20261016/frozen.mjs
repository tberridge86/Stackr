import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "902aa9114eaddc584a42b4afc31ea12a8b5deb05c0e00747f2c220fc9b8ccbee";
export const APPROVAL_SHA = "518323462369c89e1dafdb6fc5459b6ae7e63c9546bf5a2b5fecec664dfa5f6f";
export const IDENTITY_TABLE_SHA = "43c0aa6cd24c0fd06e478d9d67066b045881ed68b94482abbb86374a455768f2";
export const SAVED_TARGETS_SHA = "bc16ebdeea2c5dbb2b7e20ac2b36f3223be03259b9dc56e6561047dfec38f592";
export const SOURCE_MANIFEST_SHA = "eeb14d40bb9cfa3e18eb6efdb3ab4d9c20fef79582e1141258d83fb167af857f";
export const ARCHIVE_SHA = "3faa42e7eab254c6a4de96379534a81a213419ec9a36a88c6ef23ad7a7ca7718";
export const ARCHIVE_ID = 647356345;
export const ARCHIVE_BYTES = 2969014;
export const FRONTS = 7;
export const QUEUE_ID = "PCG3-WAVE003004-EXACT7-SHARED-FRONTS-20261016";
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
  "approvedProjectionFileByteSha256": "dc6e6c127985faa143797e35c71ead75e87cd2660a966551d99097269c25cc6b",
  "finiteDecisionFileByteSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc",
  "rootPrivateContextFileByteSha256": "ff5d4e675fd48f2983686d78b6fad76509264afe632ef7f619c778468424f860",
  "sourceHandoffFileByteSha256s": [
    "bc26a1d108c875571577624c327999cee8d8bbd1e319a0f6fc418697dd8244ef",
    "b7e7d1673330b2e09ab208b8cd40280c28694e8b043569abd9abb43503e10ba9"
  ],
  "independentSourceReviewFileByteSha256s": [
    "da505c25d2d1fc7acbbe0826b73cce1c964477f6dff5103eb1b1ecb8de7cac86",
    "ac4f2c66794419f2cd5d16d070de6b32603e8a30d8f6add2ad57568745d980d8"
  ],
  "priorPerWaveFiniteDecisionFileByteSha256s": [
    "2d17748cc6ef5884b2fd4d2048bf1de1f56afc2413eaebd02ee456492f57f9db",
    "872785dde9255e9cec6832aa6ed5177f1737d4ab7dc4433e3f8c281c02e628b2"
  ],
  "rootSourceRegistrationFileByteSha256s": [
    "1f6849b890cbf13a216043af4d91f475e8c5242c0371ed358b3a54f6a2f36d70",
    "97b466b41f9c367b98bf04e62d62331c4a71eed9f2555093760349854f74b8ec"
  ],
  "fourSourceCheckpointFileByteSha256": "19844bbc58c147c54a601377abb242cd9515bba9a2ea7bd743af47e38d44841f",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "7c24dd8fca44471df257f6d8985a8dfa1a3170db6b05c07384a0b59a35e290bf",
  "independentPrivatePackageReviewSha256": "6348fb7d92e3aeceec76963dd24381c167ecf5228a415f0983cb470765c26847",
  "rootPrivatePackageValidationSha256": "1180dbceec873d5bfdfcde1d10ad4518bb881a6bec232fce775f3ed9a72a71b6",
  "rootSourceArchiveBindingSha256": "f047cc9230a1c33664176ea6adc95773a80f0deaee37dd935f738aa664f8ad66",
  "rootUploadReceiptSha256": "fac78a4555dcac1c887b05816847c162ad02ca1eb62d86e8de6290762ed5a1d3",
  "actualMeasuredAppReportSha256": "3edce61912b4fc8430dc6a1ec1e0c64377837ebf899417cb8b72545baff1a11e",
  "actualMeasuredDimensionAuditSha256": "d967f9d1c1a70d19a1a59b31a76527dd65f24a211285d63be3065b9d0accf92e",
  "rootPublisherContextSha256": "b65bb2735f9a70a8477972b468060c36d8eb4f4a83b0f323d3f76cd89d80d0c7"
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
export const SOURCE_CHECKPOINT_SHA = "19844bbc58c147c54a601377abb242cd9515bba9a2ea7bd743af47e38d44841f";
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
  "production": "4ec4b5e953bd3d275501f49dc50853ff3ae02ee8332f55d83a357f1081bdc6de",
  "staging": "66a69058dd61826552c176ef321f79ed7d94bd082742ba1f198a2055143e45bc"
};
const baselineHashes = {
  "production": "ded93c9c6d68a25496ceae9f49978aaccdfee45d5b0bed2c651aa3a2a859fa2e",
  "staging": "ba43a114f262e1a0cffb07badc662d1594816d0d836e0e25d8277b76e401fe06"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-024",
    "JP-CARDS-025",
    "JP-CARDS-026"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 7,
  "eligible_set_aliases": [
    "PCG3-003",
    "PCG3-009",
    "PCG3-037",
    "PCG3-041",
    "PCG3-050",
    "PCG3-065",
    "PCG3-074"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "a57a1f5c-8506-4f65-9f19-8ee9b95eb3a5",
      "category": null
    },
    {
      "printingId": "2eb26020-fa19-4db2-b8e1-fb482d917a96",
      "category": null
    },
    {
      "printingId": "708e67fc-25b0-40f2-9b1d-8a58c3e4bca3",
      "category": null
    },
    {
      "printingId": "23691e78-3dc2-472a-9b4d-7ce679465da3",
      "category": null
    },
    {
      "printingId": "2be19689-88c5-4d74-afab-2bf06f8ab994",
      "category": null
    },
    {
      "printingId": "1b6ca98a-873f-4fad-952d-5bd389c02a7b",
      "category": null
    },
    {
      "printingId": "42e209b0-5d1a-4230-b1d7-a4257d6149ee",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact three changed'); const saved = JSON.parse(bytes); check(saved.length === 7 && new Set(saved.map(row => row.printing_id)).size === 7, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 7 && saved.length === 7, 'Identity scope changed');
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
  check(plan.rows.length === 7 && new Set(plan.rows.map(row => row.printing_id)).size === 7 && table.length === 7, 'Exact three front scope required');
  check(same(plan.source_counts, {pricecharting:7}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese PCG2 wave001 three shared fronts required');
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
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 7 && indexObjects(plan.rows).size === 28, 'Three exact current variants/twelve images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 7, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:7,variants:7,names:14,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === 'bdb3d8038499c82339cf786cf78dc701b59dd8b835e161f4e0a1017a4ec6e641' && canonicalHash(plan.canonical_schema_qualification) === 'c900449a514129e430b370832372399de29f8b46872f53695647768f20e37141', 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 32 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 7 && approval.variants === 7 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 647356345 && FRONTS === 7 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:7,derivative_references:21,object_references:28,unique_image_members:28,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
