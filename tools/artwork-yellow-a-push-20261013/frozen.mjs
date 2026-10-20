import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

// Exactly two inspected lettered alternates; canonical xya grouping is preserved.
export const COHORT_SHA = 'bcc86498342436261c52c7d9dafdeac6b8cb110b039183b85c8aefd597b66832';
export const APPROVAL_SHA = 'ff7eabd3a9d87d051e6fcba76e34adb7e1881bc4e13f6ba72e89bccf71fb268c';
export const IDENTITY_TABLE_SHA = '920c7867fa8ed59488f72d5c9446e504024fb160ce578b0898ce6fa2fce9f075';
export const ARCHIVE_SHA = 'da73a211f009a3ee5f3bb61bbcccdc765744c66159c0480aca9c9301ac2cc21c';
export const ARCHIVE_ID = 638504756;
export const ARCHIVE_BYTES = 1250882;
export const FRONTS = 2;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-ALT002';
export const SAVED_TARGETS_SHA = "26ccbc158ed31cb05700add5ff665b3ba2f16c8d5972a6b70a36f3db793e48f5";
export const ORIGINAL_TARGETS = 2;
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

const alternates = {
  '8a4dd5f6-ed5a-4d09-babf-85572f6eea0a': {
    collector: '107a', provider: 'xy9-107a', footer: '107a/122',
    parent: 'BREAKpoint', parentId: 'xy9',
    symbol: 'BREAKpoint leaf/point set symbol beside uncommon diamond',
  },
  'f4c6af1e-70c0-48fe-b3a1-1d04059b1051': {
    collector: '92a', provider: 'xy6-92a', footer: '92a/108',
    parent: 'Roaring Skies', parentId: 'xy6',
    symbol: 'Roaring Skies arrow/wing set symbol beside uncommon diamond',
  },
};

function alternateFor(row) {
  const known = alternates[row.printing_id];
  check(known && row.set_code === 'xya' && row.collector_number === known.collector && row.provider_id === known.provider, 'Unknown or relabelled Yellow A alternate identity');
  return known;
}

function validateAlternateEvidence(row, expected) {
  const known = alternateFor(row);
  const evidence = row.evidence;
  const pixels = evidence.pixel_identity;
  check(pixels.canonicalCollectorAlias === known.collector && pixels.printedCollectorSuffix === 'a' && pixels.printedCollectorNumber === known.footer && evidence.source_printed_number === known.footer, 'Exact a-suffixed printed footer required');
  check(pixels.underlyingSourceExpansion === known.parent && pixels.underlyingSourceExpansionId === known.parentId && pixels.underlyingPrintedSetSymbol === known.symbol && pixels.raritySymbol === 'uncommon diamond', 'Verified underlying expansion and rarity symbols changed');
  check(pixels.yellowAMarkerObservedFromPixels === true && pixels.yellowAMarker === 'yellow letter A in a black circle with white outline at bottom right' && pixels.ordinaryUnsuffixedPrintingSubstituted === false, 'Observed Yellow A marker required; ordinary unsuffixed fronts excluded');
  check(pixels.copyrightYear === 2017 && pixels.copyrightText === '©2017 Pokémon' && pixels.copyrightYearObservedFromPixels === true && pixels.copyrightInferredFromReleaseYear === false, 'Actual 2017 copyright required; parent release year is not printing evidence');
  const crosswalk = evidence.source_group_crosswalk;
  check(crosswalk.catalogueGroup === 'Yellow A Alternate / xya' && crosswalk.providerParentSet === known.parent && crosswalk.providerParentSetId === known.parentId && crosswalk.ordinaryUnsuffixedPrintingSubstituted === false && crosswalk.yellowAMarkerPixelVerified === true && crosswalk.exactASuffixedFooterPixelVerified === true && crosswalk.canonicalGroupNotChanged === true && crosswalk.physicalEditionCertified === false, 'Canonical xya to exact provider-parent crosswalk changed');
  for (const field of ['source_printed_number', 'source_group_crosswalk', 'retained_alias_metadata', 'source_name_alias', 'source_name_canonical_changed', 'source_metadata_content_discrepancies']) {
    check(isDeepStrictEqual(evidence[field], expected[field]), 'Retained alias or provider transcription evidence changed: ' + field);
  }
  check(evidence.source_name_canonical_changed === false && evidence.source_edition_evidence === null && evidence.source_binding_inference === null, 'Unknown edition, distribution or canonical name claim');
  check(pixels.language === 'English' && pixels.printedName === expected.printed_name && pixels.rulesSemanticallyMatchSource === true && pixels.normalSourceVariantMetadataSupported === true && pixels.genericFrontDoesNotCertifyFoilMaterial === true, 'Supported English printed trainer rules required');
  for (const field of ['nameNumberAndSymbolReadable', 'finePrintReadable', 'completePrintedFaceAndFrameVisible']) check(pixels[field] === true, 'Exact readable printed face required: ' + field);
  for (const field of ['outerPhysicalCornerGeometryCertified', 'stampedEditionSubstituted', 'materialFoilFinishCertified', 'editionOrDistributionProductCertified']) check(pixels[field] === false, 'Unsupported physical, stamped or distribution certification: ' + field);
  check(digest(Buffer.from(JSON.stringify(pixels))) === expected.pixel_identity_sha256, 'Exact inspected pixel content evidence changed');
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
  check(FRONTS > 0 && FRONTS <= ORIGINAL_TARGETS && table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong eligible per-printing scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside the original saved target subset');
    const known = alternateFor(row);
    check(row.printed_collector === known.footer && row.original_width === 734 && row.original_height === 1024, 'Inspected alternate footer/dimensions changed');
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
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen per-printing source identity changed');
    check(row.language_code === 'en' && row.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid printing identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]), 'Invalid singleton variant identity');
    check(row.set_code === 'xya' && row.batch_id === 'EN-CARDS-038', 'Unbounded set or batch');
    check(row.image_url === `https://images.scrydex.com/pokemon/${row.provider_id}/large`, 'Source URL changed');
    const evidence = row.evidence;
    check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(evidence.source_metadata_sha256) && evidence.source_metadata_sha256 === expected.source_metadata_sha256 && evidence.source_metadata_name === expected.source_metadata_name && evidence.collector_alias_evidence === expected.collector_alias_evidence, 'Source metadata hash, name or collector alias evidence changed');
    check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.identity_checks.physicalFinishVerified === false && evidence.product_reference_used_for_binding === false && evidence.stamped_source_alternatives_selected === false, 'Unsupported finish, licence, stamped substitute or product binding');
    check(evidence.identity_checks.savedMetadataMatched === true && evidence.identity_checks.currentProductionCardBindingMatched === true && evidence.identity_checks.printedCollectorOpticallyVerified === true, 'Verified source/current binding checks required');
    const decision = evidence.owner_business_decision;
    check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Owner decision scope changed');
    validateAlternateEvidence(row, expected);
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
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 1 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Yellow A eligible-front plan bytes changed');
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
