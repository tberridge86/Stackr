// Exact unnumbered Japanese Trainer witnesses; references are comparison evidence only.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expectedRows = {
  "053": {
    "printing_id": "ecd63564-d5d4-402d-b28d-95011e2a9107",
    "variant_id": "40806ca5-1d4c-4bf6-b499-cee8ff167f94",
    "provider_id": "neo3_ja-53",
    "raw_row_sha256": "69c28f73162659eb0238735de8758dc34e2139bef01b64d6522d2474a9da3fc0",
    "original_sha256": "8122a558912c72cef5c4b7b14591becae892a78f776ce530748b032909ce3f99",
    "metadata_sha256": "88d2dd93143a7ddc5217c772f4582789062a7214a9c7e6606020da272feefcc1",
    "actual_sha256": "04214630bcf38e92c1c07d431bff69140799ff6481acabeb996d50010e54b998"
  },
  "054": {
    "printing_id": "f03f92e7-086a-4ec9-8281-e3c88906d13d",
    "variant_id": "eaa7573e-3860-440e-be69-cb414e6bbda5",
    "provider_id": "neo3_ja-54",
    "raw_row_sha256": "99737689f71e4cbc881102634fd1f8285907570eb839b03d8c2976abd6bfc048",
    "original_sha256": "3b1abb921c0e67ef8aa7de076859d1b920caa22ce4e9d962bc2639965e7af7ed",
    "metadata_sha256": "c285981dc65234cb03399e21de5df38224372d8f8fc29373b6bdfac29c228a89",
    "actual_sha256": "86b5fe99d1593b47a991f0bbd0957f61b8abe5556e0087e2cec6ac8d65f2863c"
  },
  "055": {
    "printing_id": "05ec5ae6-bfb8-41b1-a65b-acb7ce4c3585",
    "variant_id": "fc02d833-0de4-4a4d-be84-fe71a9bd0582",
    "provider_id": "neo3_ja-55",
    "raw_row_sha256": "e6fec809c735dcb1667c495c5b428e965b9c13f35ee4462df6801797547331ef",
    "original_sha256": "f350108c698a80ae0fc2aaf67d694672a4de04bd016a3a098ab6ca65e6dbbfcf",
    "metadata_sha256": "74a00eca887b267057d3cca3e518298cdeac73709bec7631ef37084b68632a72",
    "actual_sha256": "707576c3c2659db791833a22436b92a615bfd029a6224565a5f202a27061012e"
  },
  "056": {
    "printing_id": "6196aadb-f7bc-4449-8fd3-254987e292f8",
    "variant_id": "7d0611e3-9b65-4539-8803-c7a9876f6e68",
    "provider_id": "neo3_ja-56",
    "raw_row_sha256": "7cb314e4144050061bcc1a385c518087771944229e79dde8e3649e48a446899b",
    "original_sha256": "30f797b81043589bffd3e9c7af4ead32f97b6980d38868c90b4d0ef09207005c",
    "metadata_sha256": "1865115c60cd1b5c84a9cd61dcc014757bfff740544c5528113a9d3dc041ae72",
    "actual_sha256": "dd257d0826649c07a899e9a0018c6b116b7856350b3417c07484e07ff8b5f074"
  },
  "057": {
    "printing_id": "56fc9f48-441c-40da-b1a7-29fdbd5300c4",
    "variant_id": "767914af-5fcc-4e7c-9304-de89589eb56f",
    "provider_id": "neo3_ja-57",
    "raw_row_sha256": "03ebdc2796c355ce4ec6f937fb3855a1350bf041d8c4523af43776e792d1593d",
    "original_sha256": "bcabdcf132f2d8fd1f855b4f4bb1c2e52be53f28225ae0e19f0f9310757143be",
    "metadata_sha256": "5382f243a43ef7619860e76a6f2eb4f94a98006997b256d0f819687306d06d5a",
    "actual_sha256": "bad7816a659c707034e8104f37a42ca62373924d0971c5b45a89fd2a72c34fef"
  }
};
const compact = text => text.replace(/\s+/gu, '');

