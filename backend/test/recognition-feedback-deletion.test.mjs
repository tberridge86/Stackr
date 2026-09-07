import test from 'node:test';
import assert from 'node:assert/strict';
import {removeRecognitionFeedbackImage,recognitionFeedbackDeletionPatch} from '../routes/recognitionFeedback.js';

test('private feedback deletion propagates storage failure and uses the exact stored object',async()=>{
  const calls=[];
  const client={storage:{from:(bucket)=>({remove:async(paths)=>{calls.push({bucket,paths});return {error:new Error('storage unavailable')};}})}};
  await assert.rejects(removeRecognitionFeedbackImage(client,'recognition-feedback','private/owner/photo.jpg'),/storage unavailable/);
  assert.deepEqual(calls,[{bucket:'recognition-feedback',paths:['private/owner/photo.jpg']}]);
});
test('private feedback deletion succeeds for a removed or absent image',async()=>{
  const client={storage:{from:()=>({remove:async()=>({error:null})})}};
  await removeRecognitionFeedbackImage(client,'recognition-feedback','private/owner/photo.jpg');
  await removeRecognitionFeedbackImage({},'recognition-feedback',null);
});
test('owner withdrawal does not write reviewer-only columns',()=>{
  const at='2026-09-07T19:45:00Z';const patch=recognitionFeedbackDeletionPatch(at);
  for(const field of ['review_status','reviewed_identity','reviewer_notes','reviewed_by','reviewed_at','dataset_version']) {
    assert.equal(Object.hasOwn(patch,field),false);
  }
  assert.equal(patch.deleted_at,at);assert.equal(patch.user_label_status,'withdrawn');
  assert.equal(patch.image_upload_status,'deleted');assert.equal(patch.consent_state.imageUploadConsent,false);
});
