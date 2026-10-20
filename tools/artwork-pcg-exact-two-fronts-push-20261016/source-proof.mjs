import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "b7574fc2-64bf-499e-9c6c-5122ce550a62": {
    "rawCanonicalSha256": "ec1b0d62b89b68220cc84fd5ee65772a0321f4e73463b7e8b037d58eca3d8857",
    "bodyCanonicalSha256": "e1dafe3fd387699009f5dc5e44b89871383cf339a857a650e5ccb5dae1e9b571",
    "controlsCanonicalSha256": "01764be2383533685f15c8ef74c947f65fda288c5f2624332712ab497d918385",
    "rowCanonicalSha256": "ddd9c61937e2115177364776977de4f676a48f2321de35d792fd3858113c62db",
    "actualCanonicalSha256": "002f0d63823b6742956cfb280137e005ea51f6da636a08273b2cec4f29d1a1c7",
    "production": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "variant_id": "1a449bbf-02f3-4d07-8741-45475431ad07",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "b7574fc2-64bf-499e-9c6c-5122ce550a62",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:040:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "040",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "variant_id": "1a449bbf-02f3-4d07-8741-45475431ad07",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "b7574fc2-64bf-499e-9c6c-5122ce550a62",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:040:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "040",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:48f9327567668b712767e8d1d80f6477d0f034609348ba8985f7259418152394",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/dusclops-40",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corr77pfzpfza2cffpog/1600.jpg",
    "productId": "3439753",
    "setCode": "PCG8",
    "alias": "040",
    "currentLabel": "Dusclops",
    "printedName": "サマヨール",
    "printedForm": null,
    "hp": 70,
    "type": "Psychic",
    "stage": "1進化",
    "evolvesFrom": "ヨマワル",
    "collector": "040/075",
    "artist": "Kagemaru Himeno",
    "variantId": "1a449bbf-02f3-4d07-8741-45475431ad07",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "a18971270b9349e31075719eab6e7759ffdac8debf00c44e7f02d04b6499368f",
      "bytes": 403769,
      "width": 1015,
      "height": 1463,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "7509009d8659414744ae6b04799f6fe5c92f87a6436de6bfce05f7277f8ce12b"
    },
    "observationsCanonicalSha256": "20b54f7f951011141edaa42e6bc6d80d2b4c717b07e509b791eb75edb6a42f2a",
    "entryCanonicalSha256": "f480b572d9da392d32567e7d459f63d2278cb4174027708de1de066850dbe9b2"
  },
  "6920ca9b-a187-4cf1-9f56-7a1a48d4762f": {
    "rawCanonicalSha256": "c53c6f7925272c1d48d593ecf30a3a65288a965a08e4ec52b85ceafc3d571274",
    "bodyCanonicalSha256": "56ab2c26e5d3990f3ff3a10c55cc05bfc31570cf6f00e77c35a0b923648d0be8",
    "controlsCanonicalSha256": "82fab70eac57d27ed15ab61e081b4167f88e71bc9537765095b0506e88d1cbee",
    "rowCanonicalSha256": "a6b9d0e1a7e6170fbf2bf0f27d50bc72e29de438140a36f532ca4deb0da636f8",
    "actualCanonicalSha256": "ee847bfa2f44d063175ac8c8a803ebf84dee0fcde434afe55aa5416099b12e09",
    "production": [
      {
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "variant_id": "fb44782b-ef4c-416a-a9f0-5b6adad52144",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "6920ca9b-a187-4cf1-9f56-7a1a48d4762f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:b5ef438a-ddcb-4093-8c9b-572639565af5:026:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "026",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "variant_id": "fb44782b-ef4c-416a-a9f0-5b6adad52144",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "6920ca9b-a187-4cf1-9f56-7a1a48d4762f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:b5ef438a-ddcb-4093-8c9b-572639565af5:026:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "026",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:b31746ea3064b305e6124affdccfafa91fac53c8510c3e6ab87ce3e602308a26",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-offense-and-defense-of-the-furthest-ends/feraligatr-26",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/gu6avofk4mc24kia/1600.jpg",
    "productId": "3439822",
    "setCode": "PCG9",
    "alias": "026",
    "currentLabel": "feraligatr（デルタ種）",
    "printedName": "オーダイル",
    "printedForm": "δ-デルタ種",
    "hp": 120,
    "type": "Lightning",
    "stage": "2進化",
    "evolvesFrom": "アリゲイツ",
    "collector": "026/068",
    "artist": "Kouki Saitou",
    "variantId": "fb44782b-ef4c-416a-a9f0-5b6adad52144",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "original",
    "original": {
      "sha256": "a949bcdb5a0569e0e4940412ebfe0dce35e701df31530e77edf6475fdbc28d25",
      "bytes": 408300,
      "width": 1200,
      "height": 1600,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "de25aa2dbb5cc6cb00a4eef2721497dd423e68d448b58bfb1714ec6979467ef7"
    },
    "observationsCanonicalSha256": "8c7356ba795339e8d9f68d66cca48d3e50e3cbcb94c2f427eb7291bbfd4bd9f0",
    "entryCanonicalSha256": "9179c767331afde8b47d42b9f06c2fff288baa6ed5fbaac5b1101c53cb20ceca"
  }
};
const authority={
  "approvedCanonicalSha256": "28c5c3449402c17559a9a6bafcb4bde98021a8b386ff9bcbf77d0c86c724e8dc",
  "decisionCanonicalSha256": "c9e52b7ac86e1b20acb6de3adad9277c2b596187705db1b7f0e63f474391f0b3",
  "approvedFileSha256": "31aae4b963a67dcf1aae3a6a174616c7ad036c12590d4a6d3516e6c2d9138fe9",
  "decisionFileSha256": "912c4fcac1656776b60357da92cb1424ad8d787b4b0464cd89f9661acbcad974",
  "rootContextFileSha256": "abda4ad4db5a19555b74e863d758771bb00076b8780b75bcdee65902d68feb9a"
};
export function knownSource(id){const k=expectedRows[id];check(k,'Outside exact Dusclops040/Feraligatr026 Japanese shared fronts');return k;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;}
export const publicationBody=publicProjection;
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Only materialised exact2 root authority accepted; historical wrong-scope authority rejected');
 check(approved.rows.length===2&&approved.activeAuthority===true&&approved.proposalOnly===false&&approved.preparationApproved===true&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.productionSourceChangesAllowed===0&&decision.newProductionSource===null&&decision.approvedProjectionSha256===authority.approvedFileSha256,'Exact active finite approval and zero production source writes');
 check(canonicalHash(decision.futurePublisherExpectations.productionRows)===canonicalHash([18,22])&&canonicalHash(decision.futurePublisherExpectations.stagingRows)===canonicalHash([10,15,10]),'Corrected combined scope18/10 only; old13/7 rejected');
 for(const r of approved.rows){const k=knownSource(r.printingId);check(canonicalHash(r)===k.rawCanonicalSha256&&r.requiredAssetScope.printingId===r.printingId&&r.requiredAssetScope.variantId===null&&decision.printingIds.includes(r.printingId)&&decision.variantIds.includes(k.variantId),'Exact raw current printing and nested shared scope');}return true;
}
export function validateActual(w,k){
 check(canonicalHash(w)===k.actualCanonicalSha256,'Complete original wrapped Japanese signature changed');const a=w.actualPrintedObservations;
 check(w.alias===k.setCode+'-'+k.alias&&w.originalSha256===k.original.sha256&&a&&canonicalHash(a)===k.observationsCanonicalSha256,'Full original observations incl all Japanese body clauses required');
 check(a.printedNativeName===k.printedName&&a.printedForm===k.printedForm&&a.category==='Pokemon'&&a.printedHP===k.hp&&a.printedType===k.type&&a.printedStage===k.stage&&a.printedCollectorNumber===k.collector&&a.printedArtist===k.artist&&a.abilities.length===1&&a.attacks.length===2,'Exact category/form/HP/type/evolution/ability/two attacks/footer required');
 check(a.printedNationalDex===null&&a.printedSetCodeLiteral===null&&a.allFourOuterPerimetersAndCornersVisible===true&&a.foreignWatermarkObserved===false&&a.editionStampObserved===false&&w.completePrintedIdentityAndBodyReadable===true,'Full four corners, no invented Dex/set literal or edition certificate');
}
export function validateSourceRow(raw,body,controls){
 const k=knownSource(raw.printingId);check(canonicalHash(raw)===k.rawCanonicalSha256&&canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(controls)===k.controlsCanonicalSha256,'Exact root raw/body/controls/current tuples required');
 check(raw.requiredAssetScope.printingId===raw.printingId&&raw.requiredAssetScope.variantId===null&&raw.languageCode==='ja'&&raw.setCode===k.setCode&&raw.canonicalAlias===k.alias&&raw.category==='Pokemon'&&raw.currentNativeLabel===k.currentLabel&&raw.workType==='CARDS','Exact Japanese same-printing shared scope');
 check(raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only false/null flags retained despite separate root preparation authority');
 check(raw.sourceProviderProductId===k.productId&&raw.selectedSourceCardId===k.sourceCardId&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+createHash('sha256').update(raw.sourceImageUrl).digest('hex')&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity separate from product; no provider-verbatim claim');
 check(raw.eligibleVariantIsDefaultFlag===k.defaultFlag&&raw.currentActualApiDefaultVariantId===k.variantId,'Sole normaltrue/holofalse and actual default IDs retained');validateActual(raw.actualPixelSignature,k);return k;
}
export function validatePublishedWitness(body,row){
 const k=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===k.controlsCanonicalSha256,'Complete pinned Japanese witness and controls changed');validateActual(body.actual_pixel_signature,k);
 check(row.language_code==='ja'&&row.set_code===k.setCode&&row.collector_number===k.alias&&row.card_native_name===k.currentLabel&&row.work_type==='CARDS'&&row.provider_id===k.sourceCardId&&row.image_url===k.imageUrl&&row.evidence.source_page_url===k.sourcePageUrl,'Current canonical identity and literal source photo binding');
 check(body.accepted_category==='Pokemon'&&body.required_asset_scope.printing_id===row.printing_id&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===row.printing_id&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.actual_pixel_signature_canonical_sha256===k.actualCanonicalSha256,'Shared null source/asset scope and nested wrapper');
 const f=body.root_finite_authority;check(f.approved_file_byte_sha256===authority.approvedFileSha256&&f.decision_file_byte_sha256===authority.decisionFileSha256&&f.preparation_approved===true&&f.conditional_future_publication_approved===true&&f.private_package_is_production_ready===false,'Exact materialised root authority; private is not live');
 check(body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Historical null/false source flags retained');
 for(const key of ['current_production_binding','current_staging_binding']){const b=body[key],v=b.variants[0],p=b.published_bindings[0];check(b.printing.id===row.printing_id&&b.variants.length===1&&b.published_bindings.length===1&&v.printing_id===row.printing_id&&p.printing_id===row.printing_id&&v.id===k.variantId&&p.variant_id===v.id&&v.is_default===k.defaultFlag&&v.finish_code===k.finishCode&&v.variant_code===k.variantCode&&p.finish_code===k.finishCode&&p.variant_code===k.variantCode,'Both current exact variant/default/finish tuples retained');}
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.unresolved_physical_qualifications.length>0&&body.source_provider_body_verbatim_agreement===false&&body.canonical_native_label_preserved===true,'Physical and nonverbatim qualifications retained');
 for(const key of ['physical_finish_certified','physical_edition_certified','physical_material_authenticity_verified','unlimited_edition_certified','source_wide_approval','vendor_licence_certified','provider_never_resized_certified','native_optical_gain_claimed','stackr_enlargement','full_commercial_html_or_provider_json_included'])check(body[key]===false,'No invented licence/physical/provider/optical certification or raw private captures');return k;
}
