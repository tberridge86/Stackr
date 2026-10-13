import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, sortedBindings } from '../artwork-next-push-20261013/frozen.mjs';

// Assigned only after the public-safe release package is frozen.
export const COHORT_SHA = '1cf5f02c64dcdda97e5e3fffbaf053e467d3fed554d416750f854cf6acea5e81';
export const APPROVAL_SHA = '8775125627e8e5bcaac94fc5b06e950a10e5eeaac87b3f09eb3e86d6fa7922c8';
export const ARCHIVE_SHA = 'af5cd84113f391caffa0383aab60163820cbc06c56d7bad02f4cadfca015dcaa';
export const ARCHIVE_ID = 638042830;
export const ARCHIVE_BYTES = 53091723;
export const FRONTS = 57;
export const VARIANTS = 81;
export const OBJECTS = 228;
export const QUEUE_ID = 'STACKR-EN-FRONTS-20261013-057';
export const DECISION = 'owner_authorised_exact_cohort_business_decision';
export const SOURCE_CODES = ['scrydex', 'limitless'];
export const SOURCE_COUNTS = { scrydex: 30, limitless: 27 };
export const BATCH_COUNTS = { 'EN-CARDS-008': 1, 'EN-CARDS-009': 25, 'EN-CARDS-010': 2, 'EN-CARDS-011': 24, 'EN-CARDS-012': 5 };
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json'];
export const SOURCE_FIELDS = ['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes', 'deprecated_at'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];

