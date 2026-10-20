import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "fe6b6d80-68b7-4f89-9087-7f84b760e651": {
    "rawCanonicalSha256": "75b8d04f2ab909a5ad9d34214558981b2ca3dccb0deb1053106d5187821085ec",
    "bodyCanonicalSha256": "ac45884e4b10b3affd4a2fe8535a844c1276693b5f350c3eef207457e1cf751d",
    "controlsCanonicalSha256": "1c63325f185838bf09b3e8bb47558837aa250eb30e160d54aa68ab9087efe846",
    "rowCanonicalSha256": "c3ab3494f2ea65f9dda2ccce5357ce04b9ccd4a3575123b0cba8761a811df96b",
    "actualCanonicalSha256": "ee8a7bdb706eb66b7eb264ed3364287c342947a94f8b400b7059428d87b77f8a",
    "production": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "f131958f-ac07-435c-b76c-d8a697cdec9a",
        "finish_code": "holo",
        "printing_id": "fe6b6d80-68b7-4f89-9087-7f84b760e651",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "セレビの星",
        "collector_number": "004",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "game_code": "pokemon",
        "variant_id": "f131958f-ac07-435c-b76c-d8a697cdec9a",
        "finish_code": "holo",
        "printing_id": "fe6b6d80-68b7-4f89-9087-7f84b760e651",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "セレビの星",
        "collector_number": "004",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:8e0845a7ef2d92507055a63401a2fb458dd51478ccddee780d3993a4bbb50d33",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/celebi-gold-star-4",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/a5b43f818e44b0e7982998802ebf16d0613a04ee7f0104cc876b7b12024a8816/1600.jpg",
    "original": {
      "sha256": "2b203f91d7b2cf65fc4959b36e0f02ffee256cb923273e015c7a66cecbfd701a",
      "bytes": 63097,
      "width": 459,
      "height": 648,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "d2255a2e40091620c3bcd51d605235a1aaab0a311bbf89bda660e4fccfd42f32"
    }
  }
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese PCG8 Celebi');return known;}
export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['prices','sellerPrices','pricing','marketplaces','pop_reports','provider_metadata_raw','raw_html','private_path','absolutePath'].includes(key),'Private/commercial payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}
 check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\/]|file:\/\/|<html\b/u.test(value),'Private path/raw HTML');return value;
}
export const publicationBody=publicProjection;
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actualCanonicalSha256,'Accepted root-corrected Japanese signature changed');
 check(actual.category==='Pokemon'&&actual.observedLanguage==='ja'&&actual.printedName==='セレビィ☆'&&actual.hp===60&&actual.type==='Grass'&&actual.stage==='たね'&&actual.artist==='Masakazu Fukuda'&&actual.printedCollectorNumber==='004/075'&&actual.printedSetCodeLiteral===null&&actual.printedNationalDex===null,'Actual Japanese identity, printed collector and nonliteral set association required');
 check(actual.starDeckRule==='ポケモン☆は、デッキに1枚しか入れることができない。'&&actual.ability.type==='ポケパワー'&&actual.ability.name==='ときわたり'&&actual.ability.japaneseBody.includes('コインを1回投げてオモテなら')&&Object.values(actual.ability.semanticConditions).every(value=>value===true),'Complete star deck rule and corrected trigger/coin/heads/discard/bottom-deck clauses required');
 check(actual.attack.name==='リーフシェイド'&&actual.attack.cost.join(',')==='Grass'&&actual.attack.japaneseBody==='自分のエネルギーの数ぶんのダメージカウンターを、相手のポケモン1匹にのせる。'&&actual.attack.energyScopeEnglishGloss===null&&actual.attack.energyScopeEnglishInterpretationCertified===false&&actual.attack.doesNotInventWholeBoardOrExplicitCelebiAttachmentRestriction===true,'Literal Leaf Shade Japanese without invented English energy scope required');
 check(actual.physicalFinishAuthenticated===false&&actual.physicalEditionCertified===false&&actual.stampAbsenceDoesNotCertifyUnlimited===true,'No physical edition/finish inference');
}
export function validateSourceRow(raw,body,controls){const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact corrected raw/public/body/controls changed');check(raw.workType==='CARDS'&&raw.batchId==='JP-CARDS-040'&&raw.currentNativeLabel==='セレビの星'&&raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only authority and current canonical label must remain unchanged');check(raw.sourceProviderProductId==='5075762'&&raw.historicalProposedProductSourceId==='pricecharting:5075762'&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+raw.literalImageUrlSha256,'Literal selected photo identity must remain separate from product ID');check(raw.eligibleVariantIsDefaultFlag===false&&raw.currentActualApiDefaultVariantId==='f131958f-ac07-435c-b76c-d8a697cdec9a','Current nondefault catalogue flag and actual API default must remain unchanged');validateActual(raw.actualPixelSignature,known);return known;}
export function validatePublishedWitness(body,row){const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned public/category witness changed');validateActual(body.actual_pixel_signature,known);check(row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal source photo URL-hash attribution changed');check(body.work_type==='CARDS'&&body.accepted_category==='Pokemon'&&body.required_asset_scope.variant_id===null&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.root_finite_authority.private_package_is_production_ready===false&&body.provider_body_verbatim_agreement_certified===false&&body.native_provider_japanese_corruption_qualified===true,'Printing-shared/private historical/native corruption qualification changed');for(const key of ['current_production_binding','current_staging_binding'])check(body[key].variants.length===1&&body[key].variants[0].is_default===false&&body[key].variants[0].id==='f131958f-ac07-435c-b76c-d8a697cdec9a'&&body[key].variants[0].finish_code==='holo','Both existing nondefault holo tuples must remain unchanged');check(body.native_optical_gain_claimed===false&&body.provider_never_resized_certified===false&&body.quality_qualification.HD_size===false,'No HD/native optical/provider no-resize certificate');return known;}
