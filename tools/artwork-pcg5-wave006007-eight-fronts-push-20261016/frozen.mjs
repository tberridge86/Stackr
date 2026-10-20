import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "074c3c63473345e578ce9bf8db30af43e81d192e96f86a564c015058c1635df3";
export const APPROVAL_SHA = "6f20811a2edeacc0dc8a522059d900adab56d8c3975247d0066752fdc6ab3a06";
export const IDENTITY_TABLE_SHA = "1cbd3bb008552c81c255b161cdb910fbcfbd937b7e8337170761829cca449a2c";
export const SAVED_TARGETS_SHA = "5f90cd92fba39012cfff844695e1932b69886427bd11c975b70366fe997599ea";
export const SOURCE_MANIFEST_SHA = "ad138dd3f0ea566e62f1ccca5531aefa04925a17d37b5fc325bf424f7be04557";
export const ARCHIVE_SHA = "57ddd63643250633faf619aa60ae9eae936e59b1bbc1f1e159b98bf202fbeb68";
export const ARCHIVE_ID = 648009411;
export const ARCHIVE_BYTES = 3725316;
export const FRONTS = 8;
export const QUEUE_ID = "PCG5-WAVE006007-EXACT8-SHARED-FRONTS-20261016";
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
  "approvedProjectionFileByteSha256": "ccc84806227629a97a97fc3ec4a0a66ccf9f32d2287a43f26fec41cf52eeabd5",
  "finiteDecisionFileByteSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
  "rootPrivateContextFileByteSha256": "0403ebddb01e09799b92dc7abd7eb659b301a020f264ceb27c2613518d448e95",
  "sourceHandoffFileByteSha256s": [
    "baed49569d4cfcc558ce8daf693fe3e8fe406dbc76c31d332bca4d8dee8a27de",
    "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667"
  ],
  "independentSourceReviewFileByteSha256s": [
    "20076a91c687a5f5877948b2b5bbb9f752304b2667720b6f1691f35873755555",
    "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce"
  ],
  "priorPerWaveFiniteDecisionFileByteSha256s": [
    "998f6e02194e1cc71c71b689cb445bd8826cd79845c45e0750651f07ad176dc8",
    "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d"
  ],
  "finiteFossilV2ModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
  "finiteFossilV2PeerSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c",
  "fourSourceCheckpointFileByteSha256": "8727932048b434d03fab570b670d7f2255df62647bc3a9fd47a3499b88aab896",
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "c920bd55d685630149c3edba87ea3cd671ffe97d439ecc0edeb189953e92553e",
  "privateSourceContractModuleFileByteSha256": "1b3b109fde20932a81ccb470db2dca3ebae85891ecb2aa8cad2377fa4e0c2703",
  "independentPrivatePackageReviewSha256": "01f8a91dc328f8643a2a949f304fcc0ef4beff0d0034c07de3c09ebc559be755",
  "rootPrivatePackageValidationSha256": "e88f3a6982b08e5d32a4b1aea5c49b9b103b44c6aed54d85707e41c7e31852c5",
  "rootSourceArchiveBindingSha256": "d26fb3fa8caecc7adedebb7a41a83ca6547f0bf20b5820de0c58f6d8ab657db2",
  "rootUploadReceiptSha256": "b0c64431e59ad14a7dff444cc76cdcced4c844bfe8c8655e921cb79ccf13b0ec",
  "actualMeasuredAppReportSha256": "badbe2caf54c795630861f3ea694389914ee82079da52f4fe4e69246cad53923",
  "actualMeasuredDimensionAuditSha256": "0be5bedba008ac82c0271a6c9cf775eb8d0fb3a86e0b6607abe363e1c56b2ead",
  "rootPublisherContextSha256": "ef29da818fc956aff2a5a63ec972152e388799d4997b3131c8d4a8ee6317c21e"
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
export const SOURCE_CHECKPOINT_SHA = "8727932048b434d03fab570b670d7f2255df62647bc3a9fd47a3499b88aab896";
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
  "production": "bf3f6d1c885ba04d9866bb658fdfc6f16bf0795eb35facdf4d12d3c7ba325c7f",
  "staging": "6e85add3e34155e7593620201ae2f35c10ae52ea1b057d3b694bec738e0c2408"
};
const baselineHashes = {
  "production": "3a7c2dc86995bc8e2498b804019e38efa28fce56f9f71917d6f2fcdc91d3363c",
  "staging": "1dbcf9530cb38546377267dfcd34ac4c50be3565e468301326e856425c90dd3f"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-031",
    "JP-CARDS-032"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 8,
  "eligible_set_aliases": [
    "PCG5-054",
    "PCG5-072",
    "PCG5-077",
    "PCG5-078",
    "PCG5-079",
    "PCG5-081",
    "PCG5-082",
    "PCG5-084"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "99d92c62-48a1-4f46-8c52-f8bd29aa7925",
      "category": null
    },
    {
      "printingId": "3b42d0a6-58d9-440f-a4fa-5dedd29bd2c1",
      "category": null
    },
    {
      "printingId": "d375bdec-7d0e-46ff-a6b9-b156ed9af609",
      "category": null
    },
    {
      "printingId": "54ab745b-392e-46a6-8480-b4dc593124a7",
      "category": null
    },
    {
      "printingId": "f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9",
      "category": null
    },
    {
      "printingId": "495d3e13-53cf-4193-b897-892e492dcef1",
      "category": null
    },
    {
      "printingId": "48be3163-e728-45e7-b7d5-e4b5d2267507",
      "category": null
    },
    {
      "printingId": "060248e6-200d-4e55-9c59-693b622a2bb0",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact eight changed'); const saved = JSON.parse(bytes); check(saved.length === 8 && new Set(saved.map(row => row.printing_id)).size === 8, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 8 && saved.length === 8, 'Identity scope changed');
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
  check(plan.rows.length === 8 && new Set(plan.rows.map(row => row.printing_id)).size === 8 && table.length === 8, 'Exact eight front scope required');
  check(same(plan.source_counts, {pricecharting:8}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese PCG5 waves006007 eight shared fronts required');
    const identity = table.find(item => item.printing_id === row.printing_id);
    check(identity && same(selectFields(row, IDENTITY_FIELDS), selectFields(identity, IDENTITY_FIELDS)), 'Identity table mismatch');
    check(row.evidence.artwork_scope === 'printing_front' && row.evidence.delivery_kind === 'shared' && row.evidence.asset_variant_id === null && row.evidence.exact_finish_verified === false && row.evidence.physical_edition_verified === false && row.evidence.vendor_licence_verified === false && row.evidence.owner_business_decision.kind === DECISION, 'Shared artwork/authority changed');
    validatePublishedWitness(row.evidence.source_body, row);
    check(row.objects.length === 4 && row.objects.every((object,index) => object.role === roles[index]), 'Complete original plus eight derivatives required');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && object.width <= known.original.width && object.height <= known.original.height && object.byte_size > 0 && object.byte_size < 12000000, 'Object identity or enlargement changed');
      check(object.mime_type === (object.role === 'original' ? 'image/jpeg' : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${object.role === 'original' ? 'jpg' : 'webp'}`, 'Actual JPEG/display MIME or path changed');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 8 && indexObjects(plan.rows).size === 32, 'Eight exact current variants/thirty-two images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 8, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:8,variants:8,names:16,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === 'b842c88c18a2bd90adaa8e89642e4e6142723aa5916cd58988928a1e6a1e2553' && canonicalHash(plan.canonical_schema_qualification) === '8c29d4d6225713d8c21672ee5317495a9d0356a91816e2578e5402e9c9527331', 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 36 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 8 && approval.variants === 8 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 648009411 && FRONTS === 8 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:8,derivative_references:24,object_references:32,unique_image_members:32,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