// Strip only named path fields, then reject any unexpected local path anywhere else.
export function publicProjection(value) {
  const visit = item => Array.isArray(item) ? item.map(visit) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).filter(([key, entry]) => !(['path', 'absolutePath'].includes(key) && typeof entry === 'string' && /^[A-Za-z]:[\\/]/u.test(entry))).map(([key, entry]) => [key, visit(entry)])) : item;
  const projected = visit(value);
  check(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(projected)), 'Unexpected private local path in public Trainer evidence');
  return projected;
}

export function validateSourceRow(raw, approved, metadata, historical) {
  const known = expectedRows[raw.canonicalCollectorAlias];
  const actual = raw.actualPixelSignature;
  const pixels = raw.pixelObservations;
  const source = raw.sourceMetadataCapture;
  const selection = raw.independentSelection;
  const reference = selection.referenceEvidence;
  const direct = selection.independentDirectObservation;
  check(known && canonicalHash(raw) === known.raw_row_sha256 && approved.printingId === raw.printingId && approved.variantId === raw.variantId && approved.canonicalAlias === raw.canonicalCollectorAlias && raw.printingId === known.printing_id && raw.variantId === known.variant_id, 'Outside exact frozen Trainer5 projection');
  check(raw.selectedSourceCardId === known.provider_id && approved.sourceCardId === known.provider_id && raw.approvedSourceCardId === known.provider_id && selection.independentlySelectedSourceCardId === known.provider_id && raw.canonicalSetCode === 'neo3' && raw.canonicalLanguageCode === 'ja', 'Exact current Trainer source identity required');
  check(raw.original.sha256 === known.original_sha256 && approved.originalSha256 === known.original_sha256 && source.sha256 === known.metadata_sha256 && metadata.sourceMetadata.sha256 === known.metadata_sha256 && metadata.sourceMetadata.data.id === known.provider_id, 'Original/raw metadata identity changed');
  check(canonicalHash(actual) === known.actual_sha256 && raw.actualPixelSignatureSha256 === known.actual_sha256 && approved.sourceActualPixelSignatureSha256 === known.actual_sha256 && canonicalHash(source.sourceSignature) === source.sourceSignatureSha256 && canonicalHash(metadata.sourceMetadata.data.attacks) === source.sourceAttackArraySha256, 'Untouched source/actual signature or attacks changed');
  check(same(source.sourceSignature, metadata.sourceSignature) && same(selection.sourceActualPixelSignature, actual) && same(selection.currentProductionBinding, raw.currentProductionBinding) && same(selection.currentStagingBinding, raw.currentStagingBinding), 'Accepted source/current binding bridge changed');
  check(actual.actualLanguageCode === 'ja' && actual.header === 'TRAINER' && actual.hp === null && actual.stage === null && actual.evolvesFrom === null && actual.nationalDex === null && actual.retreatSymbols === null && actual.canonicalCollectorAliasNotPrintedNumber === true && raw.printedCollectorNumber === null && raw.printedNationalDex === null, 'Unnumbered Trainer must not borrow Pokemon HP/stage/Dex/collector number');
  for (const key of ['orderedAttackNames', 'orderedAttackCosts', 'orderedAttackDamage', 'abilityNames', 'nativeAttackText']) check(Array.isArray(actual[key]) && actual[key].length === 0, 'Trainer must not borrow Pokemon attack or ability fields');
  check(actual.nativeAbilityText === null && actual.nativeRulesText.length > 20 && actual.artistReadCertain === true && actual.fullCardFrontVisible === true && actual.allFourOuterEdgesVisible === true && actual.setSymbolObserved === true && actual.editionOrMaterialCertified === false, 'Complete actual Japanese Trainer body/frame/artist required');
  check(actual.nativeName === pixels.nativeNameObserved && actual.header === pixels.headerObserved && actual.printedSubtype === pixels.printedSubtypeObserved && actual.artist === pixels.artistObserved && actual.nativeRulesText === pixels.nativeRulesTextObserved && pixels.printedNationalDexObserved === null && pixels.printedCollectorNumberObserved === null && pixels.hpObserved === null, 'Actual Trainer signature and original pixel observation diverged');
  check(reference.role === 'Identity comparison evidence only; not a production image source' && reference.cardUrl.startsWith('https://jp.pokellector.com/Awakening-Legends-Expansion/') && direct.referenceSha256 === reference.original.sha256 && direct.sourceSha256 === known.original_sha256 && direct.sourceReferenceExactPrintedFrontMatch === true && direct.sourceViewedIndependently === true && direct.referenceViewedIndependently === true && direct.fullFrame === true && direct.setMarkVisible === true, 'Exact named detail/reference/source comparison required');
  check(direct.actualTitle === actual.nativeName && direct.header === actual.header && direct.subtype === actual.printedSubtype && direct.artist === actual.artist && compact(actual.nativeRulesText).includes(compact(direct.actualNativeRules)), 'Independent complete Trainer body/art/subtype bridge changed');
  const genericRule = direct.stadiumRule ?? direct.toolRule;
  if (genericRule) check(compact(actual.nativeRulesText).includes(compact(genericRule)), 'Complete generic Stadium/Tool rule required');
  check(historical && historical.selectedSourceCardId === null && historical.holds.length > 0 && same(historical.actualPixelSignature, actual) && raw.historicalSelectedSourceCardId === null && raw.historicalQuarantineComparisonOnly === true && raw.currentCanonicalBodyAndArtistUnchanged === true && selection.canonicalMetadata.artistAbsent === true && selection.canonicalMetadata.bodyAbsent === true, 'Historical null source/holds and missing canonical body/artist must remain separate');
  check(raw.eligibleSourceOriginal === true && raw.sourceIndependentlyAccepted === true && raw.exactCanonicalTrainerArtworkMatch === true && raw.exactCanonicalPokemonSourceMatch === false && raw.referenceImagesAreComparisonEvidenceOnly === true, 'Independent exact Trainer acceptance required');
  check(raw.original.mimeType === 'image/webp' && raw.original.format === 'WEBP' && raw.original.fullPILDecodePassed === true && raw.original.fullSharpDecodePassed === true && raw.original.sourceBytesUnchanged === true && raw.original.generatedOrUpscaled === false && raw.original.minimumDetailResolution === true && raw.original.hd720x1008 === false, 'Unmodified full-decoded source original required');
  for (const key of ['vendorLicenceVerified', 'underlyingCopyrightLicenceVerified', 'physicalEditionVerified', 'physicalFinishVerified', 'sourceWideApproval']) check(raw[key] === false, `Unsupported source claim: ${key}`);
  check(raw.sourceVariantSupport.currentVariantCode === 'normal' && raw.sourceVariantSupport.currentFinishCode === 'normal' && raw.sourceVariantSupport.supportsCurrentMetadataVariant === true && raw.sourceVariantSupport.physicalFinishVerified === false, 'Existing normal metadata is not physical certification');
  if (raw.canonicalCollectorAlias === '053') check(actual.nativeName === 'ボロのつりざお' && reference.pageJapaneseLabelConflict.pageJpnLabel === 'オールドロッド', 'Actual Old Rod title must remain separate from wrong page label');
  if (raw.canonicalCollectorAlias === '057') check(actual.nativeRulesText.includes('「わるい」') && actual.nativeRulesText.includes('「20」') && !actual.nativeRulesText.includes('R団') && direct.noAdditionalRTeamCategoryInPrintedEffect === true && metadata.sourceMetadata.data.rules.some(rule => rule.includes('R団のポケモン')), 'Printed Dark-only HP+20 must not inherit source extra Team Rocket category');
  return raw;
}

