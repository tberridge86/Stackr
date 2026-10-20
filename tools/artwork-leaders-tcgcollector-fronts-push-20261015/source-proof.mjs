// Exact Leaders3TCG source proof; immutable row pins bound category-specific controls.
import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows = {
  "f732147f-deef-4c65-a092-4ed2e7bbfcad": {
    "alias": "019",
    "category": "Pokemon",
    "provider": "tcgcollector-image-url-sha256:d469579f51d639ea2d9c0f378f99d73c42c84f0cdb02f23fbce49a9c68de014f",
    "imageUrl": "https://static.tcgcollector.com/content/images/e0/57/44/e05744a819e0fca3d78fc10a3c1d20990b42a2f1b23e9398701ea2431805c6a7.jpg",
    "imageUrlSha256": "d469579f51d639ea2d9c0f378f99d73c42c84f0cdb02f23fbce49a9c68de014f",
    "row": "0a43d37483c66d5033582903a4a297a2682f67307fd46f35fe89230a1a406ccd",
    "peer": "f2ac63a015c5f55198b1fb3c960bff76e120e06d9ff8f3f0ea54f2fb7b7715cf",
    "publicPeer": "e3749d7d244f14b4294ab5b03095e2521986460ebed256fc8cb86c3ab4b665cd",
    "actual": "7313c696c95ef8200de20420914a890b822611fd7567a2594951a4f02ec093c2",
    "original": "cd305a07dd316800bc7a3bb17951c7e28245c7197c22ad182198b090c115ca9b",
    "bytes": 93116,
    "width": 593,
    "height": 834,
    "productionBinding": "eb0c26635e6637cc7fd2826978b3a065ea8bf4a45fd14b8a3d2ef4b22993a4c0",
    "stagingBinding": "885890d1ee537363c9d5380498c3ab519af875cc9bc099adaa07a7394e04f7c8",
    "photoPrivate": "b6f2741cb24baef1df9e0ae4b9943bb3a15f70065b9dc351dfeb1e8a2bd7e73a",
    "photoPublic": "099a4fa60c5c66dcd92e04858e61084d8b2ed06e876e4440d39cc2dae1fcce5d",
    "semanticIdentity": "7f77bd659e775abd433b53df54fd0cd5c898a475b7478583e7d7e0940d5f98d1",
    "body": "f7633a7b70a621432b4d6ca527d42395664873c92972f285a54289ca17e3b2ec",
    "controls": "7ff462a7322f6fd80ece0bc459180a22b421f02470d432f9add33e59a550a1df"
  },
  "58053385-0e6d-45a1-b7aa-ba11abe75091": {
    "alias": "081",
    "category": "Trainer",
    "provider": "tcgcollector-image-url-sha256:960013b61e95f821151e7a04b8fc5b7c801f0597cb35897484bb609ad088ad31",
    "imageUrl": "https://static.tcgcollector.com/content/images/97/bf/86/97bf86b62623d5298b6cfd18e975a71a06a764363ceaf86eafaa031dd9a5db76.jpg",
    "imageUrlSha256": "960013b61e95f821151e7a04b8fc5b7c801f0597cb35897484bb609ad088ad31",
    "row": "504bbf6155e056ebb39dc4dd9d2ce158a2b2c7e9c2e81d60d885758dfb5cef70",
    "peer": "d9799280634d5d1768779523dcec3ca648118262ee94faed530425bfd49feebb",
    "publicPeer": "e9bb04436dc3dc685ec16a21030896f2713079501d036cc328ff247a034a40bd",
    "actual": "f87e9c7e030a9b4ca5d984f734dceedd404e31ff8fa782c3e2d8d1f9a97133ee",
    "original": "627fe0e7530b61a0fd9ef4cb53f7ec0e626034a94d8ce9fff04ed355178768b9",
    "bytes": 82445,
    "width": 593,
    "height": 834,
    "productionBinding": "cb597c1d9d223f0ed83ce61974bfc85ddb023413bd3f70bd935283b6f69e44a3",
    "stagingBinding": "4489f1856a651b75816f009d9dcd5568fd461a0c8adb03afc879ab93ddb62eb2",
    "photoPrivate": "fea1fa5175b85a74bcdcd349105faf2cc22d7eab6190e64fe0ed215a8ffc2f7a",
    "photoPublic": "b2b8e77bdf1032372538429cebea24038635f5255e85652defe30c4be53702a4",
    "semanticIdentity": "995c2fe2018b6f628282e79f524dc550a32917af78572f481652dedc17795c62",
    "body": "e48ee317896545b82b4cdfd6a35f0127ff6d8fac1001fada81c04e5cf3c1b58f",
    "controls": "650b17b980e7d6b588ab16cf160fdcc5cf29aa660af2044cf7638694e3b26639"
  },
  "99246359-6f35-43db-9f85-2ccca99bceec": {
    "alias": "096",
    "category": "Trainer",
    "provider": "tcgcollector-image-url-sha256:128798334e1a9e0f90343f143af152e493cc1948ff9af07703149d20aa1b4244",
    "imageUrl": "https://static.tcgcollector.com/content/images/9c/ce/0d/9cce0deba604504d64afd62a6e58db4f2d429acb5194b67e37826bbee3cc9617.jpg",
    "imageUrlSha256": "128798334e1a9e0f90343f143af152e493cc1948ff9af07703149d20aa1b4244",
    "row": "35f43e9fedf4dd6d78536d4071dc76d22e1c4034bbe64f1efba386e7200e111a",
    "peer": "8604b559875cd430b6a64eb575083eac0ddb6a5a932d56df96f046ea5bd7feb5",
    "publicPeer": "2c8b4e024a3e7aac0ce81c784dd51d5790165fef4d250f691a0c1791a9f3c586",
    "actual": "dcbe60c7e1372c73e1b34542481ba599de6749630b291e13bcde7e8602d79670",
    "original": "6f6becbb06a1af7c1f9627685581ba470da630a10f096f0c855a5e04ad534d54",
    "bytes": 73131,
    "width": 593,
    "height": 834,
    "productionBinding": "6c91e1088a2677fa449e3b4083b3fa71b6811e51d29e50f24690bcaa35e15735",
    "stagingBinding": "24f67ebe67a8ec33e044b81428c9d39459fde7b9811534bfd70a12aed6b1f835",
    "photoPrivate": "3ae2ed7a4ca904e380ce62604478f7ed0e1c842dd382587eab4154541b868e0e",
    "photoPublic": "dfca036bb7782cf7f73be3c26f6db0e33e6c0f9360bfcdb6ad6fd000272c2655",
    "semanticIdentity": "30e5c44755c5353807aef902915259b3e0a06d36013b9c26276055202a9b8c29",
    "body": "6d24db9ff2205b9655975edfcb24909360621ce1aa7328f9d952937dae7b1a89",
    "controls": "6356ec91037e6fbae4b675a232c59ca5f093c581008764368f094e486bcf9067"
  }
};
export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['pricing','prices','marketplaces','pop_reports','privateDecodedMetadata'].includes(key),'Private commercial/PNG metadata');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}
 check(typeof value!=='string'||!/(?:^|\s)[A-Za-z]:[\\/]|file:\/\/\/home\//u.test(value),'Private path');return value;
}
export const publicationBody=publicProjection;
export function knownSource(id){const row=expectedRows[id];check(row,'Outside exact Leaders3TCG');return row;}
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actual,'Accepted actual signature changed');
 check(actual.language==='ja'&&actual.category===known.category&&actual.nativeName,'Actual Japanese native category/title required');
 check(actual.printedCollectorNumber===null&&(actual.completeCardFrameVisible===true||actual.fullPhysicalFrameVisible===true),'Unnumbered complete frame required');
 if(known.category==='Pokemon')check(actual.printedNumberIsNationalDex===true&&Number.isInteger(actual.printedNationalDex)&&actual.hp>0&&actual.stage&&actual.retreat>=0&&actual.attacks.length>0,'Positive Pokemon body required');
 else check(known.category==='Trainer'&&actual.printedHeader==='TRAINER'&&actual.printedNationalDex===null&&actual.printedNumberIsNationalDex===false&&actual.hp===null&&actual.stage===null&&actual.retreat===null&&actual.attacks.length===0&&Boolean(actual.nativeRules||actual.ruleMeaning),'Positive unnumbered Trainer body required');
}
export function validateSourceRow(raw,peer){
 const known=knownSource(raw.printingId);
 check(canonicalHash(raw)===known.row&&canonicalHash(peer)===known.peer,'Root/independent raw row changed');
 check(raw.rootFiniteSourceEligibilityAccepted&&raw.eligibleSourceOriginal&&raw.selectedSourceCode==='tcgcollector'&&raw.selectedSourceCardId===known.provider&&raw.sourceImageUrl===known.imageUrl,'Finite source selection changed');
 check(known.provider==='tcgcollector-image-url-sha256:'+createHash('sha256').update(known.imageUrl).digest('hex')&&createHash('sha256').update(known.imageUrl).digest('hex')===known.imageUrlSha256,'Literal photo source ID changed');
 check(raw.original.sha256===known.original&&raw.original.actualFormat==='JPEG'&&raw.original.mimeType==='image/jpeg'&&raw.original.bytes===known.bytes&&raw.original.width===known.width&&raw.original.height===known.height,'Unchanged JPEG original changed');
 check(canonicalHash(raw.currentProductionBinding)===known.productionBinding&&canonicalHash(raw.currentStagingBinding)===known.stagingBinding&&raw.eligibleVariantIds.length===1,'Exact per-environment singleton tuples changed');
 check(canonicalHash(raw.sourcePhotoProjection)===known.photoPrivate&&canonicalHash(raw.safeIdentityProjection.data)===known.semanticIdentity&&canonicalHash(raw.acceptedPeerPublicProjection)===known.publicPeer,'Identity/accepted public projection changed');
 check(raw.sourceBodyAgreementCertified===false&&raw.sourceRulesAgreementCertified===false,'Provider agreement cannot be invented');
 validateActual(raw.acceptedActualPixelSignature,known);return known;
}
export function projectSourceBody(raw,peer,body){const known=validateSourceRow(raw,peer);publicProjection(body);check(canonicalHash(body)===known.body,'Exact public source body changed');return body;}
export function projectQueueControls(raw,controls){const known=knownSource(raw.printingId);validateActual(raw.acceptedActualPixelSignature,known);check(canonicalHash(controls)===known.controls,'Exact top-level category controls changed');return controls;}
export function validatePublishedWitness(body,row){const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.body,'Exact published source body changed');validateActual(body.actual_pixel_signature,known);check(canonicalHash(body.queue_controls)===known.controls,'Published category controls changed');return known;}
