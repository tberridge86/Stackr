import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, sortedBindings } from '../artwork-next-push-20261013/frozen.mjs';
export { SOURCE_FIELDS, DECISION } from '../artwork-followup-push-20261013/frozen.mjs';
import { SOURCE_FIELDS, DECISION } from '../artwork-followup-push-20261013/frozen.mjs';

// Execution remains blocked until final source inspection and packaging agree.
export const COHORT_SHA = '3bcd61083e3be105e2cb1480d4e5ae7d3d64199fc287a05de372be8c25e5d4fb';
export const APPROVAL_SHA = 'fc62fbe643b43d1c94029a0f6cd5da525d10c893c957d4c8ebcc4a0383bf8647';
export const ARCHIVE_SHA = 'ef56173edc2e4a097b9115d0a76284393b1f07a0c9e7f81d18e5ef116a920471';
export const ARCHIVE_ID = 638073079;
export const ARCHIVE_BYTES = 42961975;
export const FRONTS = 48;
export const VARIANTS = 48;
export const OBJECTS = 192;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-048';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const SET_SCOPE = {
  'tk-dp-l': { provider: 'tk3b', max: 11, denominator: 11, batch: 'EN-CARDS-013' },
  'tk-dp-m': { provider: 'tk3a', max: 12, denominator: 12, batch: 'EN-CARDS-014' },
  'tk-hs-g': { provider: 'tk4b', max: 25, denominator: 30, batch: 'EN-CARDS-015' },
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

export function validateRows(plan) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(r => r.printing_id)).size === FRONTS, 'Wrong forty-eight-printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 48 }), 'Source counts changed');
  for (const [set, scope] of Object.entries(SET_SCOPE)) {
    const found = rows.filter(r => r.set_code === set);
    check(found.length === scope.max && new Set(found.map(r => r.collector_number)).size === scope.max, 'Trainer-kit set/collector scope changed');
  }
  for (const r of rows) {
    check(r.language_code === 'en' && r.source_code === 'scrydex', 'English Scrydex front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(r[key]), 'Invalid printing identity');
    check(r.variant_ids.length === 1 && uuid.test(r.variant_ids[0]), 'Invalid singleton variant identity');
    const scope = SET_SCOPE[r.set_code];
    const n = Number(r.collector_number);
    check(scope && /^[1-9][0-9]?$/u.test(r.collector_number) && n <= scope.max && r.provider_id === `${scope.provider}-${n}` && r.batch_id === scope.batch, 'Unbounded printing or provider identity');
    check(r.image_url === `https://images.scrydex.com/pokemon/${r.provider_id}/large`, 'Source URL changed');
    const e = r.evidence;
    check(e.source_url === r.image_url && e.provider_id === r.provider_id && e.artwork_scope === 'printing_front', 'Source evidence changed');
    check(/^[a-f0-9]{64}$/u.test(e.source_metadata_sha256) && e.collector_alias_evidence.includes(`printed ${n}/${scope.denominator}`), 'Source metadata hash or collector alias evidence changed');
    check(e.exact_finish_verified === false && e.vendor_licence_verified === false && e.identity_checks.physicalFinishVerified === false, 'Unsupported finish or vendor licence claim');
    check(e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false && e.owner_business_decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const p = e.pixel_identity;
    check(p.language === 'English' && p.printedNumerator === n && p.printedDenominator === scope.denominator && p.printedCollectorNumber === `${n}/${scope.denominator}` && p.catalogueCollectorAlias === r.collector_number && p.printedFooterMatched === true && p.nameMatched === true && p.completePrintedFaceAndFrameVisible === true && p.outerPhysicalCornerGeometryCertified === false && p.stampedEditionSubstituted === false && p.materialFoilFinishCertified === false, 'Printed trainer-kit face evidence changed');
    check(r.objects.length === 4 && r.objects.every((o, i) => o.role === roles[i]), 'Incomplete original and derivatives');
    check(r.objects[0].width === 598 && r.objects[0].height === 823, 'Original trainer-kit dimensions changed');
    for (const o of r.objects) {
      check(o.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(o.sha256) && Number.isInteger(o.byte_size) && o.byte_size > 0 && o.byte_size < 12000000 && Number.isInteger(o.width) && Number.isInteger(o.height) && o.width > 0 && o.height > 0, 'Invalid bounded image evidence');
      const extension = o.role === 'original' ? 'png' : 'webp';
      check(o.mime_type === `image/${extension}` && o.file === `objects/${o.sha256}/${o.role}.${extension}`, 'Object path or MIME changed');
      check(o.width <= r.objects[0].width && o.height <= r.objects[0].height, 'Upscaled derivative');
      safePath('/packages', `${o.artifact_id}/${o.file}`);
    }
  }
  check(new Set(rows.flatMap(r => r.variant_ids)).size === VARIANTS, 'Wrong forty-eight-variant scope');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === VARIANTS && new Set(bindings.map(c => c.variant_id)).size === VARIANTS, 'Wrong binding cohort');
    for (const r of rows) {
      const found = bindings.filter(c => c.printing_id === r.printing_id);
      check(found.length === 1 && found[0].variant_id === r.variant_ids[0], 'Variant binding changed');
      const card = found[0];
      check(card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null, 'Wrong game or artwork reference');
      for (const key of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[key] === r[key], `Frozen binding changed: ${key}`);
    }
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: 48, variants: 48, names: 96, sets: 3 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validateSourcePlan(plan) {
  const production = plan.source_policies.production;
  check(production.length === 1 && production[0].code === 'scrydex' && plan.source_policies.staging.length === 0, 'Existing provenance scope changed');
  check(plan.new_sources.production.length === 0 && isDeepStrictEqual(plan.new_sources.staging, production), 'Staging-only provenance fixture changed');
  const source = production[0];
  check(isDeepStrictEqual(Object.keys(source).sort(), [...SOURCE_FIELDS].sort()), 'Unbounded source policy fields');
  check(source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null && source.source_type === 'image' && source.base_url === 'https://scrydex.com', 'Unsupported source activation or licence');
}

export function validatePlan(bytes) {
  check(digest(bytes) === COHORT_SHA, 'Frozen forty-eight-front plan bytes changed');
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
