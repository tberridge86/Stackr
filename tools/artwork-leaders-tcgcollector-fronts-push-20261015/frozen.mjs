import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = 'bbc2786b263b482444d8a2581d5fdf09bb75ee0e37c095906daef0ed8b4f1e74';
export const APPROVAL_SHA = 'bd892f96a5a9a1f64785180c818b1c89b114b7047c52401cbe32cb8e8e0cd9e2';
export const IDENTITY_TABLE_SHA = 'b739e77c3d211a69e6da9ae11f92c23eef0ef8abccc807c2bfca6014e4efc67a';
export const SAVED_TARGETS_SHA = '702d5311eefad4a7faa629239de068a95a2039370197c3a7e17ac5aeb4e0de09';
export const SOURCE_MANIFEST_SHA = '2efae5c0d1c682aae68e058c1eac75802e5b02c2255027c2554868f6c634a3a5';
export const ARCHIVE_SHA = '8657585abf4e519b9912ded25b020f53f68427c4ca32374e1fa37bdb789ae00c';
export const ARCHIVE_ID = 644968141;
export const ARCHIVE_BYTES = 529425;
export const FRONTS = 3;
export const QUEUE_ID = "STACKR-JA-LEADERS-STADIUM-TCGCOLLECTOR-FRONTS-20261015-003";
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "96631c9294588374bf8c7fa58d29861fe4704fa68854cb9b7ba6fb7b3743c7ca",
  "finiteDecision": "68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff",
  "independentSelection": "eb873e66e2492671b9b0df09c6059b84457850bac1ef63f671832c24a6e1306e",
  "independentReview": "6a1a35be6d9c9e5c8d2bbaf68c5e24293b555b7e1b7ac72e8b3e07fb7cecf3ab",
  "sourceDesign": "898276b53dc4ee4cc29ac680d824a542bc41e2b442363889362d454cea748828",
  "sourcePolicyCheckpoint": "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9",
  "ownerPermissionAttestation": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "f732147f-deef-4c65-a092-4ed2e7bbfcad": {
    "alias": "019",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:d469579f51d639ea2d9c0f378f99d73c42c84f0cdb02f23fbce49a9c68de014f",
    "image_url": "https://static.tcgcollector.com/content/images/e0/57/44/e05744a819e0fca3d78fc10a3c1d20990b42a2f1b23e9398701ea2431805c6a7.jpg",
    "variant_id": "41b979bb-0d07-4b9e-bf3f-04de506c2831",
    "finish": "holo",
    "current_native_label": "タケシのキュウコン",
    "original_sha256": "cd305a07dd316800bc7a3bb17951c7e28245c7197c22ad182198b090c115ca9b",
    "original_mime": "image/jpeg",
    "body_sha256": "28ad1b54ac3ca95fc993bf4f1b1b175727f14043d5ffa536871d98438334d65c",
    "width": 593,
    "height": 834
  },
  "58053385-0e6d-45a1-b7aa-ba11abe75091": {
    "alias": "081",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:960013b61e95f821151e7a04b8fc5b7c801f0597cb35897484bb609ad088ad31",
    "image_url": "https://static.tcgcollector.com/content/images/97/bf/86/97bf86b62623d5298b6cfd18e975a71a06a764363ceaf86eafaa031dd9a5db76.jpg",
    "variant_id": "4a752b13-fdf9-4b5a-a94b-8964e50a2ad3",
    "finish": "normal",
    "current_native_label": "マチスの交渉",
    "original_sha256": "627fe0e7530b61a0fd9ef4cb53f7ec0e626034a94d8ce9fff04ed355178768b9",
    "original_mime": "image/jpeg",
    "body_sha256": "ff903877289a40796615cb83f7a270c80e85c349a804b465ed40bb17295c7534",
    "width": 593,
    "height": 834
  },
  "99246359-6f35-43db-9f85-2ccca99bceec": {
    "alias": "096",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "tcgcollector",
    "provider": "tcgcollector-image-url-sha256:128798334e1a9e0f90343f143af152e493cc1948ff9af07703149d20aa1b4244",
    "image_url": "https://static.tcgcollector.com/content/images/9c/ce/0d/9cce0deba604504d64afd62a6e58db4f2d429acb5194b67e37826bbee3cc9617.jpg",
    "variant_id": "96320f61-2e8c-4145-8fbc-7c5f43eeba5c",
    "finish": "holo",
    "current_native_label": "ロケット団のワナ",
    "original_sha256": "6f6becbb06a1af7c1f9627685581ba470da630a10f096f0c855a5e04ad534d54",
    "original_mime": "image/jpeg",
    "body_sha256": "f9f0608a61bc6a72a2b437a445d36f7ca54a9f14e0eb525f796d1a55e372a8b5",
    "width": 593,
    "height": 834
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-058",
    "JP-CARDS-061"
  ],
  "saved_batch_tasks": 3,
  "eligible_fronts": 3,
  "by_batch": {
    "JP-CARDS-058": {
      "verified": 1,
      "held": 0
    },
    "JP-CARDS-061": {
      "verified": 2,
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
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Leaders Stadium TCGCollector printing');
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
  check(isDeepStrictEqual(plan.source_counts, { tcgcollector: 3 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width === 593 && original.height === 834, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[object.mime_type]}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 12, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 3, variants: 3, names: 6, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 1 && cards.filter(card => card.finish_code === 'holo').length === 2, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Leaders Stadium TCGCollector plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 16 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 3, 'Exact accepted Leaders Stadium TCGCollector archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 9, object_references: 12, unique_image_members: 12, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}

export const SOURCE_CODES = ['scrydex', 'pokellector', 'tcgcollector'];
export const SOURCE_FIELDS = ['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes', 'deprecated_at'];
export const SOURCE_CHECKPOINT_SHA = "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9";
export const EXISTING_SOURCE_ROW_HASHES = {
  "pokellector": "4a2a381f7146c0bfa0201c62e91e7682f18da6597c4743f23414f3606a942a71",
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
  check(SOURCE_CHECKPOINT_SHA && plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA, 'Fresh full-source checkpoint required');
  check(isDeepStrictEqual(plan.source_policies, existingSourcePolicies) && isDeepStrictEqual(plan.new_sources, { production: [NEW_SOURCE_POLICY], staging: [NEW_SOURCE_POLICY] }), 'Exact one inactive TCGCollector creation policy required');
  check(NEW_SOURCE_POLICY.code === 'tcgcollector' && NEW_SOURCE_POLICY.source_type === 'image' && NEW_SOURCE_POLICY.active === false && NEW_SOURCE_POLICY.licence_status === 'under_review' && NEW_SOURCE_POLICY.attribution_required === true && NEW_SOURCE_POLICY.deprecated_at === null, 'Inactive image provenance required');
  check(NEW_SOURCE_POLICY.internal_notes.endsWith(' Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.'), 'Exact finite source decision notes required');
}
