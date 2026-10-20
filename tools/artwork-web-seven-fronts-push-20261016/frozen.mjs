import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "9eb559d543b303c19c5af6874564b021302819821a3035e6650d4c3c51f0c0c1";
export const APPROVAL_SHA = "9fc2604b48286b1d81251c05e50b7054579b83764c193b6de8e3ffd092002dc8";
export const IDENTITY_TABLE_SHA = "a11c5ee8182bbe973af12d6adf7c1b17b3adf5ea4510c9a1276e858df20355c6";
export const SAVED_TARGETS_SHA = "7ce069c02b01c8ba59912a5a6b956bf9c05a57785997c2656f6541864affed9d";
export const SOURCE_MANIFEST_SHA = "6687d1cde57d0eb0383c954bf0dd8b925f3ff69b47f373f6dd71effdc4642ae7";
export const ARCHIVE_SHA = "eb78aae912fe9bbda9b893337dd172b1fad3c2ef8e7ef97965315c0e9cfd5086";
export const ARCHIVE_ID = 646470015;
export const ARCHIVE_BYTES = 3213075;
export const FRONTS = 7;
export const QUEUE_ID = "WEB7-EXACT7-SHARED-FRONTS-20261016";
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
  "approvedProjectionFileByteSha256": "ebcd8e328e76a92eabd405d582b87a65c4b3f66f66c226c1aa360c8ee2592fa0",
  "finiteDecisionFileByteSha256": "aefe0b3acfb003468bd87244fd440b8639ec71546b8df2f3bfac3844a2e2363d",
  "rootPrivateContextFileByteSha256": "5bea0fdc6c762a23a2b19215952eb3734487a0c71106b320c993eea0d3c8b319",
  "sourceHandoffFileByteSha256s": [
    "524ea2a5494a0bd365f166f214835330101928d9982a3b9b0ec629cc61360e69"
  ],
  "independentSourceReviewFileByteSha256s": [
    "eb225a3002823abde25e38ee493d6f06749e7a0eba1f4183a1390a6341158071"
  ],
  "fourSourceCheckpointFileByteSha256": "9e93a6ebf16895b0cd71bd24bd7a9e6742d3f9819b163640cfc27f3771c05c8f",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "af490781c540f0168d86ee117760b30fdc57200815a79ca4c5d5ef5854f541bd",
  "independentPrivatePackageReviewSha256": "48aaa6b7d0d8f66e1e5a33141c741318c8c28e4b357cab8890f812ebc98edc5d",
  "rootPrivatePackageValidationSha256": "541b72eb02891f72cfef2d76a168544343d5ebf5952e7d2bf7f4da12100d9979",
  "rootSourceArchiveBindingSha256": "15ef527a1161e0442c0727798c7439e9528b7c2b8330df10d3b8c0e663114ada",
  "rootUploadReceiptSha256": "0dd178cf6db0fddb2c169164734dbf362cd6c7a4fa90cfb158832b5dc862bdfc",
  "actualMeasuredAppReportSha256": "da2c0e40e1843df54f82860dd6d13518ca05e8fba7b07a3a4edf1496c1240e1a",
  "actualMeasuredDimensionAuditSha256": "286e37f20b643e438f3a01e52c92a8a6d1f658a2e9bb3817b5128a8f5d64d6b1",
  "rootWeb007AdditivePlacementCorrectionSha256": "5715565257cf7211c35acde90db026a497f315d0f7c9ec994baab2b1a6199d51",
  "rootPublisherContextSha256": "9a70044a9d085e3c2b0287b809ecb5f0eb9c1a70b64a056aa0a213336c087d19"
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
  "production": "ce3e26b7196f9d0658b6b8ba567f92d99f1da9d4faf8f45bb5a6d2bb201533ec",
  "staging": "a3b377fb9ecd71a6e49f9a04e205d99471d73a7846bc0b15bc03dd8b76ff895e"
};
const baselineHashes = {
  "production": "b35765c23f0a09cb50df17c872caf721b965fc5e6d1a9a9f8568c491eb64f37f",
  "staging": "0f1d7b7ff93ba7d28f573a4438763459c98346179cd87a55b8a2adb4112d6ec0"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-068",
    "JP-CARDS-069"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 7,
  "eligible_set_aliases": [
    "web1-007",
    "web1-025",
    "web1-036",
    "web1-038",
    "web1-040",
    "web1-046",
    "web1-048"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "7b63e002-ca85-4d4d-be9d-fbaa54f6b959",
      "category": null
    },
    {
      "printingId": "221185d3-e4f8-4669-b339-5f06c86c0d50",
      "category": null
    },
    {
      "printingId": "7bab8d58-4c34-47a8-a07f-b34c8ab0bd98",
      "category": null
    },
    {
      "printingId": "2229f37c-46cb-4cb5-9e3c-22b10735ec5c",
      "category": null
    },
    {
      "printingId": "96fe50ae-f69c-4ddb-a401-fa7d97c9ad46",
      "category": null
    },
    {
      "printingId": "1f42fce8-0f6a-48bd-ad47-8b0217f7db53",
      "category": null
    },
    {
      "printingId": "fe52e1d7-ea84-4456-b139-61f4c83d1de2",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact seven changed'); const saved = JSON.parse(bytes); check(saved.length === 7 && new Set(saved.map(row => row.printing_id)).size === 7, 'Saved scope changed'); return saved; }
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
  check(plan.rows.length === 7 && new Set(plan.rows.map(row => row.printing_id)).size === 7 && table.length === 7, 'Exact seven front scope required');
  check(same(plan.source_counts, {pricecharting:7}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese Web seven shared fronts required');
    const identity = table.find(item => item.printing_id === row.printing_id);
    check(identity && same(selectFields(row, IDENTITY_FIELDS), selectFields(identity, IDENTITY_FIELDS)), 'Identity table mismatch');
    check(row.evidence.artwork_scope === 'printing_front' && row.evidence.delivery_kind === 'shared' && row.evidence.asset_variant_id === null && row.evidence.exact_finish_verified === false && row.evidence.physical_edition_verified === false && row.evidence.vendor_licence_verified === false && row.evidence.owner_business_decision.kind === DECISION, 'Shared artwork/authority changed');
    validatePublishedWitness(row.evidence.source_body, row);
    check(row.objects.length === 4 && row.objects.every((object,index) => object.role === roles[index]), 'Complete original plus seven derivatives required');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && object.width <= known.original.width && object.height <= known.original.height && object.byte_size > 0 && object.byte_size < 12000000, 'Object identity or enlargement changed');
      check(object.mime_type === (object.role === 'original' ? 'image/jpeg' : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${object.role === 'original' ? 'jpg' : 'webp'}`, 'Actual JPEG/display MIME or path changed');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 7 && indexObjects(plan.rows).size === 28, 'Seven exact current variants/twenty-eight images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 7, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:7,variants:7,names:14,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === '1c8ac655ee8b012cbe9a77cb93e01ac186998dc393f397147cfd812b8667d73d' && canonicalHash(plan.canonical_schema_qualification) === '1755745e591e92feb0ff9d39ff8fa65d026ec343097620012c33d72c99c35853', 'Distinct measured app roles and both canonical schema tuples required');
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
export function requireFinalFreeze() { check(ARCHIVE_ID === 646470015 && FRONTS === 7 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:7,derivative_references:21,object_references:28,unique_image_members:28,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
