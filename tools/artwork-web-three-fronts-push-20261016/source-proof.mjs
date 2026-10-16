import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "1b1f1db9-6e91-4cf5-8852-e11dfac760b8": {
    "rawCanonicalSha256": "30d12ca85f0b0265df4199c1622c42f4c493c8a0ccabd7bbb7230b618da2e9ab",
    "bodyCanonicalSha256": "321a8861f1c04be4c39a056431d0f786501ee8706461f102e6a6064c6917945e",
    "controlsCanonicalSha256": "5e776d46f12276a1e0f1047614b5917873cece0dfd1f45b1fbdc6ba8012fd914",
    "rowCanonicalSha256": "062e0581eec17a98719b84a158587d78450fd73adc758852eb60ce6b661e5f3b",
    "actualCanonicalSha256": "2a6873bd8485385ce968db124476284e6f65072a4a47ad6395f025fd9453c32d",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "cab43ba9-aaa5-4c7b-ae3d-f6fc35dec8c0",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "1b1f1db9-6e91-4cf5-8852-e11dfac760b8",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:008:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "008",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "cab43ba9-aaa5-4c7b-ae3d-f6fc35dec8c0",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "1b1f1db9-6e91-4cf5-8852-e11dfac760b8",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:008:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "008",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:babe13985dd7d12e754899c38869c567149631c797362743600720622dcdb6f1",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/vulpix-8",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/255bk2q7dy3sm64y/1600.jpg",
    "productId": "3438191",
    "setCode": "web1",
    "alias": "008",
    "currentLabel": "Vulpix",
    "printedName": "ロコン",
    "printedForm": null,
    "category": null,
    "hp": 50,
    "type": "Fire",
    "stage": "たねポケモン",
    "evolvesFrom": null,
    "collector": "008/048",
    "artist": "Atsuko Nishida",
    "variantId": "cab43ba9-aaa5-4c7b-ae3d-f6fc35dec8c0",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "a268399943cf21c840272f1c939f1d6114f1f5f403eaf48959acc2727e695e27",
      "bytes": 218301,
      "width": 726,
      "height": 1032,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "4870609538f7d1c3d0862a7bb3473712df5ccbca71e49fbaa27fe5d43abab257"
    },
    "observationsCanonicalSha256": "c833adc38f95c4bcda60c304aa7c24d137086a5085134239219bb70c43adcdf2",
    "entryCanonicalSha256": "c6df7ac78d774802882ddd68fdd0c2a0dd18c8e68ad17e289462ac5d9b5afa17",
    "abilityCount": 0,
    "attackCount": 1,
    "exRule": null
  },
  "c76d9283-f8c4-47eb-8a8a-7adb9515ff64": {
    "rawCanonicalSha256": "d6a31466e8b379c9fc497aaf0264e5c96c2b9f0b26183b44884ea1c907035707",
    "bodyCanonicalSha256": "bd29b93cfa48cd5f6ab71bb67d54d5e4ce6f9d1151fe11ebb878005617b302c9",
    "controlsCanonicalSha256": "e76b5124020e45673ce27d26115a3f8134ce2e8b029d5dbe3f89a9226d7bf063",
    "rowCanonicalSha256": "6eeee055c080d84a854e6d9e97d1a9b82ad61c96cd376dab589470f2545618bf",
    "actualCanonicalSha256": "ca3a854fe405221cef24b62fc479520b09b655e4aadb6a8df23b045772ec7b54",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "92c2f04b-30b3-486d-aa04-6a8c21d4a151",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c76d9283-f8c4-47eb-8a8a-7adb9515ff64",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:014:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "014",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "92c2f04b-30b3-486d-aa04-6a8c21d4a151",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c76d9283-f8c4-47eb-8a8a-7adb9515ff64",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:014:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "014",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:5b09e986349633224e9cb8415573668b11afa7635d555ae76b95a12bcd531495",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/hitmonlee-14",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ng3jvsx2d5fo7mmn/1600.jpg",
    "productId": "3438197",
    "setCode": "web1",
    "alias": "014",
    "currentLabel": "Hitmonlee",
    "printedName": "サワムラー",
    "printedForm": null,
    "category": null,
    "hp": 50,
    "type": "Fighting",
    "stage": "たねポケモン",
    "evolvesFrom": null,
    "collector": "014/048",
    "artist": "Shin-ichi Yoshida",
    "variantId": "92c2f04b-30b3-486d-aa04-6a8c21d4a151",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "9d92ff18ec25d848a7c8852221aee5663d950c5e2bc639259fc8cb6849a20d02",
      "bytes": 346168,
      "width": 1087,
      "height": 1529,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "6253b0e793bf047f43f9368db72bb932dd3901320cc63dc7124daa7cb59e581a"
    },
    "observationsCanonicalSha256": "46fdaa8234b6397cf2a24438a891c59097dd5e50f8dfa6803df4da343f5ebeed",
    "entryCanonicalSha256": "e0a42c6dee5b080798de1e23d7b96a8bbf04172e3af19fa4cfa65e3eec822578",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null
  },
  "0533fc6d-257a-4c31-96d8-2e834138ee69": {
    "rawCanonicalSha256": "21023512496f61a423772cf84361fcfe5698a51d6e0bb724753a6f6c6908fbf4",
    "bodyCanonicalSha256": "2bec43babd585e4e14313ec17d58443327e68341c9f46fc8a12e220621d51c1a",
    "controlsCanonicalSha256": "d4b40bd2c088574e470a8407b764178358b3eeb862774a055a63197da4bd7ff6",
    "rowCanonicalSha256": "d2a7270529f0385a6c0cf4610571c91d2fdc743db916391125597b0b42445f92",
    "actualCanonicalSha256": "e6fb2caa773bab58a46c26d3e997bbd4ed72985c5ead7de42dbd6b0f1ce9f4ab",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "d7c39018-9660-4045-9311-ffc1083ba7fc",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "0533fc6d-257a-4c31-96d8-2e834138ee69",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:029:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "029",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "d7c39018-9660-4045-9311-ffc1083ba7fc",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "0533fc6d-257a-4c31-96d8-2e834138ee69",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:029:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "029",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:359abaf9a01584bf1d595a7fb5712dc640dc63d82b940f7c687bb063a99a35d1",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/dugtrio-29",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/nwkaioaws34dinq5/1600.jpg",
    "productId": "3438212",
    "setCode": "web1",
    "alias": "029",
    "currentLabel": "Dugtrio",
    "printedName": "ダグトリオ",
    "printedForm": null,
    "category": null,
    "hp": 80,
    "type": "Fighting",
    "stage": "1進化ポケモン",
    "evolvesFrom": "ディグダから進化",
    "collector": "029/048",
    "artist": "Miki Tanaka",
    "variantId": "d7c39018-9660-4045-9311-ffc1083ba7fc",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "e92a9f2d497cf727c3d5db0641dadc410810c18e5f096a744cdbc51c257de4b0",
      "bytes": 201704,
      "width": 740,
      "height": 1035,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "eea1dbea7760fff41d3bcc11f18598c7b7d4cd3d967f88cf3099f4d837f39749"
    },
    "observationsCanonicalSha256": "8b25299a04a00a6714e9ebad95e97d74fbd1a7da367d1190d1b15ac25408554c",
    "entryCanonicalSha256": "6eb2b67bfc419db5691ee1008dae7ed398c9b36ac07dd4203c0a89db2ac2976c",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null
  }
};
const authority={
  "approvedCanonicalSha256": "133f1de10f02bbd3e9b92520861a2662b44e1295ed3328b1f6c9703464957af5",
  "decisionCanonicalSha256": "ca616e1ac5409bb07f397f52647756ef2e6880f72514a21f86327d6af9779be1",
  "approvedFileSha256": "ae13ed03c8228c5fa6290f8ac1b9c3fdea2c9b74212137b5279e33451e56032f",
  "decisionFileSha256": "5aec715bea952ac8703a22a85850c515c3158fc0447c159b75a148657d89f8a7",
  "rootContextFileSha256": "d78a6921e0381a75e73048d321bcf4bf58b0babfbe7d916db5a702d3f32eb4ad"
};
export function knownSource(id){const k=expectedRows[id];check(k,'Outside exact three Japanese shared fronts');return k;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;}
export const publicationBody=publicProjection;
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Only exact root three-front authority accepted');
 check(approved.rows.length===3&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.productionSourceChangesAllowed===0&&decision.approvedProjectionSha256===authority.approvedFileSha256,'Exact finite three-front root approval and zero source writes');
 check(canonicalHash(decision.expectedProductionRows)===canonicalHash([17,23])&&canonicalHash(decision.expectedStagingRows)===canonicalHash([13,20,13])&&decision.beforeQueryHasOnlyThese7Ids===true,'Exact seven-ID three-front scope required');
 for(const r of approved.rows){const k=knownSource(r.printingId);check(canonicalHash(r)===k.rawCanonicalSha256&&r.requiredAssetScope.printingId===r.printingId&&(Object.hasOwn(r.requiredAssetScope,'variantId')?r.requiredAssetScope.variantId:r.requiredAssetScope.assetVariantId)===null&&decision.printingIds.includes(r.printingId)&&decision.variantIds.includes(k.variantId),'Exact raw printing/shared scope');}return true;
}
// Observe heterogeneous saved field names without rewriting the raw witness.
export function observed(a,key){const aliases={name:['printedNativeName','printedName'],hp:['printedHP','hitPoints'],stage:['printedStage','stage'],evolvesFrom:['printedEvolutionFrom','evolvesFrom'],collector:['printedCollectorNumber','collectorNumber'],artist:['printedArtist','artist']};for(const k of aliases[key]||[key])if(Object.hasOwn(a,k))return a[k];return undefined;}
export function validateActual(w,k){
 check(canonicalHash(w)===k.actualCanonicalSha256,'Complete original wrapped Japanese signature changed');const a=w.actualPrintedObservations;
 check(w.alias===k.setCode+'-'+k.alias&&w.originalSha256===k.original.sha256&&a&&canonicalHash(a)===k.observationsCanonicalSha256,'Full unchanged original observation keys and Japanese body required');
 check(observed(a,'name')===k.printedName&&a.printedForm===k.printedForm&&Number(observed(a,'hp'))===k.hp&&a.printedType===k.type&&observed(a,'stage')===k.stage&&observed(a,'collector')===k.collector&&observed(a,'artist')===k.artist&&a.abilities.length===k.abilityCount&&a.attacks.length===k.attackCount,'Exact printed identity, ability and attack counts required');
 check((a.printedPokemonExRule??null)===k.exRule,'Full printed ex knockout rule required');
 check(w.completePrintedIdentityAndBodyReadable===true,'Complete readable original required');
}
export function validateSourceRow(raw,body,controls){
 const k=knownSource(raw.printingId);check(canonicalHash(raw)===k.rawCanonicalSha256&&canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(controls)===k.controlsCanonicalSha256,'Exact root raw/body/controls/current tuples required');
 check(raw.requiredAssetScope.printingId===raw.printingId&&(Object.hasOwn(raw.requiredAssetScope,'variantId')?raw.requiredAssetScope.variantId:raw.requiredAssetScope.assetVariantId)===null&&raw.languageCode==='ja'&&raw.setCode===k.setCode&&raw.canonicalAlias===k.alias&&raw.category===k.category&&raw.currentNativeLabel===k.currentLabel&&raw.workType==='CARDS','Exact Japanese same-printing shared scope');
 check(raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only false/null flags retained despite separate root preparation authority');
 check(raw.sourceProviderProductId===k.productId&&raw.selectedSourceCardId===k.sourceCardId&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+createHash('sha256').update(raw.sourceImageUrl).digest('hex')&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity separate from product; no provider-verbatim claim');
 check(raw.eligibleVariantIsDefaultFlag===k.defaultFlag&&raw.currentActualApiDefaultVariantId===k.variantId,'Sole normaltrue/holofalse and actual default IDs retained');validateActual(raw.actualPixelSignature,k);return k;
}
export function validatePublishedWitness(body,row){
 const k=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===k.controlsCanonicalSha256,'Complete pinned Japanese witness and controls changed');validateActual(body.actual_pixel_signature,k);
 check(row.language_code==='ja'&&row.set_code===k.setCode&&row.collector_number===k.alias&&row.card_native_name===k.currentLabel&&row.work_type==='CARDS'&&row.provider_id===k.sourceCardId&&row.image_url===k.imageUrl&&row.evidence.source_page_url===k.sourcePageUrl,'Current canonical identity and literal source photo binding');
 check(body.recorded_inventory_category===null&&body.actual_printed_category==='Pokemon'&&body.actual_native_category==='Pokemon'&&body.raw_wrapped_signature_not_rewritten===true&&body.actual_ability_logo_observation_is_additive===true&&body.root_additive_whole_original_observation_byte_sha256==='9bb8758156fcd023625f1fbc74d7fa6a85283de9258a92012fba1ee9a7649b6f'&&body.actual_printed_ability_logo===(k.alias==='029'?'ポケボディー':null),'Nullable saved category and additive ability-logo witness required');
 check(body.accepted_category===k.category&&body.required_asset_scope.printing_id===row.printing_id&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===row.printing_id&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.actual_pixel_signature_canonical_sha256===k.actualCanonicalSha256,'Shared null source/asset scope and nested wrapper');
 const f=body.root_finite_authority;check(f.approved_file_byte_sha256===authority.approvedFileSha256&&f.decision_file_byte_sha256===authority.decisionFileSha256&&f.preparation_approved===true&&f.conditional_future_publication_approved===true&&f.private_package_is_production_ready===false,'Exact materialised root authority; private is not live');
 check(body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Historical null/false source flags retained');
 for(const key of ['current_production_binding','current_staging_binding']){const b=body[key],v=b.variants[0],p=b.published_bindings[0];check(b.printing.id===row.printing_id&&b.variants.length===1&&b.published_bindings.length===1&&v.printing_id===row.printing_id&&p.printing_id===row.printing_id&&v.id===k.variantId&&p.variant_id===v.id&&v.is_default===k.defaultFlag&&v.finish_code===k.finishCode&&v.variant_code===k.variantCode&&p.finish_code===k.finishCode&&p.variant_code===k.variantCode,'Both current exact variant/default/finish tuples retained');}
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.unresolved_physical_qualifications.length>0&&body.source_provider_body_verbatim_agreement===false&&body.canonical_native_label_preserved===true,'Physical and nonverbatim qualifications retained');
 for(const key of ['physical_finish_certified','physical_edition_certified','physical_material_authenticity_verified','unlimited_edition_certified','source_wide_approval','vendor_licence_certified','provider_never_resized_certified','native_optical_gain_claimed','stackr_enlargement','full_commercial_html_or_provider_json_included'])check(body[key]===false,'No invented licence/physical/provider/optical certification or raw private captures');return k;
}
