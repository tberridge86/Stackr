import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { SOURCE_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

// Final byte pins are assigned offline after the immutable archive upload.
export const COHORT_SHA = '4b8406e829a4637e588d44cd3df78806e0a1ed638f46928c07252f59eecae42c';
export const APPROVAL_SHA = '5257dca32408ebe76a6f69bc3553842e8d7d8f20ab69394a248b22d254b174e7';
export const IDENTITY_TABLE_SHA = '2f28d436eca77ead4ed87040410f84597e2c962044263d8f5cce1e3b7ea1327c';
export const SAVED_TARGETS_SHA = 'ac98fc53f9a6b027a77a075e6322817cba903fbec7ff31d023cbfb8f2cb1383e';
export const SOURCE_MANIFEST_SHA = 'a22455e63ed49dd421587c230682a28f616003ba8f02cefff89a14655526b4a2';
export const ARCHIVE_SHA = 'b73668b35e12b8687aaeaf9e30e7102215df2bdaef74b3934b2fffa9789e69e9';
export const ARCHIVE_ID = 641581207;
export const ARCHIVE_BYTES = 6626688;
export const FRONTS = 15;
export const QUEUE_ID = 'STACKR-EN-MFB-20261014-015';
export const CATALOGUE_VERSION = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
export const SET_ID = '460a0854-bfcb-48b9-8531-6f0565a8dd6c';
export const ORIGINAL_HANDOFF_SHA = '93cc99cd760a8980489256bdbcb29fd77afde003f3eba4e229288b2041651456';
export const FINITE_DECISION_SHA = '777cb65189762d31cfec71d5b2026229076be3aaf2c85c2fa0e10d9f959dced3';
export const OWNER_PERMISSION_SHA = '7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d';
export const MAGNETON_GLYPH_SHA = 'b09b12a52eca66a675e8299f9768fbbb23a8bb5de1c65754b38d771bc68499d8';
export const OBSERVATION_CORRECTION_SHA = '04e10cb81935fd3d440705a849e886f86a56e6fca319a84ee9fc0e7dedad2d9e';
export const SOURCE_CODES = ['scrydex', 'bulbapedia'];
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const ACCEPTED_ALIASES = ['2', '3', '4', '10', '12', '13', '14', '15', '18', '19', '20', '21', '22', '28', '30'];
export const NEW_SOURCE = {
  code: 'bulbapedia', display_name: 'Bulbapedia', source_type: 'image', base_url: 'https://bulbapedia.bulbagarden.net',
  licence_status: 'under_review', attribution_required: true, active: false,
  internal_notes: 'Provenance only for exactly fifteen inspected unnumbered English My First Battle fronts in STACKR-EN-MFB-20261014-015. Owner attests website permission; per-file TCG Collector/artist attribution and artwork-specific fair-use tags retained. No independently verified vendor or underlying copyright licence, physical edition/finish certification, or source-wide acquisition approval.',
  deprecated_at: null,
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved scope');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong identity scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside fixed targets');
  }
  return table;
}

export function validateSourcePlan(plan) {
  const prod = plan.source_policies.production, stage = plan.source_policies.staging;
  check(prod.length === 1 && prod[0].code === 'scrydex' && stage.length === 0, 'Existing source policy scope changed');
  check(isDeepStrictEqual(plan.new_sources.production, [NEW_SOURCE]) && isDeepStrictEqual(plan.new_sources.staging, [prod[0], NEW_SOURCE]), 'Finite inactive source or rollback-only fixture changed');
  for (const source of [...prod, NEW_SOURCE]) {
    check(isDeepStrictEqual(Object.keys(source).sort(), [...SOURCE_FIELDS].sort()), 'Unbounded source policy fields');
    check(source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null && source.source_type === 'image', 'Unsupported source activation or licence');
  }
  check(prod[0].base_url === 'https://scrydex.com', 'Existing Scrydex source changed');
}

