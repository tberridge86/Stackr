import { RECOGNITION_FEEDBACK_SCHEMA_VERSION } from './recognitionFeedbackCore';
import type { OwnerCandidate, OwnerTeachingIdentity } from './ownerRecognitionCore';

export type OwnerTeachingUploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed';
export type OwnerTeachingSyncRecord = {
  schemaVersion: string; id: string; capturedAt: string; physicalCardId: string;
  correctedIdentity?: OwnerTeachingIdentity | null;
  predictions: OwnerCandidate[]; modelVersion: string; indexVersion: string;
  feedbackId?: string; uploadStatus?: OwnerTeachingUploadStatus; uploadedAt?: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertOwnerFeedbackId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('The saved feedback identifier is invalid.');
}

export function buildOwnerTeachingFeedback(record: OwnerTeachingSyncRecord, consentAt: string, ownerId: string) {
  const corrected = record.correctedIdentity;
  if (!corrected || !UUID.test(corrected.variantId) || !UUID.test(corrected.printingId)
    || !UUID.test(corrected.setId) || !corrected.language || !corrected.collectorNumber
    || !corrected.variantCode || !corrected.finishCode || !corrected.canonicalKey) {
    throw new Error('Choose the exact catalogue card and finish before contributing a teaching example.');
  }
  if (!UUID.test(ownerId) || !/^[a-z0-9-]+$/.test(record.id) || !record.physicalCardId.trim()) {
    throw new Error('A signed-in owner and physical-card label are required.');
  }
  const predicted = record.predictions[0];
  const identity = (value: OwnerCandidate | OwnerTeachingIdentity) => ({
    stackrCardId: 'printingId' in value ? value.printingId : value.variantId, cardName: value.name, setId: value.setId,
    collectorNumber: value.collectorNumber, language: value.language,
    variant: 'finishCode' in value ? value.finishCode : value.variantCode,
  });
  return {
    schemaVersion: RECOGNITION_FEEDBACK_SCHEMA_VERSION,
    localId: `owner-${record.id}`, anonymousScanId: `owner-${record.id}`,
    createdAt: record.capturedAt,
    action: predicted?.variantId === corrected.variantId ? 'confirm_result' : 'manual_correction',
    predictedIdentity: predicted ? identity(predicted) : null,
    correctedIdentity: identity(corrected), correctedVariant: corrected.finishCode,
    topCandidateScores: record.predictions.map(p => ({canonicalCardId:p.variantId,rank:p.rank,
      confidence:null,visualSimilarity:p.similarity,finalScore:null,setId:p.setId,collectorNumber:p.collectorNumber})),
    // Existing feedback JSON fields preserve canonical IDs and index provenance
    // without introducing another capture table or losing variant information.
    captureQuality: {ownerTeaching:{schemaVersion:'stackr-owner-teaching-v1',
      printingId:corrected.printingId,variantId:corrected.variantId,canonicalKey:corrected.canonicalKey,
      variantCode:corrected.variantCode,finishCode:corrected.finishCode,indexVersion:record.indexVersion}},
    ocrEvidenceSummary: {}, modelVersion:record.modelVersion, catalogueVersion:corrected.catalogueVersion ?? null,
    physicalCardSessionId: `${ownerId.toLowerCase()}:${record.physicalCardId.trim()}`,
    consentState:{metadataStored:true,imageUploadConsent:true,imageUploadConsentAt:consentAt,
      imageUploadWithdrawnAt:null,deletionRequestedAt:null,explanationVersion:RECOGNITION_FEEDBACK_SCHEMA_VERSION},
    userLabelStatus:'queued_for_review', reviewStatus:'queued',
  };
}

export type OwnerTeachingSyncEnvironment = {
  assertOwner(): Promise<unknown>;
  save(record: OwnerTeachingSyncRecord): Promise<void>;
  createFeedback(record: OwnerTeachingSyncRecord): Promise<string>;
  uploadImage(feedbackId: string): Promise<void>;
};

export async function syncOwnerTeachingCapture(record: OwnerTeachingSyncRecord, env: OwnerTeachingSyncEnvironment) {
  await env.assertOwner();
  if (record.uploadStatus === 'uploaded' && record.feedbackId) {
    assertOwnerFeedbackId(record.feedbackId);
    return {feedbackId:record.feedbackId,status:'uploaded' as const};
  }
  let current: OwnerTeachingSyncRecord = {...record,uploadStatus:'uploading'};
  await env.save(current);
  try {
    await env.assertOwner();
    const feedbackId = current.feedbackId ?? await env.createFeedback(current);
    assertOwnerFeedbackId(feedbackId);
    current = {...current,feedbackId};
    // Persist the server identity before uploading so a retry/deletion can find
    // an interrupted remote record, including after the app is restarted.
    await env.assertOwner();
    await env.save(current);
    await env.assertOwner();
    await env.uploadImage(feedbackId);
    await env.assertOwner();
    await env.save({...current,uploadStatus:'uploaded',uploadedAt:new Date().toISOString()});
    return {feedbackId,status:'uploaded' as const};
  } catch (error) {
    // Do not write into an old account's directory after an account switch.
    await env.assertOwner();
    await env.save({...current,uploadStatus:'failed'});
    throw error;
  }
}
