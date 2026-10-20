import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '07903745aea2a61fc30d18136f8d3404a01dc20a7ab310b42e27ee2374c047c9';
export const APPROVAL_SHA = 'c31e28f581907891b188f910cc7933742b87a24dd3b330c379c21333bf3b333f';
export const IDENTITY_TABLE_SHA = '991ba4b11e764d4ca3e9e1ca4093122a5b3a2fdbe077285e0cfe3c349c3d3a45';
export const SAVED_TARGETS_SHA = '83a2e04c671fbcce0ea51a30fa7a7a5e3d98357ec30095a301d701dd05e0761b';
export const SOURCE_MANIFEST_SHA = 'c62f57cfdf8b44aa86b7db48be7c17e7008e79ef8c52397a43d3e697d944d802';
export const ARCHIVE_SHA = '63c693d21095a4c0fd474ce8acc3a825451f6ece6073ff3c7c4d3df20fa059a2';
export const ARCHIVE_ID = 644553288;
export const ARCHIVE_BYTES = 842814;
export const FRONTS = 1;
export const QUEUE_ID = "STACKR-JA-NEO1-SLOWPOKE-FRONT-20261015-001";
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "f181911b78adce2be7ba3f8864b775d0b265cff03d43860fc3d349abe3ea0c77",
  "finiteDecision": "97d080446d7e9d8253a212329c12d136e541bd29efd7bf48b78dea4439392261",
  "independentSelection": "a104f67443f401fd42aa5e904b87f3d197141095a1e3a1a9d9c232a461dc415d",
  "independentPrivateReview": "a02ff63fb0caf56f1a9baa096872681332f25e5e1363b31ef6ed843df776d231",
  "sourcePolicyCheckpoint": "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "494725ee-70bf-41d3-a6b7-2a7bb6180287": {
    "alias": "045",
    "batch_id": "JP-CARDS-004",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c440501050afdccbc520cba0c0b5057137d71948aac242a0558d5896d9c137cb",
    "image_url": "https://den-cards.pokellector.com/324/Slowpoke.NEO1.45.38564.png",
    "variant_id": "72c0e00c-e174-4ecd-a672-2864a586af82",
    "finish": "normal",
    "current_native_label": "slowpoke",
    "original_sha256": "2d1170c7cac4753e519f9fe69c5179aee284f2d01be5c12f4d49af1a44e498eb",
    "original_mime": "image/png",
    "body_sha256": "5fbaf91ab72801e60622fa40fcbfec346a703c8c1609ae4e5d47975ef83ab75a",
    "width": 570,
    "height": 797
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-004"
  ],
  "saved_batch_tasks": 1,
  "eligible_fronts": 1,
  "by_batch": {
    "JP-CARDS-004": {
      "verified": 1,
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
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Neo1 Slowpoke printing');
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
  check(isDeepStrictEqual(plan.source_counts, { pokellector: 1 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[object.mime_type]}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 4, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 1, variants: 1, names: 2, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 1 && cards.filter(card => card.finish_code === 'holo').length === 0, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Neo1 Slowpoke plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 8 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 1, 'Exact accepted Neo1 Slowpoke archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 3, object_references: 4, unique_image_members: 4, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}

export const SOURCE_CODES = ['scrydex', 'pokellector'];
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
const stagingSourceFixtures = [
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
  }
];
export function validateSourcePlan(plan) {
  check(SOURCE_CHECKPOINT_SHA && plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA, 'Fresh postLegacy8 V2 full-source checkpoint required');
  check(isDeepStrictEqual(plan.source_policies, existingSourcePolicies) && isDeepStrictEqual(plan.new_sources, { production: [], staging: stagingSourceFixtures }), 'No new production source or existing policy change permitted');
  for (const source of [...plan.source_policies.production, ...plan.new_sources.staging]) check(SOURCE_CODES.includes(source.code) && source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null, 'Unknown/active/sourcewide provenance rejected');
}
