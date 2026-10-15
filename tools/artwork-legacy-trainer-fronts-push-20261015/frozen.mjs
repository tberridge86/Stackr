import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = 'caab1bc58bc7f0f5862c88e8e82739ac28e85a108ffd57d2d21c7e55bb945257';
export const APPROVAL_SHA = '392ab5c4a6c00b2f9e2cb3e615db85e7d18162cbf0b3441ffd8bf29b0a2a5817';
export const IDENTITY_TABLE_SHA = '892f45ca7486b6bd908a5c3757644487580f47b1d86f1b48581b8696f6ea7c3a';
export const SAVED_TARGETS_SHA = '8cbfdbcad0ba05e937dc2168b14595073bdabf54430c6b8f18152d3a0bc5c311';
export const SOURCE_MANIFEST_SHA = '5933b6aea282326cb6dd25421499ccea72d3204d22f2626b761b98f71f928dc2';
export const ARCHIVE_SHA = 'eef7d4300f3c756081e18fda0a303971d59439c2f7f73f5b77613e2728808d14';
export const ARCHIVE_ID = 644243819;
export const ARCHIVE_BYTES = 3023054;
export const FRONTS = 8;
export const QUEUE_ID = 'STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "52fcc73b1a34aba96faf863a1a78251bf4e84406dcce01df118975d499bcfd17",
  "finiteDecisionV2": "b0ef2b3ba98cb9cdf44c7d82fc97529b6832e04a8975b87a6a7c1b278cffc8f0",
  "currentScope": "22451ac1a157a4cd661893ce35875305405f6312da0bb0b64983f5ea7a30b175",
  "proposedSourcePolicy": "eaf14987ed8e38ded85fc868db2da07aaa3d8f828d401bc8045136e77fbb4e73",
  "ownerPermission": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d",
  "productionBefore": "4da03fcfd3d5ac1367e11f0ccbf560c8d2752184f4f4f5a5d612bb1b1b55f2de",
  "stagingBefore": "817ef8c74e89508b3b30e32c2e5c4ffbf9fca7f7c87daa93bda82276612d527b",
  "productionBindings": "14f559ac0e1e1c914ca50c2998958655678b2bfc544f82334ea2bd1268bb619f",
  "stagingBindings": "efa3615cccf30e4e56ede2791b246eb63ddba7086cb8171d4b14049b176a19a3",
  "neo1-trainer3-independent-source-selection-20261015.json": "b7fccfaa7df76c5a8402c5ed43601667c0db239f8447b6559e0468ab14874ddb",
  "neo1-trainer3-independent-review-20261015.json": "306ec71b1197caac25ff1a88e68ec8560ad6caeee656a0e9c2b99f5c8c70f0db",
  "neo2-trainer5-independent-source-selection-20261015.json": "9419b9bb8040086befd94d732678e09ce3a0efb443b7e723b59a1a0744d7fe43",
  "neo2-trainer5-independent-review-20261015.json": "1ad94dd15b4560668c74407c92db3f6a6ffecb8d5c723e9413a5d80a3f50ca48"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "03b21683-af68-4f9a-bbbd-647dec3d5b81": {
    "alias": "053",
    "batch_id": "JP-CARDS-009",
    "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
    "set_code": "neo2",
    "source_code": "scrydex",
    "provider": "neo2_ja-53",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-53/large",
    "variant_id": "e0b949b2-2bc9-4aca-bdec-f1584ec3f011",
    "finish": "normal",
    "current_native_label": "エネルギーアーク",
    "original_sha256": "19feecd0a5d0653c7c5656865600300f37d26470f872e89116206e539282e18d",
    "original_mime": "image/webp",
    "body_sha256": "e2177e7cae8644f88df25fa0137e129628800973d566ec82f418b0258891f48f",
    "width": 565,
    "height": 800
  },
  "9815742c-ab9c-47d5-a05e-8fa67d755b43": {
    "alias": "054",
    "batch_id": "JP-CARDS-009",
    "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
    "set_code": "neo2",
    "source_code": "pokellector",
    "provider": "39645",
    "image_url": "https://den-cards.pokellector.com/331/Ruin-Wall-KabutoRuin-Wall-Aerodactyl.NEO2.54.39645.png",
    "variant_id": "e9c77163-1fa9-417f-ac99-caa57cce0533",
    "finish": "normal",
    "current_native_label": "壁を台無しにする[カブト]",
    "original_sha256": "d5561d776619b453097fb25d53135c3d7ae4cece93c6abe8e0875b555e1e6a88",
    "original_mime": "image/webp",
    "body_sha256": "eb8292ff6adf3f7578c24f93549a91ba877e5fc50c00d273e36c0d703ef64f73",
    "width": 570,
    "height": 794
  },
  "be1af7b3-7199-445e-89e3-2ad26f93ffc7": {
    "alias": "055",
    "batch_id": "JP-CARDS-009",
    "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
    "set_code": "neo2",
    "source_code": "scrydex",
    "provider": "neo2_ja-55",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-55/large",
    "variant_id": "33605fc7-7329-4191-ab47-25a8b8dfedc4",
    "finish": "normal",
    "current_native_label": "化石卵",
    "original_sha256": "093954beed912a12f4bbc2bd63601fa27123f780fa65321a032f4fe9207e9a47",
    "original_mime": "image/webp",
    "body_sha256": "9d47714d64cd4d934862ce34883a2d420f194f2f547caf2263393a6fe2260bdf",
    "width": 567,
    "height": 800
  },
  "34a5728e-9e47-453f-8102-84259c8cdaf2": {
    "alias": "056",
    "batch_id": "JP-CARDS-009",
    "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
    "set_code": "neo2",
    "source_code": "scrydex",
    "provider": "neo2_ja-56",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-56/large",
    "variant_id": "9de3a61b-28c7-4cfa-8167-2ee54b2f62e4",
    "finish": "normal",
    "current_native_label": "ハイパーデボルブスプレー",
    "original_sha256": "3def2fa5637f88174f9e82193707a3f247595d1336b3330c30669781f830730c",
    "original_mime": "image/webp",
    "body_sha256": "617e150a6efb28e25a04372efe50578b07bb329ba55dc30b715635fca2fc298e",
    "width": 570,
    "height": 794
  },
  "4ec6bdf6-3a65-4dd6-a3d7-84ea96cb77d6": {
    "alias": "057",
    "batch_id": "JP-CARDS-009",
    "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
    "set_code": "neo2",
    "source_code": "pokellector",
    "provider": "39648",
    "image_url": "https://den-cards.pokellector.com/331/Ruin-Wall-Kabuto.NEO2.54.39648.mobile.jpg",
    "variant_id": "a4b5fd43-f9f0-494f-8fc8-e1dcc7398386",
    "finish": "normal",
    "current_native_label": "壁を台無しにする[aerodactyl]",
    "original_sha256": "f00804e6b093b5d9028cb1f5692d939195d41cbb6a5bdcef1fe5d3bfed9d43c4",
    "original_mime": "image/jpeg",
    "body_sha256": "29d702d91c3cdf79d474b2d97aa4a508cb5938904760ced223dd3ea0d1349479",
    "width": 570,
    "height": 799
  },
  "60c39900-94fe-420b-b997-60e9c64f3491": {
    "alias": "073",
    "batch_id": "JP-CARDS-005",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-73",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-73/large",
    "variant_id": "c21bd7f6-d7e6-487c-ac76-00a7d218d95c",
    "finish": "normal",
    "current_native_label": "ベリー",
    "original_sha256": "31d49627ce76df792c54f2108b5a0faec45a7ffa1fbeba77b933c19f3458f079",
    "original_mime": "image/webp",
    "body_sha256": "6c2f27b41cfe52889fd8efad5ac74bee36b59829fa408cae7abf90108f127cae",
    "width": 570,
    "height": 794
  },
  "56ae4a00-656c-4564-8d7a-831db2900857": {
    "alias": "074",
    "batch_id": "JP-CARDS-005",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-74",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-74/large",
    "variant_id": "0d21bd9d-f70f-4671-898f-278daad9cda2",
    "finish": "normal",
    "current_native_label": "スーパーロッド",
    "original_sha256": "b767880240a4bfb59ebdbb852f4856a340f4bcc272191ab5abd20a611c9af9f7",
    "original_mime": "image/webp",
    "body_sha256": "5705d19277b12db79cc7c2d84462e4d33248966d073cab40aa4bc3c6ea57009c",
    "width": 569,
    "height": 800
  },
  "331a9eb6-75c4-47f1-97c8-ad2c55884ba3": {
    "alias": "075",
    "batch_id": "JP-CARDS-005",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-75",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-75/large",
    "variant_id": "8f29d59d-9dbf-4058-a9b1-17797791530f",
    "finish": "normal",
    "current_native_label": "二重突風",
    "original_sha256": "3fbf00ecdf7a6682fa29e2fe76cd705cec4cc3920977fb08f7c75f7d1a30a39c",
    "original_mime": "image/webp",
    "body_sha256": "7db14e194c1a1cf843a818fca6118546ae3d8246055e4a2d4bdd39ec7bb90993",
    "width": 570,
    "height": 799
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-005",
    "JP-CARDS-009"
  ],
  "saved_batch_tasks": 8,
  "eligible_fronts": 8,
  "by_batch": {
    "JP-CARDS-005": {
      "verified": 3,
      "held": 0
    },
    "JP-CARDS-009": {
      "verified": 5,
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
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Legacy Trainer printing');
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
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 6, pokellector: 2 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${object.mime_type === 'image/jpeg' ? 'jpg' : 'webp'}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 32, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 8, variants: 8, names: 16, sets: 2 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.every(card => card.finish_code === 'normal'), 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Legacy Trainer plan changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 8, 'Exact accepted Legacy Trainer archive and final freeze required');
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

export const SOURCE_CODES = ['scrydex', 'pokellector'];
export const SOURCE_FIELDS = ["code", "display_name", "source_type", "base_url", "licence_status", "attribution_required", "active", "internal_notes", "deprecated_at"];
export const EXISTING_SOURCE_ROW_SHA = "25af5b50521e6fd0942764536f62b0c53c3e72c69c874916241af47735407929";
const existingSourcePolicy = {
  "code": "scrydex",
  "display_name": "Scrydex",
  "source_type": "image",
  "base_url": "https://scrydex.com",
  "licence_status": "under_review",
  "attribution_required": true,
  "active": false,
  "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
  "deprecated_at": null
};
const newSourcePolicy = {
  "code": "pokellector",
  "display_name": "Pokellector (owner supplied Japanese card fronts)",
  "source_type": "image",
  "base_url": "https://jp.pokellector.com",
  "licence_status": "under_review",
  "attribution_required": true,
  "active": false,
  "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
  "deprecated_at": null
};
export function validateSourcePlan(plan) {
  check(isDeepStrictEqual(plan.source_policies, { production: [existingSourcePolicy], staging: [] }) && isDeepStrictEqual(plan.new_sources, { production: [newSourcePolicy], staging: [existingSourcePolicy, newSourcePolicy] }), 'Finite inactive two-source policy changed');
  for (const source of [...plan.source_policies.production, ...plan.new_sources.staging]) check(SOURCE_CODES.includes(source.code) && source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null, 'Unknown, active or unapproved provenance');
}
