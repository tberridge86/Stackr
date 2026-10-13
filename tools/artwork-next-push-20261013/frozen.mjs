import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';

export const COHORT_SHA = '0a0417e1afbfb0176ef8ac55b184247efd3b255711e2f3e2497cd22a15313b6a';
export const APPROVAL_SHA = 'f3cbadd0500e69947534216038818e460af8001147a1f37b30505b3c7421c042';
export const ARCHIVE_SHA = 'de494b5c6a98b462db09738034df10c7deef226f552283354008dd9cf1056fd7';
export const ARCHIVE_ID = 637933079;
export const ARCHIVE_BYTES = 5828179;
export const DECISION = 'owner_authorised_exact_cohort_business_decision';
export const BINDING_FIELDS = ['game_code', 'language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'variant_id', 'variant_code', 'finish_code', 'same_artwork_as_variant_id', 'catalogue_version_id'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
export const selectFields = (row, fields) => Object.fromEntries(fields.map(key => [key, row[key]]));
export const sortedBindings = rows => rows.map(row => selectFields(row, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id));

export function validateRows(plan) {
  const { rows } = plan;
  check(rows.length === 10 && new Set(rows.map(r => r.printing_id)).size === 10, 'Wrong ten-printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 9, pokemon_tcg_api: 1 }), 'Source counts changed');
  for (const r of rows) {
    check(r.language_code === 'en', 'English front required');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(r[key]), 'Invalid printing identity');
    check(r.variant_ids.length > 0 && r.variant_ids.every(id => uuid.test(id)), 'Invalid variant identity');
    const expectedUrl = r.source_code === 'scrydex'
      ? `https://images.scrydex.com/pokemon/${r.provider_id}/large`
      : 'https://images.pokemontcg.io/cel25c/93_A_hires.png';
    check(['scrydex', 'pokemon_tcg_api'].includes(r.source_code) && r.image_url === expectedUrl, 'Source URL changed');
    const permitted = r.set_code === 'B1a'
      ? r.collector_number === '088' && r.card_native_name === 'Oddish' && r.provider_id === 'tcgp-B1a-88' && r.source_code === 'scrydex'
      : r.set_code === 'cel25cc'
        ? r.collector_number === 'CC014' && r.card_native_name === 'Gardevoir ex' && r.provider_id === 'cel25c-93_A' && r.source_code === 'pokemon_tcg_api'
        : r.set_code === 'mee' && /^00[1-8]$/u.test(r.collector_number) && r.provider_id === `mee-${Number(r.collector_number)}` && r.source_code === 'scrydex';
    check(permitted, 'Unbounded printing or provider identity');
    const e = r.evidence;
    check(e.source_url === r.image_url && e.provider_id === r.provider_id && e.artwork_scope === 'printing_front', 'Source evidence changed');
    check(e.exact_finish_verified === false && e.vendor_licence_verified === false && e.identity_checks.physicalFinishVerified === false, 'Unsupported finish or vendor licence claim');
    check(e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false && e.owner_business_decision.vendor_licence_verified === false, 'Owner decision scope changed');
    if (r.set_code === 'cel25cc') {
      check(e.collector_alias.catalogueReference === 'CC014' && e.collector_alias.printedReference === '93/101' && e.pixel_identity.catalogueCollectorAlias === 'CC014' && e.pixel_identity.printedCollectorNumber === '93' && e.pixel_identity.printedDenominator === '101' && e.pixel_identity.observedTitle === 'Gardevoir ex δ DELTA SPECIES' && e.pixel_identity.artist === 'Masahiko Ishii' && e.pixel_identity.ability === 'Imprison' && e.pixel_identity.attack === 'Flame Ball80' && e.pixel_identity.aliasBinding.includes('250331'), 'Gardevoir printed alias evidence changed');
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
  check(rows.filter(r => r.source_code === 'scrydex').length === 9 && rows.filter(r => r.source_code === 'pokemon_tcg_api').length === 1, 'Wrong provenance distribution');
  check(new Set(rows.flatMap(r => r.variant_ids)).size === 18, 'Wrong eighteen-variant scope');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === 18 && new Set(bindings.map(c => c.variant_id)).size === 18, 'Wrong binding cohort');
    for (const r of rows) {
      const found = bindings.filter(c => c.printing_id === r.printing_id);
      check(isDeepStrictEqual(found.map(c => c.variant_id).sort(), [...r.variant_ids].sort()), 'Variant binding changed');
      for (const c of found) {
        check(c.game_code === 'pokemon' && c.same_artwork_as_variant_id === null, 'Wrong game or artwork reference');
        for (const key of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(c[key] === r[key], `Frozen binding changed: ${key}`);
      }
    }
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes) {
  check(digest(bytes) === COHORT_SHA, 'Frozen ten-front plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === 'STACKR-EN-FRONTS-20261013-010', 'Wrong queue');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 43, 'Frozen archive changed');
  validateRows(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const a = JSON.parse(bytes);
  check(a.approved === true && a.store_resize_display === true && a.fronts === 10 && a.cohort_sha256 === COHORT_SHA && a.language_code === 'en' && a.decision_type === DECISION && a.source_wide_approval === false && a.human_review_required === false && a.vendor_licence_verified === false && a.owner_instructions.length === 3 && a.approved_at === '2026-10-13', 'Wrong owner business decision');
  return a;
}

export async function loadFrozen() {
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)));
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: 10, derivative_references: 30, object_references: 40, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt };
}
