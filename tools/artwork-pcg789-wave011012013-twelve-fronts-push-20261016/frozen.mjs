import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalHash, validatePublishedWitness, knownSource } from './source-proof.mjs';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
export const COHORT_SHA = "477021bea5228a33c64414b790af250f5f57f4ad81e3b772b77f1cdd025e38ef";
export const APPROVAL_SHA = "42ff685755fbd080b8218f640c175ef3ad79a960d94553755086ba13821a0be0";
export const IDENTITY_TABLE_SHA = "b479b0a6a010e91655ffa1ebed23367f0468cef8bc9fe3e173ee986928ea8a34";
export const SAVED_TARGETS_SHA = "4666bfcb26888d322818802be95811e2c7c3213dfbf102b9f61cb9f802118ee8";
export const SOURCE_MANIFEST_SHA = "418b410552f46ad0378e4010b2c7960ccfc80819c2a2f621e40d6ad2a297df95";
export const ARCHIVE_SHA = "75a95c11c369d2fe9e73f31332401e7f14f23c5063a0b6e77a277180c7540cc0";
export const ARCHIVE_ID = 648356088;
export const ARCHIVE_BYTES = 5976589;
export const FRONTS = 12;
export const QUEUE_ID = "STACKR-JA-PCG789-WAVE011012013-EXACT12-SHARED-FRONTS-20261016";
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
  "approvedProjectionFileByteSha256": "34210b15423e8f9b002dc619b5b4c05c396510f7daeae909a0e5c757df447164",
  "finiteDecisionFileByteSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
  "rootPrivateContextFileByteSha256": "c24154a2a6572ab2c2e9b321504c4d041883417f671fdffaa1a7060979b64964",
  "sourceLineages": [
    {
      "wave": "011",
      "sourceHandoffSHA": "40888f3bc3efbd3a8aaf585175601f6680b5d80941614226f6ae01a0610a03a4",
      "independentPeerSHA": "7097a3538764e7983e6e2075330a1a24484c4ba5026dec73aed35b4f6eff29ac",
      "rootDecisionSHA": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
      "selected": 3,
      "operationalHeld": 17
    },
    {
      "wave": "012",
      "sourceHandoffSHA": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentPeerSHA": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "rootDecisionSHA": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "selected": 6,
      "operationalHeld": 14
    },
    {
      "wave": "013",
      "sourceHandoffSHA": "a1d2991c2f423bd37c70c414943a94caa6a646dc4f6063d365b1ee878865124a",
      "independentPeerSHA": "6595353e6ca7046b030607101fece0e4c0fbcb954139ce3e04a74b433aa7f47f",
      "rootDecisionSHA": "eaf72c29563094f5fea5f00e9932a8cc5423c908cc619a5f58bb0168e31f1fb8",
      "selected": 3,
      "operationalHeld": 17
    }
  ],
  "source012HoldProjectionHF": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
  "source012HoldProjectionPeer": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
  "finiteEnergyQualification": {
    "alias": "PCG8-075",
    "handoffSHA": "d4530fece80edb6ad367006a32fce51d2eee26b2ed1a5caa7a9a0d77c35031c8",
    "moduleSHA": "3b43cae88048f970cf4c5f031a0237c329192f0028c59dcdd514247c3bdeb433",
    "bindingSHA": "86cec2239bbcaa44a2c6429a6e7684e5d913a6ada38b4b92c3c7a8900cd5ae9a",
    "packetSHA": "573f8f801862ab7e6ce3062a273df17f812c7fd5b568bb5e75d6f7994c1fd818",
    "operationalQuerySHA": "3e972f519c307989756fe6a6d08502762f34e7340df9c5beaa1e5923183048be",
    "independentPeerSHA": "df7c7116c2d41c923e2b9b58026a78bc7139fd813e664a334de69c8c94342878",
    "actualPrintedClass": "Energy",
    "providerNativeClassRetained": "Trainer",
    "canonicalCategoryRetained": null,
    "englishNameRetained": null,
    "fullRulesIncludingBothPokemonExExclusionsPreserved": true,
    "globalTrainerEnergyWaiver": false,
    "sourceAuthorApprovalFlagsChanged": false
  },
  "source011ProseCorrection": {
    "originalDecisionSHA": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
    "alias": "PCG7-022",
    "incorrectHistoricalProse": "022 normal/defaultTRUE",
    "correctFrozenRowAndActualCurrentTuple": "022 holo/defaultFALSE; sole actual API default remains its only holo variant",
    "rowValuesAndSourceArtifactBytesUnchanged": true,
    "metadataWrites": 0
  },
  "ownerPermissionAttestationSha256": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "privateSourceContractFileByteSha256": "c529f49954a2800bb31bf833eb89528d9f197a01946875ff53b07c21f34e5af0",
  "privateSourceContractModuleFileByteSha256": "9f7a132ec7c2e8f508d19d1869836a3cdb9b521e1c0723cde68fc87098ff7f75",
  "externalValidatorBindingFileByteSha256": "65e7faabea24c378950eae3e0f9f4b1524888c09c06506444e3e7dd5e0784e90",
  "privateHandoffFileByteSha256": "c5d42eac529d1047ed8200b8bc1dd6425bf38e62eb46ed42d0ce04eede35a323",
  "executableValidatorSeparateFromArchive": true,
  "independentPrivatePackageReviewSha256": "76e2c1bc639a3645fbad6ffcef8d86d3f204445b831e0d53780f17e1f311b041",
  "rootPrivatePackageValidationSha256": "347c00d6274a47479fccaebb30df4d12a94b7a36473f119715a07c029ea06fa2",
  "rootUploadReceiptSha256": "77ebf292fffae683ec1e213b1e08ba8e746f289d503b255eb391afd53dbc32e1",
  "actualMeasuredAppReportSha256": "6811ee38779a2480cee9397ff0437de56adac531b87ec7c2187c0e82ab02ee0b",
  "rootPublisherContextSha256": "f5c5eacae2d1b40bae48bb3beebd24235386396b7aa74311722a5532c0feb25a",
  "otherOperationalHolds48": true,
  "perRowEnglishCategoryValuesExact": true,
  "PCG8051EnglishExactly": "jigglypuff"
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
export const SOURCE_CHECKPOINT_SHA = "28604117ad0d490f95bb75c5766001bd452d5d4fabf5c1f2ab4e953f224ec02c";
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
  "production": "d099b303ada59cd1379afbd02d0e2cddb5de00dd483a777903c464ba8409c11a",
  "staging": "6b7a9576a33ed0fe568ac9d1241b9d56234adc42581c5df9674e518e25458ea9"
};
const baselineHashes = {
  "production": "f8a75df8c62085f0f4e98c9e8cc15432b11d9e12c86b1277ed700bbe374d5c79",
  "staging": "e06d179377c29f602c90214188c4c182e0fcc98bf99b8f7ab66bcc6c7d7e615d"
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-037",
    "JP-CARDS-038",
    "JP-CARDS-041",
    "JP-CARDS-042",
    "JP-CARDS-044"
  ],
  "work_type": "CARDS",
  "eligible_fronts": 12,
  "eligible_set_aliases": [
    "PCG7-022",
    "PCG7-033",
    "PCG7-040",
    "PCG7-048",
    "PCG7-050",
    "PCG8-047",
    "PCG8-048",
    "PCG8-050",
    "PCG8-051",
    "PCG8-068",
    "PCG8-075",
    "PCG9-048"
  ],
  "recorded_categories_preserved": [
    {
      "printingId": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
      "category": null
    },
    {
      "printingId": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
      "category": null
    },
    {
      "printingId": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
      "category": null
    },
    {
      "printingId": "38e67ba5-019b-405a-9800-6995a3d62393",
      "category": null
    },
    {
      "printingId": "826abe37-5568-4559-b3e2-da9cc4e29658",
      "category": null
    },
    {
      "printingId": "40c40f95-7df1-4153-9030-1871ccaf77cf",
      "category": null
    },
    {
      "printingId": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
      "category": null
    },
    {
      "printingId": "4f98bea0-d418-4443-84bf-07a30281a5d3",
      "category": null
    },
    {
      "printingId": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
      "category": null
    },
    {
      "printingId": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
      "category": null
    },
    {
      "printingId": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
      "category": null
    },
    {
      "printingId": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
      "category": null
    }
  ],
  "asset_variant_id": null,
  "source_variant_id": null,
  "delivery_kind": "shared",
  "whole_batch_completion_asserted": false
};
const roles = ['original','card-grid','search-result','detail-page'];
export function validateSavedTargets(bytes) { check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved exact twelve changed'); const saved = JSON.parse(bytes); check(saved.length === 12 && new Set(saved.map(row => row.printing_id)).size === 12, 'Saved scope changed'); return saved; }
export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed'); const table = JSON.parse(bytes);
  check(table.length === 12 && saved.length === 12, 'Identity scope changed');
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
  check(plan.rows.length === 12 && new Set(plan.rows.map(row => row.printing_id)).size === 12 && table.length === 12, 'Exact twelve front scope required');
  check(same(plan.source_counts, {pricecharting:12}) && same(plan.delivery_scope, deliveryScope), 'Shared finite delivery scope changed');
  for (const row of plan.rows) {
    const known = knownSource(row.printing_id);
    check(canonicalHash(row) === known.rowCanonicalSha256, 'Frozen current identity/source/evidence/object row changed');
    check(row.language_code === 'ja' && row.set_code === known.setCode && row.work_type === 'CARDS' && row.variant_ids.length === 1 && same(row.variant_ids, known.production.map(card => card.variant_id)), 'Exact Japanese PCG789 waves011012013 twelve shared fronts required');
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
  check(new Set(plan.rows.flatMap(row => row.variant_ids)).size === 12 && indexObjects(plan.rows).size === 48, 'Twelve exact current variants/forty-eight images required');
  for (const env of ['production','staging']) {
    check(canonicalHash(plan.binding_expectations[env]) === bindingHashes[env] && plan.binding_expectations[env].length === 12, 'Current per-environment bindings changed');
    check(same(plan.scope_counts[env], {printings:12,variants:12,names:24,sets:3}) && plan.before_snapshot_hashes[env] === baselineHashes[env], 'Full canonical snapshot scope changed');
  }
  check(canonicalHash(plan.app_display_expectation) === "d4037f298d931252c9e3d2f84b5942831cf7f20d9eecc89d5b01114139bc7f9f" && canonicalHash(plan.canonical_schema_qualification) === "4e57d34bc327fc7e2ce5f9946bfd16ebb16718d14eafde3bb414b71ec0eff1a3", 'Distinct measured app roles and both canonical schema tuples required');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen finite plan bytes changed'); const plan = JSON.parse(bytes);
  check(plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Finite plan provenance changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 52 && same(plan.archive_metadata.map(row => row.file), METADATA_FILES), 'Immutable archive changed');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}
export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed'); const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.fronts === 12 && approval.variants === 12 && approval.cohort_sha256 === COHORT_SHA && approval.store_resize_display === true && approval.decision_type === DECISION && approval.language_code === 'ja' && approval.source_wide_approval === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && same(approval.source_evidence, SOURCE_EVIDENCE), 'Exact finite conditional authority required'); return approval;
}
export function requireFinalFreeze() { check(ARCHIVE_ID === 648356088 && FRONTS === 12 && /^[a-f0-9]{64}$/u.test(COHORT_SHA), 'Final exact release freeze required'); }
export async function loadFrozen() {
  requireFinalFreeze(); const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json',import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json',import.meta.url)),saved);
  const plan = validatePlan(await readFile(new URL('./plan.json',import.meta.url)),table);
  const approval = validateApproval(await readFile(new URL('./approval.json',import.meta.url)));
  const receipt = {cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,fronts:12,derivative_references:36,object_references:48,unique_image_members:48,decision_type:DECISION,vendor_licence_verified:false,source_wide_approval:false,artifacts:[{id:ARCHIVE_ID,sha256:ARCHIVE_SHA,size_in_bytes:ARCHIVE_BYTES}]};
  return {plan,rows:plan.rows,approval,receipt,table,saved};
}