function validateEvidence(row, expected) {
  const e = row.evidence, body = e.source_body, p = body.actual_pixels, signature = body.signature;
  check(e.source_url === row.image_url && e.provider_id === row.provider_id && e.artwork_scope === 'printing_front' && e.source_metadata_sha256 === expected.source_metadata_sha256, 'Source evidence changed');
  check(digest(Buffer.from(JSON.stringify(body))) === expected.source_body_sha256, 'Frozen structured source body changed');
  check(/^[a-f0-9]{64}$/u.test(e.retained_source_signature_sha256) && e.actual_structured_signature_sha256 === digest(Buffer.from(JSON.stringify(signature))), 'Historical signature hash and current structured serialization must remain separate');
  const identity = e.printed_identity;
  check(identity.canonical_alias === row.collector_number && identity.canonical_alias_is_internal_only === true && identity.printed_collector_number === null && identity.printed_national_dex_is_not_collector_number === true, 'Unnumbered alias cannot become a printed collector number');
  check(p.printedCollectorNumberObserved === null && p.canonicalAliasNotTreatedAsPrintedNumber === true && p.cardIsUnnumberedPerDeckList === true && signature.printedCollectorNumber === null && signature.unnumberedPerSourceDeckList === true && signature.canonicalCollectorAliasIsInternalOnly === true, 'Actual unnumbered-card witness required');
  check(p.printedNameObserved === signature.name && p.printedNameObserved === row.card_native_name && p.printedHPObserved === signature.hp && p.artistObserved.toLowerCase() === signature.artist.toLowerCase() && p.printedNationalDexTextObserved === identity.printed_national_dex, 'Printed name/HP/artist/Dex changed');
  check(p.printedNationalDexTextObserved === signature.nationalDexNumber, 'Printed/source Dex representation changed');
  for (const field of ['wholeOriginalIndividuallyViewed', 'viewedAtNativePixelDimensions', 'fullCardFrameObserved', 'wholePrintingLanguageVerified', 'metadataNameMatches', 'metadataHPMatches', 'metadataStageHeaderMatches', 'metadataOrderedAttackNamesCostsDamageMatch', 'metadataArtistMatchesIgnoringCase', 'acceptedExactEnglishWholeFront', 'completeCopyrightLineLegible']) check(p[field] === true, `Actual readable English whole front required: ${field}`);
  check(p.printedBodyLanguageObserved === 'en' && p.printedStageHeaderObserved !== 'BASIS' && p.holds.length === 0 && p.originalSha256 === row.objects[0].sha256 && p.deckSilhouetteObserved === identity.deck_silhouette && signature.sourceEnglishDeck === identity.source_english_deck, 'Whole-front language/body/deck evidence changed');
  const attackCore = attacks => attacks.map(a => ({ name: a.name, costSymbols: a.costSymbols, damage: a.damage }));
  check(isDeepStrictEqual(attackCore(p.orderedAttacksObserved), attackCore(signature.attacks)) && isDeepStrictEqual(attackCore(p.orderedAttacksObserved), attackCore(body.metadata.retainedTcgWitness.sourceMetadata.attacks)), 'Ordered attacks differ from independent metadata');
  check(p.copyrightYearInferredFromReleaseDate === false && p.physicalEditionVerified === false && p.physicalFinishVerified === false && p.sourceBytesUnchanged === true && p.localResizeOrUpscalePerformed === false && p.pixelsGenerated === false, 'Unsupported physical/quality claim');
  if (row.collector_number === '20') {
    const glyph = body.inline_glyph_resolution;
    check(glyph?.printingId === row.printing_id && glyph.originalSha256 === row.objects[0].sha256 && glyph.sourceRawHTMLSha256 === e.source_metadata_sha256 && glyph.originalHTMLIncludesInlineLightningGlyph === true && glyph.sourceHTMLBodyWitness.includes('alt="Lightning"') && glyph.pixelResolution === true && glyph.canonicalCorrection === false, 'Exact retained inline Lightning glyph required');
    const correction = body.current_observation_correction;
    check(row.printing_id === 'caac57ef-b60b-43e6-95c7-44d01f2eed48' && row.objects[0].sha256 === '3d69fcdfc745a982da031268d58cedbe42a6940e3a5d0f4f1a48e29ec5839b29' && p.printedNationalDexTextObserved === '0082' && p.printedNationalDexNumericValue === 82 && p.providerMetadataDiscrepancies.length === 0 && body.provider_metadata_discrepancies.length === 0, 'Corrected visible Magneton0082 required; obsolete zero-padding discrepancy excluded');
    check(correction?.receipt_sha256 === OBSERVATION_CORRECTION_SHA && correction.printing_id === row.printing_id && correction.original_sha256 === row.objects[0].sha256 && correction.previous_observed_dex === '082' && correction.correct_observed_dex === '0082' && correction.numeric_national_dex === 82 && correction.printed_collector_number === null && correction.canonical_metadata_changes === 0 && correction.original_byte_changes === 0 && correction.historical_source_handoff_preserved_sha256 === ORIGINAL_HANDOFF_SHA, 'Exact root observation correction and immutable source history required');
  } else check(body.inline_glyph_resolution === null, 'Inline glyph exception outside Magneton');
  const rights = e.source_rights;
  const noSeparateAttributionOnVoltorb = row.printing_id === 'c732f0af-7106-4b09-b2df-77e6fadac5b6' && row.collector_number === '21' && rights.source_attribution.length === 0 && rights.artwork_specific_rights_tag === 'This image is from the official database of card images. The contributor claims this to be fair use .';
  check(rights.owner_website_permission_attested === true && rights.generic_footer_licence_is_not_artwork_licence === true && rights.artwork_specific_rights_tag.includes('fair use') && (rights.source_attribution.length > 0 || noSeparateAttributionOnVoltorb), 'Owner permission and per-file rights/attribution required');
  for (const field of ['vendor_licence_verified', 'underlying_copyright_licence_verified', 'sourcewide_approval']) check(rights[field] === false, `Unsupported rights claim: ${field}`);
  check(e.exact_finish_verified === false && e.vendor_licence_verified === false && e.physical_edition_verified === false && e.identity_checks.printedCollectorOpticallyVerified === false && e.identity_checks.canonicalAliasIsInternalOnly === true, 'Unsupported printed-number/edition/finish claim');
  check(e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false && e.owner_business_decision.vendor_licence_verified === false, 'Finite owner decision scope changed');
  check(digest(Buffer.from(JSON.stringify(e))) === expected.evidence_sha256, 'Frozen inspected evidence changed');
}

