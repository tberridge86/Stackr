import assert from 'node:assert/strict';
import { buildOwnerTeachingFeedback, syncOwnerTeachingCapture, type OwnerTeachingSyncRecord } from '../lib/ownerTeachingSyncCore';
import { buildRecognitionFeedbackDatasetManifest } from '../lib/recognitionFeedbackCore';

const owner='309453d1-52a2-4f40-81e4-27ae69b520fa';
const backendId='11111111-1111-4111-8111-111111111111';
const record: OwnerTeachingSyncRecord={schemaVersion:'stackr-owner-capture-v2',id:'capture-1',capturedAt:'2026-09-07T19:00:00Z',
  physicalCardId:'my-card-1',predictions:[],modelVersion:'siglip2_vision_256_768',indexVersion:'pinned-index',
  correctedIdentity:{variantId:'f0148213-e8c2-4c66-b063-4d4664876718',printingId:'1f4b68b4-785b-4f6a-a91c-2a179b77b76e',
    canonicalKey:'pokemon:en:85f8c1fc-874d-4b7a-892b-2137adc6647b:38:normal',name:'Kingler',language:'en',
    setId:'85f8c1fc-874d-4b7a-892b-2137adc6647b',setCode:'base3',collectorNumber:'38',variantCode:'normal',finishCode:'normal'}};

async function main(){
  for (const finishCode of ['normal','holo','reverse_holo']){
    const payload=buildOwnerTeachingFeedback({...record,correctedIdentity:{...record.correctedIdentity!,finishCode}},record.capturedAt,owner);
    assert.equal(payload.correctedIdentity.variant,finishCode);
    assert.equal(payload.correctedIdentity.stackrCardId,record.correctedIdentity!.printingId);
    assert.equal(payload.captureQuality.ownerTeaching.printingId,record.correctedIdentity!.printingId);
    assert.equal(payload.captureQuality.ownerTeaching.variantId,record.correctedIdentity!.variantId);
    assert.equal(payload.captureQuality.ownerTeaching.indexVersion,'pinned-index');
    assert.equal(payload.reviewStatus,'queued');
    assert.equal(payload.consentState.imageUploadConsent,true);
    assert.equal(payload.physicalCardSessionId,`${owner}:my-card-1`);
  }
  assert.throws(()=>buildOwnerTeachingFeedback({...record,correctedIdentity:null},record.capturedAt,owner),/exact catalogue/);
  assert.throws(()=>buildOwnerTeachingFeedback({...record,id:'../capture'},record.capturedAt,owner),/owner/);
  const manifest=buildRecognitionFeedbackDatasetManifest([{id:backendId,anonymous_scan_id:'owner-capture-1',action:'manual_correction',
    predicted_identity:null,corrected_identity:{stackrCardId:record.correctedIdentity!.variantId},reviewed_identity:null,
    review_status:'queued',user_label_status:'queued_for_review',image_upload_status:'uploaded',consent_state:{imageUploadConsent:true},
    rectified_image_storage_path:'private/example.jpg',rectified_image_checksum_sha256:'a'.repeat(64),capture_quality:{},ocr_evidence_summary:{},
    model_version:record.modelVersion,catalogue_version:null,device_class:null,physical_card_session_id:`${owner}:my-card-1`,
    deleted_at:null,created_at:record.capturedAt}],{datasetVersion:'test'});
  assert.equal(manifest.examples.length,0,'An uploaded correction is not automatically approved training data');
  let saved:OwnerTeachingSyncRecord={...record};let creates=0;let uploads=0;let active=true;
  const env={assertOwner:async()=>{if(!active)throw new Error('account changed');},
    save:async(r:OwnerTeachingSyncRecord)=>{saved=r;},createFeedback:async()=>{creates++;return backendId;},
    uploadImage:async()=>{uploads++;throw new Error('network');}};
  await assert.rejects(syncOwnerTeachingCapture(record,env),/network/);
  assert.equal(saved.feedbackId,backendId);assert.equal(saved.uploadStatus,'failed');
  await syncOwnerTeachingCapture(saved,{...env,uploadImage:async()=>{uploads++;}});
  assert.equal(creates,1,'Retry reuses the persisted feedback row');assert.equal(uploads,2);assert.equal(saved.uploadStatus,'uploaded');
  await syncOwnerTeachingCapture(saved,env);assert.equal(uploads,2,'Already uploaded examples do not duplicate image uploads');
  active=true;uploads=0;
  await assert.rejects(syncOwnerTeachingCapture(record,{...env,createFeedback:async()=>{active=false;return backendId;},
    uploadImage:async()=>{uploads++;}}),/account changed/);
  assert.equal(uploads,0,'Account changes stop image contribution');
  console.log('Owner teaching sync: exact identity/finish/provenance, review gate, interrupted retry and account boundaries passed.');
}
void main();
