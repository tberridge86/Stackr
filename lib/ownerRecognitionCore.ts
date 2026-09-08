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

/**
 * A catalogue-backed owner label.  This is deliberately separate from a model
 * candidate: an owner can correct a card which was not in the five returned
 * predictions, but may only select a real printing and variant from the
 * canonical API.
 */
export type OwnerTeachingIdentity = {
  variantId: string;
  printingId: string;
  canonicalKey: string;
  name: string;
  nativeName?: string;
  language: string;
  setId: string;
  setCode: string;
  collectorNumber: string;
  variantCode: string;
  finishCode: string;
  catalogueVersion?: string;
};

function cleanTeachingValue(value: unknown, field: string, optional = false) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (!cleaned && !optional) throw new Error(`Choose a catalogue ${field} before saving for teaching.`);
  return cleaned;
}

export function normaliseOwnerTeachingIdentity(value: OwnerTeachingIdentity): OwnerTeachingIdentity {
  return {
    variantId: cleanTeachingValue(value?.variantId, 'variant'),
    printingId: cleanTeachingValue(value?.printingId, 'printing'),
    canonicalKey: cleanTeachingValue(value?.canonicalKey, 'identity'),
    name: cleanTeachingValue(value?.name, 'card'),
    ...(cleanTeachingValue(value?.nativeName, 'native card name', true) ? { nativeName: cleanTeachingValue(value?.nativeName, 'native card name', true) } : {}),
    language: cleanTeachingValue(value?.language, 'language').toLowerCase(),
    setId: cleanTeachingValue(value?.setId, 'set'),
    setCode: cleanTeachingValue(value?.setCode, 'set code'),
    collectorNumber: cleanTeachingValue(value?.collectorNumber, 'collector number'),
    variantCode: cleanTeachingValue(value?.variantCode, 'variant code'),
    finishCode: cleanTeachingValue(value?.finishCode, 'finish'),
    ...(cleanTeachingValue(value?.catalogueVersion, 'catalogue version', true) ? { catalogueVersion: cleanTeachingValue(value?.catalogueVersion, 'catalogue version', true) } : {}),
  };
}

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
  correctedIdentity?: OwnerTeachingIdentity | null;
  trainingUseApproved?: boolean;
}) {
  const physicalCardId = input.physicalCardId.trim();
  if (!physicalCardId || physicalCardId.length > 120) throw new Error('Give this physical card a label (up to 120 characters). Reuse it for more photos of the same card.');
  const result = parseOwnerRecognitionResult(input.result);
  const confirmed = result.candidates.find((c) => c.variantId === input.selectedVariantId) ?? null;
  if (input.selectedVariantId && !confirmed) throw new Error('Select a candidate from this scan, or save it as unresolved.');
  if (input.trainingUseApproved === true) {
    throw new Error('Owner corrections require review before training use can be approved.');
  }
  const correctedIdentity = input.correctedIdentity ? normaliseOwnerTeachingIdentity(input.correctedIdentity) : null;
  // A pre-v2 model candidate does not expose a trusted printing ID. Keep it
  // verbatim for device-only candidate records; only canonical API selection
  // may create an OwnerTeachingIdentity.
  const expectedIdentity = correctedIdentity ?? confirmed;
  return {
    schemaVersion: 'stackr-owner-capture-v2', id: input.id, capturedAt: input.capturedAt,
    physicalCardId, imageFile: 'card.jpg', reviewStatus: correctedIdentity ? 'owner_corrected' : confirmed ? 'owner_confirmed' : 'unresolved',
    imagePreparation: 'local_edge_native_full_card_rectification_v1',
    expectedIdentity, correctedIdentity, predictions: result.candidates, modelVersion: result.modelVersion,
    indexVersion: result.indexVersion, timings: result.timings,
    purpose: 'private_recognition_evaluation', trainingUseApproved: false,
    publicDisplayApproved: false, holdoutAssignment: 'unassigned',
  };
}
