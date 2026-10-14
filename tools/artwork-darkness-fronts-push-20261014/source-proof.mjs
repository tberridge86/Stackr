// Pure guards for the exact independently selected Neo4 original fronts.
import { isDeepStrictEqual as same } from 'node:util';
import { createHash } from 'node:crypto';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const comparisonAliases = ['008', '046', '050', '051'];
const completeArtists = { '009': 'K. Hoshiba / CR CG gangs', '012': 'Shin-ichi Yoshikawa / CR CG gangs', '030': 'Jungo Suzuki / CR CG gangs' };

export function validateSourceRow(raw, approved) {
  const source = raw.sourceSignature;
  const actual = raw.actualPixelSignature;
  const pixel = raw.pixelObservations;
  const original = raw.original;
  const alias = raw.canonicalCollectorAlias;
  check(approved && raw.printingId === approved.printingId && raw.variantId === approved.variantId && alias === approved.canonicalCollectorAlias && !['013', '024', '025', '047'].includes(alias), 'Outside the exact approved Darkness subset');
  check(raw.canonicalSetCode === 'neo4' && raw.canonicalLanguageCode === 'ja' && raw.canonicalAliasIsPrintedNumber === false && raw.currentNativeLabelRetained === true && raw.currentNativeLabelUsedForMatch === false && raw.eligibleSourceOriginal === true && raw.sourceIndependentlyAccepted === true, 'Approved Japanese identity and retained labels required');
  check(raw.selectedSourceCardId === approved.independentlySelectedSourceCardId && raw.approvedSourceCardId === approved.independentlySelectedSourceCardId && raw.candidateSourceCardId === approved.candidateSourceCardId && original.sha256 === approved.originalSha256 && original.bytes === approved.originalBytes && original.width === approved.width && original.height === approved.height, 'Pinned selected source/original changed');
  check(raw.sourceMetadataHash === approved.sourceMetadataSha256 && raw.sourceMetadataCapture.sha256 === approved.sourceMetadataSha256 && raw.tcgdexMetadataCapture.sha256 === approved.tcgMetadataSha256 && raw.sourceSignatureSha256 === approved.sourceSignatureSha256 && canonicalHash(source) === approved.sourceSignatureSha256 && raw.sourceAttackArraySha256 === approved.sourceAttackArraySha256 && canonicalHash(raw.sourceMetadataCapture.data.attacks) === approved.sourceAttackArraySha256, 'Raw metadata/signature/ordered attacks changed');
  check(raw.actualPixelSignatureSha256 === approved.actualPixelSignatureSha256 && canonicalHash(actual) === approved.actualPixelSignatureSha256 && pixel.originalObservation.sha256 === approved.pixelObservationSha256 && actual.pixelObservationSha256 === approved.pixelObservationSha256 && actual.originalSha256 === original.sha256 && canonicalHash(raw.providerMetadataDiscrepancies) === approved.providerDiscrepanciesCanonicalJsonSha256, 'Accepted actual signature/observation/discrepancy changed');
  check(original.mimeType === 'image/webp' && original.format === 'WEBP' && original.fullPILDecodePassed === true && original.fullSharpDecodePassed === true && original.sourceBytesUnchanged === true && original.sourceImageUnmodified === true && original.generatedOrUpscaled === false && original.minimumReadableSize === true && original.hdThreshold720x1008 === false && original.width >= 360 && original.height >= 504, 'Readable unchanged full-decoded original required');
  check(actual.actualLanguage === 'ja' && actual.printedNumberIsNationalDex === true && actual.canonicalCollectorAliasIsNotPrintedNumber === true && actual.nativeName === pixel.printedJapaneseNameObserved && actual.hp === pixel.hpObserved && actual.nationalDex === pixel.printedNationalDexNumberObserved && actual.artist === pixel.artistObserved && actual.nativeStage === pixel.nativeStageObserved && actual.normalisedStage === pixel.stageObserved && same(actual.evolvesFrom, pixel.evolvesFromObserved) && actual.retreat === pixel.retreatSymbolsObserved && same(actual.abilities, pixel.abilitiesObserved) && same(actual.rules, pixel.rulesObserved), 'Actual signature and observed identity/body diverged');
  check(same(actual.orderedAttacks.map(attack => attack.name), pixel.printedAttackNamesObserved) && same(actual.orderedAttacks.map(attack => attack.cost), pixel.attackCostsObserved) && same(actual.orderedAttacks.map(attack => attack.damage), pixel.attackDamageObserved) && same(actual.orderedAttacks.map(attack => attack.effect), pixel.bodyEffectFactsObserved), 'Ordered actual attacks changed');
  check(same(pixel.attackCostsObserved, source.orderedAttacks.map(attack => attack.normalisedCosts)) && same(pixel.attackDamageObserved, source.orderedAttacks.map(attack => attack.sourceDamage)), 'Actual/source ordered costs or damage mismatch');
  check(actual.hp === Number(source.hp) || (['050', '051'].includes(alias) && actual.hp === 50 && Number(source.hp) === 40 && approved.comparisonResolution?.actualAndCanonicalHp === 50), 'Unbound source HP exception');
  check(actual.artist === (completeArtists[alias] ?? source.artist) && pixel.artistReadCertain === true, 'Unbound complete artist exception');
  check(raw.historicalCaptureMode === approved.historicalCaptureMode && raw.historicalSelectedSourceCardId === approved.historicalSelectedSourceCardId, 'Historical association changed');
  if (comparisonAliases.includes(alias)) check(raw.historicalCaptureMode === 'quarantine_comparison_only' && approved.comparisonResolution && raw.independentSelection.comparisonResolution, 'Comparison requires exact independent acceptance');
  if (['050', '051'].includes(alias)) {
    const form = alias === '050' ? 'L' : 'S';
    const ability = form === 'L' ? 'LAUGH' : 'SEARCH';
    check(raw.historicalSelectedSourceCardId === null && actual.form === form && pixel.unownLetterObserved === form && actual.hp === 50 && actual.abilities[0].name.startsWith(ability) && actual.rules[0].text.includes('4枚'), 'Exact independently accepted Unown glyph/ability/header required');
    check(approved.comparisonResolution.acceptedForm === form, 'Unbound Unown selection');
    if (form === 'S') check(same(actual.orderedAttacks[0].cost, ['Psychic', 'Colorless']) && actual.orderedAttacks[0].damage === '20' && actual.retreat === 1 && actual.abilities[0].criticalNativeText.includes('サイドカード') && actual.abilities[0].criticalNativeText.includes('もとにもどす') && raw.approvedActualPixelGuard.includes('Psychic plus Colorless'), 'S must use actual Psychic+Colorless guard, not historical two-Psychic typo');
    else check(actual.abilities[0].criticalNativeText.includes('相手の山札'), 'L actual opponent-deck shuffle required');
  }
  for (const key of ['wholeOriginalInspected', 'neoExpansionSymbolObserved', 'rulesOrAttackTextVisible', 'fullCardFrameVisible', 'allFourOuterEdgesVisible', 'nameNumberAndSymbolReadable']) check(pixel[key] === true, `Missing actual pixel witness: ${key}`);
  for (const key of ['copyrightOrDateLineVisible', 'copyrightYearInferred', 'editionStampVisible', 'editionOrDistributionCertified', 'materialFoilFinishCertified', 'actualSourcePixelsGeneratedOrUpscaled', 'fullNativeRulesTranscriptionClaimed']) check(pixel[key] === false, `Unsupported pixel claim: ${key}`);
  check(raw.providerMetadataDiscrepancies.every(item => item.pixelResolution === true && item.canonicalCorrection === false && item.actualOriginalSha256 === original.sha256 && item.actualPixelSignatureSha256 === approved.actualPixelSignatureSha256), 'Every provider discrepancy needs the exact accepted actual witness');
  const support = raw.sourceVariantSupport;
  check(support.currentVariantCode === raw.currentVariantCode && support.currentFinishCode === raw.currentFinish && support.supportsCurrentMetadataVariant === true && support.physicalFinishVerified === false && support.globalFrontNotPerVariantProof === true, 'Current finish metadata is not physical certification');
  for (const key of ['sourceLicenseIndependentlyVerified', 'sourceWideApproval', 'vendorLicenceVerified', 'physicalEditionVerified', 'physicalFinishVerified']) check(raw[key] === false, `Unsupported source claim: ${key}`);
  return raw;
}

