import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "1ec3e5ff-f0c2-4ff2-8423-9021a810f5b7": {
    "rawCanonicalSha256": "86ab8bd636b878c8e3f73ea8221709559c467b0e0ee2a8653e31f80713ef1f9b",
    "bodyCanonicalSha256": "2d03398c1e6cd024ac8e19e84a8392104725eb2d9f966e764a96cc7f07ac88de",
    "controlsCanonicalSha256": "463d06cf5637e3fdb10285e2370dbeddbdf870dfd17fbbf9b0cb358cc72640b3",
    "rowCanonicalSha256": "81ad4b84b3944c85f909a4745f499a5a2148eb87e858d0f52df7522f7c58d2dc",
    "actualCanonicalSha256": "ee451cfad67d03ae89b4f2d098c27f0d9de4a8b9dd6cda709e3128e2f1a59f6e",
    "production": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "c1697767-547d-4c48-a774-ccb5357f07b4",
        "finish_code": "holo",
        "printing_id": "1ec3e5ff-f0c2-4ff2-8423-9021a810f5b7",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "luvdisc",
        "collector_number": "027",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "c1697767-547d-4c48-a774-ccb5357f07b4",
        "finish_code": "holo",
        "printing_id": "1ec3e5ff-f0c2-4ff2-8423-9021a810f5b7",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "luvdisc",
        "collector_number": "027",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:db50605658ba522392b809aea4200d8d2cef733f30c4cd75bd20ea3296720f8c",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/luvdisc-27",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/7a9b921596b750b23bf473eed1864bed1eb2904b414a9c2ff87f80f075a19024/1600.jpg",
    "original": {
      "sha256": "caf0171a65a1a8d2c6ab7350ba201d270316dcf1767f13a628243dee15f54356",
      "bytes": 540677,
      "width": 1020,
      "height": 1403,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "c92fe3b0c84696dbf2def7c4a4cafbaa713439102ed4d80afc3eaebcab7ddfdf"
    }
  }
};
const authority={
  "approvedCanonicalSha256": "351eb21155468f6935bd2fb45b473b9276be432de37b0fc841840189784da98f",
  "decisionCanonicalSha256": "bff17ac5bba3afbfd08a1cdd2239db141880789efc3d2e543945e20e390a7800",
  "approvedFileSha256": "0d51946911fdb2635591bee7b0af18eaf435784845c164970f4cb1688b4f57af",
  "decisionFileSha256": "18d97d8614e1593fd437dc8e1720caaa31831e1ec899ccbc0a30761c70b11eff",
  "rootContextFileSha256": "7ac4ebf7a643e942c2694b880d5b31d2d88e6692d35a07130c694f970ef8aa56"
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese PCG8 Luvdisc027 shared front');return known;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;}
export const publicationBody=publicProjection;
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Only exact root Luvdisc approval and finite decision are authoritative');
 const r=approved.rows[0];check(approved.rows.length===1&&r.printingId==='1ec3e5ff-f0c2-4ff2-8423-9021a810f5b7'&&r.requiredAssetScope.printingId===r.printingId&&r.requiredAssetScope.variantId===null,'Root nested asset scope must match exact Luvdisc printing');
 check(decision.approvedProjectionSha256===authority.approvedFileSha256&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.productionSourceChangesAllowed===0&&decision.newProductionSource===null&&decision.printingIds.length===1&&decision.printingIds[0]===r.printingId&&decision.variantIds.length===1&&decision.variantIds[0]==='c1697767-547d-4c48-a774-ccb5357f07b4','Exact finite authority and zero production source writes required');return true;
}
export function validateActual(w,known){
 check(canonicalHash(w)===known.actualCanonicalSha256,'Complete original wrapped actual Japanese Luvdisc signature changed');
 const a=w.actualPrintedObservations;check(w.alias==='PCG8-027'&&w.originalSha256===known.original.sha256&&a&&a.printedNativeName==='ラブカス'&&a.category==='Pokemon'&&a.printedForm===null&&a.printedHP===60&&a.printedType==='Water'&&a.printedStage==='たね'&&a.printedCollectorNumber==='027/075','Exact nested Japanese Luvdisc name/noDelta/HP/type/stage/number required');
 check(a.abilities.length===0&&canonicalHash(a.attacks)===canonicalHash([{name:'おあいこ',cost:['Colorless'],printedDamage:null,nativeText:'自分の山札から、相手のポケモンの数ぶんまでの「たねポケモン」を選び出し、自分のベンチに出す。その後、その山札を切る。'},{name:'スタジアムプレイ',cost:['Colorless'],printedDamage:'10',nativeText:'場に自分の「スタジアム」があるなら、自分のポケモン全員のダメージカウンターを、それぞれ1個ずつとりのぞく。場に相手の「スタジアム」があるなら、相手のベンチポケモン全員にも、それぞれ10ダメージ。'}]),'Complete Japanese deck/opponent-count/own-bench/shuffle and both Stadium clauses required');
 check(a.printedArtist==='Kyoko Umemoto'&&a.printedWeakness==='Lightning'&&a.printedResistance===null&&a.printedRetreat===1&&a.printedRarityGlyph==='black star'&&a.printedNationalDex===null&&a.printedSetCodeLiteral===null,'Actual artist/footer and no invented Dex or literal PCG8 required');
 check(a.allFourOuterPerimetersAndCornersVisible===true&&a.foreignWatermarkObserved===false&&a.editionStampObserved===false&&w.completePrintedIdentityAndBodyReadable===true&&canonicalHash(w.holds)===canonicalHash(['current_physical_edition_unresolved']),'Whole front and historical unresolved physical-edition hold required');
}
export function validateSourceRow(raw,body,controls){
 const known=knownSource(raw.printingId);check(raw.requiredAssetScope.printingId===raw.printingId&&raw.requiredAssetScope.variantId===null&&body.required_asset_scope.printing_id===raw.printingId&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===raw.printingId,'Nested same-printing shared scope required');
 check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact root raw/body/controls/current tuples changed');
 check(raw.languageCode==='ja'&&raw.setCode==='PCG8'&&raw.canonicalAlias==='027'&&raw.category==='Pokemon'&&raw.currentNativeLabel==='luvdisc'&&raw.workType==='CARDS'&&raw.batchId==='JP-CARDS-041'&&raw.preparationApproved===true&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Exact Japanese Luvdisc finite preparation and historical authority required');
 check(raw.sourceProviderProductId==='3439740'&&raw.historicalProposedProductSourceId==='pricecharting:3439740'&&raw.literalImageUrlSha256==='db50605658ba522392b809aea4200d8d2cef733f30c4cd75bd20ea3296720f8c'&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+raw.literalImageUrlSha256&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity distinct from product and qualified provider text required');
 check(raw.eligibleVariantIsDefaultFlag===false&&raw.currentActualApiDefaultVariantId==='c1697767-547d-4c48-a774-ccb5357f07b4','Sole holo false flag and actual fallback default must remain distinct');validateActual(raw.actualPixelSignature,known);return known;
}
export function validatePublishedWitness(body,row){
 const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned complete Japanese Luvdisc witness changed');validateActual(body.actual_pixel_signature,known);
 check(row.language_code==='ja'&&row.set_code==='PCG8'&&row.collector_number==='027'&&row.card_native_name==='luvdisc'&&row.work_type==='CARDS'&&row.batch_id==='JP-CARDS-041'&&row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal photo attribution or current canonical identity changed');
 check(body.accepted_category==='Pokemon'&&body.work_type==='CARDS'&&body.required_asset_scope.printing_id===row.printing_id&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===row.printing_id&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.source_signature_wrapper_preserved===true&&body.actual_pixel_signature_canonical_sha256===known.actualCanonicalSha256,'Exact same-printing shared source/asset scope and wrapped signature required');
 const finite=body.root_finite_authority;check(finite.decision_file_byte_sha256===authority.decisionFileSha256&&finite.approved_projection_file_byte_sha256===authority.approvedFileSha256&&finite.root_private_context_file_byte_sha256===authority.rootContextFileSha256&&finite.preparation_approved===true&&finite.conditional_future_publication_approved===true&&finite.private_package_is_production_ready===false,'Exact finite root authority required');
 check(body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Historical source-only false/null flags remain unchanged');
 for(const key of ['current_production_binding','current_staging_binding']){const b=body[key],v=b.variants[0],p=b.published_bindings[0];check(b.printing.id===row.printing_id&&b.variants.length===1&&b.published_bindings.length===1&&v.printing_id===row.printing_id&&p.printing_id===row.printing_id&&v.id==='c1697767-547d-4c48-a774-ccb5357f07b4'&&p.variant_id===v.id&&v.is_default===false&&v.finish_code==='holo'&&v.variant_code==='holo'&&p.finish_code==='holo'&&p.variant_code==='holo','Both current sole holo tuples and false default flags required');}
 check(body.current_holo_is_default_false_retained===true&&body.actual_api_default_variant_id==='c1697767-547d-4c48-a774-ccb5357f07b4','Actual API fallback default does not authorise false flag rewrite');
 const q=body.quality_qualification;check(q.original_width===1020&&q.original_height===1403&&q.original_HD_pixels===true&&q.detail_derivative_HD_pixels===false&&q.whole_original_perimeter_and_corners_retained===true&&q.app_large_expected_role==='original','Unchanged original HD pixels, non-HD detail and large-original expectation required');
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.current_edition_exact_match_established===false&&body.no_observed_stamp_is_unlimited_certificate===false&&body.unresolved_physical_qualifications.length===1&&body.source_provider_body_verbatim_agreement===false&&body.provider_unprinted_weakness_resistance_parenthetical_included===false&&body.canonical_translated_native_label_preserved===true,'Physical-edition and nonverbatim provider qualifications required; exclude unprinted parenthetical');
 for(const k of ['physical_finish_certified','physical_edition_certified','physical_material_authenticity_verified','unlimited_edition_certified','source_wide_approval','vendor_licence_certified','provider_never_resized_certified','native_optical_gain_claimed','stackr_enlargement','full_commercial_html_or_provider_json_included'])check(body[k]===false,'No invented physical/licence/sourcewide/optical certificates or raw metadata');return known;
}
