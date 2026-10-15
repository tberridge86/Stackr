import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "4f5ffc62-ebdf-4768-a11c-7dd384c3c6d7": {
    "rawCanonicalSha256": "407312848ca1f7d624c8e42b4def1cd8d0c627ed960a9d88f518c927257770e0",
    "bodyCanonicalSha256": "fd36fe8b2bf619e76ba14b60313e28005bf7b4a31511661631271096fcf02bb8",
    "controlsCanonicalSha256": "11eaf7d4517a0f55216bcd4cbfb0a407a549691c772a4300d88402dd57d155bf",
    "rowCanonicalSha256": "fd6de37ffe34f252b1c0453e70da51bc4ddbd557c4a7b37abc58890e8a869f94",
    "actualCanonicalSha256": "aa6e7ce4687983e88d6f45e72fea3faa7e02019db34be4cee8ff9c9c4378103b",
    "production": [
      {
        "set_id": "151b0439-551d-49d6-bd35-32c4d3a2de4f",
        "set_code": "SM1+",
        "game_code": "pokemon",
        "variant_id": "95aea58b-127f-4b66-9906-2c4f2ad8763f",
        "finish_code": "holo",
        "printing_id": "4f5ffc62-ebdf-4768-a11c-7dd384c3c6d7",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "ニンフィアGX",
        "collector_number": "064",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "151b0439-551d-49d6-bd35-32c4d3a2de4f",
        "set_code": "SM1p",
        "game_code": "pokemon",
        "variant_id": "95aea58b-127f-4b66-9906-2c4f2ad8763f",
        "finish_code": "holo",
        "printing_id": "4f5ffc62-ebdf-4768-a11c-7dd384c3c6d7",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "ニンフィアGX",
        "collector_number": "064",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pokellector:photo:14613",
    "sourcePageUrl": "https://jp.pokellector.com/Sun-Moon-Strengthening-Expansion-Expansion/Sylveon-GX-Card-64",
    "imageUrl": "https://den-cards.pokellector.com/200/Sylveon-GX.SM1+.64.14613.png",
    "alias": "064",
    "category": "Pokemon",
    "original": {
      "sha256": "de6eec9518fb45321efeb85563825953599523807ae05a9ab5f4c4117f92f821",
      "bytes": 824795,
      "width": 567,
      "height": 800,
      "mime": "image/png",
      "format": "PNG",
      "rgbaSha256": "66ada6182cf770d96cc0a02dc4ce189891c90cf23aec2ff6660cea338b0bd18e"
    }
  },
  "c83aac5f-eba3-49da-baab-cbef76e8bc6e": {
    "rawCanonicalSha256": "585ee542e08ce7995adc1a333500a0febe4bdb13a476dccf9b4dffc0712ea918",
    "bodyCanonicalSha256": "280a568080bc0d1ec1cc19cb95e6ca0caf48ec520ad623a6b43f1e41cf13d5fd",
    "controlsCanonicalSha256": "05d693fe130d6fd8113add7829efbfb17a500deaf1c23d89ae70bf1a5d8e7084",
    "rowCanonicalSha256": "a333c07d188e79b42b526cbb62f94793e0c92f580c3b5dcff37411c5116336fe",
    "actualCanonicalSha256": "6f38464516e3a5eea213c2199587ba2af87127a2488d3353637851da9fafe41a",
    "production": [
      {
        "set_id": "151b0439-551d-49d6-bd35-32c4d3a2de4f",
        "set_code": "SM1+",
        "game_code": "pokemon",
        "variant_id": "b685e065-7995-4968-bc77-67826c3245fe",
        "finish_code": "holo",
        "printing_id": "c83aac5f-eba3-49da-baab-cbef76e8bc6e",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "基本草エネルギー",
        "collector_number": "068",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "151b0439-551d-49d6-bd35-32c4d3a2de4f",
        "set_code": "SM1p",
        "game_code": "pokemon",
        "variant_id": "b685e065-7995-4968-bc77-67826c3245fe",
        "finish_code": "holo",
        "printing_id": "c83aac5f-eba3-49da-baab-cbef76e8bc6e",
        "variant_code": "holo",
        "language_code": "ja",
        "card_native_name": "基本草エネルギー",
        "collector_number": "068",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pokellector:photo:23186",
    "sourcePageUrl": "https://jp.pokellector.com/Sun-Moon-Strengthening-Expansion-Expansion/Grass-Energy-Card-68",
    "imageUrl": "https://den-cards.pokellector.com/200/Grass-Energy.SM1+.68.23186.png",
    "alias": "068",
    "category": "Energy",
    "original": {
      "sha256": "2ee529ffbfc32bde464ae48193e644c8b8228f57ba05c2ca2d16207454b98289",
      "bytes": 665429,
      "width": 570,
      "height": 800,
      "mime": "image/png",
      "format": "PNG",
      "rgbaSha256": "284e7343851115701d26e22b70868ae888b2950faf75e8099af6db86916db0bf"
    }
  }
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese SM1+ sharp2 scope');return known;}
export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['prices','sellerPrices','pricing','marketplaces','pop_reports','provider_metadata_raw','raw_html','private_path','absolutePath','raw_thumb_uri'].includes(key),'Private/commercial payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}
 check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:[/\\]|<html\b/u.test(value),'Private path/raw HTML');return value;
}
export const publicationBody=publicProjection;
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actualCanonicalSha256,'Accepted actual Japanese signature changed');
 check(actual.observedLanguage==='ja'&&actual.printedSetFooter==='SM1+'&&actual.printedCollectorNumber===known.alias+'/051','Exact printed Japanese SM1+ reference required');
 if(known.category==='Pokemon'){
  check(known.alias==='064'&&actual.category==='Pokemon'&&actual.printedName==='ニンフィアGX'&&actual.hp===200&&actual.type==='Fairy'&&actual.stage==='1進化'&&actual.evolvesFromPrinted==='イーブイ'&&actual.artist==='5ban Graphics'&&actual.regulationMarkObserved==='A'&&actual.rarityGlyphTextObserved==='HR','Sylveon064 HR category and footer required');
  check(actual.attacks.length===3&&actual.attacks[0].japaneseBody.includes('3枚まで')&&actual.attacks[0].revealingCardsClaimed===false&&actual.attacks[1].damage===110&&actual.attacks[2].benchPokemonCountPrinted===2&&actual.attacks[2].upToClauseClaimed===false&&actual.attacks[2].japaneseBody.includes('すべてのカード')&&actual.attacks[2].gxUsageClause==='対戦中、自分はGXワザを1回しか使えない。'&&actual.gxRule.japaneseBody==='ポケモンGXがきぜつしたとき、相手はサイドを2枚とる。','Complete three attacks, GX usage and knockout rule required');
 }else{
  check(known.alias==='068'&&actual.category==='Energy'&&actual.printedTitleTextSegments.join(',')==='基本,エネルギー'&&actual.printedGrassTypeAsGlyphNotKanji===true&&actual.printedTypeGlyph==='Grass leaf'&&actual.rarityGlyphTextObserved==='UR','Energy068 UR glyph title required');
  check(actual.hp===null&&actual.nationalDex===null&&actual.pokemonStage===null&&actual.artist===null&&actual.rulesBody===null&&actual.attacks.length===0&&actual.regulationMarkObserved===null,'Energy cannot borrow Pokemon HP,Dex,stage,artist,rules,attacks or A mark');
 }
 check(actual.physicalFinishAuthenticated===false&&actual.physicalEditionCertified===false&&actual.stampAbsenceOr2017NotUnlimitedCertificate===true,'No physical edition/finish inference');
}
export function validateSourceRow(raw,body,controls){const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact raw/public/category body/controls changed');check(raw.workType==='SHARP'&&raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null&&raw.safePhotoIdentityProjection.selectedSourceCardId===null,'Historical SHARP source-only authority must remain false/null');validateActual(raw.actualPixelSignature,known);return known;}
export function validatePublishedWitness(body,row){
 const known=knownSource(row.printing_id);publicProjection(body);
 check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned public/category witness changed');validateActual(body.actual_pixel_signature,known);
 check(row.source_code==='pokellector'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal exact Pokellector photo attribution changed');
 check(row.work_type==='SHARP'&&body.work_type==='SHARP'&&body.required_asset_scope.variant_id===null&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.root_finite_authority.private_package_is_production_ready===false&&body.provider_body_verbatim_agreement_certified===false,'Printing-shared/private historical/category qualification changed');
 const m=body.provider_processing_metadata;check(m.raw_local_uri_excluded_from_safe_json===true&&m.raw_local_uri_remains_embedded_in_unchanged_original===true&&m.original_metadata_will_remain_publicly_visible_if_published===true&&m.original_metadata_stripped===false&&m.ordinary_noncredentialed_provider_metadata_exposure_root_accepted===true,'Unchanged public original metadata exposure must remain explicit');
 check(body.provider_never_resized_certified===false&&body.native_optical_gain_claimed===false&&body.quality_qualification.current_configured_api_image_null===true,'Provider processing and current API qualifications required');return known;
}