export function projectQueueControls(raw) {
  const pixel = raw.pixelObservations;
  const actual = raw.actualPixelSignature;
  return {
    pixel_observations: {
      whole_original_inspected: true, full_frame_visible: pixel.fullCardFrameVisible,
      name_number_and_symbol_readable: pixel.nameNumberAndSymbolReadable,
      artist_read_certain: pixel.artistReadCertain, fine_print_readability: pixel.finePrintReadability,
      copyright_or_date_line_visible: false, copyright_year_inferred: false,
      edition_stamp_visible: false, edition_or_distribution_certified: false,
      material_foil_finish_certified: false, physical_card_or_material_not_observed: true,
      source_image_does_not_certify_physical_finish: true,
      full_native_rules_transcription_claimed: false,
    },
    identity_controls: {
      canonical_alias: raw.canonicalCollectorAlias, printed_national_dex: actual.nationalDex,
      canonical_alias_is_not_printed_national_dex: true, current_native_label: raw.currentNativeLabel,
      verified_printed_native_name: actual.nativeName, current_native_label_not_used_for_match: true,
      known_native_label_defect_retained_without_write: raw.currentNativeLabel !== actual.nativeName,
      form_letter: pixel.unownLetterObserved,
    },
    source_qa: {
      actual_japanese_full_front_verified: true, ordered_costs_and_damage_verified: true,
      all_provider_discrepancies_pixel_resolved: true, physical_finish_verified: false,
      source_metadata_sha256: raw.sourceMetadataHash, original_sha256: raw.original.sha256,
      actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    },
  };
}