export function validateRows(plan) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(r => r.printing_id)).size === FRONTS, 'Wrong fifty-seven-printing scope');
  check(isDeepStrictEqual(plan.source_counts, SOURCE_COUNTS), 'Source counts changed');
  for (const [batch, count] of Object.entries(BATCH_COUNTS)) check(rows.filter(r => r.batch_id === batch).length === count, 'Frozen batch scope changed');
  for (const r of rows) {
    check(r.language_code === 'en', 'English catalogue front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(r[key]), 'Invalid printing identity');
    check(r.variant_ids.length > 0 && r.variant_ids.every(id => uuid.test(id)), 'Invalid variant identity');
    const n = Number(r.collector_number);
    let permitted = false;
    if (r.set_code === 'miscp') permitted = r.collector_number === '001' && r.card_native_name === 'Ancient Mew' && r.provider_id === 'miscp-1' && r.source_code === 'scrydex' && r.batch_id === 'EN-CARDS-008';
    if (r.set_code === 'P-A') permitted = /^\d{3}$/u.test(r.collector_number) && n >= 74 && n <= 100 && r.provider_id === `P-A/${n}` && r.source_code === 'limitless' && r.batch_id === (n <= 98 ? 'EN-CARDS-009' : 'EN-CARDS-010');
    if (r.set_code === 'sve') permitted = /^\d{3}$/u.test(r.collector_number) && n >= 1 && n <= 24 && r.provider_id === `sve-${n}` && r.source_code === 'scrydex' && r.batch_id === 'EN-CARDS-011';
    if (r.set_code === 'svp') permitted = ['209', '210', '221', '222', '223'].includes(r.collector_number) && r.provider_id === `svp-${n}` && r.source_code === 'scrydex' && r.batch_id === 'EN-CARDS-012';
    check(permitted, 'Unbounded printing or provider identity');
    const expectedUrl = r.source_code === 'scrydex'
      ? `https://images.scrydex.com/pokemon/${r.provider_id}/large`
      : `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/P-A/P-A_${r.collector_number}_EN.png`;
    check(r.image_url === expectedUrl, 'Source URL changed');
    const e = r.evidence;
    check(e.source_url === r.image_url && e.provider_id === r.provider_id && e.artwork_scope === 'printing_front', 'Source evidence changed');
    check(e.exact_finish_verified === false && e.vendor_licence_verified === false && e.identity_checks.physicalFinishVerified === false, 'Unsupported finish or vendor licence claim');
    check(e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false && e.owner_business_decision.vendor_licence_verified === false, 'Owner decision scope changed');
    const p = e.pixel_identity;
    if (r.set_code === 'miscp') {
      check(r.printing_id === 'e2e03892-7792-4195-a3d5-917d3d04ba9d' && r.variant_ids.length === 1 && r.variant_ids[0] === '891a893d-b419-4770-8f65-3bfae843af2a', 'Ancient Mew singleton binding changed');
      check(p.copyrightNintendoSpelling === 'Nintendo, not Nintedo' && p.copyrightWizardsPresent === true && p.copyrightYear2000Present === true && p.printedCollectorNumberPresent === false && p.canonicalEditionMetadataInvented === false && p.sourceImageEditionIdentified === true && e.source_binding_inference.includes('singleton') && e.source_binding_inference.includes('not an asserted canonical physical edition'), 'Ancient Mew source inference changed');
    } else if (r.set_code === 'P-A') {
      check(e.source_page_url === `https://pocket.limitlesstcg.com/cards/P-A/${n}` && p.digitalPocketLayout === true && p.printedSetCollectorNumberPresent === false && p.physicalFoilFinishClaimed === false, 'Pocket digital identity evidence changed');
    } else {
      check(p.printedSetCode === r.set_code.toUpperCase() && p.printedLanguageCode === 'EN' && p.printedCollectorNumber === r.collector_number && p.printedCollectorMatched === true && p.otherStampedEditionSelected === false && p.materialFoilFinishCertified === false, 'Physical printed-front evidence changed');
    }
    check(r.objects.length === 4 && r.objects.every((o, i) => o.role === roles[i]), 'Incomplete original and derivatives');
    for (const o of r.objects) {
      check(o.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(o.sha256) && Number.isInteger(o.byte_size) && o.byte_size > 0 && o.byte_size < 12000000 && Number.isInteger(o.width) && Number.isInteger(o.height) && o.width > 0 && o.height > 0 && o.width <= 1024 && o.height <= 1024, 'Invalid bounded image evidence');
      const extension = o.role === 'original' ? 'png' : 'webp';
      check(o.mime_type === `image/${extension}` && o.file === `objects/${o.sha256}/${o.role}.${extension}`, 'Object path or MIME changed');
      check(o.width <= r.objects[0].width && o.height <= r.objects[0].height, 'Upscaled derivative');
      safePath('/packages', `${o.artifact_id}/${o.file}`);
    }
  }
  for (const [source, count] of Object.entries(SOURCE_COUNTS)) check(rows.filter(r => r.source_code === source).length === count, 'Wrong provenance distribution');
  check(new Set(rows.flatMap(r => r.variant_ids)).size === VARIANTS, 'Wrong eighty-one-variant scope');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === VARIANTS && new Set(bindings.map(c => c.variant_id)).size === VARIANTS, 'Wrong binding cohort');
    for (const r of rows) {
      const found = bindings.filter(c => c.printing_id === r.printing_id);
      check(isDeepStrictEqual(found.map(c => c.variant_id).sort(), [...r.variant_ids].sort()), 'Variant binding changed');
      for (const c of found) {
        check(c.game_code === 'pokemon' && c.same_artwork_as_variant_id === null, 'Wrong game or artwork reference');
        for (const key of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(c[key] === r[key], `Frozen binding changed: ${key}`);
      }
    }
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: 57, variants: 81, names: 162, sets: 4 }), 'Snapshot scope counts changed');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validateSourcePlan(plan) {
  const prod = plan.source_policies.production;
  const stage = plan.source_policies.staging;
  check(prod.length === 1 && prod[0].code === 'scrydex' && stage.length === 0, 'Existing provenance scope changed');
  const newProd = plan.new_sources.production;
  const newStage = plan.new_sources.staging;
  check(newProd.length === 1 && newProd[0].code === 'limitless' && newStage.length === 2, 'New provenance scope changed');
  check(isDeepStrictEqual(newStage.find(s => s.code === 'scrydex'), prod[0]) && isDeepStrictEqual(newStage.find(s => s.code === 'limitless'), newProd[0]), 'Staging provenance fixtures changed');
  for (const s of [...prod, ...newProd]) {
    check(isDeepStrictEqual(Object.keys(s).sort(), [...SOURCE_FIELDS].sort()), 'Unbounded source policy fields');
    check(s.active === false && s.licence_status === 'under_review' && s.attribution_required === true && s.deprecated_at === null && s.source_type === 'image', 'Unsupported source activation or licence');
  }
  check(prod[0].base_url === 'https://scrydex.com' && newProd[0].base_url === 'https://pocket.limitlesstcg.com' && newProd[0].display_name === 'Limitless TCG' && newProd[0].internal_notes === 'Provenance for the exact 27 English Pokemon TCG Pocket Promo-A fronts 074-100 in STACKR-EN-FRONTS-20261013-057. Owner-approved artwork front display only; no independently verified vendor licence and no source-wide acquisition approval.', 'Exact Limitless provenance changed');
}

export function validatePlan(bytes) {
  check(digest(bytes) === COHORT_SHA, 'Frozen fifty-seven-front plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID, 'Wrong queue');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === OBJECTS + METADATA_FILES.length, 'Frozen archive changed');
  validateRows(plan);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const a = JSON.parse(bytes);
  check(a.approved === true && a.store_resize_display === true && a.fronts === FRONTS && a.cohort_sha256 === COHORT_SHA && a.language_code === 'en' && a.decision_type === DECISION && a.source_wide_approval === false && a.human_review_required === false && a.vendor_licence_verified === false && a.owner_instructions.length === 3 && a.approved_at === '2026-10-13', 'Wrong owner business decision');
  return a;
}

export async function loadFrozen() {
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)));
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: FRONTS * 3, object_references: OBJECTS, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt };
}
