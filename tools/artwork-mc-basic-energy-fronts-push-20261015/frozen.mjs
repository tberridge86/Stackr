import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness, requireFinalPublicationFreeze } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '8be6a84e59101aa8a1903966c68a8882e55fd7707355539878838d7461786a83';
export const APPROVAL_SHA = '9b0c2c490eff8ea690a359f9505020bbd1920988dfe66cdff4b5bc83835d74b2';
export const IDENTITY_TABLE_SHA = '2d1621e57e120401e6d8f8d1a216fd9b34309ce26758f396b77027b03fce7289';
export const SAVED_TARGETS_SHA = '5a6458909042bcff2ffac23ac3fc2f82286a3b6cc48a0560a629046367af343c';
export const SOURCE_MANIFEST_SHA = '27408899a41956c0318d0d2b432613396e279d7e6cb3437f2d85ee5e0526d9e4';
export const ARCHIVE_SHA = '383309f90b04dfe87bb87e0e7e65c75577e06064c97954ce5e01fcc35407668f';
export const ARCHIVE_ID = 645030064;
export const ARCHIVE_BYTES = 910831;
export const FRONTS = 8;
export const QUEUE_ID = "STACKR-JA-MC-BASIC-ENERGY-TCGCOLLECTOR-FRONTS-20261015-008";
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "b7ca60acb2fc5fde03b0fb5107d671cd63608874a10a78305a453e68e9a06106",
  "finitePreparationConditionalPublicationDecision": "fa01abad2bec8b61eef8110a171cae6794175a653dbaead879eeb66e9e82d5e4",
  "independentSelection": "a9a7761bf7235ef6cd4e126a4f49efa870c6def5ed2c3f6029350d2e13563c14",
  "independentReview": "04edfca5da2eeb2badda116555fe58a8243bd8311a93e0e9c560b10c75636c88",
  "priorTcgSourcePolicyCanonical": "207957571711627d17ab7e1ed0ef77f6635426ee9a5972d47d316e3fcba9bd1e",
  "ownerPermissionAttestation": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "e830100c-dc89-403f-aa16-994b4b1b8cb9": {
    "alias": "DAR",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:57ce71bb47db3d7bff6a5327ca93b8b7bf297c56ae0473f1e5cccc98f49c5a61",
    "image_url": "https://static.tcgcollector.com/content/images/06/91/51/0691516890eda2d682b3502b19c672eca3d8ddf1952ea29560d1098a18ebfa74.webp",
    "variant_id": "c4d608e8-ed76-49f9-bc90-cd42d13a626a",
    "finish": "normal",
    "current_native_label": "基本悪エネルギー",
    "original_sha256": "e1484f6fc27e2ca486af21a5219a847102ef8bdb3f419f307444b4eeaec4e0b4",
    "original_mime": "image/webp",
    "body_sha256": "d0929be657c65a0d34a5bc9de9c69c4c15514acbb04473c3b4f592672029ce53",
    "width": 868,
    "height": 1212
  },
  "78343d26-d54b-40df-9d6f-d883c74c71cd": {
    "alias": "FIG",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:0c7d6123f4cc13b0c7c22ca3c4f379d0f68f3ec4f850526469295d3e71ab7bf8",
    "image_url": "https://static.tcgcollector.com/content/images/c0/09/fa/c009fa6edcdcf236fa8fd37af192a0e7afb752dedf04661f23ec99791c909f05.webp",
    "variant_id": "5f06793b-569b-48b0-8843-2d103893b1c3",
    "finish": "normal",
    "current_native_label": "基本闘エネルギー",
    "original_sha256": "241425bb8a572e619ec1cbdb2828fe72e0d877847eb1e6f3287ad0529b2d23c3",
    "original_mime": "image/webp",
    "body_sha256": "7d0f23a39f16f0ae8bab6607eee6c17fc8441a7f75204c95dc9df01e18340c13",
    "width": 868,
    "height": 1212
  },
  "16ddfe56-d4f2-4bbe-93fe-bc33e2ba46fd": {
    "alias": "FIR",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:a9f726bbdc3d720a84e6670d7eb211fff8497d1c6c950172793697ef0a3becf0",
    "image_url": "https://static.tcgcollector.com/content/images/f4/97/aa/f497aaed813e3abda973c63027e95165ecc72eb06673c098c0e6b3cb088c5f11.webp",
    "variant_id": "1fd4398e-6c9a-4f1e-8f44-7e9cb372d2ba",
    "finish": "normal",
    "current_native_label": "基本炎エネルギー",
    "original_sha256": "a2fc2bc3fb09a28e259c323304e30213b0f5933b0114719623776685c4e88383",
    "original_mime": "image/webp",
    "body_sha256": "bcba13264d6189261f72f11d19ae87fa032c35cd8438ff4e53ecd7023f6c2d70",
    "width": 868,
    "height": 1212
  },
  "7b1cc2c4-1540-4d78-880b-4e10a0331397": {
    "alias": "GRA",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:6cc623d466eac9417fc28cb3b861b4c4e5ec1fcf0eac4169f99c24e0a5aefd43",
    "image_url": "https://static.tcgcollector.com/content/images/3a/2d/21/3a2d214c2084f1a5b9934b3c7a0dde4ea8f2519624f463936f7a6f249bf423ee.webp",
    "variant_id": "5e4d0715-7eb6-449b-9979-9ca61e30aedb",
    "finish": "normal",
    "current_native_label": "基本草エネルギー",
    "original_sha256": "022d647dc7d68bfff87d168cce25a84f1a754104b7ff3f499567ca5a022ac3eb",
    "original_mime": "image/webp",
    "body_sha256": "09739286ee4bcb5f97f906350fed0dc0dc553e1c645d857879f9a1e1bc9a740b",
    "width": 868,
    "height": 1212
  },
  "85321449-d93a-49a2-86a0-611d7b7b3e8e": {
    "alias": "LIG",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:c22d729db0e49828966e36bfe3fb046b2e30a380f304ca69ed301e0feb432d85",
    "image_url": "https://static.tcgcollector.com/content/images/92/87/b5/9287b537edd6e48bb169a0a349439c5fb3f0d9e346069ef96bbee453ca9626d4.webp",
    "variant_id": "a493adee-161e-400b-b222-ab76ae519cd3",
    "finish": "normal",
    "current_native_label": "基本雷エネルギー",
    "original_sha256": "f59bf4573265b1fb0e80be1737e9acbad79014bd9f04b9305b6fffbb6391974e",
    "original_mime": "image/webp",
    "body_sha256": "85b3ca345024948b940295df370f45e78e686cc872b492f72ec0825fc655b994",
    "width": 868,
    "height": 1212
  },
  "322b5ba7-8a5d-418d-8abd-376a12d3dea9": {
    "alias": "MET",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:d1236e8ebb0e0945a3db682a1c56e6dfc9ebf34799e465922b279a4e6f17ccaa",
    "image_url": "https://static.tcgcollector.com/content/images/44/fc/59/44fc593e3141734d92d78d30d9aa3f03b475b00732ae082fbbb6ff87b3bd4022.webp",
    "variant_id": "a574e417-34de-4ce9-89dd-ccd016945d29",
    "finish": "normal",
    "current_native_label": "基本鋼エネルギー",
    "original_sha256": "1c92c9e66a140dcdaa6a4de04fdfc28791c7ff48f1172fdedff4718b2fdf3a88",
    "original_mime": "image/webp",
    "body_sha256": "8b7e17617bbd421ea6847f38ca772bc8119eff39ce4389e3caa01a25c1b207a2",
    "width": 868,
    "height": 1212
  },
  "07ff7f6b-9459-4feb-bb0f-a0efd42079e5": {
    "alias": "PSY",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:ae7364f22a8c46d11d4d06b04dd84664347687de643202aaeaeccdd3e422dd95",
    "image_url": "https://static.tcgcollector.com/content/images/90/54/e0/9054e0755036ab864e3ed4c9ec6a3540c3112a2515ef3db4355cf24750568b75.webp",
    "variant_id": "eae8d1c2-6315-4e56-9d1e-3166f14c7c13",
    "finish": "normal",
    "current_native_label": "基本超エネルギー",
    "original_sha256": "a6de1a07bdda1b0fd8e774868a02ab17804985ed17bae3f568ab9846cd1d3876",
    "original_mime": "image/webp",
    "body_sha256": "290e01e90aff35712e1972440bd3cacfa1f1bd27e78c1e28bd5a72d5efabe378",
    "width": 868,
    "height": 1212
  },
  "e366fc5e-deec-4863-bd5c-cc890adfbc08": {
    "alias": "WAT",
    "batch_id": "JP-CARDS-002",
    "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
    "set_code": "MC",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:74b014fc2fb490c80cbd93e4ee250bd8c026dfa743b5eb627ae5a8e858a5d061",
    "image_url": "https://static.tcgcollector.com/content/images/c4/79/a3/c479a31dce405c352f2571f6a3291c6b62904721ac37750a100949c45e07b669.webp",
    "variant_id": "6dd5229e-3675-4d5a-8f0b-cc89c5ad3a3a",
    "finish": "normal",
    "current_native_label": "基本水エネルギー",
    "original_sha256": "1379a845a194f6ba41712f2f84f26c41858e75d8e7b22da3f47a2314a9ff4fe6",
    "original_mime": "image/webp",
    "body_sha256": "b51fbaa1ffa621cd695f675189055368b664dd42a3d38cbd650be96fb0aac775",
    "width": 868,
    "height": 1212
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-002"
  ],
  "saved_batch_tasks": 8,
  "eligible_fronts": 8,
  "by_batch": {
    "JP-CARDS-002": {
      "verified": 8,
      "held": 0
    }
  },
  "excluded_aliases": [],
  "excluded": [],
  "outside_fixed_cohort": [],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled MC Basic Energy printing');
  check(row.card_native_name === known.current_native_label, 'Current native label must be preserved');
  return known;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved subset size');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong identity table scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    const known = knownFor(row);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)) && row.original_sha256 === known.original_sha256 && row.body_sha256 === known.body_sha256, 'Identity outside accepted fixed subset');
  }
  return table;
}

