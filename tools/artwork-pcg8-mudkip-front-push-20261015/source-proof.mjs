import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "23728d2b-ddc5-483b-bc3a-dd19bd9e5a45": {
    "rawCanonicalSha256": "83665daf4a34e84499f664e4fe060aefdb16b6b455de6a0718c6029dbe881ffe",
    "bodyCanonicalSha256": "1ff10b8b93305610b66d14691854051c9cae43e526ea3524e8b772b2aa39fe32",
    "controlsCanonicalSha256": "aa058f3b467aa55118c5d3b63bacea2bcd59a110fc8242dbd33eba357aa41a27",
    "rowCanonicalSha256": "0ffb0e9949bcad63df6b615862f997fd9efbb35da1ce5d0b45ecc9fe04dae205",
    "actualCanonicalSha256": "dddbd224bb2861c5277e747e3ae8d4b0704c642802f97ff08185637c58fb3057",
    "production": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "b75dc155-b702-40e1-ad25-9cbcd0e5ab38",
        "finish_code": "normal",
        "printing_id": "23728d2b-ddc5-483b-bc3a-dd19bd9e5a45",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "マッドキップ",
        "collector_number": "021",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "b75dc155-b702-40e1-ad25-9cbcd0e5ab38",
        "finish_code": "normal",
        "printing_id": "23728d2b-ddc5-483b-bc3a-dd19bd9e5a45",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "マッドキップ",
        "collector_number": "021",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:7fbfa93738aafd12a7cd597323758460272be2129c9a61ba267a359a8340a6fb",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/mudkip-21",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/02b9b8572bcb48987608ff6cbff31cff0931afc73003469191c942f5420f6cd9/1600.jpg",
    "original": {
      "sha256": "46161031c73062f381f73404a440f610bfd0a9f8f911ebac2a26a95e1644f8d2",
      "bytes": 512378,
      "width": 1022,
      "height": 1409,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "3f7ba5f55cb7fbae6c6ce008ed1cd2d8d30b396add5a525a831a8933e3734231"
    }
  }
};
const authority={
  "approvedCanonicalSha256": "02cd89987602a7cf80b9df4b2ccc7abd503d98786cd6ed6f5d7ee23433d8f098",
  "decisionCanonicalSha256": "423802f1f94007e366d5745045d420bd90ba6305e50c876ade98372562bc099f",
  "correctionCanonicalSha256": "bf9ecca98459719bb4938bcf74991a0cbcaac1c22c338ac105297520afbfec20",
  "approvedFileSha256": "881d8f89601c9490a9f973e8bc403652ba3d7847cb5be95a927f25deb95e6cf3",
  "decisionFileSha256": "7c958bfa3bd63b3cec05ea32952fcd367c53aebd24a094fcbe6a7c1043727b40",
  "correctionFileSha256": "aebfc103657ac6f98c0774fc1fde537cb8b6ed65015632cbc0292232c48139ad",
  "supersededApprovalFileSha256": "af1a25a61f05fac2aefc204d1d3fdf684e594fbbb64d2e3910c8bd60fba60630",
  "supersededDecisionFileSha256": "b50b5d76be627a62aeae49dd6cf01dce705a586b26046ae0cbaaee9ae175429e"
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese PCG8 Mudkip021 shared front');return known;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;}
export const publicationBody=publicProjection;
export function validateCorrectedAuthorityPackets(approved,decision,correction){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256&&canonicalHash(correction)===authority.correctionCanonicalSha256,'Only exact corrected Mudkip approval/decision/correction receipt are authoritative');
 check(approved.rows.length===1&&approved.rows[0].printingId==='23728d2b-ddc5-483b-bc3a-dd19bd9e5a45'&&approved.rows[0].requiredAssetScope.printingId===approved.rows[0].printingId&&approved.rows[0].requiredAssetScope.variantId===null,'Corrected root nested asset scope must match Mudkip printing');
 check(decision.approvedProjectionSha256===authority.approvedFileSha256&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.productionSourceChangesAllowed===0&&decision.newProductionSource===null&&decision.scopeCorrectionOnly===true,'Corrected finite authority and zero production source writes required');
 check(correction.newApprovedSourceSha256===authority.approvedFileSha256&&correction.newFiniteDecisionSha256===authority.decisionFileSha256&&correction.oldApprovedSourceSha256===authority.supersededApprovalFileSha256&&correction.oldFiniteDecisionSha256===authority.supersededDecisionFileSha256&&correction.preparedUploadedOrPublishedUnderOldScope===0&&correction.originalHistoricalFilesRetained===true,'Superseded wrong-scope packets remain historical and rejected');return true;
}
export function validateActual(a,known){
 check(canonicalHash(a)===known.actualCanonicalSha256,'Complete actual Japanese Mudkip signature changed');
 check(a.alias==='PCG8-021'&&a.printedNativeName==='ミズゴロウ'&&a.printedHP===50&&a.printedType==='Water'&&a.printedStage==='たね'&&a.printedDeltaSpeciesLabel===null&&a.printedCollectorNumber==='021/075','Exact actual Japanese Mudkip name/noDelta/HP/type/stage/number required');
 check(a.abilities.length===0&&canonicalHash(a.attacks)===canonicalHash([{name:'ひとやすみ',cost:['Colorless'],printedDamage:null,nativeText:'自分のダメージカウンターを2個とりのぞく。'},{name:'たきのぼり',cost:['Water','Colorless'],printedDamage:'20',nativeText:null}]),'Actual remove-two self counters and Water+Colorless20 no-effect attack required');
 check(a.printedArtist==='Hajime Kusajima'&&a.printedWeakness==='Grass'&&a.printedResistance===null&&a.printedRetreat===1&&a.printedRarityGlyph==='black circle'&&!Object.hasOwn(a,'printedNationalDex')&&!Object.hasOwn(a,'nationalDex')&&!Object.hasOwn(a,'literalPrintedSetCodePCG8'),'Actual artist/footer; no invented Dex or literal PCG8 required');
 check(a.allFourOuterPerimetersAndCornersVisible===true&&a.completePrintedBodyReadable===true&&a.foreignWatermarkObserved===false&&a.editionStampObserved===false&&canonicalHash(a.holds)===canonicalHash(['current_physical_edition_unresolved']),'Whole front and unresolved physical-edition hold required');
}
function validateNestedScope(raw,body){check(raw.requiredAssetScope.printingId===raw.printingId&&raw.requiredAssetScope.variantId===null&&body.required_asset_scope.printing_id===raw.printingId&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===raw.printingId,'Nested printing scope must match exact Mudkip printing, never another card');}
export function validateSourceRow(raw,body,controls){
 const known=knownSource(raw.printingId);validateNestedScope(raw,body);
 check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact corrected root raw/body/controls/current tuples changed');
 check(raw.languageCode==='ja'&&raw.setCode==='PCG8'&&raw.canonicalAlias==='021'&&raw.category==='Pokemon'&&raw.currentNativeLabel==='マッドキップ'&&raw.workType==='CARDS'&&raw.batchId==='JP-CARDS-040'&&raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Exact Japanese Mudkip and historical source-only authority required');
 check(raw.sourceProviderProductId==='3439734'&&raw.historicalProposedProductSourceId==='pricecharting:3439734'&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+raw.literalImageUrlSha256&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity distinct from product and qualified provider text required');validateActual(raw.actualPixelSignature,known);return known;
}
export function validatePublishedWitness(body,row){
 const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned complete Japanese Mudkip witness changed');validateActual(body.actual_pixel_signature,known);
 check(row.language_code==='ja'&&row.set_code==='PCG8'&&row.collector_number==='021'&&row.card_native_name==='マッドキップ'&&row.work_type==='CARDS'&&row.batch_id==='JP-CARDS-040'&&row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal photo attribution or current canonical identity changed');
 check(body.accepted_category==='Pokemon'&&body.work_type==='CARDS'&&body.required_asset_scope.printing_id===row.printing_id&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===row.printing_id&&body.source_variant_id===null&&body.required_delivery_kind==='shared','Exact same-printing shared nested asset/source scope required');
 const finite=body.root_finite_authority;check(finite.decision_file_byte_sha256===authority.decisionFileSha256&&finite.corrected_approval_sha256===authority.approvedFileSha256&&finite.scope_correction_receipt_sha256===authority.correctionFileSha256&&finite.superseded_wrong_scope_approval_sha256===authority.supersededApprovalFileSha256&&finite.private_package_is_production_ready===false,'Only corrected authority may govern this package; old wrong nested scope stays rejected');
 check(body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Historical source-only flags remain unchanged');
 for(const key of ['current_production_binding','current_staging_binding'])check(body[key].printing.id===row.printing_id&&body[key].variants.length===1&&body[key].published_bindings.length===1&&body[key].variants[0].printing_id===row.printing_id&&body[key].variants[0].id==='b75dc155-b702-40e1-ad25-9cbcd0e5ab38'&&body[key].variants[0].is_default===true&&body[key].variants[0].finish_code==='normal'&&body[key].variants[0].variant_code==='normal','Both current sole default normal tuples must match same Mudkip printing');
 const q=body.quality_qualification;check(q.original_width===1022&&q.original_height===1409&&q.original_HD_pixels===true&&q.detail_derivative_HD_pixels===false&&q.whole_original_perimeter_and_corners_retained===true&&q.app_large_expected_role==='original','Qualified original HD pixels and non-HD detail/large-original expectation required');
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.current_edition_exact_match_established===false&&body.no_observed_stamp_is_unlimited_certificate===false&&body.unresolved_physical_qualifications.length===1&&body.source_provider_body_verbatim_agreement===false&&body.canonical_translated_native_label_preserved===true,'Physical-edition and non-verbatim native-provider qualifications must remain');
 check(body.physical_finish_certified===false&&body.physical_edition_certified===false&&body.unlimited_edition_certified===false&&body.source_wide_approval===false&&body.vendor_licence_certified===false&&body.provider_never_resized_certified===false&&body.native_optical_gain_claimed===false&&body.stackr_enlargement===false,'No invented physical/unlimited/licence/sourcewide/optical certificates');return known;
}
