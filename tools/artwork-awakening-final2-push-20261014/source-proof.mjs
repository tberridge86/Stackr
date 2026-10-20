// Pure guards for the separately approved Neo3 final-two source schema.
import { isDeepStrictEqual as same } from 'node:util';
import { createHash } from 'node:crypto';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expectedIds = {
  '051': { printing: '6ad6da5c-02cb-45e1-ab7a-2de25855dbf4', variant: 'c563902f-3ed5-41c6-8289-60dbdc121a5b', original: '64ac8b84198f0dcbf4c625edc2f2407f86cdd767d74ee0aa772971fb31bf837b', metadata: 'abad128a0a95f8aee8e052a2aeacf467d504740e2150e12a869fa5f67baa8213', actual: '196595e9da0fe40a0ef379190587adee43510751e39c4001e2304675a7ff6cff' },
  '052': { printing: 'ab2c259c-353a-4317-b075-83f28a24fab2', variant: 'c1935cc0-315e-472d-ac8d-65a2da94674c', original: 'c94cfbe99ed1e5bac2c9464abd9e713b410fe99a00995cc1199419a355a2ff75', metadata: '6ab686ea25a08de83c3c78f25d648d0cd8887b61b9c9b108e6b1399623d1a278', actual: 'd0e9d10dd83625f98bf4ff0a0405daacb3025922e563fdf273f17ade4aaf000b' },
};

export function validateSourceRow(raw, eligible, metadata) {
  const known = expectedIds[raw.canonicalCollectorAlias];
  const capture = raw.sourceMetadataCapture;
  const source = capture.sourceSignature;
  const pixel = raw.pixelObservations;
  const actual = raw.actualPixelSignature;
  check(known && eligible && metadata && raw.printingId === known.printing && raw.variantId === known.variant && eligible.printingId === known.printing && eligible.variantId === known.variant && raw.selectedSourceCardId === `neo3_ja-${Number(raw.canonicalCollectorAlias)}`, 'Source outside the exact approved two identities');
  check(raw.original.sha256 === known.original && eligible.original.sha256 === known.original && capture.sha256 === known.metadata && eligible.sourceMetadataSha256 === known.metadata && raw.actualPixelSignatureSha256 === known.actual && eligible.actualPixelSignatureSha256 === known.actual && canonicalHash(actual) === known.actual, 'Pinned original/source/actual signature changed');
  check(capture.sourceSignatureSha256 === eligible.sourceSignatureSha256 && canonicalHash(source) === eligible.sourceSignatureSha256 && capture.sourceAttackArraySha256 === eligible.sourceAttackArraySha256 && canonicalHash(source.orderedAttacks) === eligible.sourceAttackArraySha256 && same(metadata.sourceSignature, source) && metadata.sourceMetadata.sha256 === known.metadata, 'Raw provider signature and ordered native attacks changed');
  check(raw.batchId === 'JP-CARDS-012' && raw.canonicalSetCode === 'neo3' && raw.canonicalLanguageCode === 'ja' && raw.currentNativeLabelRetained === true && raw.exactCanonicalPokemonSourceMatch === true && raw.quarantineComparisonOnly === false && raw.eligibleSourceOriginalForIndependentReview === true && raw.holds.length === 0, 'Unsupported identity or held comparison');
  check(raw.currentProductionBinding.finish_code === 'holo' && raw.currentProductionBinding.variant_code === 'holo' && raw.currentProductionBinding.same_artwork_as_variant_id === null, 'Exact current holo singleton required');
  const original = raw.original;
  check(original.mimeType === 'image/webp' && original.format === 'WEBP' && original.fullPILDecodePassed === true && original.fullSharpDecodePassed === true && original.sourceBytesUnchanged === true && original.generatedOrUpscaled === false && original.minimumDetailResolution === true && original.hd720x1008 === false && original.width >= 360 && original.height >= 504, 'Readable unchanged original required');
  check(pixel.actualLanguageCode === 'ja' && pixel.fullCardFrontVisible === true && pixel.allFourOuterEdgesVisible === true && pixel.setSymbolObserved === true && pixel.artistReadCertain === true && pixel.editionStampVisible === false && pixel.physicalEditionVerified === false && pixel.physicalFinishVerified === false && pixel.generatedOrUpscaled === false, 'Actual full-front evidence or physical limits changed');
  check(actual.canonicalCollectorAliasNotPrintedNumber === true && actual.editionOrMaterialCertified === false && actual.nativeName === pixel.nativeNameObserved && actual.artist === pixel.artistObserved && actual.hp === pixel.hpObserved && actual.nationalDex === pixel.printedNationalDexObserved && actual.stage === pixel.stageObserved && actual.evolvesFrom === pixel.evolvesFromObserved && actual.retreatSymbols === pixel.retreatSymbolsObserved && actual.nativeAbilityText === pixel.nativeAbilityTextObserved && same(actual.nativeAttackText, pixel.nativeAttackTextObserved), 'Actual pixel signature and body observations diverged');
  check(actual.nativeName === source.nativeName && actual.hp === Number(source.hp) && same(source.nationalDex, [actual.nationalDex]) && actual.artist === source.artist && same(source.subtypes, [actual.stage]) && same(source.evolvesFrom, [actual.evolvesFrom]), 'Provider-to-pixel name/HP/Dex/artist/evolution mismatch');
  check(same(actual.orderedAttackNames, pixel.printedAttackNamesObserved) && same(actual.orderedAttackNames, source.orderedAttacks.map(attack => attack.name)) && same(actual.orderedAttackCosts, pixel.attackCostsObserved) && same(actual.orderedAttackCosts, source.orderedAttacks.map(attack => attack.cost.map(symbol => symbol === '無' ? 'Colorless' : symbol))) && same(actual.orderedAttackDamage, pixel.attackDamageObserved) && same(actual.orderedAttackDamage, source.orderedAttacks.map(attack => attack.damage ?? null)) && same(actual.nativeAttackText, source.orderedAttacks.map(attack => attack.text)) && same(actual.abilityNames, source.abilities.map(ability => ability.name)) && actual.nativeAbilityText === source.abilities[0].text, 'Ordered actual attack/ability body changed');
  if (raw.canonicalCollectorAlias === '051') check(pixel.nonColorlessRestrictionActuallyVisible === true && actual.nativeAbilityText.includes('（「無色」以外）') && actual.retreatSymbols === 1 && raw.providerMetadataDiscrepancies[0]?.type === 'actual_nonColorless_type_restriction', 'Exact Porygon2 non-Colorless restriction required');
  else check(actual.retreatSymbols === 2 && source.convertedRetreatCost === 1 && metadata.tcgMetadata.data.retreat === 2 && raw.providerMetadataDiscrepancies[0]?.actualRetreat === 2 && raw.providerMetadataDiscrepancies[0]?.sourceRetreat === 1, 'Exact Blissey printed retreat exception required');
  check(raw.providerMetadataDiscrepancies.every(item => item.pixelResolution === true && item.canonicalCorrection === false), 'Every provider discrepancy requires actual pixel resolution');
  const support = raw.sourceVariantSupport;
  check(support.currentFinishCode === 'holo' && support.currentVariantCode === 'holo' && same(support.sourceVariantNames, ['holofoil']) && support.supportsCurrentMetadataVariant === true && support.physicalFinishVerified === false && support.globalFrontNotPerVariantProof === true, 'Metadata holo support is not physical certification');
  for (const key of ['vendorLicenceVerified', 'underlyingCopyrightLicenceVerified', 'physicalEditionVerified', 'physicalFinishVerified', 'sourceWideApproval']) check(raw[key] === false, `Unsupported source claim: ${key}`);
  return raw;
}

