// Offline-only preparation of one reviewed, exact eligible source handoff.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION, IDENTITY_FIELDS, validateSavedTargets, CORRECTED_PRINTINGS, indexObjects } from './frozen.mjs';

const root = process.argv[2];
check(root, 'Authoritative local handoff directory required');
const inputsBytes = await readFile(new URL('./freeze-inputs.json', import.meta.url));
// Assigned after the coordinator's source/quality classification and archive.
check(digest(inputsBytes) === '5d5ee0a5485c432a63e66b5c6bcf996fa5f518cfd68f690abb484e7b7ac11c5c', 'Frozen final input descriptor changed');
const inputs = JSON.parse(inputsBytes);
const sourceBytes = await readFile(`${root}/${inputs.source_manifest_file}`);
check(digest(sourceBytes) === inputs.source_manifest_sha256, 'Authoritative source manifest changed');
const source = JSON.parse(sourceBytes);
const checkedBytes = await readFile(`${root}/${inputs.checked_handoff_file}`);
check(digest(checkedBytes) === inputs.checked_handoff_sha256, 'Checked source/quality handoff changed');
const checked = JSON.parse(checkedBytes);
const fronts = inputs.eligible_fronts;
check(fronts === 32 && source.entries.length === fronts, 'Exact original32 handoff size changed');
check(checked.productionQueueEligibleCount === fronts && checked.rows.length === fronts && new Set(checked.rows.map(row => row.printingId)).size === fronts && checked.sourceContentHoldCount === 0 && checked.rows.every(row => row.productionReady === true && row.preparedForRootQueue === true), 'Corrected original32 source scope changed');
const addendumBytes = await readFile(`${root}/${inputs.correction_addendum_file}`);
check(digest(addendumBytes) === inputs.correction_addendum_sha256, 'Independent inspection correction addendum changed');
const addendum = JSON.parse(addendumBytes);
const previousBytes = await readFile(`${root}/source-batches/receipts/en025-en027-checked-handoff-20261013T211138665029Z.json`);
check(digest(previousBytes) === 'ed842aa232e667a5c2322991870c5dc7a7451f42304109bb10319e65843ed3c7' && addendum.supersededFrozenHandoff.sha256 === digest(previousBytes) && addendum.supersededFrozenHandoff.fileUnchanged === true && addendum.originalHashesUnchanged === true && addendum.sourceMetadataAndCanonicalBindingsUnchanged === true && addendum.physicalPrintingErrorEstablished === false && addendum.providerMetadataErrorEstablished === false && addendum.sourceContentHoldsRemaining === 0, 'Missing immutable previous evidence or unsupported card/source correction');
const previous = JSON.parse(previousBytes);
const corrections = CORRECTED_PRINTINGS.map(expected => {
  const row = checked.rows.find(candidate => candidate.printingId === expected.printing_id);
  const independent = addendum.rows.find(candidate => candidate.printingId === expected.printing_id);
  const prior = previous.rows.find(candidate => candidate.printingId === expected.printing_id);
  const attack = row.pixelObservations.attacks.find(candidate => candidate.name === 'Take Down');
  const sourceAttack = row.sourceAttacks.find(candidate => candidate.name === 'Take Down');
  check(independent && isDeepStrictEqual(independent.pixelObservations, row.pixelObservations) && row.contentSha256 === expected.sha256 && independent.contentSha256 === expected.sha256 && prior.contentSha256 === expected.sha256 && prior.pixelObservations.attacks.find(candidate => candidate.name === 'Take Down').damage === null && row.priorSourceContentHoldSuperseded === true && row.pixelIdentityCheck === 'passed_independent_original_recheck' && attack.damage === '40' && sourceAttack.damage === '40' && isDeepStrictEqual(attack.cost, ['Fighting', 'Fighting']) && /10 damage to itself/iu.test(attack.text), 'Former blank-damage assertion or absent independent correction');
  return { ...expected, variant_id: row.canonicalRegularVariant.variant_id, set_code: row.setCode, collector_number: row.catalogueCollectorReference, provider_id: row.sourceProviderId, width: row.width, height: row.height, previous_damage_observation: null, observed_attack_damage: attack.damage, observed_attack_cost: attack.cost, observed_attack_text: attack.text, source_attack_damage: sourceAttack.damage, reading_error_corrected: row.priorSourceContentHoldSuperseded, provider_metadata_error_established: row.providerMetadataErrorEstablished, physical_printing_error_established: row.physicalPrintingErrorEstablished, original_pixels_modified: row.originalPixelsModified, canonical_metadata_changed: row.canonicalMetadataChanged, pixel_identity_sha256: digest(Buffer.from(JSON.stringify(row.pixelObservations))) };
});
const correctionBytes = Buffer.from(JSON.stringify({ addendum_sha256: digest(addendumBytes), checked_handoff_sha256: digest(checkedBytes), superseded_observation_receipt_sha256: digest(previousBytes), corrections }, null, 2) + '\n');
const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
const saved = validateSavedTargets(savedBytes);
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const snapshot = JSON.parse(await readFile(`${root}/publish-review/${inputs.binding_prefix}-${environment}-bindings.json`));
  check(snapshot.length === 1 && snapshot[0].snapshot.cards.length === fronts, 'Wrong current binding scope');
  snapshots[environment] = snapshot[0].snapshot;
}
const archive = inputs.archive;
const rows = source.entries.map(entry => {
  const previous = saved.find(target => target.printing_id === entry.printing_id);
  check(previous && isDeepStrictEqual(previous.variant_ids, entry.variant_ids), 'Source outside original saved target scope');
  const inspected = checked.rows.find(row => row.printingId === entry.printing_id);
  const rechecked = CORRECTED_PRINTINGS.some(row => row.printing_id === entry.printing_id);
  check(inspected?.currentCanonicalIdentityMatched === true && inspected.sourceMetadataIdentityVerified === true && inspected.sourceMetadataHashVerified === true && inspected.exactCardFrontSupported === true && inspected.productionReady === true && inspected.preparedForRootQueue === true && inspected.pixelIdentityCheck === (rechecked ? 'passed_independent_original_recheck' : 'passed_agent_original_inspection') && inspected.selectedSourceVariant === 'normal' && inspected.canonicalRegularVariant.finish_code === 'normal' && inspected.canonicalRegularVariant.variant_code === 'normal', 'Missing checked normal-front source eligibility');
  check(inspected.originalPixelsModified === false && inspected.upscaled === false && inspected.generatedArtwork === false && inspected.stampedSourceAlternativesSelected === false && inspected.exactFinishVerified === false && inspected.independentSourceLicenceEstablished === false && inspected.sourceContentDiscrepancies.length === 0 && inspected.providerMetadataErrorEstablished === false && inspected.physicalPrintingErrorEstablished === false, 'Unsupported original, content, stamped substitute, finish or licence claim');
  const pixels = { ...inspected.pixelObservations };
  delete pixels.delegatedPixelReceipt; // Private local path; retain its digest.
  check(isDeepStrictEqual(entry.pixel_identity, pixels) && entry.source_metadata_sha256 === inspected.sourceMetadataSha256 && entry.objects[0].sha256 === inspected.contentSha256 && entry.collector_alias_evidence === inspected.collectorAliasEvidence && entry.provider_id === inspected.sourceProviderId && entry.product_reference_used_for_binding === false, 'Manifest differs from actual inspected source evidence');
  for (const environment of ['production', 'staging']) {
    const found = snapshots[environment].cards.filter(card => card.printing_id === entry.printing_id);
    check(isDeepStrictEqual(found.map(card => card.variant_id).sort(), [...entry.variant_ids].sort()), 'Current variants differ from source manifest');
    for (const card of found) {
      check(card.finish_code === 'normal' && card.variant_code === 'normal', 'Unsupported current normal-front finish');
      for (const field of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[field] === entry[field] && entry[field] === previous[field], `Source/current/saved binding changed: ${field}`);
    }
  }
  check(entry.objects[0].width >= 576 && entry.objects[0].height >= 800, 'Undersized research original excluded from preparation');
  return {
    ...selectFields(entry, IDENTITY_FIELDS),
    objects: entry.objects.map(object => ({ ...object, artifact_id: archive.id })),
    evidence: {
      source_url: entry.image_url, source_page_url: entry.source_page_url, provider_id: entry.provider_id,
      source_metadata_sha256: entry.source_metadata_sha256, collector_alias_evidence: entry.collector_alias_evidence,
      product_scope: entry.product_scope, pixel_identity: entry.pixel_identity,
      product_reference_used_for_binding: entry.product_reference_used_for_binding,
      stamped_source_alternatives_selected: inspected.stampedSourceAlternativesSelected,
      ...(rechecked ? { inspection_correction_sha256: digest(correctionBytes), provider_metadata_error_established: inspected.providerMetadataErrorEstablished, physical_printing_error_established: inspected.physicalPrintingErrorEstablished } : {}),
      cross_deck_reference_conflicts: entry.cross_deck_reference_conflicts,
      source_metadata_content_discrepancies: entry.source_metadata_content_discrepancies,
      identity_checks: { savedMetadataMatched: true, currentProductionCardBindingMatched: true, physicalFinishVerified: false, printedCollectorOpticallyVerified: true },
      source_kind: entry.source_kind, artwork_scope: 'printing_front', exact_finish_verified: false, vendor_licence_verified: false,
      source_licence_facts: entry.source_licence_facts,
      owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false },
    },
  };
});
check(archive.file_count === indexObjects(rows).size + 3, 'Wrong unique archive member count');
const existing = snapshots.production.sources.map(policy => selectFields(policy, SOURCE_FIELDS));
check(existing.length === 1 && existing[0].code === 'scrydex' && !(snapshots.staging.sources?.length), 'Existing source policy scope changed');
const table = source.entries.map(entry => ({
  ...selectFields(entry, IDENTITY_FIELDS), source_metadata_sha256: entry.source_metadata_sha256,
  collector_alias_evidence: entry.collector_alias_evidence,
  printed_numerator: entry.pixel_identity.printedNumerator, printed_denominator: entry.pixel_identity.printedDenominator,
  printed_collector: entry.pixel_identity.printedCollectorNumber, deck_symbol: entry.pixel_identity.deckSymbol,
  printed_name: entry.pixel_identity.printedName, copyright_year: entry.pixel_identity.copyrightYear,
  energy_type_symbol: entry.pixel_identity.energyTypeSymbol ?? null,
  pixel_identity_sha256: digest(Buffer.from(JSON.stringify(entry.pixel_identity))),
  original_sha256: entry.objects[0].sha256, original_width: entry.objects[0].width, original_height: entry.objects[0].height,
})).sort((a, b) => a.printing_id.localeCompare(b.printing_id));
const tableBytes = Buffer.from(JSON.stringify(table, null, 2) + '\n');
const scope = { printings: fronts, variants: fronts, names: fronts * 2, sets: 2 };
const plan = {
  schemaVersion: 1, queue_id: source.queue_id, source_manifest_sha256: digest(sourceBytes), checked_handoff_sha256: digest(checkedBytes), correction_addendum_sha256: digest(addendumBytes), saved_targets_sha256: digest(savedBytes), identity_table_sha256: digest(tableBytes), inspection_correction_sha256: digest(correctionBytes), archive, rows,
  source_counts: source.source_counts,
  delivery_scope: { original_saved_targets: 32, eligible_fronts: fronts, excluded_targets: 32 - fronts, whole_batch_completion_asserted: false },
  binding_expectations: Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(card => selectFields(card, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))])),
  scope_counts: { production: scope, staging: scope },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [], staging: existing },
};
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const previousDecision = JSON.parse(await readFile(new URL('../artwork-next-push-20261013/approval.json', import.meta.url)));
const approval = { ...previousDecision, fronts, cohort_sha256: digest(planBytes), source_counts: source.source_counts, scope: `Store, resize and display exactly these ${fronts} verified Latios trainer-kit source originals and ${fronts * 3} derivative references. All original 32 saved target identities remain fixed. The two earlier Rhyhorn reading errors are superseded by pinned independent inspection of unchanged originals, confirming printed Take Down40. The unpublished30 cohort remains preserved as history. Per-printing source aliases, original hashes, actual pixel observations and minimum detail dimensions are frozen. No card/source defect, canonical metadata/pricing repair, production source insertion, source-wide activation or per-batch human review is asserted. Independent vendor licence and physical foil certification remain unestablished.` };
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
await writeFile(new URL('./identity-table.json', import.meta.url), tableBytes);
await writeFile(new URL('./plan.json', import.meta.url), planBytes);
await writeFile(new URL('./approval.json', import.meta.url), approvalBytes);
await writeFile(new URL('./inspection-correction.json', import.meta.url), correctionBytes);
const wanted = rows.map(row => `'${row.printing_id}'::uuid`).join(',');
const beforeQuery = `-- Read-only before/after evidence for the frozen eligible Latios subset.\n-- Keep full returned metadata private, outside public workflow artifacts.\nBEGIN READ ONLY;\nSET LOCAL statement_timeout = '20s';\nWITH wanted AS (SELECT unnest(ARRAY[${wanted}]::uuid[]) AS id),\np AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),\nv AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT ${fronts + 1}),\nn AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT ${fronts * 2 + 1}),\na AS MATERIALIZED (\n SELECT * FROM catalog.assets\n WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)\n OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201\n),\nl AS MATERIALIZED (\n SELECT * FROM catalog.catalogue_version_assets\n WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)\n OR asset_id IN (SELECT id FROM a)\n OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201\n)\nSELECT 'printings' AS scope,id::text AS identity,to_jsonb(p) AS payload FROM p\nUNION ALL SELECT 'variants',id::text,to_jsonb(v) FROM v\nUNION ALL SELECT 'names',id::text,to_jsonb(n) FROM n\nUNION ALL SELECT 'sets',s.id::text,to_jsonb(s) FROM catalog.sets s WHERE id IN (SELECT set_id FROM p)\nUNION ALL SELECT 'assets',a.id::text,to_jsonb(a) FROM a\nUNION ALL SELECT 'links',l.catalogue_version_id::text||':'||l.asset_id::text,to_jsonb(l) FROM l\nUNION ALL SELECT 'sources',s.id::text,to_jsonb(s) FROM ingest.sources s WHERE code='scrydex'\nORDER BY scope,identity;\nROLLBACK;\n`;
await writeFile(new URL('./before-query.sql', import.meta.url), beforeQuery);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), IDENTITY_TABLE_SHA: digest(tableBytes), INSPECTION_CORRECTION_SHA: digest(correctionBytes), ARCHIVE_SHA: archive.sha256, ARCHIVE_ID: archive.id, ARCHIVE_BYTES: archive.byte_size, FRONTS: fronts, QUEUE_ID: source.queue_id })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${typeof value === 'number' ? value : `'${value}'`};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = "[^"]+"/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ cohort_sha256: digest(planBytes), approval_sha256: digest(approvalBytes), identity_table_sha256: digest(tableBytes), archive_id: archive.id, fronts, derivative_references: fronts * 3, database_requests: 0, network_requests: 0 }));