export function projectSourceBody(raw, approved, historical) {
  validateSourceRow(raw, approved);
  check(historical && historical.printingId === raw.printingId && historical.captureMode === raw.historicalCaptureMode && historical.selectedSourceCardId === raw.historicalSelectedSourceCardId && same(historical.actualPixelSignature, raw.actualPixelSignature) && same(historical.sourceMetadataCapture.data, raw.sourceMetadataCapture.data), 'Historical raw source record changed');
  return {
    provider_metadata: raw.sourceMetadataCapture.data,
    provider_metadata_raw_html_sha256: raw.sourceMetadataHash,
    provider_metadata_canonical_json_sha256: canonicalHash(raw.sourceMetadataCapture.data),
    tcgdex_metadata: raw.tcgdexMetadataCapture.data,
    source_signature: raw.sourceSignature, source_signature_sha256: raw.sourceSignatureSha256,
    source_attack_array_sha256: raw.sourceAttackArraySha256,
    actual_pixel_observations: raw.pixelObservations,
    actual_pixel_signature: raw.actualPixelSignature,
    actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    original_observation_sha256: raw.pixelObservations.originalObservation.sha256,
    provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    original_metadata_discrepancies_retained: raw.originalMetadataDiscrepanciesRetained,
    historical_source_handoff_row_canonical_json_sha256: canonicalHash(historical),
    root_approved_projection_row_canonical_json_sha256: canonicalHash(raw),
    historical_association: { capture_mode: historical.captureMode, selected_source_card_id: historical.selectedSourceCardId, identity_match: historical.identityMatch, holds: historical.holds, review_qualifications: historical.reviewQualifications },
    independent_selection: raw.independentSelection,
    approved_actual_pixel_guard: raw.approvedActualPixelGuard,
    current_acceptance: { source_card_id: raw.selectedSourceCardId, independently_accepted: true, actual_signature_sha256: raw.actualPixelSignatureSha256 },
    source_variant_support: raw.sourceVariantSupport,
    effects_are_observed_paraphrases: true, literal_full_body_transcription_claimed: false,
    physical_edition_verified: false, physical_finish_verified: false,
    generic_other_rows_may_relax: false, queue_controls: projectQueueControls(raw),
  };
}

export function publicationBody(sourceBody) {
  const body = structuredClone(sourceBody);
  delete body.actual_pixel_observations.originalObservation.path;
  check(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(body)), 'Private local path in public source evidence');
  return body;
}
