import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "16b6947b206476eaa7c86763eed0607681c2daa291aaa569429e7a4387ae4a0f";
export const APPROVAL_SHA = "2a6487868b48beb43c0c1889986df9a7333c335b968b658166e9658027149f4c";
export const IDENTITY_TABLE_SHA = "1b7179e84e942b154f04a29e9b21653b851db91f1005d293730024b9717814ca";
export const SAVED_TARGETS_SHA = "7e95012cd4fd870d3ead6c19237e09eaaadb0dceb4c5d4562d628ecf8e78c264";
export const SOURCE_MANIFEST_SHA = "61d8530f497e9dc2b2095f95e63a0a2bb332027f1877da811ca8dc1f6f0472db";
export const ARCHIVE_SHA = "c53e01a36b0e37aef0ca5da29a506bcd314c46684a9c612473af82dcd41a4d3b";
export const ARCHIVE_ID = 648265809;
export const ARCHIVE_BYTES = 4056759;
export const FRONTS = 10;
export const QUEUE_ID = "pcg6-wave008009010-fronts";
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
  "approvedProjectionFileByteSha256": "61484eb4abfe5ce7787ad5fa6752efb034c8e1b95ae90b007aa5a8c299d32a87",
  "finiteDecisionFileByteSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
  "rootPrivateContextFileByteSha256": "50d3da85513eadb2550dad1055238018b0acc59bf83950922710cd13415d57c2",
  "sourceLineages": {
    "sourceLineages": [
      {
        "wave": "008",
        "handoffSHA": "4f600dd25d3ffdb2744a140921a2bc71cc0e922a3c7fec12ea67dde4086e5762",
        "independentSourcePeerSHA": "59955361dc218092e491465947bd5bdf02e25eaf880b37c81e634e96f3addcfe",
        "priorRootDecisionSHA": "ae9fa3fa807f3d59f66742d77af7c3980bf362dfbc823957e239663599eade54"
      },
      {
        "wave": "009",
        "handoffSHA": "d3254352263f9938509cc7b899c4947c617bb92d6f37c35c6dc46da300e7bfd5",
        "independentSourcePeerSHA": "2b28acbbd0298df871300839787ae064069cbb843f3f3fb8e19d16d504bc1ea1",
        "priorRootDecisionSHA": "98b69c75b155971a789fef0a2967f9abc2c60a193d3210a0e098eb5e27486dab"
      },
      {
        "wave": "010",
        "handoffSHA": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
        "independentSourcePeerSHA": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
        "priorRootDecisionSHA": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b"
      }
    ],
    "finiteEnergyQualification": {
      "aliases": [
        "PCG6-085",
        "PCG6-086"
      ],
      "handoffSHA": "ce221f8c00579866edd4c715ae22cf4d25abe679708972ea4a183bff0bcb6a7c",
      "moduleSHA": "07ad55e7c9ff251c0a0aa46bc06f0718d8eaa88c4fac790e56e7f3bea051b1da",
      "peerSHA": "884d6d5875e04125bc8fea1bd715379c683e0f7259d1b8c89c66b6be420dd8df",
      "currentNativeProviderCategory": "Trainer",
      "currentCanonicalCategory": null,
      "printedClass": "Energy",
      "completePrintedRulesIncludingPokemonExRestrictionPreserved": true,
      "source010RawHistoricalPartition": {
        "accepted": 4,
        "held": 16
      },
      "source010OperationalPartition": {
        "accepted": 6,
        "held": 14
      },
      "sourceAuthorFlagsRemainFalse": true,
      "globalTrainerOrEnergyWaiver": false,
      "notIncluded": "PCG6-084"
    },
    "otherOperationalHolds": 50,
    "rawHistoricalHolds": 52,
    "allFalseSourceAuthorFlagsPreserved": true,
    "allNineInsertionWitnessChecksAndStoredSHARecomputesRequired": true,
    "newSourceRequestsAllowed": 0
  },
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "a5408cf93e3806de7b76d19b2014c91fe2e2f2527cb76c5e6778b25f36506425",
  "privateSourceContractModuleFileByteSha256": "8d234aae1a181aa47da915f71d3091ffed8237f56295b5cf298daa341157c479",
  "v2ExternalValidatorBindingFileByteSha256": "e5ea926d9fc6ef91bfcf94b998800ce2a6d1f659c2a373982344f9b4722c9a35",
  "privateV2HandoffFileByteSha256": "0a8d5f748d441041b6c496e8ada48e9aec41461ae5e28241b159e612cd07e298",
  "unchangedArchiveDoesNotAloneProveCorrectedValidator": true,
  "independentPrivatePackageReviewSha256": "af6f2ab63737fa1206f9c7337cc5add4e285bdd551bc46a4c6599c082e5323c9",
  "rootPrivatePackageValidationSha256": "354bf9f5ea98db4979d5325e71a27852f449b36260b2ee4b94a487cffeb427fb",
  "rootUploadReceiptSha256": "287eeec5e4b5f12653f8cd0f6eb4aefc0365d140bccc733ac775471d292f825b",
  "actualMeasuredAppReportSha256": "02dcaa088cca0d9764b24c92170be095ac5a6b45b93ab4150047944298260962",
  "rootPublisherContextSha256": "43aaa7135dc8e626ce262bdd8349cd7ea2ab564242ae3ea557c8927f2193c687"
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
export const SOURCE_CHECKPOINT_SHA = "f1946a2cac1907ddb7f95cfdaf1416b65505901bbe706debcc22970febdeaaba";
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
  "production": "be66421d09e6a641c783d9cd4daaffe0b6cbd690cb9aa29f0e2ac11466396bea",
  "staging": "b5bccc5f4690acdc6d9befb8fa123daafe3c77f5f717625d386f2dedf6f1ecdd"
};
const baselineHashes = {
  "production": "4eedb23373af70698234b088af324cb4ba3863af50e915e67f7df5f747ad053c",
  "staging": "6cbc971b89783018f5a0af68b13cd715e9f6a958ad6e6e9466fb69b413d42061"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-033",
    "JP-CARDS-034",
    "JP-CARDS-035",
    "JP-CARDS-036"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 10,
  "eligible_set_aliases": [
    "PCG6-007",
    "PCG6-020",
    "PCG6-021",
    "PCG6-044",
    "PCG6-070",
    "PCG6-078",
    "PCG6-080",
    "PCG6-083",
    "PCG6-085",
    "PCG6-086"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
      "category": null
    },
    {
      "printingId": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
      "category": null
    },
    {
      "printingId": "bcb2a732-f043-4eac-a767-6515f1c5408d",
      "category": null
    },
    {
      "printingId": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
      "category": null
    },
    {
      "printingId": "701a96ec-0100-41ea-b324-b6adc450fb2f",
      "category": null
    },
    {
      "printingId": "7734f437-9514-4c5a-ace5-7359a60216ad",
      "category": null
    },
    {
      "printingId": "bafca88a-6810-411a-8a1f-ca250618a502",
      "category": null
    },
    {
      "printingId": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
      "category": null
    },
    {
      "printingId": "cc1681cb-030e-4d1e-a144-d68ff927f111",
      "category": null
    },
    {
      "printingId": "335d5820-4616-49be-89ff-5c8f494e1940",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact ten changed'); const saved = JSON.parse(bytes); check(saved.length === 10 && new Set(saved.map(row => row.printing_id)).size === 10, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 10 && saved.length === 10, 'Identity scope changed');
  for (const row of table) check(same(selectFields(row, IDENTITY_FIELDS.filter(field => !['source_code','provider_id','image_url'].includes(field))), saved.find(item => item.printing_id === row.printing_id)), 'Saved/table identity changed');
  return table;
}
export function validateSourcePlan(plan) {
  check(plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA && same(plan.source_evidence, SOURCE_EVIDENCE), 'Fresh source/authority checkpoint changed');
  check(same(plan.existing_source_row_hashes, EXISTING_SOURCE_ROW_HASHES), 'Staging absence or old full17 pins changed');
  check(same(plan.source_policies, existingPolicies) && same(plan.new_sources, {production:[],staging:[STAGING_FIXTURE_POLICY]}) && plan.production_source_changes_allowed === 0, 'Production source writes forbidden; only temporary stage PriceCharting fixture allowed');
  check(STAGING_FIXTURE_POLICY.code === 'pricecharting' && STAGING_FIXTURE_POLICY.source_type === 'image' && STAGING_FIXTURE_POLICY.active === false && STAGING_FIXTURE_POLICY.licence_status === 'under_review' && STAGING_FIXTURE_POLICY.attribution_required === true && STAGING_FIXTURE_POLICY.deprecated_at === null && canonicalHash(STAGING_FIXTURE_POLICY) === "514a1411733d2af6b3a62b5e45b688fbeab270a0527dab44d3d44192b172be0b", 'Exact finite PriceCharting nine-field policy required');
}
export function validateRows(plan, table) {
  check(plan.rows.length === 10 && new Set(plan.rows.map(row => row.printing_id)).size === 10 && table.length === 10, 'Exact ten front scope required');
  check(same(plan.source_counts, {pricecharting:10}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese PCG6 waves008009010 ten shared fronts required');
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
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 10 && indexObjects(plan.rows).size === 40, 'Ten exact current variants/forty images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 10, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:10,variants:10,names:20,sets:1}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === "211ddbfd50415fee397080274c96c16ce118c4829264669b1a1704ce11b298db" && canonicalHash(plan.canonical_schema_qualification) === "926bef957f6c48fbcb610205eda3dfe67716c8c4558b7c9fa7ac3b1533893805", 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 44 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 10 && approval.variants === 10 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 648265809 && FRONTS === 10 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:10,derivative_references:30,object_references:40,unique_image_members:40,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
