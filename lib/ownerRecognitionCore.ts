export const OWNER_MODEL_VERSION = 'siglip2_vision_256_768';
export const OWNER_INDEX_VERSION = 'siglip2-vision-256-768-r3f9f96cb-full-48011-v1';
export const OWNER_PRIVATE_RECOGNITION_ENABLED = process.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED === 'true';

export type OwnerCandidate = {
  rank: number; similarity: number; variantId: string; canonicalKey: string;
  name: string; nativeName?: string; language: string; setId: string; setCode: string;
  collectorNumber: string; variantCode: string; referenceAssetId: string;
};
export type OwnerRecognitionResult = {
  status: 'review_required'; modelVersion: string; indexVersion: string;
  requiresReview: true; autoAccept: false; autoAdd: false;
  candidates: OwnerCandidate[];
  timings: { preprocessingMs: number; inferenceMs: number; searchMs: number; totalMs: number };
};
export function parseOwnerRecognitionResult(value: unknown): OwnerRecognitionResult {
  const result = value as OwnerRecognitionResult | null;
  if (result?.modelVersion !== OWNER_MODEL_VERSION || result.indexVersion !== OWNER_INDEX_VERSION
    || result.status !== 'review_required' || result.requiresReview !== true
    || result.autoAccept !== false || result.autoAdd !== false
    || !Array.isArray(result.candidates) || result.candidates.length > 5
    || result.candidates.some((c) => typeof c.variantId !== 'string' || typeof c.canonicalKey !== 'string'
      || typeof c.name !== 'string' || !Number.isFinite(c.similarity)
      || c.similarity < -1.001 || c.similarity > 1.001)
    || !result.timings || !Number.isFinite(result.timings.totalMs)) {
    throw new Error('OWNER_RESPONSE_INVALID: The private model returned an incompatible result. No match was accepted.');
  }
  return result;
}

export function ownerCaptureDirectory(root: string | null, ownerId: string) {
  if (!root || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error('A signed-in owner and native device storage are required.');
  }
  return `${root.replace(/\/$/, '')}/owner-recognition/${ownerId.toLowerCase()}/`;
}

export function createOwnerCaptureRecord(input: {
  id: string; capturedAt: string; physicalCardId: string; result: OwnerRecognitionResult;
  selectedVariantId: string | null;
}) {
  const physicalCardId = input.physicalCardId.trim();
  if (!physicalCardId || physicalCardId.length > 120) throw new Error('Give this physical card a label (up to 120 characters). Reuse it for more photos of the same card.');
  const result = parseOwnerRecognitionResult(input.result);
  const confirmed = result.candidates.find((c) => c.variantId === input.selectedVariantId) ?? null;
  if (input.selectedVariantId && !confirmed) throw new Error('Select a candidate from this scan, or save it as unresolved.');
  return {
    schemaVersion: 'stackr-owner-capture-v1', id: input.id, capturedAt: input.capturedAt,
    physicalCardId, imageFile: 'card.jpg', reviewStatus: confirmed ? 'owner_confirmed' : 'unresolved',
    imagePreparation: 'local_edge_native_full_card_rectification_v1',
    expectedIdentity: confirmed, predictions: result.candidates, modelVersion: result.modelVersion,
    indexVersion: result.indexVersion, timings: result.timings,
    purpose: 'private_recognition_evaluation', trainingUseApproved: false,
    publicDisplayApproved: false, holdoutAssignment: 'unassigned',
  };
}
