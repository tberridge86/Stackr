import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = '96f6a0cd92b31b9e37bef04a6dfa7cec52366e780095a5c16f8c31f6320da43a';
export const APPROVAL_SHA = 'af20708b53b91319d99acfd0d256752b1c8975802a83be4b0a4c8682d8d161b0';
export const IDENTITY_TABLE_SHA = '7507d6784edba2673e3fa6b638c4fffa7633264136c7fd05d0d5d57e58d84672';
export const SAVED_TARGETS_SHA = '96b95a57b33bc9778292f70297629cdcaa30877c85b9d56a395ed27ab3814e41';
export const SOURCE_MANIFEST_SHA = '6a4589185a70dbe7b3745519502bafe554e976d9b8633aa8db2f3fbf33305ee6';
export const ARCHIVE_SHA = '97d39c1f4ef272951456a00093fecd14e2ba7a5751bcc0d8804050d71928c4d0';
export const ARCHIVE_ID = 645177330;
export const ARCHIVE_BYTES = 751422;
export const FRONTS = 2;
export const QUEUE_ID = 'aquapolis-two-shared-fronts-20261015';
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
  "source_code",
  "provider_id",
  "image_url"
];
export const SOURCE_EVIDENCE = {
  "rootApprovedFileByteSha256": "6e9787984304ec8617d0f8eea2c41cb1bb13fa8f53d84169a914a70836233c58",
  "rootFiniteDecisionFileByteSha256": "825e18ab9a8fd9a8ae743052c77d4b2d47fcad7e77ecdc94e16fd1e5ac5ce9ce",
  "eligibilityFileByteSha256": "fe5cbc6c8d97054319a8959f66e1713936c0f55edd45e63b427f4968a7b9cc3d",
  "eligibilityProbeSha256": "52b268533df8cf63e4d80f8a5771d6cb3068b1e667f9fbea02560703714512a8",
  "historicalSourceHandoffSha256": "cbdcffe0521f507c67384e85ecca33b6cffa431342e47aceeb6230e866cd2047",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "existingThreeSourcePolicyCheckpointSha256": "9fed86a8de20b4229f20cd0a91b617cb8e44b7e83623fd2939a6ab068e1c9228",
  "privateSourceContractFileByteSha256": "dc1a75c84a1f63c08ae983ba5acd8e800df90a5abbfbb71ff3e387e72249345e",
  "freshSourceCheckpointSha256": "fef1de93887a28ee980616ee1048a05d73fa3e7e9b065dad38d8836a48d35592",
  "stagingSourceQualificationSha256": "3b58bba78eae6d1c7a1df6f9c826817d7f3ad5b9d23e5de230ac8a590d2ca4d1",
  "independentPrivatePackageReviewSha256": "1457e86ca80f26167d72500d599198bc19de4915e8be479ec759ed9299a7e203",
  "independentSourceAuthorityPreflightSha256": "09e8a0ef314ef02133a95faceaf447b6a89c73be802648059d8c10e16a18ceac",
  "rootSourceArchiveBindingSha256": "6d675d94b085247e852feff10c8d435e9684ade54a4323905fcbb71c3eb4217a",
  "rootUploadReceiptSha256": "fe394476e5f62131a9d6b5cec3018c12c0db32dd5d37adb44db8c4d022213992"
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
export const SOURCE_CHECKPOINT_SHA = 'fef1de93887a28ee980616ee1048a05d73fa3e7e9b065dad38d8836a48d35592';
export const EXISTING_SOURCE_ROW_HASHES = {
  "pokellector": "4a2a381f7146c0bfa0201c62e91e7682f18da6597c4743f23414f3606a942a71",
  "tcgcollector": "f1f01d1b094986ad0a9f5efcf1e98fe7388e0e1c5452d23da6cf7cab97a1ca29",
  "scrydex": "25af5b50521e6fd0942764536f62b0c53c3e72c69c874916241af47735407929"
};
export const NEW_SOURCE_POLICY = {
  "code": "pricecharting",
  "display_name": "PriceCharting (owner supplied card fronts)",
  "source_type": "image",
  "base_url": "https://www.pricecharting.com",
  "licence_status": "under_review",
  "attribution_required": true,
  "active": false,
  "deprecated_at": null,
  "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged."
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
  "production": "791b1ed91b36a6c42665b20a9cfe6901ce908951594c005ee6b67601800b49fd",
  "staging": "791b1ed91b36a6c42665b20a9cfe6901ce908951594c005ee6b67601800b49fd"
};
const baselineHashes = {
  "production": "a416d82b588bbdae434f941a04587b21766afe37cdc0a9bbd5b7925c4223c4b6",
  "staging": "88e8d06e985ecb8e2a8b226aab02e7ae838b2a5d8494d35bcfa7d5c4995f2087"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "EN-CARDS-003"
  ],
  "eligible_printing_fronts": 2,
  "fixed_variants": 4,
  "eligible_aliases": [
    "95b",
    "103b"
  ],
  "held_aliases_unchanged": [
    "50b",
    "74b"
  ],
  "asset_variant_id": null,
  "required_delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact two changed'); const saved = JSON.parse(bytes); check(saved.length === 2 && new Set(saved.map(row => row.printing_id)).size === 2, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 2 && saved.length === 2, 'Identity scope changed');
  for (const row of table) check(same(selectFields(row, IDENTITY_FIELDS.filter(field => !['source_code','provider_id','image_url'].includes(field))), saved.find(item => item.printing_id === row.printing_id)), 'Saved/table identity changed');
  return table;
}
export function validateSourcePlan(plan) {
  check(plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA && same(plan.source_evidence, SOURCE_EVIDENCE), 'Fresh source/authority checkpoint changed');
  check(plan.staging_source_qualification_sha256 === SOURCE_EVIDENCE.stagingSourceQualificationSha256 && same(plan.existing_source_row_hashes, EXISTING_SOURCE_ROW_HASHES), 'Staging absence or old full17 pins changed');
  check(same(plan.source_policies, existingPolicies) && same(plan.new_sources, {production:[NEW_SOURCE_POLICY],staging:[NEW_SOURCE_POLICY]}), 'Only exact inactive PriceCharting source creation allowed');
  check(NEW_SOURCE_POLICY.code === 'pricecharting' && NEW_SOURCE_POLICY.source_type === 'image' && NEW_SOURCE_POLICY.active === false && NEW_SOURCE_POLICY.licence_status === 'under_review' && NEW_SOURCE_POLICY.attribution_required === true && NEW_SOURCE_POLICY.deprecated_at === null && canonicalHash(NEW_SOURCE_POLICY) === '514a1411733d2af6b3a62b5e45b688fbeab270a0527dab44d3d44192b172be0b', 'Exact finite PriceCharting nine-field policy required');
}
export function validateRows(plan, table) {
  check(plan.rows.length === 2 && new Set(plan.rows.map(row => row.printing_id)).size === 2 && table.length === 2, 'Exact two front scope required');
  check(same(plan.source_counts, {pricecharting:2}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'en' && row.set_code === 'ecard2' && row.variant_ids.length === 2 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact English shared pair required');
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
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 4 && indexObjects(plan.rows).size === 8, 'Exact four variants/eight images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 4, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:2,variants:4,names:8,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 12 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 2 && approval.variants === 4 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'en' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 645177330 && FRONTS === 2 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:2,derivative_references:6,object_references:8,unique_image_members:8,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