export function projectQueueControls(raw) {
  const pixel = raw.pixelObservations;
  return {
    pixel_observations: {
      whole_original_inspected: true, full_frame_visible: pixel.fullCardFrontVisible,
      name_number_and_symbol_readable: true, artist_read_certain: pixel.artistReadCertain,
      fine_print_readability: pixel.transcriptionNote,
      copyright_or_date_line_visible: false, copyright_year_inferred: false,
      edition_stamp_visible: false, edition_or_distribution_certified: false,
      material_foil_finish_certified: false, physical_card_or_material_not_observed: true,
      source_image_does_not_certify_physical_finish: true,
      full_native_rules_transcription_claimed: false,
    },
    identity_controls: {
      canonical_alias: raw.canonicalCollectorAlias,
      printed_national_dex: pixel.printedNationalDexObserved,
      canonical_alias_is_not_printed_national_dex: true,
      current_native_label: raw.currentNativeLabel,
      verified_printed_native_name: pixel.nativeNameObserved,
      current_native_label_not_used_for_match: true,
      known_native_label_defect_retained_without_write: raw.currentNativeLabel !== pixel.nativeNameObserved,
      form_letter: null,
    },
    source_qa: {
      actual_japanese_full_front_verified: true, ordered_costs_and_damage_verified: true,
      all_provider_discrepancies_pixel_resolved: true, physical_finish_verified: false,
      source_metadata_sha256: raw.sourceMetadataCapture.sha256,
      original_sha256: raw.original.sha256,
      actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    },
  };
}

export function projectSourceBody(raw, eligible, metadata) {
  validateSourceRow(raw, eligible, metadata);
  return {
    provider_metadata: metadata.sourceMetadata.data, tcgdex_metadata: metadata.tcgMetadata.data,
    source_signature: raw.sourceMetadataCapture.sourceSignature,
    source_signature_sha256: raw.sourceMetadataCapture.sourceSignatureSha256,
    source_attack_array_sha256: raw.sourceMetadataCapture.sourceAttackArraySha256,
    actual_pixel_observations: raw.pixelObservations, actual_pixel_signature: raw.actualPixelSignature,
    actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    original_observation_sha256: raw.originalObservation.sha256,
    provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    source_variant_support: raw.sourceVariantSupport, raw_provider_translations_preserved: true,
    printed_native_body_transcription_note: raw.pixelObservations.transcriptionNote,
    physical_edition_verified: false, physical_finish_verified: false,
    generic_other_rows_may_relax: false, queue_controls: projectQueueControls(raw),
  };
}

export function publicationBody(sourceBody) {
  const body = structuredClone(sourceBody);
  delete body.actual_pixel_observations.path;
  check(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(body)), 'Private local path in public source evidence');
  return body;
}
