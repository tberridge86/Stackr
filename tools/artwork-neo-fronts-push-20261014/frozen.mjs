import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '5501a15103bd50e314ca3a1e3ec17401296975527241eec1ae95122eeba722df';
export const APPROVAL_SHA = '78f675feaf750d88d54bdc268992242e137f99b573132935f3c4cb590a778fd4';
export const IDENTITY_TABLE_SHA = 'd8738121ecf5e422a642274d3ed6a01288f646e3b983075e1d9e68d2a9d523b1';
export const SAVED_TARGETS_SHA = '9d52f911d8f31d1ed395029c10df8f84bffa1fc6728daf327b18a41de8d73bc3';
export const SOURCE_MANIFEST_SHA = 'e7fe9b524d77b35c40dff09cd07eeeec12da07f14305d97553341da4cae8444f';
export const ARCHIVE_SHA = 'ee849164f5f744038105d95c3fbbfc9774068b2488e5f4678398a383bf5da5e9';
export const ARCHIVE_ID = 639568745;
export const ARCHIVE_BYTES = 21448691;
export const FRONTS = 25;
export const QUEUE_ID = 'STACKR-JP-NEO1-20261014-025';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = '769fa22e-e603-41a8-b62b-920a4abc660b';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Populated from the inspected manifest; provider IDs are not guessed from Dex numbers.
const knownPrintings = {
  "90ae09c7-61dd-425a-b794-6310e86e00cb": {
    "alias": "001",
    "provider": "neo1_ja-1",
    "variant_id": "408fdc0f-b9e8-41df-a7aa-949d74a7ac7d",
    "finish": "normal",
    "dex": "No.043",
    "printed_native_name": "ナゾノクサ",
    "current_native_label": "奇妙な"
  },
  "8a659a70-37ba-43cb-a316-7914f518f676": {
    "alias": "002",
    "provider": "neo1_ja-2",
    "variant_id": "86905a40-df36-4e45-a217-95524c8fd4e4",
    "finish": "normal",
    "dex": "No.152",
    "printed_native_name": "チコリータ",
    "current_native_label": "チコリータ"
  },
  "2285b30e-1aad-479b-b14f-83cd22675f45": {
    "alias": "003",
    "provider": "neo1_ja-3",
    "variant_id": "0f0e8dd3-7476-4182-95ad-8a64c1862b91",
    "finish": "normal",
    "dex": "No.165",
    "printed_native_name": "レディバ",
    "current_native_label": "レディバ"
  },
  "9a879c9f-c51e-4877-a0e0-48fa9fbc069b": {
    "alias": "004",
    "provider": "neo1_ja-4",
    "variant_id": "76778438-85ac-4bad-b677-5c3ec1e5b56f",
    "finish": "normal",
    "dex": "No.167",
    "printed_native_name": "イトマル",
    "current_native_label": "スパラク"
  },
  "8c320850-2ba6-4cc7-bab8-a1a62dba49b5": {
    "alias": "005",
    "provider": "neo1_ja-5",
    "variant_id": "0c7d697e-bdbb-49af-b839-a46440e5f113",
    "finish": "normal",
    "dex": "No.187",
    "printed_native_name": "ハネッコ",
    "current_native_label": "ホッピップ"
  },
  "fee413bc-9aed-48b1-a303-ca39323f8a42": {
    "alias": "006",
    "provider": "neo1_ja-6",
    "variant_id": "43c02b76-d1a9-4872-845f-8cd9e2c7e5b4",
    "finish": "normal",
    "dex": "No.191",
    "printed_native_name": "ヒマナッツ",
    "current_native_label": "サンカーン"
  },
  "58208168-50b4-4305-bc41-6786dde14647": {
    "alias": "007",
    "provider": "neo1_ja-7",
    "variant_id": "3ddb2bc9-621d-40b5-844e-f30701b13313",
    "finish": "normal",
    "dex": "No.213",
    "printed_native_name": "ツボツボ",
    "current_native_label": "シャックル"
  },
  "6bf8fbe8-6bf6-4afe-a078-9d42de535395": {
    "alias": "008",
    "provider": "neo1_ja-8",
    "variant_id": "74d0e9ef-41cc-4d0d-9b96-ca2ce503ed9e",
    "finish": "normal",
    "dex": "No.044",
    "printed_native_name": "クサイハナ",
    "current_native_label": "暗闇"
  },
  "59202a99-d920-44d4-b07c-fb10d11f1daa": {
    "alias": "009",
    "provider": "neo1_ja-9",
    "variant_id": "176ea776-6b5e-4879-8e27-b9b9c384b3be",
    "finish": "normal",
    "dex": "No.153",
    "printed_native_name": "ベイリーフ",
    "current_native_label": "Bayleef"
  },
  "6c6fe4fd-1857-4947-9fd5-fb7789a1f34d": {
    "alias": "010",
    "provider": "neo1_ja-10",
    "variant_id": "e5ee574e-605b-48fd-a899-c6e55fba2dae",
    "finish": "normal",
    "dex": "No.166",
    "printed_native_name": "レディアン",
    "current_native_label": "レディアン"
  },
  "19c99ff3-f19a-44c3-9297-633452e080a6": {
    "alias": "011",
    "provider": "neo1_ja-11",
    "variant_id": "45e41855-dd12-464d-b46b-f57cbadada32",
    "finish": "normal",
    "dex": "No.168",
    "printed_native_name": "アリアドス",
    "current_native_label": "アリアドス"
  },
  "1f03e4bc-b881-481f-a001-33a53d370f6e": {
    "alias": "012",
    "provider": "neo1_ja-12",
    "variant_id": "ff1a2c9c-0a8a-4a8b-90e9-e6089dffe0c3",
    "finish": "normal",
    "dex": "No.188",
    "printed_native_name": "ポポッコ",
    "current_native_label": "スキプルーム"
  },
  "1ee24ec6-3b56-4ca2-825e-69b851e0cdca": {
    "alias": "013",
    "provider": "neo1_ja-13",
    "variant_id": "c8592751-bd13-4caa-b5b7-454eec679f05",
    "finish": "normal",
    "dex": "No.192",
    "printed_native_name": "キマワリ",
    "current_native_label": "サンフロラ"
  },
  "ecad1bb6-feb8-46b6-b9b7-4d376aa44757": {
    "alias": "014",
    "provider": "neo1_ja-14",
    "variant_id": "018434dd-cfd6-4e1f-9cf9-96894ef5d91a",
    "finish": "holo",
    "dex": "No.154",
    "printed_native_name": "メガニウム",
    "current_native_label": "ミーガニウム"
  },
  "d36f9adb-2afa-4427-a54d-1db31d6d3601": {
    "alias": "015",
    "provider": "neo1_ja-15",
    "variant_id": "64d8b3d0-0828-40d2-b677-f85b4616dd80",
    "finish": "holo",
    "dex": "No.182",
    "printed_native_name": "キレイハナ",
    "current_native_label": "Bellossom"
  },
  "782a7508-0e11-4cf9-aaee-3b0279a065c1": {
    "alias": "016",
    "provider": "neo1_ja-16",
    "variant_id": "2955848f-d63a-468f-8200-38e194730a34",
    "finish": "holo",
    "dex": "No.189",
    "printed_native_name": "ワタッコ",
    "current_native_label": "ジャンプラフ"
  },
  "445afc32-37f1-4202-a76c-9656f30680f6": {
    "alias": "017",
    "provider": "neo1_ja-17",
    "variant_id": "42746cac-9d3b-4338-8827-aeda3b6e228c",
    "finish": "holo",
    "dex": "No.214",
    "printed_native_name": "ヘラクロス",
    "current_native_label": "ヘラクロス"
  },
  "da202189-2089-4e8b-beed-0ed8e5316ba0": {
    "alias": "018",
    "provider": "neo1_ja-18",
    "variant_id": "9c38ca12-0488-4979-af0f-59315943f593",
    "finish": "normal",
    "dex": "No.155",
    "printed_native_name": "ヒノアラシ",
    "current_native_label": "シンダキル"
  },
  "3f63a206-e033-4286-ac07-2d772ab502fd": {
    "alias": "019",
    "provider": "neo1_ja-19",
    "variant_id": "8f897b29-ff6e-4cc0-a061-dadf344b8bd9",
    "finish": "normal",
    "dex": "No.126",
    "printed_native_name": "ブーバー",
    "current_native_label": "マグマー"
  },
  "c46bc63e-a2e0-4fe1-a5d3-d2fded501238": {
    "alias": "020",
    "provider": "neo1_ja-20",
    "variant_id": "42debcb5-22e5-4308-96cf-94faea211a6f",
    "finish": "normal",
    "dex": "No.156",
    "printed_native_name": "マグマラシ",
    "current_native_label": "キラバ"
  },
  "ce0049e9-a3f1-4bf3-9fa6-ade1b29917f6": {
    "alias": "021",
    "provider": "neo1_ja-21",
    "variant_id": "9bc26723-2769-4fcb-98c4-347d5a9ff91d",
    "finish": "holo",
    "dex": "No.157",
    "printed_native_name": "バクフーン",
    "current_native_label": "染色"
  },
  "6ae6c878-f766-47f8-b459-56c3bac7c6ec": {
    "alias": "022",
    "provider": "neo1_ja-22",
    "variant_id": "ad520e57-5f19-4ea4-9add-a9841ac6b44c",
    "finish": "normal",
    "dex": "No.240",
    "printed_native_name": "ブビィ",
    "current_native_label": "マグビー"
  },
  "03c58fc0-02f1-4dda-90ee-312e0eac4eae": {
    "alias": "023",
    "provider": "neo1_ja-23",
    "variant_id": "c025ec4c-ecac-4d88-9cad-af358721e1eb",
    "finish": "normal",
    "dex": "No.116",
    "printed_native_name": "タッツー",
    "current_native_label": "馬"
  },
  "a6ef3fda-5cd0-4e49-95f4-cc3add0b4a35": {
    "alias": "024",
    "provider": "neo1_ja-24",
    "variant_id": "c1fd60a4-ed13-4216-bc9a-3e056bb9799e",
    "finish": "normal",
    "dex": "No.158",
    "printed_native_name": "ワニノコ",
    "current_native_label": "totodile"
  },
  "0b7bb0ee-32ee-4c5b-83e0-10e1ab18457d": {
    "alias": "025",
    "provider": "neo1_ja-25",
    "variant_id": "3723ba28-e835-4485-bc2f-0bf065d839dd",
    "finish": "normal",
    "dex": "No.183",
    "printed_native_name": "マリル",
    "current_native_label": "マリル"
  }
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id, 'Unknown or relabelled Neo printing');
  check(row.card_native_name === known.current_native_label, 'Current native label must be preserved');
  return known;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed batch identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved fixed batch size');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong exact identity table scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside saved fixed batch');
    const known = knownFor(row);
    check(row.printed_native_name === known.printed_native_name && row.printed_national_dex === known.dex, 'Printed Japanese identity changed');
  }
  return table;
}