function validateBody(row, known) {
  check(digest(Buffer.from(JSON.stringify(row.evidence.source_body))) === known.body_sha256, 'Exact source/public body changed');
  validatePublishedWitness(row.evidence.source_body, row);
  const e = row.evidence;
  check(e.artwork_scope === 'printing_front' && e.source_kind === 'third_party_original' && e.exact_finish_verified === false && e.physical_edition_verified === false && e.vendor_licence_verified === false && e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false, 'Finite artwork decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { tcgcollector: 8 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width === 868 && original.height === 1212, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[object.mime_type]}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 32, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 8, variants: 8, names: 16, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 8 && cards.filter(card => card.finish_code === 'holo').length === 0, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen MC Basic Energy plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 36 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'ja' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && isDeepStrictEqual(approval.source_evidence, SOURCE_EVIDENCE), 'Exact eligible-subset approval changed');
  return approval;
}

export function requireFinalFreeze() {
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 8, 'Exact accepted MC Basic Energy archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 24, object_references: 32, unique_image_members: 32, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}

export const SOURCE_CODES = ['scrydex', 'pokellector', 'tcgcollector'];
export const SOURCE_FIELDS = ['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes', 'deprecated_at'];
export const SOURCE_CHECKPOINT_SHA = "9fed86a8de20b4229f20cd0a91b617cb8e44b7e83623fd2939a6ab068e1c9228";
export const EXISTING_SOURCE_ROW_HASHES = {
  "pokellector": "4a2a381f7146c0bfa0201c62e91e7682f18da6597c4743f23414f3606a942a71",
  "tcgcollector": "f1f01d1b094986ad0a9f5efcf1e98fe7388e0e1c5452d23da6cf7cab97a1ca29",
  "scrydex": "25af5b50521e6fd0942764536f62b0c53c3e72c69c874916241af47735407929"
};
const existingSourcePolicies = {
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
export const NEW_SOURCE_POLICY = {
  "code": "tcgcollector",
  "display_name": "TCGCollector (owner supplied Japanese card fronts)",
  "source_type": "image",
  "base_url": "https://www.tcgcollector.com",
  "licence_status": "under_review",
  "attribution_required": true,
  "active": false,
  "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
  "deprecated_at": null
};
export function validateSourcePlan(plan) {
  requireFinalPublicationFreeze(plan);
  check(plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA && isDeepStrictEqual(plan.existing_source_row_hashes, EXISTING_SOURCE_ROW_HASHES), 'Fresh full17 three-source checkpoint required');
  check(isDeepStrictEqual(plan.source_policies, existingSourcePolicies) && isDeepStrictEqual(plan.new_sources, { production: [], staging: [NEW_SOURCE_POLICY] }), 'No production source creation; only exact staging TCGCollector fixture allowed');
  check(canonicalHash(NEW_SOURCE_POLICY) === '207957571711627d17ab7e1ed0ef77f6635426ee9a5972d47d316e3fcba9bd1e', 'Initial finite3 TCGCollector policy must remain unchanged');
}
