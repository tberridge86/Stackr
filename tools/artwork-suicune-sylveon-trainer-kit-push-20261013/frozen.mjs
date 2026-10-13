import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

// One frozen inspected60 cohort; both finish-mismatched targets stay excluded.
export const COHORT_SHA = '2a8937ffa6b164728ed295e49a6297687ac4d947a9b600d5c01d25936889b26f';
export const APPROVAL_SHA = '366b42ddfc1eb11e200705d3c29362820a3b126bb161afa5758ecbc34e48c1f7';
export const IDENTITY_TABLE_SHA = '56f558754257f70c0c94356fb5019fda34fbc35fbad726be0c222d3647bc6c87';
export const ARCHIVE_SHA = '1f06df02a94f68cdd71115f0144809a95ea05e869a6f556a5f4d7d07d94c87a2';
export const ARCHIVE_ID = 638434423;
export const ARCHIVE_BYTES = 56995023;
export const FRONTS = 60;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-SS060';
export const SAVED_TARGETS_SHA = '0e54f3917ce7a1438cf4498f115c7ba4cf6c3e0cc40693f6d6124f5d5d7d999d';
export const ORIGINAL_TARGETS = 62;
export const FINISH_HOLD_PRINTINGS = ['20201198-462c-4883-97ed-e828c88a602d', 'c846ec98-8db7-4532-a2a2-1e6a23eab9fc'];
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Original saved target identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === ORIGINAL_TARGETS && new Set(saved.map(row => row.printing_id)).size === ORIGINAL_TARGETS, 'Wrong original saved scope');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen per-printing identity table bytes changed');
  const table = JSON.parse(bytes);
  check(FRONTS > 0 && FRONTS <= ORIGINAL_TARGETS && table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong eligible per-printing scope');
  for (const row of table) {
    check(!FINISH_HOLD_PRINTINGS.includes(row.printing_id), 'Canonical normal/source holofoil mismatch remains held');
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside the original saved target subset');
    const provider = { 'tk-xy-p': 'tk9b', 'tk-xy-su': 'tk9a', 'tk-xy-sy': 'tk6a' }[row.set_code];
    check(row.provider_id === `${provider}-${Number(row.collector_number)}` && row.printed_denominator === 30, 'Verified source deck/footer alias changed');
  }
  return table;
}

export function validateRows(plan, table) {
  const { rows } = plan;
  check(FRONTS > 0 && FRONTS <= ORIGINAL_TARGETS && rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen eligible scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }), 'Source counts changed');
  check(plan.delivery_scope.original_saved_targets === ORIGINAL_TARGETS && plan.delivery_scope.eligible_fronts === FRONTS && plan.delivery_scope.excluded_targets === ORIGINAL_TARGETS - FRONTS && plan.delivery_scope.whole_batch_completion_asserted === false, 'Eligible/held delivery counts changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate per-printing identity table entry');
  for (const row of rows) {
    check(!FINISH_HOLD_PRINTINGS.includes(row.printing_id), 'Canonical normal/source holofoil mismatch remains held');
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen per-printing source identity changed');
    check(row.language_code === 'en' && row.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid printing identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]), 'Invalid singleton variant identity');
    check(['tk-xy-p', 'tk-xy-su', 'tk-xy-sy'].includes(row.set_code) && ['EN-CARDS-031', 'EN-CARDS-032', 'EN-CARDS-033', 'EN-CARDS-034', 'EN-CARDS-035'].includes(row.batch_id), 'Unbounded set or batch');
    check(row.image_url === `https://images.scrydex.com/pokemon/${row.provider_id}/large`, 'Source URL changed');
    const evidence = row.evidence;
    check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256) && evidence.source_metadata_sha256 === expected.source_metadata_sha256 && evidence.source_metadata_name === expected.source_metadata_name && evidence.collector_alias_evidence === expected.collector_alias_evidence, 'Source metadata hash, name or collector alias evidence changed');
    check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.identity_checks.physicalFinishVerified === false && evidence.product_reference_used_for_binding === false && evidence.stamped_source_alternatives_selected === false, 'Unsupported finish, licence, stamped substitute or product binding');
    check(evidence.identity_checks.savedMetadataMatched === true && evidence.identity_checks.currentProductionCardBindingMatched === true && evidence.identity_checks.printedCollectorOpticallyVerified === true, 'Verified source/current binding checks required');
    const decision = evidence.owner_business_decision;
    check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const pixels = evidence.pixel_identity;
    // Energy faces identify their type by a symbol; their printed title need not
    // literally equal the catalogue name. Preserve each inspected observation.
    check(pixels.language === 'English' && pixels.printedNumerator === expected.printed_numerator && pixels.printedNumerator === Number(row.collector_number) && pixels.printedDenominator === expected.printed_denominator && pixels.printedCollectorNumber === expected.printed_collector && pixels.catalogueCollectorAlias === row.collector_number && pixels.deckSymbol === expected.deck_symbol && pixels.printedName === expected.printed_name && (pixels.energyTypeSymbol ?? null) === expected.energy_type_symbol && pixels.copyrightYear === expected.copyright_year && pixels.copyrightYearObservedFromPixels === true && pixels.copyrightInferredFromReleaseYear === false && pixels.nameNumberAndSymbolReadable === true && pixels.finePrintReadable === true && pixels.completePrintedFaceAndFrameVisible === true && pixels.outerPhysicalCornerGeometryCertified !== true && pixels.stampedEditionSubstituted === false && pixels.materialFoilFinishCertified === false && digest(Buffer.from(JSON.stringify(pixels))) === expected.pixel_identity_sha256, 'Exact readable printed face/deck/year/content evidence changed');
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
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 3 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Suicune/Sylveon eligible-front plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Wrong queue or identity table');
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
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: FRONTS * 3, object_references: FRONTS * 4, unique_image_members: indexObjects(plan.rows).size, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
