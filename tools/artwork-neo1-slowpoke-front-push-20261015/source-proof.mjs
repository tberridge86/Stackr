// One finite source identity exception; source HP40, actual HP50 and PNG history stay distinct.
import { createHash } from 'node:crypto';
const check = (value, message) => { if (!value) throw Error(message); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expected = {
  "printingId": "494725ee-70bf-41d3-a6b7-2a7bb6180287",
  "alias": "045",
  "category": "Pokemon",
  "provider": "pokellector-image-url-sha256:c440501050afdccbc520cba0c0b5057137d71948aac242a0558d5896d9c137cb",
  "imageUrl": "https://den-cards.pokellector.com/324/Slowpoke.NEO1.45.38564.png",
  "original": "2d1170c7cac4753e519f9fe69c5179aee284f2d01be5c12f4d49af1a44e498eb",
  "row": "4c1bbec4aa3852aafdc12c17642ca2b4f7cac8c51ec1b7459d6d994ea48b3a4d",
  "peer": "c9522dc797befd73cbdd9f219e35733f00a460dbcfdd96cbb96cbeac6d69f6e2",
  "publicPeer": "2f3f5cc26f93f5b6c08d7322723ffb0f09a4c5f79dfdf02c87260dda96fd80bd",
  "actual": "a54693d29010fba757d04818df54775f93f0700065edc281bc94de330e7001fe",
  "identity": "737ff6aa6d683a7b09f80827b802d7bb7d7fd2f1a12f80ab37283443270a217b",
  "photoHtml": "37aeb192f5aa819df81fc61499a6ea03cf596fb827ed8c52e9b99401b97529a8",
  "nativeHtml": "5601bd27f1d2a462841a9d4f9bbcc47eebb94d5260c3a9ce1cb2201cbb8199c1",
  "cachedIdentity": "bf5f14a2b0186dd2c709ce91fa70f0078e5a85fc52f7ff82d0705057c41b57c2",
  "fullCanonical": "ba2b6dca5cd565b20d1deef9e3e7f8321fb0d6317db59c27c16bbcfa373fb5c6",
  "observations": "9c42ae4d7159984fc0b34b52f1a38c99d2f3650c1da0876feec7612f795582d5",
  "quality": "c1378998d5c2566cc6777d2d4c4d43be4b0a305428c6d4622d8d6ce127b6740a",
  "qualifications": "e401d756dcc354a99aaa6d4dcf1c12baa9bfa7b1fee8d80ec06bde253bd97a67",
  "discrepancies": "ee715b1468e71d7cffe153599774c90f7168873540af787226b27be59d6af286",
  "holdSha256": "285515b04c540d3258d4962b9474d6d65d35fdd560dee27c057b91f8670fb798",
  "oldObservationSha256": "5b98d53f7550dcb957176e03292e14159a917bcda84924ffbe020a58984d7387"
};
const commercial = new Set(['prices', 'pricing', 'marketplaces', 'pop_reports', 'privateFullCapturedScrydexCard', 'privateFullCapturedTCGdexJSON']);
const privateKeys = new Set(['path', 'absolutePath', 'rawPath', 'receiptPath', 'rawHtmlPath']);
export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key, nested]) => {
    if (privateKeys.has(key) && typeof nested === 'string' && /^[A-Za-z]:[\\/]/u.test(nested)) return false;
    check(!commercial.has(key), 'Private full/commercial provider payload'); return true;
  }).map(([key, nested]) => [key, publicProjection(nested)]));
  check(typeof value !== 'string' || !/(?:^|\s)[A-Za-z]:[\\/]/u.test(value), 'Unexpected private path'); return value;
}
export const publicationBody = publicProjection;
export function knownSource(id) { check(id === expected.printingId, 'Outside exact Slowpoke1'); return expected; }
export function validateActual(actual) {
  check(canonicalHash(actual) === expected.actual, 'Pinned actual full native body changed');
  check(actual.category === 'Pokemon' && actual.language === 'ja' && actual.nativeName === 'ヤドン' && actual.hp === 50 && actual.level === 20 && actual.printedNationalDex === 79 && actual.printedDex === 'No.079', 'Actual HP50/LV20/Dex79 body required');
  check(actual.printedNumberIsNationalDex === true && actual.printedCollectorNumber === null && actual.printedCollectorDenominator === null && actual.canonicalAliasIsUnprintedIndex === true, 'Alias045 must not become a printed collector or denominator');
  check(actual.attacks.length === 2 && actual.attacks[0].nativeName === 'ねんりき' && actual.attacks[0].damage === '10' && actual.attacks[1].nativeName === 'みずでっぽう' && actual.attacks[1].damage === '10+' && actual.attacks[1].nativeRules.includes('2個ぶんまで'), 'Complete ordered native attacks/max2 extra Water required');
  check(actual.printedWeaknessMultiplier === null && actual.artist === 'Tomokazu Komiya' && actual.art.includes('green grass') && !actual.art.includes('pond'), 'Qualified weakness/artist/lawn-art witness required');
}
export function validateSourceRow(raw, peer) {
  knownSource(raw.printingId);
  check(canonicalHash(raw) === expected.row && canonicalHash(peer) === expected.peer, 'Pinned root/independent row changed');
  check(raw.rootFiniteSourceEligibilityAccepted === true && raw.exactArtworkSourceIdentityAccepted === true && raw.selectedSourceCode === 'pokellector' && raw.independentlySelectedSourceCardId === expected.provider, 'Exact finite photo acceptance required');
  check(raw.original.sha256 === expected.original && raw.original.mimeType === 'image/png' && raw.original.providerPreprocessingCertified === false, 'Original PNG/unknown processing history required');
  check(canonicalHash(raw.sourceIdentityProjection) === expected.identity && raw.sourceFullCapturedJsonFileSha256 === null && raw.sourceFullCapturedJsonCanonicalSha256 === expected.fullCanonical, 'Derived identity versus privately embedded native JSON contract changed');
  check(raw.sourceIdentityProjection.nativeCanonicalIdentityAndBody.hp === '50' && raw.sourceIdentityProjection.historicalTCGdexSafeIdentity.hp === 40, 'Historical40/native50 discrepancy must remain explicit');
  validateActual(raw.acceptedActualPixelSignature); return expected;
}
export function projectQueueControls(raw) {
  validateActual(raw.acceptedActualPixelSignature);
  return {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: true, name_number_and_symbol_readable: true, full_native_body_verified: true, exact_art_reference_verified: true },
    identity_controls: { canonical_alias: '045', canonical_alias_is_internal_only: true, canonical_alias_is_not_printed_national_dex: true, printed_collector_number: null, printed_national_dex: 79, pokemon_identity_asserted: true },
    source_qa: { actual_japanese_full_front_verified: true, actual_japanese_pokemon_front_verified: true, actual_hp50_distinct_historical_tcg40_verified: true, provider_native_resolution_gain_certified: false, provider_no_resize_certified: false, original_sha256: expected.original, actual_pixel_signature_sha256: expected.actual },
  };
}
export function projectSourceBody(raw, peer, publicPeer) {
  validateSourceRow(raw, peer); publicProjection(publicPeer);
  check(canonicalHash(publicPeer) === expected.publicPeer, 'Independent safe public projection changed');
  return publicProjection({
    contract: 'stackr-ja-neo1-slowpoke1-identity-v1', accepted_category: 'Pokemon', photo_source_provider: 'pokellector', photo_source_identifier: expected.provider,
    photo_source_raw_html_sha256: expected.photoHtml, native_semantic_metadata_provider: 'scrydex', historical_semantic_metadata_provider: 'tcgdex', semantic_metadata_is_photo_provenance: false,
    provider_metadata_identity_projection: raw.sourceIdentityProjection, provider_metadata_identity_projection_sha256: expected.identity,
    native_semantic_raw_html_sha256: expected.nativeHtml, cached_native_identity_file_sha256: expected.cachedIdentity,
    semantic_provider_full_captured_json_file_sha256: null, semantic_provider_full_captured_json_canonical_sha256: expected.fullCanonical,
    provider_capture_contract: 'Full native Scrydex card is embedded only in the pinned private review after extraction from immutable HTML. No standalone full JSON file exists: its file-byte SHA stays null. Full parsed canonical hash, cached derived identity-file hash, photo HTML hash and safe identity hash are distinct. TCGdex40 and native Scrydex50 remain unmodified semantic witnesses, not photo provenance.',
    actual_pixel_signature: raw.acceptedActualPixelSignature, actual_pixel_signature_sha256: expected.actual,
    approved_projection_row_canonical_json_sha256: expected.row, independent_selection_raw_canonical_json_sha256: expected.peer,
    independent_selection_public_canonical_json_sha256: expected.publicPeer, independent_selection: publicPeer,
    historical_association: { selected_source_card_id: raw.historicalSelectedSourceCardId, selected_metadata_candidate_source_id: raw.historicalSelectedMetadataCandidateSourceId, preparation_approved: raw.historicalPreparationApproved, publication_approved: raw.historicalPublicationApproved, hold_file_sha256: raw.historicalHold.sha256, observation_file_sha256: raw.historicalObservation.sha256 },
    pixel_observations: raw.independentDirectObservation, pixel_observations_canonical_json_sha256: expected.observations,
    accepted_qualifications: raw.acceptedSignatureQualifications, provider_discrepancies_retained: raw.sourceProviderDiscrepanciesRetained,
    quality: raw.qualityComparison, source_variant_support: raw.sourceVariantSupport, queue_controls: projectQueueControls(raw),
    current_acceptance: { independently_accepted: true, source_code: 'pokellector', source_card_id: expected.provider, original_sha256: expected.original, category: 'Pokemon' },
    generic_other_rows_may_relax: false, vendor_licence_verified: false, sourcewide_approval: false, physical_edition_verified: false, physical_finish_verified: false,
  });
}
export function validatePublishedWitness(body, row) {
  knownSource(row.printing_id); publicProjection(body);
  check(row.source_code === 'pokellector' && row.provider_id === expected.provider && row.image_url === expected.imageUrl && body.contract === 'stackr-ja-neo1-slowpoke1-identity-v1' && body.accepted_category === 'Pokemon', 'Exact1 photo source changed');
  check(body.approved_projection_row_canonical_json_sha256 === expected.row && body.independent_selection_raw_canonical_json_sha256 === expected.peer && canonicalHash(body.independent_selection) === expected.publicPeer && body.independent_selection_public_canonical_json_sha256 === expected.publicPeer, 'Raw/root/public projection contract changed');
  check(body.photo_source_raw_html_sha256 === expected.photoHtml && body.native_semantic_raw_html_sha256 === expected.nativeHtml && body.cached_native_identity_file_sha256 === expected.cachedIdentity && body.semantic_provider_full_captured_json_file_sha256 === null && body.semantic_provider_full_captured_json_canonical_sha256 === expected.fullCanonical, 'Distinct photoHTML/nativeHTML/derivedfile/embeddedJSON hashes changed');
  check(canonicalHash(body.provider_metadata_identity_projection) === expected.identity && body.provider_metadata_identity_projection_sha256 === expected.identity && canonicalHash(body.pixel_observations) === expected.observations, 'Identity/actual observations changed');
  check(canonicalHash(body.quality) === expected.quality && body.quality.genuineNativeResolutionGainCertified === false && body.quality.providerNeverUpscaledCertified === false && body.quality.hd720x1008 === false, 'PNG history/no-native-gain qualification changed');
  check(body.actual_pixel_signature_sha256 === expected.actual && canonicalHash(body.accepted_qualifications) === expected.qualifications && canonicalHash(body.provider_discrepancies_retained) === expected.discrepancies, 'Full accepted qualifications/raw disagreements changed');
  check(body.historical_association.selected_source_card_id === null && body.historical_association.selected_metadata_candidate_source_id === null && body.historical_association.preparation_approved === false && body.historical_association.publication_approved === false && body.historical_association.hold_file_sha256 === expected.holdSha256 && body.historical_association.observation_file_sha256 === expected.oldObservationSha256, 'Immutable historical hold/false flags changed');
  validateActual(body.actual_pixel_signature); return expected;
}