export function projectQueueControls(raw) {
  const actual = raw.actualPixelSignature;
  return {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: actual.fullCardFrontVisible, name_and_set_symbol_readable: true, artist_read_certain: actual.artistReadCertain, full_japanese_trainer_rules_read: true, printed_collector_number: null, printed_national_dex: null, physical_finish_verified: false, edition_or_distribution_certified: false, copyright_year_inferred: false },
    identity_controls: { canonical_alias: raw.canonicalCollectorAlias, canonical_alias_is_not_printed_number: true, printed_collector_number: null, printed_national_dex: null, card_category: 'Trainer', verified_printed_native_name: actual.nativeName, current_native_label: raw.currentNativeLabel, current_native_label_not_used_as_sole_match: true, pokemon_identity_asserted: false, trainer_full_body_art_reference_bridge_verified: true },
    source_qa: { actual_japanese_unnumbered_trainer_front_verified: true, complete_native_trainer_body_verified: true, independent_named_reference_and_source_front_match: true, reference_image_comparison_only: true, printed_number_and_national_dex_absent_verified: true, original_sha256: raw.original.sha256, source_metadata_sha256: raw.sourceMetadataCapture.sha256, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256, independent_reference_sha256: raw.independentSelection.referenceEvidence.original.sha256, physical_finish_verified: false },
  };
}

