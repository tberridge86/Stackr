import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '0cb244197cfc59ceba856594a4c0de50ce5a1a1dd2177d3996843fa621be765e';
export const APPROVAL_SHA = 'f506dddd9cf547f63c1cd31677dc6a9ad6d6d59d2d71c5f8b49b4fff5706e27d';
export const IDENTITY_TABLE_SHA = '3415ab53334b6e572a4ae60e3d38cb2c44f3d847b21b7e1674e08ccfaa92ea8b';
export const SAVED_TARGETS_SHA = 'fd226e22b0b8498114b7fc8cd84cd46b7386d82ba648fc9e1f378cdcc8f51be9';
export const SOURCE_MANIFEST_SHA = 'a39231f161e14967e556e9004b3bc7f9a2924ac6e39f1b01970da79e47049345';
export const ARCHIVE_SHA = '9918ceb7090bed46f9c9583468f9ddf016a6de2199a9a2719ed9b6b862283fc4';
export const ARCHIVE_ID = 641256222;
export const ARCHIVE_BYTES = 20461026;
export const FRONTS = 24;
export const QUEUE_ID = 'STACKR-JP-NEO1-20261014-024';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = '769fa22e-e603-41a8-b62b-920a4abc660b';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Populated from the inspected manifest; provider IDs are not guessed from Dex numbers.
const knownPrintings = {
  "230c774d-4c7a-46dc-95dc-1dbf227aa97a": {
    "alias": "026",
    "provider": "neo1_ja-26",
    "variant_id": "efa3e7dd-d4d8-43d3-926c-7dd5145d11a4",
    "finish": "normal",
    "dex": "No.194",
    "printed_native_name": "ウパー",
    "current_native_label": "ウーパー"
  },
  "17982c8c-f3fe-42d4-a363-4fd7c4daf370": {
    "alias": "027",
    "provider": "neo1_ja-27",
    "variant_id": "43e8251d-1330-41bf-96ba-f6f77c3751fd",
    "finish": "normal",
    "dex": "No.220",
    "printed_native_name": "ウリムー",
    "current_native_label": "swinub"
  },
  "a46d63d4-a792-48cc-9ca7-1e1853553ba6": {
    "alias": "028",
    "provider": "neo1_ja-28",
    "variant_id": "36c313c9-4eaf-40c9-91c8-da453346a1d4",
    "finish": "normal",
    "dex": "No.226",
    "printed_native_name": "マンタイン",
    "current_native_label": "マンティン"
  },
  "d67e5b17-e653-4969-8f1e-c609130834ae": {
    "alias": "029",
    "provider": "neo1_ja-29",
    "variant_id": "60736520-06a9-47ed-a5c1-088f101562cc",
    "finish": "normal",
    "dex": "No.117",
    "printed_native_name": "シードラ",
    "current_native_label": "シードラ"
  },
  "da798c7c-dbb3-4622-9f65-5801a8d98370": {
    "alias": "030",
    "provider": "neo1_ja-30",
    "variant_id": "fc7c3882-aa1c-4992-bf08-620b15033ff8",
    "finish": "normal",
    "dex": "No.159",
    "printed_native_name": "アリゲイツ",
    "current_native_label": "クロコノー"
  },
  "06193c75-1091-42df-b759-74919a754ff3": {
    "alias": "031",
    "provider": "neo1_ja-31",
    "variant_id": "3bc908b8-dd19-4e5c-ad00-d41944253d5e",
    "finish": "normal",
    "dex": "No.195",
    "printed_native_name": "ヌオー",
    "current_native_label": "quagsire"
  },
  "0e89b987-0853-43db-9063-1411965138bd": {
    "alias": "032",
    "provider": "neo1_ja-32",
    "variant_id": "ecc0a1b2-e7c1-45d3-9d79-722a9917d57f",
    "finish": "normal",
    "dex": "No.221",
    "printed_native_name": "イノムー",
    "current_native_label": "ピロスワイン"
  },
  "ff82db98-30a8-4b05-9ea2-c6d60f1a5a10": {
    "alias": "033",
    "provider": "neo1_ja-33",
    "variant_id": "04072ea2-9dae-4087-8984-051970a46b2c",
    "finish": "holo",
    "dex": "No.160",
    "printed_native_name": "オーダイル",
    "current_native_label": "feraligatr"
  },
  "1ac901c2-f3e1-44ef-8847-cf5a010d05da": {
    "alias": "034",
    "provider": "neo1_ja-34",
    "variant_id": "66c0e295-1531-4d42-a1ae-5cb2d33b3de5",
    "finish": "holo",
    "dex": "No.184",
    "printed_native_name": "マリルリ",
    "current_native_label": "アズマリル"
  },
  "cbd2d3d0-b97a-4180-815f-73fd727c0ad9": {
    "alias": "035",
    "provider": "neo1_ja-35",
    "variant_id": "aa7fa9f6-706f-42b0-9d72-758f6b9327a4",
    "finish": "holo",
    "dex": "No.230",
    "printed_native_name": "キングドラ",
    "current_native_label": "キングドラ"
  },
  "78846023-e099-4f64-b256-91bdbdb5286c": {
    "alias": "036",
    "provider": "neo1_ja-36",
    "variant_id": "1237e4de-387e-48a0-8438-3112ec693d51",
    "finish": "normal",
    "dex": "No.025",
    "printed_native_name": "ピカチュウ",
    "current_native_label": "ピカチュウ"
  },
  "70f7b66f-3e0a-4212-8921-4a332ec95715": {
    "alias": "037",
    "provider": "neo1_ja-37",
    "variant_id": "d3a7c6f8-7c7c-42b2-8604-229b0910c67d",
    "finish": "normal",
    "dex": "No.170",
    "printed_native_name": "チョンチー",
    "current_native_label": "チンチョウ"
  },
  "febc8290-78f1-4cbe-a5bc-218fc0fb0830": {
    "alias": "038",
    "provider": "neo1_ja-38",
    "variant_id": "b4c99ca7-04f4-4a9e-96a0-aa7aee1eae56",
    "finish": "normal",
    "dex": "No.179",
    "printed_native_name": "メリープ",
    "current_native_label": "Mareep"
  },
  "c8e5b811-c676-4fbe-8d5d-1b0e4c74697a": {
    "alias": "039",
    "provider": "neo1_ja-39",
    "variant_id": "9d6a430c-c661-438e-a244-3813eac8b9d9",
    "finish": "normal",
    "dex": "No.125",
    "printed_native_name": "エレブー",
    "current_native_label": "Electabuzz"
  },
  "18f5deb2-2199-4cb0-bb8a-96686e4967c4": {
    "alias": "040",
    "provider": "neo1_ja-40",
    "variant_id": "ccd9244b-3e25-4647-877f-80ea62ee7714",
    "finish": "normal",
    "dex": "No.171",
    "printed_native_name": "ランターン",
    "current_native_label": "ラントン"
  },
  "eff798f3-dfdf-4de0-a85e-72d9c8f39952": {
    "alias": "041",
    "provider": "neo1_ja-41",
    "variant_id": "99478c48-648f-41c0-9c16-06808425c851",
    "finish": "normal",
    "dex": "No.180",
    "printed_native_name": "モココ",
    "current_native_label": "フラフィー"
  },
  "300c5db4-c31b-4166-a7d5-9a91e3fd6db8": {
    "alias": "042",
    "provider": "neo1_ja-42",
    "variant_id": "4b1b8105-ca71-4e8e-9a7e-e11bd76ce904",
    "finish": "holo",
    "dex": "No.172",
    "printed_native_name": "ピチュー",
    "current_native_label": "ピチュ"
  },
  "c4a56912-dcc2-46da-92f5-8aa2082cc9c3": {
    "alias": "043",
    "provider": "neo1_ja-43",
    "variant_id": "25984233-9d8b-4d1d-bb11-1f5b101ebadf",
    "finish": "holo",
    "dex": "No.181",
    "printed_native_name": "デンリュウ",
    "current_native_label": "アンファロス"
  },
  "c3b57590-535a-473f-aa8d-6cbc8b2fd9ae": {
    "alias": "044",
    "provider": "neo1_ja-44",
    "variant_id": "7e1836ad-62ed-4fed-84da-777d5bba2a43",
    "finish": "normal",
    "dex": "No.239",
    "printed_native_name": "エレキッド",
    "current_native_label": "Elekid"
  },
  "cc80010d-960f-4028-b29a-f753c07585aa": {
    "alias": "046",
    "provider": "neo1_ja-46",
    "variant_id": "f13e2bbc-6966-4c9e-9b07-12dadfd74a89",
    "finish": "normal",
    "dex": "No.177",
    "printed_native_name": "ネイティ",
    "current_native_label": "natu"
  },
  "2d2065ec-7bd8-4c2d-8f7d-746dbf6d58e2": {
    "alias": "047",
    "provider": "neo1_ja-47",
    "variant_id": "12ec9765-c708-4b9f-85d6-7bb08db12d2f",
    "finish": "normal",
    "dex": "No.203",
    "printed_native_name": "キリンリキ",
    "current_native_label": "Girafarig"
  },
  "9162af6a-38e9-4e48-9588-2f75cf412fc7": {
    "alias": "048",
    "provider": "neo1_ja-48",
    "variant_id": "187b4560-4bc3-4513-8648-ba4a3275231c",
    "finish": "normal",
    "dex": "No.178",
    "printed_native_name": "ネイティオ",
    "current_native_label": "xatu"
  },
  "b533c32b-4322-4681-ab61-a83f5881b9fe": {
    "alias": "049",
    "provider": "neo1_ja-49",
    "variant_id": "e3e3cc48-1e0c-4cb3-89f9-e3c0ad34f036",
    "finish": "holo",
    "dex": "No.199",
    "printed_native_name": "ヤドキング",
    "current_native_label": "スローキング"
  },
  "fd4178cd-5b1b-4c2e-90da-e54431d2eae0": {
    "alias": "050",
    "provider": "neo1_ja-50",
    "variant_id": "4c92991a-c0f8-4193-b92e-5882d2719266",
    "finish": "normal",
    "dex": "No.095",
    "printed_native_name": "イワーク",
    "current_native_label": "onix"
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
  const support = body.source_variant_support;
  const providerFinish = known.finish === 'normal' ? 'normal' : 'holofoil';
  check(support.currentFinish === known.finish && support.providerVariant === providerFinish && isDeepStrictEqual(support.sourceNames, [providerFinish]) && support.metadataLabelSupported === true && support.physicalProof === false, 'Retained source variant label evidence changed');
  check(body.neo_expansion_symbol_observed === true && typeof body.rarity_mark === 'string' && body.rarity_mark.length > 0 && Array.isArray(body.metadata_attacks) && body.metadata_attacks.length === body.attack_costs.length && body.attack_damage.length === body.attack_costs.length && Array.isArray(body.provider_metadata_discrepancies), 'Retained body/cost/damage witnesses required');
  for (const field of ['whole_original_inspected', 'full_frame_visible', 'name_number_and_symbol_readable', 'fine_print_readable']) check(pixels[field] === true, `Readable whole original required: ${field}`);
  for (const field of ['copyright_or_date_line_visible', 'copyright_year_inferred', 'edition_stamp_visible', 'edition_or_distribution_certified', 'material_foil_finish_certified']) check(pixels[field] === false, `Unsupported copyright, edition or material claim: ${field}`);
  check(pixels.physical_card_or_material_not_observed === true && pixels.source_image_does_not_certify_physical_finish === true && typeof pixels.source_image_has_rendered_foil_like_background === 'boolean', 'Source image cannot certify physical material');
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
  check(isDeepStrictEqual(plan.delivery_scope, { fixed_batch_id: 'JP-CARDS-004', saved_batch_tasks: 25, eligible_fronts: FRONTS, excluded_printing_id: '494725ee-70bf-41d3-a6b7-2a7bb6180287', excluded_alias: '045', exclusion_reason: 'Slowpoke HP 40/50 identity conflict', whole_batch_completion_asserted: false }), 'Fixed batch delivery scope changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate identity table entry');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen source identity changed');
    check(row.language_code === 'ja' && row.source_code === 'scrydex' && row.set_code === 'neo1' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.batch_id === 'JP-CARDS-004', 'Only exact Japanese Neo1 batch supported');
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
  check(indexObjects(rows).size === 96, 'Exact unique image member count changed');
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
    check(bindings.filter(card => card.finish_code === 'normal').length === 18 && bindings.filter(card => card.finish_code === 'holo').length === 6, 'Eighteen normal/six holo metadata scope changed');
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
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 100, 'Frozen archive changed');
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
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: 72, object_references: 96, unique_image_members: 96, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
