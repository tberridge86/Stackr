import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';

// A separate frozen32 cohort with independently corrected inspection evidence.
export const COHORT_SHA = '3c5a18af706b5c1ecd63f8134e5ebfe5b6787d12c6529b06cebfab1d970463c8';
export const APPROVAL_SHA = 'a11e2841aee044bb18f79810b5a1f79a4418773d2e2e26a2cc185221d90e0365';
export const IDENTITY_TABLE_SHA = '4ec45168147b60e183b82a66e7bc7ad335f1c8af67414a69e68118f1c004985f';
export const ARCHIVE_SHA = 'a28ae10ef8979f2bdf8ba6b2221e4dc856d5a1df10fdd13c111e71214fb5f203';
export const ARCHIVE_ID = 638295433;
export const ARCHIVE_BYTES = 32934150;
export const FRONTS = 32;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-LAT032';
export const SAVED_TARGETS_SHA = '3da25244e5301a11c4ca139305a28f556d6d89e07de4d2f5ef27c9c9519e7625';
export const ORIGINAL_TARGETS = 32;
export const INSPECTION_CORRECTION_SHA = '7b4c198e1ee6230aaa362b25e814b652a3a9d1820961fb8658e461d83eeb93b5';
export const CORRECTED_PRINTINGS = [
  { printing_id: 'c4c82782-0817-4304-815b-bcc0bba3db9b', sha256: '9e889b833a77cf604a696616dbd6942879b292be92f9119380642e7ca356457f' },
  { printing_id: '2edf6f8d-8922-4d4c-9e4c-b1cca68b08a6', sha256: '6a8f7935c9ac6710b3d48c167b2ab610f08048d10009f06283a314d828560702' },
];
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

export function indexObjects(rows) {
  const indexed = new Map();
  for (const object of rows.flatMap(row => row.objects)) {
    const previous = indexed.get(object.file);
    check(!previous || isDeepStrictEqual(previous, object), 'Incompatible immutable object path alias');
    indexed.set(object.file, object);
  }
  return indexed;
}

export function validateInspectionCorrection(bytes) {
  check(digest(bytes) === INSPECTION_CORRECTION_SHA, 'Frozen corrected inspection evidence changed');
  const evidence = JSON.parse(bytes);
  check(isDeepStrictEqual(evidence.corrections.map(row => selectFields(row, ['printing_id', 'sha256'])), CORRECTED_PRINTINGS), 'Corrected identities or immutable originals changed');
  check(evidence.corrections.every(row => row.previous_damage_observation === null && row.observed_attack_damage === '40' && row.source_attack_damage === '40' && row.reading_error_corrected === true && row.provider_metadata_error_established === false && row.physical_printing_error_established === false && row.original_pixels_modified === false && row.canonical_metadata_changed === false), 'Former blank-damage assertion or unsupported card correction');
  return evidence;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Original saved target identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === ORIGINAL_TARGETS && new Set(saved.map(row => row.printing_id)).size === ORIGINAL_TARGETS, 'Wrong original saved scope');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen per-printing identity table bytes changed');
  const table = JSON.parse(bytes);
  check(FRONTS === ORIGINAL_TARGETS && table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong exact original32 per-printing scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside the original saved target subset');
    const provider = row.set_code === 'tk-xy-latio' ? 'tk8a' : 'tk8b';
    check(row.provider_id === `${provider}-${Number(row.collector_number)}` && row.printed_denominator === 30, 'Verified source deck/footer alias changed');
  }
  return table;
}