function validateEvidence(row, expected, known) {
  const evidence = row.evidence;
  const printed = evidence.printed_identity;
  const pixels = evidence.pixel_identity;
  const body = evidence.source_body;
  check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source front evidence changed');
  check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256), 'Missing retained source metadata hash');
  check(printed.canonical_alias === known.alias && printed.printed_national_dex === known.dex && printed.verified_printed_native_name === known.printed_native_name && body.printed_dex_number === known.dex && body.printed_name === known.printed_native_name, 'Printed National Dex/name crosswalk changed');
  check(printed.canonical_alias_is_not_printed_national_dex === true && printed.current_native_label_not_used_for_match === true && printed.current_native_label === row.card_native_name, 'Catalogue alias cannot substitute for printed National Dex; current label remains separate');
  check(printed.known_native_label_defect_retained_without_write === (known.current_native_label !== known.printed_native_name), 'Known label defect must remain explicit');
  check(body.hp === evidence.source_signature.hp && evidence.source_signature.dex.length === 1 && known.dex === `No.${String(evidence.source_signature.dex[0]).padStart(3, '0')}` && body.rules_or_attack_text_visible === true && typeof body.artist === 'string' && body.artist.length > 0 && Array.isArray(body.attack_costs) && Array.isArray(body.attack_damage), 'Inspected Japanese body/signature evidence required');
  for (const field of ['whole_original_inspected', 'full_frame_visible', 'name_number_and_symbol_readable', 'fine_print_readable']) check(pixels[field] === true, `Readable whole original required: ${field}`);
  for (const field of ['copyright_or_date_line_visible', 'copyright_year_inferred', 'edition_stamp_visible', 'edition_or_distribution_certified', 'material_foil_finish_certified']) check(pixels[field] === false, `Unsupported copyright, edition or material claim: ${field}`);
  check(!Object.hasOwn(pixels, 'copyright_year') && !Object.hasOwn(body, 'copyright_year'), 'No visible copyright year; release date cannot be inferred');
  const limits = evidence.identity_limits;
  check(limits.printed_national_dex_is_not_catalogue_alias === true && limits.native_label_repair_proposal_retained_separately === (known.current_native_label !== known.printed_native_name) && limits.physical_edition_certified === false && limits.physical_finish_certified === false && limits.copyright_year_inferred === false, 'Identity limitations changed');
  const checks = evidence.identity_checks;
  check(checks.savedMetadataMatched === true && checks.currentProductionCardBindingMatched === true && checks.printedNationalDexOpticallyVerified === true && checks.canonicalAliasIsNotPrintedNationalDex === true && checks.physicalFinishVerified === false, 'Source/current identity checks changed');
  check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.physical_edition_verified === false, 'Unsupported physical finish, edition or vendor licence');
  const decision = evidence.owner_business_decision;
  check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Finite business decision scope changed');
  check(digest(Buffer.from(JSON.stringify(evidence))) === expected.evidence_sha256, 'Frozen inspected source evidence changed');
}

