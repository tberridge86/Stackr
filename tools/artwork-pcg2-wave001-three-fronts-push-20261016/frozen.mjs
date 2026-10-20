import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "a9c4439ecde035eefdde6fb42e4ed7e42097adc641cc9de9bee0cad1f3bf2aaa";
export const APPROVAL_SHA = "59e03fc9079cf484f07dfc2e9664132ac5afe2704ec22bd7cc9aa4e3686a34af";
export const IDENTITY_TABLE_SHA = "3b8963f1f896e77584416aa7aeb40a20dce8e8c6e2d51fbe7aa8589c5b211bdb";
export const SAVED_TARGETS_SHA = "d5a34b072b02790a84f4a85b1863366ce7d4173a14d2fcea9eed42aaa62bd842";
export const SOURCE_MANIFEST_SHA = "468e121f80ae0dc64897ebc5b55f3a86fc68556e7653cc6378b248e71fc90945";
export const ARCHIVE_SHA = "1482ac67527df7cca8a6f06bb5b17798fa5eaa4df27ec3ac43faf1eb2e93994e";
export const ARCHIVE_ID = 646704421;
export const ARCHIVE_BYTES = 1389917;
export const FRONTS = 3;
export const QUEUE_ID = "PCG2-WAVE001-EXACT3-SHARED-FRONTS-20261016";
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
  "approvedProjectionFileByteSha256": "47d6562d64e659d75b642d6569f2b81e9ef99aaca662c94bb5a90353872065fa",
  "finiteDecisionFileByteSha256": "df4d3c3463b7555a662a8a1d2bed8cb2c949b4739e4b2fbec7c76ea6393b6347",
  "rootPrivateContextFileByteSha256": "a2aaea707a2e8ddc05e8c71d143bc672888642f29e3368757e3d4073965ddad2",
  "sourceHandoffFileByteSha256s": [
    "15e12e42c58e46c49e12b5a23686c19cc4aa8981ab101c42e9db746457d80a8d"
  ],
  "independentSourceReviewFileByteSha256s": [
    "9798d92969e1f8acdae10e3d41c8c218640d54db462ec25ee15e3863ad4c7ef4"
  ],
  "fourSourceCheckpointFileByteSha256": "fab06b3d207933bfab65f82f61949c5fe6f77361b073a90ed4f0fbb2a6c033e1",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "6a27c693bef20c68d53d1c6647a75156b6df17d7f41d0429aafa83da19367e81",
  "independentPrivatePackageReviewSha256": "6a4bffebd1737774a33188aebd5d2015e69699c4749b980a96d493ac7ca39b4d",
  "rootPrivatePackageValidationSha256": "22096830da97143b8e225bb78c21ad6c373301ce028b30d163985a9482273d49",
  "rootSourceArchiveBindingSha256": "12309b9fd761ff9c780b2615d77b2ab225d6bb1d36e1bbfff2eab28d059652a3",
  "rootUploadReceiptSha256": "bffb4e00ef2f688b34dfb17ab0c24cb1dccc25cce49105c26577605b94ca44a0",
  "actualMeasuredAppReportSha256": "8b698ddc2b5c2e921fb5f266d2a3f854c684c6cb4413deefbead60025e853fca",
  "actualMeasuredDimensionAuditSha256": "9b810811ae02f6069916cba662cd53daee6c2a75d170ab5689e088f23e9dc4ab",
  "rootPublisherContextSha256": "22446c27ce6c1d5f31275ebb2f1cb73010a6ea50d39b8f9ee190127d6981ae9b"
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
export const SOURCE_CHECKPOINT_SHA = "fab06b3d207933bfab65f82f61949c5fe6f77361b073a90ed4f0fbb2a6c033e1";
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
  "production": "f92fea0a04caf857fdb4f3b2353df1c5bfef98bfc22161cefdcf2bc428db5431",
  "staging": "14d7371da1d8913dbd5eaf7f45aefcbd420f783be5a35aa7883dbe5e13b5de4c"
};
const baselineHashes = {
  "production": "54b38f10e785d247fa027de0ad9045f0f9aeebe9aea8fe0a9bcc0c415f2a7976",
  "staging": "864692a4984244569a76af62506d335513a696bcd6a85f1e31f42820482baeae"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-021"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 3,
  "eligible_set_aliases": [
    "PCG2-008",
    "PCG2-010",
    "PCG2-031"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "36710a9b-7b22-4412-b2a9-2fb4af5aeb7c",
      "category": null
    },
    {
      "printingId": "e6192b59-9593-4315-a414-591df5f3fe51",
      "category": null
    },
    {
      "printingId": "c61d1e2b-a65c-4b2a-bce6-6f66d236b4fb",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact three changed'); const saved = JSON.parse(bytes); check(saved.length === 3 && new Set(saved.map(row => row.printing_id)).size === 3, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 3 && saved.length === 3, 'Identity scope changed');
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
  check(plan.rows.length === 3 && new Set(plan.rows.map(row => row.printing_id)).size === 3 && table.length === 3, 'Exact three front scope required');
  check(same(plan.source_counts, {pricecharting:3}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
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
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 3 && indexObjects(plan.rows).size === 12, 'Three exact current variants/twelve images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 3, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:3,variants:3,names:6,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === '3ba448b0af8ffaf7c0bf3bd4be16473282d7d9fc6b02c551c9a57efb3e7ec3cf' && canonicalHash(plan.canonical_schema_qualification) === '12e27134b26c5d9e6f99243095ae9b9cb1bbbad3abcfe046ed6ee7743234b01a', 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 16 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 3 && approval.variants === 3 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 646704421 && FRONTS === 3 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:3,derivative_references:9,object_references:12,unique_image_members:12,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
