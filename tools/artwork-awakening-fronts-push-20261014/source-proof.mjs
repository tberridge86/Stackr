// Pure validation and projection of the frozen actual-source evidence. No I/O.
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const same = isDeepStrictEqual;
const formByAlias = { '030': 'K', '032': 'B', '033': 'Y' };
const formLabels = { K: 'K [ケー]', B: 'B [ビー]', Y: 'Y [ワイ]' };
const attackNames = { '017': ['つきあげる', 'つのでいちげき'], '027': ['ビリリパンチ', 'エレキテール'] };
const abilityNames = { '021': ['クリスタルボディ'], '026': ['せんすい'] };
const artistNames = { '034': 'Keita Komatsuya / CR CG gangs', '045': '"Big Mama" Tagawa / CR CG gangs' };

export function validateSourceRow(raw, eligible) {
  const alias = raw.canonicalCollectorAlias;
  const pixels = raw.pixelObservations;
  const source = raw.sourceSignature;
  const metadata = raw.sourceMetadataCapture;
  const original = raw.original;
  check(eligible && raw.printingId === eligible.printingId && raw.variantId === eligible.variantId && alias === eligible.canonicalCollectorAlias && !['022', '023'].includes(alias), 'Unbound or held source identity');
  check(raw.canonicalSetCode === 'neo3' && raw.canonicalLanguageCode === 'ja' && raw.canonicalAliasIsPrintedNumber === false && raw.currentNativeLabelUsedForMatch === false && raw.currentNativeLabelRetained === true && raw.holds.length === 0 && raw.eligibleSourceOriginalForIndependentReview === true, 'Actual Japanese identity or retained catalogue labels changed');
  check(raw.sourceMetadataHash === eligible.sourceMetadataSha256 && metadata.rawSha256 === eligible.sourceMetadataSha256 && raw.sourceSignatureSha256 === eligible.sourceSignatureSha256 && hash(source) === eligible.sourceSignatureSha256 && metadata.attacksSha256 === eligible.sourceAttackArraySha256 && hash(metadata.attacks) === eligible.sourceAttackArraySha256, 'Frozen source metadata/signature/ordered attacks changed');
  check(original.sha256 === eligible.original.sha256 && original.bytes === eligible.original.bytes && original.mimeType === 'image/webp' && original.format === 'WEBP' && original.decodedFully === true && original.fullPILDecodePassed === true && original.fullSharpDecodePassed === true && original.sourceBytesUnchanged === true && original.sourceImageUnmodified === true && original.generatedOrUpscaled === false && original.hdThreshold720x1008 === false && original.width >= 360 && original.height >= 504, 'Unchanged fully decoded readable WebP required');
  check(raw.actualPixelSignatureSha256 === eligible.actualPixelSignatureSha256 && hash(raw.actualPixelSignature) === eligible.actualPixelSignatureSha256, 'Frozen actual-pixel signature changed');
  check(pixels.actualLanguageCode === 'ja' && pixels.printedDexNotCanonicalCollectorAlias === true && pixels.hpObserved === Number(source.hp) && same(source.nationalDex, [pixels.printedNationalDexNumberObserved]), 'Actual HP/Dex/language bridge changed');
  check(same(pixels.attackCostsObserved, source.orderedAttacks.map(attack => attack.normalisedCosts)) && same(pixels.attackDamageObserved, source.orderedAttacks.map(attack => attack.printedDamageCandidate ?? null)), 'Actual ordered costs/damage changed');
  check(same(pixels.printedAttackNamesObserved, attackNames[alias] ?? source.orderedAttacks.map(attack => attack.nativeName)), 'Unbound printed attack-label exception');
  check(same(pixels.abilityNamesObserved, abilityNames[alias] ?? source.abilities.map(ability => ability.name)), 'Unbound printed ability-label exception');
  if (formByAlias[alias]) {
    const form = formByAlias[alias];
    check(source.nativeName === `アンノーン${form}` && pixels.printedJapaneseNameObserved === 'アンノーン' && pixels.unownLetterObserved === form && pixels.printedFormLabelObserved === formLabels[form], 'Exact Unown name/form/body bridge changed');
    check(pixels.bodyEffectFactsObserved.length > 0 && pixels.abilityNamesObserved[0].startsWith({ K: 'KEEP', B: 'BEAR', Y: 'YIELD' }[form]), 'Exact Unown ability body required');
  } else check(pixels.printedJapaneseNameObserved === source.nativeName && pixels.unownLetterObserved === null, 'Unbound native name or form exception');
  if (alias === '011') check(pixels.artistObserved === null && pixels.artistReadCertain === false && pixels.sourceRecordedArtist === 'Kimiya Masago' && source.artist === 'Kimiya Masago' && pixels.creditClarification?.printedArtistText === null && pixels.artistUncertainty, 'Ho-oh optical uncertainty must remain separate from provider artist');
  else check(pixels.artistReadCertain === true && pixels.artistObserved === (artistNames[alias] ?? source.artist), 'Unbound artist-credit exception');
  if (alias === '031') check(pixels.stageObserved === 'Baby' && pixels.actualBabyRuleBoxVisible === true && pixels.observedBabyRuleText.includes('ベイビィポケモン') && pixels.babyEvolutionTextObserved === 'ルージュラへ進化' && same(metadata.rules, []), 'Actual Baby rule/evolution and source omission must survive');
  else check(pixels.actualBabyRuleBoxVisible === false && pixels.observedBabyRuleText === null, 'Unplanned Baby-rule evidence');
  const signature = raw.actualPixelSignature;
  check(signature.nativeName === pixels.printedJapaneseNameObserved && signature.formLetter === pixels.unownLetterObserved && signature.hp === pixels.hpObserved && signature.stage === pixels.stageObserved && signature.nationalDex === pixels.printedNationalDexNumberObserved && same(signature.orderedAttackNames, pixels.printedAttackNamesObserved) && same(signature.orderedCosts, pixels.attackCostsObserved) && same(signature.orderedDamage, pixels.attackDamageObserved) && same(signature.abilityNames, pixels.abilityNamesObserved) && signature.retreatSymbols === pixels.retreatSymbolsObserved && signature.printedArtist === pixels.artistObserved && signature.sourceArtist === source.artist && signature.artistReadCertain === pixels.artistReadCertain && signature.babyRuleVisible === pixels.actualBabyRuleBoxVisible, 'Pixel observations and actual signature diverged');
  for (const key of ['wholeOriginalInspected', 'neoExpansionSymbolObserved', 'rulesOrAttackTextVisible', 'fullCardFrameVisible', 'allFourOuterEdgesVisible', 'nameNumberAndSymbolReadable']) check(pixels[key] === true, `Missing actual pixel witness: ${key}`);
  for (const key of ['copyrightOrDateLineVisible', 'copyrightYearInferred', 'editionStampVisible', 'editionOrDistributionCertified', 'materialFoilFinishCertified', 'actualSourcePixelsGeneratedOrUpscaled', 'fullNativeRulesTranscriptionClaimed']) check(pixels[key] === false, `Unsupported pixel claim: ${key}`);
  check(raw.providerMetadataDiscrepancies.every(item => item.pixelResolution === true && item.canonicalCorrection === false && item.originalSha256 === original.sha256 && item.sourceMetadataHtmlSha256 === metadata.rawSha256), 'Every provider conflict requires its exact original/source pixel bridge');
  check(raw.identityMatch.exactCurrentIdsRetained === true && raw.identityMatch.actualJapaneseFullFrontMatched === true && raw.identityMatch.actualMetadataDifferencesSeparatelyResolved === true && raw.identityMatch.wrongLanguage === false && raw.identityMatch.wrongSpeciesOrForm === false, 'Actual identity match is incomplete');
  const support = raw.sourceVariantSupport;
  check(support.currentVariantCode === raw.currentVariantCode && support.currentFinishCode === raw.currentFinish && same(support.sourceVariantNames, [raw.currentFinish === 'normal' ? 'normal' : 'holofoil']) && support.supportsCurrentMetadataVariant === true && support.globalFrontNotPerVariantProof === true && support.physicalFinishVerified === false, 'Metadata finish support is not physical certification');
  for (const key of ['sourceLicenseIndependentlyVerified', 'sourceWideApproval', 'vendorLicenceVerified', 'physicalEditionVerified', 'physicalFinishVerified']) check(raw[key] === false, `Unsupported source claim: ${key}`);
  return raw;
}