export function validateRows(plan, table) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }), 'Source counts changed');
  check(isDeepStrictEqual(plan.delivery_scope, { fixed_batch_id: 'JP-CARDS-003', eligible_fronts: FRONTS, whole_batch_completion_asserted: false }), 'Fixed batch delivery scope changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate identity table entry');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen source identity changed');
    check(row.language_code === 'ja' && row.source_code === 'scrydex' && row.set_code === 'neo1' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.batch_id === 'JP-CARDS-003', 'Only exact Japanese Neo1 batch supported');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid canonical identity');
    check(uuid.test(row.variant_ids[0]) && row.image_url === `https://images.scrydex.com/pokemon/${known.provider}/large`, 'Invalid variant or observed image URL');
    validateEvidence(row, expected, known);
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Incomplete original and derivatives');
    const original = row.objects[0];
    check(original.sha256 === expected.original_sha256 && original.width === expected.original_width && original.height === expected.original_height, 'Per-printing original changed');
    check(original.width >= 360 && original.height >= 504, 'Source below minimum readable detail quality');
    check(original.width <= 570 && original.height <= 800, 'This batch has no verified HD originals');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0, 'Invalid bounded object evidence');
      const extension = object.role === 'original' ? 'png' : 'webp';
      check(object.mime_type === `image/${extension}` && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path or MIME changed');
      check(object.width <= original.width && object.height <= original.height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS, 'Duplicate variant or original printing identity');
  check(indexObjects(rows).size === 100, 'Exact unique image member count changed');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === FRONTS && new Set(bindings.map(card => card.variant_id)).size === FRONTS, 'Wrong binding cohort');
    for (const row of rows) {
      const found = bindings.filter(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(found.length === 1 && found[0].variant_id === row.variant_ids[0], 'Singleton variant binding changed');
      const card = found[0];
      check(card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish, 'Current supported metadata finish changed');
      for (const field of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Frozen binding changed: ${field}`);
      check(card.catalogue_version_id === (environment === 'staging' ? STAGE_JA : PRODUCTION_JA), 'Wrong environment-specific Japanese version');
    }
    check(bindings.filter(card => card.finish_code === 'normal').length === 20 && bindings.filter(card => card.finish_code === 'holo').length === 5, 'Twenty normal/five holo metadata scope changed');
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 1 }), 'Snapshot scope counts changed');
  }
  for (const production of plan.binding_expectations.production) {
    const staging = plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id);
    check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, staging), 'Only staging version may differ');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Neo plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Wrong exact queue/source identity');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 104, 'Frozen archive changed');
  check(isDeepStrictEqual(plan.archive_metadata.map(metadata => metadata.file), METADATA_FILES) && plan.archive_metadata.every(metadata => /^[a-f0-9]{64}$/u.test(metadata.sha256) && metadata.byte_size > 0 && metadata.byte_size < 12000000), 'Frozen metadata members changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'ja' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && approval.owner_instructions.length === 3 && approval.approved_at === '2026-10-14', 'Wrong finite business decision');
  return approval;
}

export async function loadFrozen() {
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: 75, object_references: 100, unique_image_members: 100, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
