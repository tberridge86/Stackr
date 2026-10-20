import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';

// Assign these only after the source inspections and immutable package agree.
export const COHORT_SHA = '0bc7b51cfd6bde6c878b9b3674751c6c079b5af99d18c3f8c9410eed84f80f45';
export const APPROVAL_SHA = '1b8879eb856915a3407ce7970f68aac5e2e60ef2b0ea94e82dce314a3383b28a';
export const ARCHIVE_SHA = '9bcc979f0ddb70dc64544c8cc592667fa19d570a12e295834600e459132ad862';
export const ARCHIVE_ID = 638107947;
export const ARCHIVE_BYTES = 32119253;
export const FRONTS = 35;
export const VARIANTS = 35;
export const OBJECTS = 140;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-035';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
const scope = {
  'tk-hs-g': { provider: 'tk4b', min: 26, max: 30, count: 5 },
  'tk-hs-r': { provider: 'tk4a', min: 1, max: 30, count: 30 },
};

export function validateRows(plan) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS, 'Wrong thirty-five-printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 35 }), 'Source counts changed');
  for (const [set, expected] of Object.entries(scope)) {
    const found = rows.filter(row => row.set_code === set);
    check(found.length === expected.count && new Set(found.map(row => row.collector_number)).size === expected.count, 'Trainer-kit set/collector scope changed');
  }
  for (const row of rows) {
    check(row.language_code === 'en' && row.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid printing identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]), 'Invalid singleton variant identity');
    const expected = scope[row.set_code];
    const number = Number(row.collector_number);
    const batch = row.set_code === 'tk-hs-g' ? 'EN-CARDS-016' : number <= 25 ? 'EN-CARDS-017' : 'EN-CARDS-018';
    check(expected && /^[1-9][0-9]?$/u.test(row.collector_number) && number >= expected.min && number <= expected.max && row.provider_id === `${expected.provider}-${number}` && row.batch_id === batch, 'Unbounded printing or provider identity');
    check(row.image_url === `https://images.scrydex.com/pokemon/${row.provider_id}/large`, 'Source URL changed');
    const evidence = row.evidence;
    check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256) && evidence.collector_alias_evidence.includes(`printed ${number}/30`), 'Source metadata hash or collector alias evidence changed');
    check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.identity_checks.physicalFinishVerified === false && evidence.product_reference_used_for_binding === false, 'Unsupported finish, licence or ambiguous product binding');
    const conflict = evidence.cross_deck_reference_conflict;
    check(conflict.provider === 'tcgplayer' && conflict.productId === 88222 && isDeepStrictEqual(conflict.sourceCards, ['tk4b-27 Pokemon Communication', 'tk4a-27 Pokemon Collector']) && conflict.sourceOrCanonicalPriceMetadataChanged === false, 'Excluded cross-deck product-reference evidence changed');
    const decision = evidence.owner_business_decision;
    check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const pixels = evidence.pixel_identity;
    check(pixels.language === 'English' && pixels.printedNumerator === number && pixels.printedDenominator === 30 && pixels.printedCollectorNumber === `${number}/30` && pixels.catalogueCollectorAlias === row.collector_number && pixels.printedFooterMatched === true && pixels.nameMatched === true && pixels.completePrintedFaceAndFrameVisible === true && pixels.outerPhysicalCornerGeometryCertified === false && pixels.stampedEditionSubstituted === false && pixels.materialFoilFinishCertified === false, 'Printed trainer-kit face evidence changed');
    check(row.objects.length === 4 && row.objects.every((object, i) => object.role === roles[i]), 'Incomplete original and derivatives');
    check(row.objects[0].width === 598 && row.objects[0].height === 823, 'Original trainer-kit dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0, 'Invalid bounded image evidence');
      const extension = object.role === 'original' ? 'png' : 'webp';
      check(object.mime_type === `image/${extension}` && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path or MIME changed');
      check(object.width <= row.objects[0].width && object.height <= row.objects[0].height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === VARIANTS, 'Wrong thirty-five-variant scope');
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
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: 35, variants: 35, names: 70, sets: 2 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes) {
  check(digest(bytes) === COHORT_SHA, 'Frozen thirty-five-front plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID, 'Wrong queue');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === OBJECTS + METADATA_FILES.length, 'Frozen archive changed');
  validateRows(plan);
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
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)));
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: FRONTS * 3, object_references: OBJECTS, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt };
}