export function projectSourceBody(raw, approved, metadata, historical, providerMetadata) {
  validateSourceRow(raw, approved, metadata, historical);
  check(providerMetadata && same({ ...providerMetadata, variants: providerMetadata.variants.map(({ name, images }) => ({ name, images })) }, metadata.sourceMetadata.data), 'Full embedded provider body must retain the frozen identity projection');
  const selection = publicProjection(raw.independentSelection);
  return {
    provider_metadata_raw_html_sha256: raw.sourceMetadataCapture.sha256,
    provider_metadata_full_captured_json_sha256: canonicalHash(providerMetadata),
    provider_metadata_identity_projection: metadata.sourceMetadata.data,
    provider_metadata_identity_projection_sha256: canonicalHash(metadata.sourceMetadata.data),
    provider_metadata_projection_contract: 'Derived identity-only projection from the retained exactmetadata7 packet; full captured provider JSON remains offline and is represented only by its distinct hash.',
    tcgdex_metadata: metadata.tcgMetadata.data,
    source_signature: raw.sourceMetadataCapture.sourceSignature,
    source_signature_sha256: raw.sourceMetadataCapture.sourceSignatureSha256,
    source_attack_array_sha256: raw.sourceMetadataCapture.sourceAttackArraySha256,
    actual_pixel_signature: raw.actualPixelSignature,
    actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    actual_pixel_observations: publicProjection(raw.pixelObservations),
    original_observation_sha256: raw.originalObservation.sha256,
    provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    historical_source_row_canonical_json_sha256: canonicalHash(historical),
    root_approved_projection_row_canonical_json_sha256: canonicalHash(raw),
    historical_association: { selected_source_card_id: null, quarantine_comparison_only: true, holds: raw.historicalHolds, exact_canonical_trainer_artwork_match: false, canonical_artist_and_body_missing_retained: true },
    independent_selection: selection,
    independent_selection_raw_canonical_json_sha256: canonicalHash(raw.independentSelection),
    independent_selection_public_canonical_json_sha256: canonicalHash(selection),
    public_projection_contract: 'Remove only local path/absolutePath properties; reject unexpected local paths; raw private evidence hashes remain distinct from projected hashes.',
    current_acceptance: { independently_accepted: true, source_card_id: raw.selectedSourceCardId, exact_unnumbered_japanese_trainer: true },
    source_variant_support: raw.sourceVariantSupport,
    physical_edition_verified: false, physical_finish_verified: false,
    generic_other_rows_may_relax: false, queue_controls: projectQueueControls(raw),
  };
}

export function publicationBody(body) {
  const projected = publicProjection(body);
  check(!/"(?:provider_metadata|prices|marketplaces|pop_reports)"\s*:/u.test(JSON.stringify(projected)), 'Commercial raw provider data must remain offline');
  return projected;
}
