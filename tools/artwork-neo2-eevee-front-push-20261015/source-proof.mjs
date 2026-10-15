import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "a00039a3-9121-49a7-b6d1-f2ec4a7d5608": {
    "rawCanonicalSha256": "e2d5cd9fd1e8bba1415855f3ef61e8f8474606e9102f7a089a90858906dac30b",
    "bodyCanonicalSha256": "a919bcb80adb5b02f20374f4c6ae35934574802d875f3368575b77da58bc0486",
    "controlsCanonicalSha256": "5a032fb043b1ae480febda60cbf74ff670d859676395665a0205723c2858aa52",
    "rowCanonicalSha256": "812d63b830a1f475519f3bb11e3e00108bceeba96e5d28252edf1a70674c4899",
    "actualCanonicalSha256": "90d6a517c9a369871949b983ff213e67f6753a81dede76aaca173d88c734db70",
    "production": [
      {
        "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
        "set_code": "neo2",
        "game_code": "pokemon",
        "variant_id": "7699421e-d760-4251-a090-40166235602b",
        "finish_code": "normal",
        "printing_id": "a00039a3-9121-49a7-b6d1-f2ec4a7d5608",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "Eevee",
        "collector_number": "049",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
        "set_code": "neo2",
        "game_code": "pokemon",
        "variant_id": "7699421e-d760-4251-a090-40166235602b",
        "finish_code": "normal",
        "printing_id": "a00039a3-9121-49a7-b6d1-f2ec4a7d5608",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "Eevee",
        "collector_number": "049",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:bc0b4ef727794b09acc3c376b11cacecfe8689a4722803f9408c510dd31884de",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-crossing-the-ruins/eevee-133",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/2e343a7aafdc4faf5e6687ff62f53415569f6821740f6ee1d6b770f269290aef/1600.jpg",
    "original": {
      "sha256": "2ae17ba7ce1262dd78997956cadaac44d31f3b28b9dfdb2fe1c144829d0eda6e",
      "bytes": 285444,
      "width": 978,
      "height": 1360,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "70f2a2c5d2262234aff971fade9955b1eba4c736099cc1fa72ce27d066c014d0"
    }
  }
};
export function knownSource(id){const known=expectedRows[id];check(known,'Outside exact Japanese Neo2 Eevee');return known;}
export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['prices','sellerPrices','pricing','marketplaces','pop_reports','provider_metadata_raw','raw_html','private_path','absolutePath'].includes(key),'Private/commercial payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}
 check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b/u.test(value),'Private path/raw HTML');return value;
}
export const publicationBody=publicProjection;
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actualCanonicalSha256,'Accepted actual Japanese signature changed');
 check(actual.observedLanguage==='ja'&&actual.printedName==='イーブイ'&&actual.hp===50&&actual.printedLevel===14&&actual.printedNationalDex==='No.133'&&actual.printedCollectorNumber===null&&actual.canonical049AliasPrinted===false,'Printed Japanese Pokemon/Dex versus internal049 required');
 const clauses=actual.ability.semanticClauses;check(clauses.optionalUse===true&&clauses.basicEnergyOnlyClaimed===false&&clauses.shuffleAfter===true&&clauses.disabledWhile.join(',')==='Asleep,Paralyzed,Confused','Complete optional Energy Evolution clauses required');
 check(actual.physicalFinishCertified===false&&actual.physicalEditionCertified===false&&actual.editionStampAbsenceDoesNotCertifyUnlimited===true,'No physical edition/finish inference');
}
export function validateSourceRow(raw,body,controls){const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.rawCanonicalSha256&&canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(controls)===known.controlsCanonicalSha256,'Exact raw/public/body/controls changed');check(raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only authority must remain false/null');validateActual(raw.actualPixelSignature,known);return known;}
export function validatePublishedWitness(body,row){const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===known.controlsCanonicalSha256,'Pinned public/category witness changed');validateActual(body.actual_pixel_signature,known);check(row.source_code==='pricecharting'&&row.provider_id===known.sourceCardId&&row.image_url===known.imageUrl&&row.evidence.source_page_url===known.sourcePageUrl,'Literal source URL-hash attribution changed');check(body.required_asset_scope.variant_id===null&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.root_finite_authority.private_package_is_production_ready===false&&body.provider_body_verbatim_agreement_certified===false,'Printing-shared/private historical/provider qualification changed');return known;}
