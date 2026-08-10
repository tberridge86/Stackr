import { buildRecognitionEvent, createScannerDiagnostics } from '../events';
import {
  fusedCandidateToRecognitionCandidate,
  fuseLocalEvidence,
} from '../evidenceFusion';
import {
  buildLocalOnDeviceComparisonSnapshot,
  getLocalOnDeviceReadiness,
  runLocalOnDeviceV1Inference,
} from '../localOnDeviceInference';
import {
  resolveExactVariant,
  variantResolutionSummary,
} from '../variantResolver';
import {
  type CatalogueManifest,
  type ModelManifest,
  type RecognitionCandidate,
  type RecognitionEngine,
  type RecognitionRequest,
  type RecognitionResult,
} from '../types';

const readiness = getLocalOnDeviceReadiness();

export const LOCAL_ON_DEVICE_V1_MODEL_MANIFEST: ModelManifest = {
  id: readiness.modelManifest.modelVersion,
  engineId: 'local_on_device_v1',
  name: 'Stackr local on-device recognizer',
  version: readiness.modelManifest.modelVersion,
  createdAt: readiness.modelManifest.generatedAt.slice(0, 10),
  runtime: readiness.ready ? 'on_device' : 'not_ready',
  input: readiness.ready ? 'rectified_card_jpeg' : 'none',
  weightsSource: readiness.modelManifest.files.fullPrecisionModel.exists
    ? readiness.modelManifest.files.fullPrecisionModel.path
    : null,
  license: readiness.modelManifest.license.modelWeights,
};

export const LOCAL_ON_DEVICE_V1_CATALOGUE_MANIFEST: CatalogueManifest = {
  id: readiness.catalogueManifest.packVersion,
  name: 'Stackr local recognition catalogue',
  version: readiness.catalogueManifest.packVersion,
  createdAt: readiness.catalogueManifest.generatedAt.slice(0, 10),
  languages: [],
  sources: ['stackr-approved-catalogue-pack'],
  schemaVersion: readiness.catalogueManifest.schemaVersion,
  cardCount: readiness.catalogueManifest.canonicalCards.count,
};

function failureReasonForCode(code: string) {
  if (code.includes('TIMEOUT')) return 'engine_timeout' as const;
  if (code.includes('BLOCKED') || code.includes('MISSING') || code.includes('INCOMPATIBLE')) {
    return 'engine_not_ready' as const;
  }
  return 'engine_error' as const;
}

function buildResult({
  request,
  startedAt,
  outcome,
  candidates,
  error,
  notes,
}: {
  request: RecognitionRequest;
  startedAt: number;
  outcome: RecognitionResult['outcome'];
  candidates: RecognitionCandidate[];
  error: RecognitionResult['error'];
  notes: string[];
}): RecognitionResult {
  const durationMs = Date.now() - startedAt;
  const event = buildRecognitionEvent({
    anonymousScanId: request.anonymousScanId,
    stage: 'engine_completed',
    durationMs,
    resultState: outcome,
    engineId: 'local_on_device_v1',
    modelManifest: LOCAL_ON_DEVICE_V1_MODEL_MANIFEST,
    catalogueManifest: LOCAL_ON_DEVICE_V1_CATALOGUE_MANIFEST,
    candidates,
    quality: request.quality,
    qualityFailureReasons: error ? [failureReasonForCode(error.code)] : [],
    errorCode: error?.code ?? null,
  });

  return {
    outcome,
    engineId: 'local_on_device_v1',
    candidates,
    acceptedCandidate: outcome === 'accepted' ? candidates[0] ?? null : null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: request.anonymousScanId,
      startedAt: request.requestedAt,
      finishedAt: new Date().toISOString(),
      totalDurationMs: durationMs,
      events: [event],
      engineId: 'local_on_device_v1',
      modelManifest: LOCAL_ON_DEVICE_V1_MODEL_MANIFEST,
      catalogueManifest: LOCAL_ON_DEVICE_V1_CATALOGUE_MANIFEST,
      notes,
    }),
    error,
  };
}

