import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';

// Assign only after every exact subset source and immutable package is verified.
export const COHORT_SHA = '92df998eae88050520a202f3c68a45c28158dae12e27886ca1464c7d97d856ed';
export const APPROVAL_SHA = '8ea05cf12cee82b546dcfe4e39afc685c547af56471004a68a8f6fa413d161f9';
export const IDENTITY_TABLE_SHA = 'c979669f074cd5d3e51a0dc60807bf7a68621e638c82ba70e343a8828b907324';
export const ARCHIVE_SHA = 'be73d17379657b1128eb5f01b9666c53026e0b2289e015ae324f18344d457370';
export const ARCHIVE_ID = 638165691;
export const ARCHIVE_BYTES = 35408502;
export const FRONTS = 30;
export const VARIANTS = 30;
export const OBJECTS = 120;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-SM030';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
const savedCollectors = {
  'tk-sm-l': ['1', '4', '5', '11', '12', '13', '14', '15', '16', '18', '19', '21', '22', '23', '25', '27'],
  'tk-sm-r': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '23', '24', '25', '26', '27', '28', '29'],
};

export function validateIdentityTable(bytes) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen per-printing identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong per-printing identity scope');
  for (const row of table) {
    check(savedCollectors[row.set_code]?.includes(row.collector_number), 'Reference outside the original saved subset');
    const provider = row.set_code === 'tk-sm-l' ? 'tk10a' : 'tk10b';
    check(row.provider_id === `${provider}-${Number(row.collector_number)}` && row.printed_denominator === 30, 'Exact source deck alias/footer changed');
  }
  return table;
}

export function validateRows(plan, table) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong thirty-ready-printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 30 }), 'Source counts changed');
  check(isDeepStrictEqual(plan.delivery_scope, { mode: 'partial_saved_batches', original_saved_targets: 44, eligible_fronts: 30, low_resolution_research_fronts_excluded: 14, whole_batch_completion_asserted: false }), 'Partial delivery or research exclusion scope changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate per-printing identity table entry');
  for (const row of rows) {
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen per-printing source identity changed');
    check(row.language_code === 'en' && row.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid printing identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]), 'Invalid singleton variant identity');
    check(['EN-CARDS-019', 'EN-CARDS-020', 'EN-CARDS-021'].includes(row.batch_id), 'Unbounded batch');
    check(row.image_url === `https://images.scrydex.com/pokemon/${row.provider_id}/large`, 'Source URL changed');
    const evidence = row.evidence;
    check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256) && evidence.source_metadata_sha256 === expected.source_metadata_sha256 && evidence.collector_alias_evidence === expected.collector_alias_evidence, 'Source metadata hash or collector alias evidence changed');
    check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.identity_checks.physicalFinishVerified === false && evidence.product_reference_used_for_binding === false, 'Unsupported finish, licence or product binding');
    const decision = evidence.owner_business_decision;
    check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const pixels = evidence.pixel_identity;
    check(pixels.language === 'English' && pixels.printedNumerator === expected.printed_numerator && pixels.printedDenominator === expected.printed_denominator && pixels.printedCollectorNumber === expected.printed_collector && pixels.catalogueCollectorAlias === row.collector_number && pixels.deckSymbol === expected.deck_symbol && pixels.printedName === expected.printed_name && pixels.printedFooterNumberAndSymbolMatched === true && pixels.nameMatched === true && pixels.completePrintedFaceAndFrameVisible === true && pixels.outerPhysicalCornerGeometryCertified !== true && pixels.stampedEditionSubstituted === false && pixels.materialFoilFinishCertified === false, 'Exact printed face/deck evidence changed');
    check(row.objects.length === 4 && row.objects.every((object, i) => object.role === roles[i]), 'Incomplete original and derivatives');
    const original = row.objects[0];
    check(original.sha256 === expected.original_sha256 && original.width === expected.original_width && original.height === expected.original_height, 'Per-printing original changed');
    check(original.width === 728 && original.height === 1018, 'Only the thirty checked HD originals are eligible; tiny research fronts are excluded');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= 2048 && object.height <= 2048, 'Invalid bounded image evidence');
      const extension = object.role === 'original' ? 'png' : 'webp';
      check(object.mime_type === `image/${extension}` && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path or MIME changed');
      check(object.width <= original.width && object.height <= original.height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === VARIANTS, 'Wrong thirty-variant scope');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === VARIANTS && new Set(bindings.map(card => card.variant_id)).size === VARIANTS, 'Wrong binding cohort');
    for (const row of rows) {
      const found = bindings.filter(card => card.printing_id === row.printing_id);
      check(found.length === 1 && found[0].variant_id === row.variant_ids[0], 'Variant binding changed');
      const card = found[0];
      check(card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null, 'Wrong game or artwork reference');
      for (const key of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[key] === row[key], `Frozen binding changed: ${key}`);
    }
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: 30, variants: 30, names: 60, sets: 2 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen thirty-front partial plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.identity_table_sha256 === IDENTITY_TABLE_SHA, 'Wrong queue or identity table');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === OBJECTS + METADATA_FILES.length, 'Frozen archive changed');
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
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)));
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: FRONTS * 3, object_references: OBJECTS, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table };
}