export function validateRows(plan, table) {
  const { rows } = plan;
  check(FRONTS === ORIGINAL_TARGETS && rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen exact original32 scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }), 'Source counts changed');
  check(plan.delivery_scope.original_saved_targets === ORIGINAL_TARGETS && plan.delivery_scope.eligible_fronts === FRONTS && plan.delivery_scope.excluded_targets === ORIGINAL_TARGETS - FRONTS && plan.delivery_scope.whole_batch_completion_asserted === false, 'Eligible/held delivery counts changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate per-printing identity table entry');
  for (const row of rows) {
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen per-printing source identity changed');
    check(row.language_code === 'en' && row.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid printing identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]), 'Invalid singleton variant identity');
    check(['tk-xy-latio', 'tk-xy-latia'].includes(row.set_code) && ['EN-CARDS-025', 'EN-CARDS-026', 'EN-CARDS-027'].includes(row.batch_id), 'Unbounded set or batch');
    check(row.image_url === `https://images.scrydex.com/pokemon/${row.provider_id}/large`, 'Source URL changed');
    const evidence = row.evidence;
    check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256) && evidence.source_metadata_sha256 === expected.source_metadata_sha256 && evidence.collector_alias_evidence === expected.collector_alias_evidence, 'Source metadata hash or collector alias evidence changed');
    check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.identity_checks.physicalFinishVerified === false && evidence.product_reference_used_for_binding === false && evidence.stamped_source_alternatives_selected === false, 'Unsupported finish, licence, stamped substitute or product binding');
    check(evidence.identity_checks.savedMetadataMatched === true && evidence.identity_checks.currentProductionCardBindingMatched === true && evidence.identity_checks.printedCollectorOpticallyVerified === true, 'Verified source/current binding checks required');
    const decision = evidence.owner_business_decision;
    check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const pixels = evidence.pixel_identity;
    const corrected = CORRECTED_PRINTINGS.find(entry => entry.printing_id === row.printing_id);
    if (corrected) {
      check(evidence.inspection_correction_sha256 === INSPECTION_CORRECTION_SHA && row.objects[0]?.sha256 === corrected.sha256, 'Missing or unpinned corrected inspection proof');
      const attack = pixels.attacks.find(entry => entry.name === 'Take Down');
      check(attack?.damage === '40' && isDeepStrictEqual(attack.cost, ['Fighting', 'Fighting']) && /10 damage to itself/iu.test(attack.text) && evidence.provider_metadata_error_established === false && evidence.physical_printing_error_established === false, 'Former blank-damage assertion or unsupported card correction');
    }
    // Energy faces identify their type by a symbol; their printed title need not
    // literally equal the catalogue name. Preserve each inspected observation.
    check(pixels.language === 'English' && pixels.printedNumerator === expected.printed_numerator && pixels.printedNumerator === Number(row.collector_number) && pixels.printedDenominator === expected.printed_denominator && pixels.printedCollectorNumber === expected.printed_collector && pixels.deckSymbol === expected.deck_symbol && pixels.printedName === expected.printed_name && (pixels.energyTypeSymbol ?? null) === expected.energy_type_symbol && pixels.copyrightYear === expected.copyright_year && pixels.copyrightYearObservedFromPixels === true && pixels.copyrightInferredFromReleaseYear === false && pixels.nameNumberAndSymbolReadable === true && pixels.completePrintedFaceAndFrameVisible === true && pixels.outerPhysicalCornerGeometryCertified !== true && pixels.materialFoilFinishCertified === false && digest(Buffer.from(JSON.stringify(pixels))) === expected.pixel_identity_sha256, 'Exact readable printed face/deck/year/content evidence changed');
    check(row.objects.length === 4 && row.objects.every((object, i) => object.role === roles[i]), 'Incomplete original and derivatives');
    const original = row.objects[0];
    check(original.sha256 === expected.original_sha256 && original.width === expected.original_width && original.height === expected.original_height, 'Per-printing original changed');
    check(original.width >= 576 && original.height >= 800, 'Source is below minimum detail quality; research originals cannot be published');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= 2048 && object.height <= 2048, 'Invalid bounded image evidence');
      const extension = object.role === 'original' ? 'png' : 'webp';
      check(object.mime_type === `image/${extension}` && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path or MIME changed');
      check(object.width <= original.width && object.height <= original.height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS, 'Wrong singleton variant scope');
  check(new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS, 'Originals cannot be reused across printing identities');
  indexObjects(rows);
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === FRONTS && new Set(bindings.map(card => card.variant_id)).size === FRONTS, 'Wrong binding cohort');
    for (const row of rows) {
      const found = bindings.filter(card => card.printing_id === row.printing_id);
      check(found.length === 1 && found[0].variant_id === row.variant_ids[0], 'Variant binding changed');
      const card = found[0];
      check(card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === 'normal' && card.finish_code === 'normal', 'Wrong game, artwork reference or supported normal finish');
      for (const key of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[key] === row[key], `Frozen binding changed: ${key}`);
    }
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 2 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Latios eligible-front plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && plan.inspection_correction_sha256 === INSPECTION_CORRECTION_SHA, 'Wrong queue, identity table or corrected inspection');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === indexObjects(plan.rows).size + METADATA_FILES.length, 'Frozen archive changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'en' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && approval.owner_instructions.length === 3 && approval.approved_at === '2026-10-13', 'Wrong owner business decision');
  return approval;
}

export async function loadFrozen() {
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const correction = validateInspectionCorrection(await readFile(new URL('./inspection-correction.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, inspection_correction_sha256: INSPECTION_CORRECTION_SHA, fronts: FRONTS, derivative_references: FRONTS * 3, object_references: FRONTS * 4, unique_image_members: indexObjects(plan.rows).size, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved, correction };
}