export const localOnDeviceV1Engine: RecognitionEngine = {
  id: 'local_on_device_v1',
  modelManifest: LOCAL_ON_DEVICE_V1_MODEL_MANIFEST,
  catalogueManifest: LOCAL_ON_DEVICE_V1_CATALOGUE_MANIFEST,
  async recognize(request: RecognitionRequest): Promise<RecognitionResult> {
    const startedAt = Date.now();
    const inference = await runLocalOnDeviceV1Inference(request);
    const comparison = buildLocalOnDeviceComparisonSnapshot(inference);

    if (inference.status !== 'success') {
      return buildResult({
        request,
        startedAt,
        outcome: 'rescan_required',
        candidates: [],
        error: {
          code: inference.error.code,
          message: inference.error.message,
          retriable: inference.error.retriable,
        },
        notes: [
          inference.error.message,
          `localInference=${JSON.stringify({
            status: comparison.status,
            modelVersion: comparison.modelVersion,
            catalogueVersion: comparison.catalogueVersion,
            timings: comparison.timings,
          })}`,
        ],
      });
    }

    const fusion = fuseLocalEvidence({
      candidates: inference.candidates,
      ocrEvidence: request.ocrEvidence ?? inference.ocrEvidence ?? null,
      captureQuality: request.quality ?? null,
    });
    const candidates = fusion.candidates.map((candidate) => {
      const recognitionCandidate = fusedCandidateToRecognitionCandidate(candidate, inference.modelVersion);
      const variantResolution = resolveExactVariant({
        baseCandidate: {
          canonicalCardId: candidate.candidate.canonicalCardId,
          collectorNumber: candidate.candidate.collectorNumber ?? null,
          setId: candidate.candidate.setId ?? null,
          language: candidate.candidate.language ?? null,
          variantId: candidate.candidate.variant ?? 'unknown',
          cardName: candidate.candidate.cardName ?? null,
        },
        candidateFamily: null,
        ocrEvidence: request.ocrEvidence ?? inference.ocrEvidence ?? null,
      });
      const existingRaw = recognitionCandidate.raw && typeof recognitionCandidate.raw === 'object'
        ? recognitionCandidate.raw
        : {};
      return {
        ...recognitionCandidate,
        requiresReview: recognitionCandidate.requiresReview || variantResolution.outcome !== 'resolved_variant',
        evidence: {
          ...recognitionCandidate.evidence,
          reasons: [
            ...(recognitionCandidate.evidence.reasons ?? []),
            variantResolution.outcome === 'resolved_variant'
              ? 'exact_variant_resolved'
              : 'exact_variant_unresolved',
          ],
        },
        raw: {
          ...existingRaw,
          variantResolution: variantResolutionSummary(variantResolution),
        },
      };
    });

    return buildResult({
      request,
      startedAt,
      outcome: candidates.length > 0 ? fusion.outcome : 'rescan_required',
      candidates,
      error: candidates.length > 0 && fusion.outcome !== 'rescan_required'
        ? null
        : { code: 'LOCAL_NO_CANDIDATES', message: fusion.reasons.join('; ') || 'Local search returned no candidates.', retriable: true },
      notes: [
        `localInference=${JSON.stringify({
          status: comparison.status,
          modelVersion: comparison.modelVersion,
          catalogueVersion: comparison.catalogueVersion,
          timings: comparison.timings,
          fusion: {
            outcome: fusion.outcome,
            calibrationVersion: fusion.calibrationVersion,
            reasons: fusion.reasons,
          },
          topCandidates: comparison.topCandidates.map((candidate) => ({
            canonicalCardId: candidate.canonicalCardId,
            similarity: candidate.similarity,
            rank: candidate.rank,
          })),
        })}`,
      ],
    });
  },
};