export function projectSourceBody(raw, eligible) {
  validateSourceRow(raw, eligible);
  const { rawPath, retainedAtUtc, ...metadata } = raw.sourceMetadataCapture;
  const { originalObservation, inspectionMethod, immediatelyPrecedingHashCheck, creditClarification, ...pixels } = raw.pixelObservations;
  const clarification = creditClarification ? Object.fromEntries(Object.entries(creditClarification).filter(([key]) => key !== 'priorObservationPath')) : null;
  return {
    provider_metadata: metadata, source_signature: raw.sourceSignature,
    tcgdex_metadata: raw.tcgdexMetadataCapture.data,
    actual_pixel_observations: pixels, actual_pixel_signature: raw.actualPixelSignature,
    actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    original_observation_sha256: originalObservation.sha256,
    append_only_credit_clarification: clarification,
    provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    original_metadata_discrepancies_retained: raw.originalMetadataDiscrepanciesRetained,
    source_variant_support: raw.sourceVariantSupport, identity_match: raw.identityMatch,
    review_qualifications: raw.reviewQualifications,
    effects_are_observed_paraphrases: true, literal_full_body_transcription_claimed: false,
    generic_other_rows_may_relax: false,
  };
}

export function projectQueueControls(raw) {
  const pixels = raw.pixelObservations;
  return {
    pixel_observations: {
      whole_original_inspected: true, full_frame_visible: true,
      name_number_and_symbol_readable: true,
      fine_print_readability: pixels.finePrintReadability,
      artist_read_certain: pixels.artistReadCertain,
      copyright_or_date_line_visible: false, copyright_year_inferred: false,
      edition_stamp_visible: false, edition_or_distribution_certified: false,
      material_foil_finish_certified: false, physical_card_or_material_not_observed: true,
      source_image_has_rendered_foil_like_background: pixels.sourceImageHasRenderedFoilLikeBackground,
      source_image_does_not_certify_physical_finish: true,
      full_native_rules_transcription_claimed: false,
    },
    identity_controls: {
      canonical_alias: raw.canonicalCollectorAlias,
      printed_national_dex: pixels.printedNationalDexNumberObserved,
      canonical_alias_is_not_printed_national_dex: true,
      current_native_label: raw.currentNativeLabel,
      verified_printed_native_name: pixels.printedJapaneseNameObserved,
      current_native_label_not_used_for_match: true,
      known_native_label_defect_retained_without_write: raw.currentNativeLabel !== pixels.printedJapaneseNameObserved,
      form_letter: pixels.unownLetterObserved,
    },
    source_qa: {
      actual_japanese_full_front_verified: true, ordered_costs_and_damage_verified: true,
      all_provider_discrepancies_pixel_resolved: true, physical_finish_verified: false,
      source_metadata_sha256: raw.sourceMetadataHash,
      original_sha256: raw.original.sha256,
      actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    },
  };
}

export function publicationBody(sourceBody) {
  const body = structuredClone(sourceBody);
  // The private source packet retains the rechecked-view path. Public evidence
  // keeps its content hash and observation, without a workstation filesystem path.
  const recheckedView = body.append_only_credit_clarification?.recheckedView;
  if (recheckedView) delete recheckedView.path;
  check(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(body)), 'Private local path in public source evidence');
  return body;
}
