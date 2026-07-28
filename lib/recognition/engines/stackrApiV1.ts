import { stackrApiClient, type StackrRecognitionCandidate } from '../../stackrApiV1';
import { getScannerClientContext } from '../../scannerClientContext';
import { buildRecognitionEvent, createScannerDiagnostics } from '../events';
import {
  getLocalOnDeviceReadiness,
  runLocalOnDeviceV1Inference,
  type LocalOnDeviceInferenceResult,
} from '../localOnDeviceInference';
import {
  type CaptureQuality,
  type CatalogueManifest,
  type ModelManifest,
  type OcrEvidence,
  type OcrScript,
  type RecognitionCandidate,
  type RecognitionEngine,
  type RecognitionRequest,
  type RecognitionResult,
} from '../types';

const readiness = getLocalOnDeviceReadiness();

export const STACKR_API_V1_MODEL_MANIFEST: ModelManifest = {
  id: 'stackr-api-v1',
  engineId: 'stackr_api_v1',
  name: 'Stackr API recognition',
  version: readiness.modelVersion,
  createdAt: new Date().toISOString().slice(0, 10),
  runtime: 'stackr_api',
  input: 'embedding_and_ocr',
  weightsSource: readiness.modelManifest.files.fullPrecisionModel.exists
    ? readiness.modelManifest.files.fullPrecisionModel.path
    : null,
  license: readiness.modelManifest.license.modelWeights,
};

export const STACKR_API_V1_CATALOGUE_MANIFEST: CatalogueManifest = {
  id: readiness.catalogueVersion,
  name: 'Stackr API recognition index',
  version: readiness.catalogueVersion,
  createdAt: readiness.catalogueManifest.generatedAt.slice(0, 10),
  languages: [],
  sources: ['stackr-api-v1'],
  schemaVersion: readiness.catalogueManifest.schemaVersion,
  cardCount: readiness.catalogueManifest.canonicalCards.count,
};

function scriptToApi(script?: OcrScript | null) {
  return script ?? 'unknown';
}

function languageToApi(language?: string | null) {
  const lower = String(language ?? '').trim().toLowerCase();
  if (lower === 'en' || lower === 'ja' || lower === 'ko') return lower;
  if (lower === 'zh' || lower === 'zh-hans' || lower === 'zh-cn') return 'zh-Hans';
  if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk') return 'zh-Hant';
  return 'unknown';
}

function captureQualityToApi(quality?: CaptureQuality | null) {
  return {
    score: quality?.score ?? null,
    focusScore: quality?.focusScore ?? null,
    glareScore: quality?.glareScore ?? null,
    exposureScore: quality?.exposureScore ?? null,
    framingScore: quality?.framingScore ?? null,
    stabilityScore: quality?.stabilityScore ?? null,
    cardCoverage: quality?.cardCoverage ?? null,
    failureReasons: (quality?.failureReasons ?? []).map(String).slice(0, 12),
  };
}

function possibleCollectorNumber(ocr?: OcrEvidence | null) {
  if (ocr?.printedNumber?.raw) return ocr.printedNumber.raw;
  if (ocr?.printedNumber?.number != null) return String(ocr.printedNumber.number);
  return null;
}

function stackrCandidateToRecognitionCandidate(
  candidate: StackrRecognitionCandidate,
  modelVersion: string
): RecognitionCandidate {
  return {
    identity: {
      id: candidate.canonicalCardId,
      name: candidate.cardName ?? candidate.canonicalCardId ?? 'Unknown card',
      number: candidate.collectorNumber,
      setId: candidate.setId,
      setName: candidate.setCode,
      language: candidate.languageCode,
      rarity: null,
    },
    confidence: candidate.overallConfidence,
    evidence: {
      providerScore: candidate.overallConfidence,
      visual: {
        similarity: candidate.imageScore,
        finalScore: candidate.overallConfidence,
        marginToSecond: null,
        modelVersion,
      },
      ocr: null,
      rankingScore: candidate.overallConfidence,
      reasons: candidate.reasons,
    },
    engineId: 'stackr_api_v1',
    requiresReview: candidate.uncertaintyFlags.length > 0,
    raw: candidate,
  };
}

function failureResult(
  request: RecognitionRequest,
  startedAt: number,
  code: string,
  message: string,
  localInference?: LocalOnDeviceInferenceResult | null
): RecognitionResult {
  const durationMs = Date.now() - startedAt;
  const event = buildRecognitionEvent({
    anonymousScanId: request.anonymousScanId,
    stage: 'engine_completed',
    durationMs,
    resultState: 'rescan_required',
    engineId: 'stackr_api_v1',
    modelManifest: STACKR_API_V1_MODEL_MANIFEST,
    catalogueManifest: STACKR_API_V1_CATALOGUE_MANIFEST,
    candidates: [],
    quality: request.quality,
    qualityFailureReasons: ['recognition_unavailable'],
    errorCode: code,
  });

  return {
    outcome: 'rescan_required',
    engineId: 'stackr_api_v1',
    candidates: [],
    acceptedCandidate: null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: request.anonymousScanId,
      startedAt: request.requestedAt,
      finishedAt: new Date().toISOString(),
      totalDurationMs: durationMs,
      events: [event],
      engineId: 'stackr_api_v1',
      modelManifest: STACKR_API_V1_MODEL_MANIFEST,
      catalogueManifest: STACKR_API_V1_CATALOGUE_MANIFEST,
      notes: [
        message,
        ...(localInference ? [`localInference:${localInference.status}`] : []),
      ],
    }),
    error: {
      code,
      message,
      retriable: true,
    },
  };
}

