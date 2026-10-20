import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "c74b44da-73e0-4e07-9950-5c1adb74784b": {
    "rawCanonicalSha256": "331a5675300ee48540b1406bfb01b021108fdc999af1f4b189b62e4c9a9c3493",
    "bodyCanonicalSha256": "d66b89dc98c09130386f32830a8daed1fec4957b08258edcdfb352a3b4fa53cd",
    "controlsCanonicalSha256": "65287c9dbbd09af1d9469803008a45124401ae19d110fb0556cc96783c652ab6",
    "rowCanonicalSha256": "601ffdc712a424e344d23c43ca6c0e49d711a79fd7c91f73f45347fcbe5a6763",
    "actualCanonicalSha256": "0fac9b02bfd10d971201ad47b9f230947bbefc8d3de16e2c9d0bc4c38667080a",
    "production": [
      {
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "game_code": "pokemon",
        "variant_id": "ba7421c1-b1ca-4345-ba12-2777c8867b38",
        "finish_code": "normal",
        "printing_id": "c74b44da-73e0-4e07-9950-5c1adb74784b",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "ウーパー（デルタ種）",
        "collector_number": "005",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "game_code": "pokemon",
        "variant_id": "ba7421c1-b1ca-4345-ba12-2777c8867b38",
        "finish_code": "normal",
        "printing_id": "c74b44da-73e0-4e07-9950-5c1adb74784b",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "ウーパー（デルタ種）",
        "collector_number": "005",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:fc70a9b103f26e73964e5207e8c15aea3e7a4fe44f38d0b8a8b69529b27829b8",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-offense-and-defense-of-the-furthest-ends/wooper-5",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/j4fqslsao3jnaa76/1600.jpg",
    "original": {
      "sha256": "63b1a0d68c9c4cc22ee544481624ca27cbf265a17a8eaab65a483bd7ec459a11",
      "bytes": 245386,
      "width": 1103,
      "height": 1520,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "16832dd2b34d0263c0df3f8cbcfd98a3a36b0a13ff1c0d58d16ca84c4fb52d6f"
    }
  }
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese PCG9 Wooper005 shared front');return known;}
export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){
  for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));
 }
 check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;
}
export const publicationBody=publicProjection;
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actualCanonicalSha256,'Accepted complete Japanese Wooper actual signature changed');
 check(actual.alias==='PCG9-005'&&actual.category==='Pokemon'&&actual.language==='ja'&&actual.printedNativeName==='ウパー'&&actual.printedDeltaSpeciesLabel==='δ-デルタ種'&&actual.printedHP===40&&actual.printedType==='Grass'&&actual.printedStage==='たね'&&actual.printedCollectorNumber==='005/068','Exact actual Japanese Delta form/HP/type/stage/number required');
 check(actual.abilities.length===0&&canonicalHash(actual.attacks)===canonicalHash([{name:'ドわすれ',cost:['Colorless'],printedDamage:null,nativeText:'相手の持っているワザを1つ選ぶ。次の相手の番、このワザを受けた相手は、そのワザを使うことができない。'},{name:'しっぽでたたく',cost:['Grass','Colorless'],printedDamage:'20',nativeText:null}]),'Complete actual Japanese attacks, costs, damage, target and next-turn timing required');
 check(actual.printedArtist==='Tomokazu Komiya'&&actual.printedWeakness==='Grass'&&actual.printedResistance===null&&actual.printedRetreat===1&&actual.printedRarityGlyph==='black circle'&&actual.literalPrintedSetCodePCG9===false&&!Object.hasOwn(actual,'printedNationalDex'),'Actual artist/footer, no invented literal PCG9 or Dex required');
 check(actual.allFourOuterPerimetersAndCornersVisible===true&&actual.completePrintedBodyReadable===true&&actual.foreignWatermarkObserved===false&&actual.editionStampObserved===false&&actual.currentEditionExactMatchEstablished===false&&actual.noObservedStampIsUnlimitedCertificate===false&&canonicalHash(actual.holds)===canonicalHash(['current_physical_edition_unresolved']),'Whole front with unresolved physical-edition qualification required');
}
export function validateSourceRow(raw,body,controls){
 const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact raw root source/body/controls/current tuples changed');
 check(raw.languageCode==='ja'&&raw.setCode==='PCG9'&&raw.canonicalAlias==='005'&&raw.category==='Pokemon'&&raw.currentNativeLabel==='ウーパー（デルタ種）'&&raw.workType==='CARDS'&&raw.batchId==='JP-CARDS-043'&&raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Exact Japanese scope and historical source-only authority required');
 check(raw.sourceProviderProductId==='3439801'&&raw.historicalProposedProductSourceId==='pricecharting:3439801'&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+raw.literalImageUrlSha256&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity distinct from product and qualified provider text required');
 validateActual(raw.actualPixelSignature,known);return known;
}
export function validatePublishedWitness(body,row){
 const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned full Japanese Wooper witness changed');validateActual(body.actual_pixel_signature,known);
 check(row.language_code==='ja'&&row.set_code==='PCG9'&&row.collector_number==='005'&&row.card_native_name==='ウーパー（デルタ種）'&&row.work_type==='CARDS'&&row.batch_id==='JP-CARDS-043'&&row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal photo attribution or current Japanese canonical identity changed');
 check(body.accepted_category==='Pokemon'&&body.work_type==='CARDS'&&body.required_asset_scope.variant_id===null&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.root_finite_authority.private_package_is_production_ready===false&&body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Printing-shared historical authority scope required');
 for(const key of ['current_production_binding','current_staging_binding'])check(body[key].variants.length===1&&body[key].published_bindings.length===1&&body[key].variants[0].id==='ba7421c1-b1ca-4345-ba12-2777c8867b38'&&body[key].variants[0].is_default===true&&body[key].variants[0].finish_code==='normal'&&body[key].variants[0].variant_code==='normal','Both current sole default normal tuples required');
 const q=body.quality_qualification;check(q.original_width===1103&&q.original_height===1520&&q.original_HD_pixels===true&&q.detail_derivative_HD_pixels===false&&q.whole_original_perimeter_and_corners_retained===true&&q.app_large_expected_role==='original','Qualified measured original/detail pixels and large-original expectation required');
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.unresolved_physical_qualifications.length===1&&body.source_provider_body_verbatim_agreement===false&&body.canonical_translated_native_label_preserved===true,'Physical-edition and non-verbatim native-provider qualifications must remain');
 check(body.physical_finish_certified===false&&body.physical_edition_certified===false&&body.unlimited_edition_certified===false&&body.source_wide_approval===false&&body.vendor_licence_certified===false&&body.provider_never_resized_certified===false&&body.native_optical_gain_claimed===false&&body.stackr_enlargement===false,'No invented physical, unlimited, licence, sourcewide or optical certifications');return known;
}