export function validateRows(plan, table) {
  check(rowsSize(plan.rows) === FRONTS && table.length === FRONTS && isDeepStrictEqual(plan.source_counts, { bulbapedia: FRONTS }), 'Wrong exact source cohort');
  check(isDeepStrictEqual(plan.rows.map(row => row.collector_number).sort(), [...ACCEPTED_ALIASES].sort()), 'Accepted aliases changed');
  check(isDeepStrictEqual(plan.delivery_scope, { batches: ['EN-CARDS-006', 'EN-CARDS-007'], saved_batch_tasks: 34, eligible_fronts: 15, held_captured_originals: 9, excluded_ambiguous_targets: 10, accepted_aliases: ACCEPTED_ALIASES, whole_batch_completion_asserted: false }), 'Fixed partial-batch delivery scope changed');
  for (const row of plan.rows) {
    const expected = table.find(target => target.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen source identity changed');
    check(row.set_id === SET_ID && row.set_code === 'mfb' && row.language_code === 'en' && row.catalogue_version_id === CATALOGUE_VERSION && row.source_code === 'bulbapedia' && ['EN-CARDS-006', 'EN-CARDS-007'].includes(row.batch_id), 'Only exact English My First Battle targets supported');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid canonical identity');
    check(row.variant_ids.length === 1 && uuid.test(row.variant_ids[0]) && row.image_url.startsWith('https://archives.bulbagarden.net/media/upload/') && row.provider_id.startsWith('File:'), 'Invalid observed source or singleton variant');
    check(row.objects.length === 4 && row.objects.every((object, i) => object.role === roles[i]), 'Original and three derivatives required');
    const original = row.objects[0];
    check(original.sha256 === expected.original_sha256 && original.width === expected.original_width && original.height === expected.original_height && original.width >= 360 && original.height >= 504, 'Inspected original hash/dimensions changed');
    for (const object of row.objects) {
      const extension = object.role === 'original' ? 'jpg' : 'webp';
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0, 'Invalid bounded object');
      check(object.mime_type === (extension === 'jpg' ? 'image/jpeg' : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path/MIME changed');
      check(object.width <= original.width && object.height <= original.height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateEvidence(row, expected);
  }
  check(indexObjects(plan.rows).size === 60 && new Set(plan.rows.flatMap(row => row.variant_ids)).size === FRONTS, 'Duplicate immutable images or variants');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === FRONTS && new Set(bindings.map(card => card.variant_id)).size === FRONTS, 'Wrong binding cohort');
    for (const row of plan.rows) {
      const card = bindings.find(candidate => candidate.printing_id === row.printing_id);
      check(card && card.variant_id === row.variant_ids[0] && card.variant_code === 'normal' && card.finish_code === 'normal' && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null, 'Current normal singleton binding changed');
      for (const field of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 1 }), 'Scoped metadata counts changed');
  }
  check(isDeepStrictEqual(plan.binding_expectations.production, plan.binding_expectations.staging), 'English environment bindings differ');
  assertNoConflictingFronts(plan.rows);
  return plan.rows;
}
const rowsSize = rows => rows.length === new Set(rows.map(row => row.printing_id)).size ? rows.length : -1;

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen MFB15 plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && plan.original_handoff_sha256 === ORIGINAL_HANDOFF_SHA && plan.finite_decision_sha256 === FINITE_DECISION_SHA && plan.owner_permission_attestation_sha256 === OWNER_PERMISSION_SHA && plan.magneton_inline_glyph_sha256 === MAGNETON_GLYPH_SHA, 'Frozen source/decision identity changed');
  check(plan.metadata_revision === 2 && plan.observation_correction_sha256 === OBSERVATION_CORRECTION_SHA, 'Current corrected observation revision required');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 64, 'Frozen archive changed');
  check(isDeepStrictEqual(plan.archive_metadata.map(member => member.file), METADATA_FILES) && plan.archive_metadata.every(member => /^[a-f0-9]{64}$/u.test(member.sha256) && member.byte_size > 0 && member.byte_size < 12000000), 'Four frozen metadata members required');
  validateRows(plan, table); validateSourcePlan(plan); return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'en' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && approval.underlying_copyright_licence_verified === false && approval.owner_website_permission_attested === true && approval.approved_at === '2026-10-14' && approval.finite_decision_sha256 === FINITE_DECISION_SHA && approval.owner_permission_attestation_sha256 === OWNER_PERMISSION_SHA && isDeepStrictEqual(approval.source_counts, { bulbapedia: FRONTS }), 'Wrong exact finite owner decision');
  check(approval.metadata_revision === 2 && approval.observation_correction_sha256 === OBSERVATION_CORRECTION_SHA, 'Corrected observation revision required for current finite decision');
  return approval;
}

export async function loadFrozen() {
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: 45, object_references: 60, unique_image_members: 60, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
