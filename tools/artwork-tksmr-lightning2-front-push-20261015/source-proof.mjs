import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "d70868de-b7dc-414e-ac9f-d63055956ef0": {
    "rawCanonicalSha256": "4017c7b8d2f2a7a72ab2e1a335de69903f5a012da07f1b3c31bdaf0ed53d1764",
    "bodyCanonicalSha256": "100ba5f281050ffe0ac62b05a7fde70ff0f818ffee0fc9e2a97c6024c0d19e17",
    "controlsCanonicalSha256": "88d3b3b1a74eabe91024e98e7573a10772dc712515f17dca36876507624bc3d1",
    "rowCanonicalSha256": "4413d096387a6c80baf59b8807d12609da85bb3ad9cfa785f3cc5aea2dba80ee",
    "actualCanonicalSha256": "0a0cf3a2742145ae2a7910771d4a7dcb441c0efb47a7a470f36f96ec10d8ca71",
    "production": [
      {
        "set_id": "6bbc266c-3ebc-4f6e-a3a5-d8a6d40427b7",
        "set_code": "tk-sm-r",
        "game_code": "pokemon",
        "variant_id": "a5401eba-11c3-42f1-a05e-f76b3db9d945",
        "finish_code": "normal",
        "printing_id": "d70868de-b7dc-414e-ac9f-d63055956ef0",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Lightning Energy",
        "collector_number": "2",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "6bbc266c-3ebc-4f6e-a3a5-d8a6d40427b7",
        "set_code": "tk-sm-r",
        "game_code": "pokemon",
        "variant_id": "a5401eba-11c3-42f1-a05e-f76b3db9d945",
        "finish_code": "normal",
        "printing_id": "d70868de-b7dc-414e-ac9f-d63055956ef0",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Lightning Energy",
        "collector_number": "2",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:c476992336733cd7d8945cf4bf5c2e3e6120347a96b7672fed22fa6531630df8",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-lycanroc-%26-alolan-raichu/lightning-energy-2",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/d190a2da2b78dae7625f89adbf3ee5da3d1f7f6d276dbf813734e6f07d21f689/1600.jpg",
    "original": {
      "sha256": "aa596e1acb287f469733735faae3c4a2b9ecb614630762bed7ac31084eac1701",
      "bytes": 167616,
      "width": 1200,
      "height": 1600,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "d862b2bd6f5586fa4aad43462947ea2e665472ad754dec95ee07508e1a30ce5f"
    }
  }
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact English Lightning2 Energy');return known;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['prices','sellerPrices','pricing','marketplaces','pop_reports','provider_metadata_raw','raw_html','private_path','absolutePath'].includes(key),'Private/commercial payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b/u.test(value),'Private path/raw HTML');return value;}
export const publicationBody=publicProjection;
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actualCanonicalSha256,'Accepted exact English Energy signature changed');
 check(actual.observedLanguage==='en'&&actual.printedTitle==='ENERGY'&&actual.semanticEnergyType==='Lightning'&&actual.typeGlyph.includes('lightning bolt')&&actual.printedCollectorNumber==='2/30'&&actual.trainerKitGoldMarkObserved===true&&actual.trainerKitGoldMarkDescription.includes('Raichu')&&actual.printedSetCodeLiteral===null&&actual.literalPrintedWordsLightningOrPsychicEnergyClaimed===false,'ENERGY, bolt, exact2/30 and goldRaichu mark required');
 check(['hp','nationalDex','stage','rulesBody','artist'].every(field=>actual[field]===null)&&actual.abilities.length===0&&actual.attacks.length===0&&actual.artistCreditObserved===false&&actual.noPokemonFieldsInvented===true,'No Pokemon HP,Dex,stage,abilities,attacks,rules or artist invented');
 check(actual.allFourRoundedCornersObserved===true&&actual.fullOuterFrameVisibleCertified===true&&actual.physicalFinishAuthenticated===false&&actual.physicalEditionCertified===false&&actual.noStampAbsenceUnlimitedInference===true,'Complete source photograph without physical edition/finish inference required');
}
export function validateSourceRow(raw,body,controls){const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact English Energy raw/public/body/controls changed');check(raw.languageCode==='en'&&raw.category==='Energy'&&raw.currentNativeLabel==='Lightning Energy'&&raw.workType==='CARDS'&&raw.batchId==='EN-CARDS-020'&&raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only authority and exact Energy scope required');check(raw.sourceProviderProductId==='6610761'&&raw.historicalProposedProductSourceId==='pricecharting:6610761'&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+raw.literalImageUrlSha256,'Literal photo identity distinct from product6610761 required');validateActual(raw.actualPixelSignature,known);return known;}
export function validatePublishedWitness(body,row){
 const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned English Energy witness changed');validateActual(body.actual_pixel_signature,known);
 check(row.work_type==='CARDS'&&row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal photo URL-hash attribution changed');
 check(body.accepted_category==='Energy'&&body.work_type==='CARDS'&&body.required_asset_scope.variant_id===null&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.root_finite_authority.private_package_is_production_ready===false,'Printing-shared historical authority scope required');
 for(const key of ['current_production_binding','current_staging_binding'])check(body[key].variants.length===1&&body[key].variants[0].id==='a5401eba-11c3-42f1-a05e-f76b3db9d945'&&body[key].variants[0].is_default===true&&body[key].variants[0].finish_code==='normal','Both current sole default normal tuples required');
 const q=body.quality_qualification;check(q.original_width===1200&&q.original_height===1600&&q.original_HD_pixels===true&&q.detail_derivative_HD_pixels===false&&q.whole_uncropped_fabric_photograph_retained===true&&q.glare_uneven_lighting_shadow_perspective_surface_specks_retained===true&&q.pristine_condition_certified===false&&body.native_optical_gain_claimed===false&&body.provider_never_resized_certified===false,'Full imperfect photograph and qualified measured HD dimensions required');return known;
}
