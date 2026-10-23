import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath } from '../artwork3303-publish-20260928/publish.mjs';
import { createMetadataGuard } from './metadata-guard.mjs';
import { assertSourceUrl, ARTIFACT_ID } from './prepare.mjs';

export const COHORT_SHA = '6bc2f65a7826ba623c8e0e1f8a6d0ea46e4db3e24a4e7c582543b14d6c313dc7';
export const APPROVAL_SHA = 'b4f9942eb8ceadc8190f306d0193913f213f7fc785df7044a77036e6df259fb7';
export const SOURCE_EVIDENCE_SHA = '964e632a7daa5e914692d1bb64d17347ce10c0743816ef44d3a4b2958c1b7fec';
export const FRONTS = 71;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const extensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export function validateRows(plan, sourceEvidence) {
  check(plan.queue_id === 'JAPANESE-ARTWORK-71-20261023' && plan.fronts === FRONTS && plan.rows.length === FRONTS && new Set(plan.rows.map(row => row.printing_id)).size === FRONTS, 'Exactly71 frozen Japanese printing fronts required');
  check(sourceEvidence.fronts === FRONTS && sourceEvidence.cards.length === FRONTS && new Set(sourceEvidence.cards.map(card => card.printingId)).size === FRONTS && plan.source_evidence_sha256 === SOURCE_EVIDENCE_SHA && sourceEvidence.retainedOriginalBytesUnaltered === true && sourceEvidence.databaseWritesInSourceReview === 0, 'Finite reviewed source evidence required');
  for (const row of plan.rows) {
    const source = sourceEvidence.cards.find(card => card.printingId === row.printing_id);
    check(source && UUID.test(row.printing_id) && UUID.test(row.set_id) && row.language_code === 'ja' && row.source_code === 'tcgcollector', 'Finite Japanese source/printing scope changed');
    check(row.set_id === source.setId && row.set_code === source.setCode && row.collector_number === source.canonicalCollectorNumber && row.card_native_name === source.canonicalNativeNameUnchanged && row.image_url === source.sourceImageUrl, 'Reviewed source identity changed');
    assertSourceUrl(row.image_url);
    check(source.nativeFullFrontVisuallyVerified === true && source.visibleEdition === 'unstamped' && source.visibleWatermark === false, 'Only reviewed unstamped complete native fronts may publish');
    const evidence = row.evidence;
    check(evidence.source_evidence_sha256 === SOURCE_EVIDENCE_SHA && evidence.source_card_page_url === source.sourceCardPageUrl && evidence.source_set_page_url === source.sourceSetUrl && evidence.source_set_page_sha256 === source.sourceSetPageSha256, 'Source page evidence changed');
    check(evidence.artwork_scope === 'printing_front' && evidence.delivery_kind === 'shared' && evidence.asset_variant_id === null && evidence.source_variant_id === null && evidence.source_original_bytes_unaltered === true && evidence.native_full_front_visually_verified === true && evidence.visible_edition === 'unstamped' && evidence.visible_watermark === false && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false, 'Ordinary printing front cannot certify an edition or finish');
    check(row.objects.length === 4 && isDeepStrictEqual(row.objects.map(object => object.role), roles), 'Original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === source.sourceImageSha256 && isDeepStrictEqual([original.width, original.height], source.dimensions), 'Retained original SHA/dimensions changed');
    for (const object of row.objects) {
      check(SHA.test(object.sha256) && object.artifact_id === ARTIFACT_ID && extensions[object.mime_type] && object.file === `objects/${object.sha256}/${object.role}.${extensions[object.mime_type]}`, 'Frozen content-addressed object required');
      check(Number.isSafeInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12_000_000 && Number.isSafeInteger(object.width) && Number.isSafeInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && (object.role === 'original' || object.mime_type === 'image/webp'), 'Bounded static object without enlargement required');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    const bindings = plan.bindingExpectations.production.filter(card => card.printing_id === row.printing_id);
    check(bindings.length > 0 && isDeepStrictEqual(row.variant_ids, bindings.map(card => card.variant_id).sort()) && bindings.every(card => card.catalogue_version_id === row.catalogue_version_id && card.game_code === 'pokemon' && card.language_code === 'ja' && card.set_id === row.set_id && card.set_code === row.set_code && card.collector_number === row.collector_number && card.card_native_name === row.card_native_name && card.same_artwork_as_variant_id === null), 'Frozen live canonical and variant bindings changed');
  }
  check(plan.production_source_changes_allowed === 0 && plan.ownership_changes_allowed === 0 && plan.pricing_changes_allowed === 0 && plan.catalogue_metadata_changes_allowed === 0 && plan.source_activation === false && plan.physical_finish_verified === false && plan.physical_edition_verified === false, 'Finite artwork-only scope changed');
  assertNoConflictingFronts(plan.rows);
  createMetadataGuard(plan);
  return plan.rows;
}

export function validateApproval(approval) {
  check(approval.approved === true && approval.cohort_sha256 === COHORT_SHA && approval.source_evidence_sha256 === SOURCE_EVIDENCE_SHA && approval.fronts === FRONTS && approval.language_code === 'ja' && isDeepStrictEqual(approval.source_codes, ['tcgcollector']) && approval.store_resize_display === true && approval.decision_type === 'owner_attested_finite_artwork_publication' && approval.approved_at === '2026-10-23' && approval.owner_statement === 'Source and identity checks. I need you to release them now.', 'Exact owner-approved finite publication required');
  check(approval.source_wide_approval === false && approval.source_activation === false && approval.vendor_licence_verified === false && approval.physical_finish_verified === false && approval.physical_edition_verified === false && approval.animation === false && approval.additional_provider_spend === 0, 'Owner scope and source-policy limits changed');
}

export async function loadFrozen() {
  const readFrozen = async (file, expected) => {
    const bytes = await readFile(new URL(file, import.meta.url));
    check(digest(bytes) === expected, `Frozen ${file} bytes changed`);
    return JSON.parse(bytes);
  };
  const plan = await readFrozen('./plan.json', COHORT_SHA);
  const sourceEvidence = await readFrozen('./source-evidence.json', SOURCE_EVIDENCE_SHA);
  const approval = await readFrozen('./approval.json', APPROVAL_SHA);
  const rows = validateRows(plan, sourceEvidence);
  validateApproval(approval);
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, source_evidence_sha256: SOURCE_EVIDENCE_SHA, fronts: FRONTS, object_references: FRONTS * 4, derivative_references: FRONTS * 3, source_counts: { tcgcollector: FRONTS }, original_bytes_unchanged: true, source_wide_approval: false, vendor_licence_verified: false, physical_finish_verified: false, physical_edition_verified: false, artifacts: [{ id: ARTIFACT_ID, kind: 'frozen_literal_sources_and_pinned_derivatives' }] };
  return { plan, rows, approval, receipt };
}