export const stackrApiV1RecognitionEngine: RecognitionEngine = {
  id: 'stackr_api_v1',
  modelManifest: STACKR_API_V1_MODEL_MANIFEST,
  catalogueManifest: STACKR_API_V1_CATALOGUE_MANIFEST,
  async recognize(request: RecognitionRequest): Promise<RecognitionResult> {
    const startedAt = Date.now();
    const localInference = await runLocalOnDeviceV1Inference(request);
    if (localInference.status !== 'success') {
      return failureResult(
        request,
        startedAt,
        'STACKR_API_EMBEDDING_UNAVAILABLE',
        'Stackr API recognition requires a local embedding or a private uploaded-image key.',
        localInference
      );
    }

    try {
      const clientContext = getScannerClientContext();
      const response = await stackrApiClient.recognitionIdentify({
        modelVersion: localInference.modelVersion,
        embedding: localInference.embedding,
        ocrText: request.ocrEvidence?.rawText ?? null,
        possibleCollectorNumber: possibleCollectorNumber(request.ocrEvidence),
        possibleSetCode: request.ocrEvidence?.setCode ?? request.ocrEvidence?.setId ?? null,
        possibleCardName: request.ocrEvidence?.nameHint ?? null,
        detectedLanguage: languageToApi(request.ocrEvidence?.language),
        detectedScript: scriptToApi(request.ocrEvidence?.probableScript),
        captureQuality: captureQualityToApi(request.quality),
        consent: {
          retainImage: false,
          useForTraining: false,
          imageUploadConsent: false,
        },
        client: {
          appVersion: clientContext.appVersion,
          platform: clientContext.platform === 'ios' || clientContext.platform === 'android'
            ? clientContext.platform
            : 'unknown',
          deviceClass: clientContext.deviceTier,
          requestId: request.anonymousScanId,
        },
      });
      const data = response.data;
      const candidates = data.topCandidates.map((candidate) => (
        stackrCandidateToRecognitionCandidate(candidate, data.modelVersion)
      ));
      const outcome: RecognitionResult['outcome'] = data.matchStatus === 'exact'
        && data.autoAddAllowed
        && data.uncertaintyFlags.length === 0
        ? 'accepted'
        : candidates.length
          ? 'review_required'
          : 'rescan_required';
      const durationMs = Date.now() - startedAt;
      const event = buildRecognitionEvent({
        anonymousScanId: request.anonymousScanId,
        stage: 'engine_completed',
        durationMs,
        resultState: outcome,
        engineId: 'stackr_api_v1',
        modelManifest: {
          ...STACKR_API_V1_MODEL_MANIFEST,
          version: data.modelVersion,
        },
        catalogueManifest: {
          ...STACKR_API_V1_CATALOGUE_MANIFEST,
          version: data.indexVersion ?? STACKR_API_V1_CATALOGUE_MANIFEST.version,
        },
        candidates,
        quality: request.quality,
        errorCode: null,
      });

      return {
        outcome,
        engineId: 'stackr_api_v1',
        candidates,
        acceptedCandidate: outcome === 'accepted' ? candidates[0] ?? null : null,
        diagnostics: createScannerDiagnostics({
          anonymousScanId: request.anonymousScanId,
          startedAt: request.requestedAt,
          finishedAt: new Date().toISOString(),
          totalDurationMs: durationMs,
          events: [event],
          engineId: 'stackr_api_v1',
          modelManifest: {
            ...STACKR_API_V1_MODEL_MANIFEST,
            version: data.modelVersion,
          },
          catalogueManifest: {
            ...STACKR_API_V1_CATALOGUE_MANIFEST,
            version: data.indexVersion ?? STACKR_API_V1_CATALOGUE_MANIFEST.version,
          },
          notes: [
            `stackr-api:${data.matchStatus}`,
            `requestedNextAction:${data.requestedNextAction}`,
            `scoringConfig:${data.scoringConfigVersion}`,
            ...data.reasons,
            ...data.uncertaintyFlags.map((flag) => `uncertain:${flag}`),
          ],
        }),
        error: outcome === 'rescan_required'
          ? {
              code: data.matchStatus === 'rejected' ? 'STACKR_API_REJECTED' : 'STACKR_API_NO_MATCH',
              message: data.reasons.join('; ') || 'Stackr API returned no match.',
              retriable: data.requestedNextAction === 'upload_fallback_image' || data.requestedNextAction === 'rescan',
            }
          : null,
      };
    } catch (error) {
      return failureResult(
        request,
        startedAt,
        'STACKR_API_REQUEST_FAILED',
        error instanceof Error ? error.message : String(error),
        localInference
      );
    }
  },
};
