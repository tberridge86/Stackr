import { buildRecognitionEvent, createAnonymousScanId, createScannerDiagnostics } from './events';
import { getRecognitionFeatureFlags, type RecognitionFeatureFlags } from './featureFlags';
import { localOnDeviceV1Engine } from './engines/localOnDeviceV1';
import { buildRecognitionShadowModeSnapshot } from '../recognitionShadowModePilotCore';
import {
  type CaptureQualityFailureReason,
  type RecognitionEngine,
  type RecognitionEngineId,
  type RecognitionOutcome,
  type RecognitionRequest,
  type RecognitionResult,
} from './types';

export type RecognitionOrchestratorOptions = {
  featureFlags?: RecognitionFeatureFlags;
  engines?: {
    legacy?: RecognitionEngine;
    local?: RecognitionEngine;
    stackrApi?: RecognitionEngine;
  };
  engineTimeoutMs?: number;
};

type EngineRunResult =
  | {
      ok: true;
      result: RecognitionResult;
      durationMs: number;
    }
  | {
      ok: false;
      engineId: RecognitionEngineId;
      durationMs: number;
      failureReason: CaptureQualityFailureReason;
      errorCode: string;
      message: string;
    };

type ShadowRunSnapshotSource = {
  result: RecognitionResult;
  durationMs: number;
};

const DEFAULT_ENGINE_TIMEOUT_MS = 15000;
const FINAL_OUTCOMES: RecognitionOutcome[] = ['accepted', 'review_required', 'rescan_required'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasValidRecognitionResult(value: unknown): value is RecognitionResult {
  if (!isRecord(value)) return false;
  if (!FINAL_OUTCOMES.includes(value.outcome as RecognitionOutcome)) return false;
  if (!Array.isArray(value.candidates)) return false;
  if (
    value.engineId !== 'existing_legacy_engine'
    && value.engineId !== 'local_on_device_v1'
    && value.engineId !== 'stackr_api_v1'
  ) return false;
  if (value.outcome === 'accepted' && value.candidates.length < 1) return false;
  if (!isRecord(value.diagnostics)) return false;
  return true;
}

function timeoutPromise(ms: number, engineId: RecognitionEngineId): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Recognition engine timed out: ${engineId}`));
    }, Math.max(1, ms));
  });
}

async function runEngineWithTimeout(
  engine: RecognitionEngine,
  request: RecognitionRequest,
  timeoutMs: number
): Promise<EngineRunResult> {
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      engine.recognize(request),
      timeoutPromise(timeoutMs, engine.id),
    ]);
    const durationMs = Date.now() - startedAt;
    if (!hasValidRecognitionResult(result)) {
      return {
        ok: false,
        engineId: engine.id,
        durationMs,
        failureReason: 'malformed_engine_response',
        errorCode: 'MALFORMED_ENGINE_RESPONSE',
        message: 'Recognition engine returned an invalid response.',
      };
    }
    return { ok: true, result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes('timed out');
    return {
      ok: false,
      engineId: engine.id,
      durationMs,
      failureReason: timedOut ? 'engine_timeout' : 'engine_error',
      errorCode: timedOut ? 'ENGINE_TIMEOUT' : 'ENGINE_ERROR',
      message,
    };
  }
}

function attachOrchestratorEvents(
  result: RecognitionResult,
  engine: RecognitionEngine,
  events: ReturnType<typeof buildRecognitionEvent>[],
  totalDurationMs: number
): RecognitionResult {
  const completed = buildRecognitionEvent({
    anonymousScanId: result.diagnostics.anonymousScanId,
    stage: 'orchestrator_completed',
    durationMs: totalDurationMs,
    resultState: result.outcome,
    engineId: result.engineId,
    modelManifest: engine.modelManifest,
    catalogueManifest: engine.catalogueManifest,
    candidates: result.candidates,
    quality: null,
  });

  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      totalDurationMs,
      finishedAt: new Date().toISOString(),
      events: [
        ...events,
        ...(result.diagnostics.events ?? []),
        completed,
      ],
    },
  };
}

function buildFailureResult(
  request: RecognitionRequest,
  events: ReturnType<typeof buildRecognitionEvent>[],
  startedAt: number,
  code: string,
  message: string,
  reasons: CaptureQualityFailureReason[]
): RecognitionResult {
  const totalDurationMs = Date.now() - startedAt;
  const completion = buildRecognitionEvent({
    anonymousScanId: request.anonymousScanId,
    stage: 'orchestrator_completed',
    durationMs: totalDurationMs,
    resultState: 'rescan_required',
    engineId: null,
    candidates: [],
    quality: request.quality,
    qualityFailureReasons: reasons,
    errorCode: code,
  });

  return {
    outcome: 'rescan_required',
    engineId: 'local_on_device_v1',
    candidates: [],
    acceptedCandidate: null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: request.anonymousScanId,
      startedAt: request.requestedAt,
      finishedAt: new Date().toISOString(),
      totalDurationMs,
      events: [...events, completion],
      notes: [message],
    }),
    error: {
      code,
      message,
      retriable: true,
    },
  };
}

function buildEngineFailureResult(
  request: RecognitionRequest,
  engine: RecognitionEngine,
  run: Extract<EngineRunResult, { ok: false }>
): RecognitionResult {
  const event = engineFailureEvent(request, engine, run);
  return {
    outcome: 'rescan_required',
    engineId: engine.id,
    candidates: [],
    acceptedCandidate: null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: request.anonymousScanId,
      startedAt: request.requestedAt,
      finishedAt: new Date().toISOString(),
      totalDurationMs: run.durationMs,
      events: [event],
      engineId: engine.id,
      modelManifest: engine.modelManifest,
      catalogueManifest: engine.catalogueManifest,
      notes: [run.message],
    }),
    error: {
      code: run.errorCode,
      message: run.message,
      retriable: run.failureReason !== 'malformed_engine_response',
    },
  };
}

function attachShadowModeSnapshot(
  visibleResult: RecognitionResult,
  request: RecognitionRequest,
  shadowSource: ShadowRunSnapshotSource | null
): RecognitionResult {
  if (!shadowSource) return visibleResult;
  const snapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: request.anonymousScanId,
    visibleResult,
    localResult: shadowSource.result,
    localRunDurationMs: shadowSource.durationMs,
  });
  const legacyDiagnostics = visibleResult.diagnostics.legacyDiagnostics;
  const nextLegacyDiagnostics = legacyDiagnostics && typeof legacyDiagnostics === 'object'
    ? {
        ...(legacyDiagnostics as Record<string, unknown>),
        shadowMode: snapshot,
      }
    : legacyDiagnostics;

  return {
    ...visibleResult,
    diagnostics: {
      ...visibleResult.diagnostics,
      shadowMode: snapshot,
      legacyDiagnostics: nextLegacyDiagnostics,
      notes: [
        ...(visibleResult.diagnostics.notes ?? []),
        `shadow-mode-pilot:${snapshot.agreement.disagreementCategory}`,
      ],
    },
  };
}

function mergeVisibleCandidates(
  primary: RecognitionResult,
  secondary: RecognitionResult | null
): RecognitionResult {
  if (!secondary?.candidates.length) return primary;
  const seen = new Set<string>();
  const candidates = [...primary.candidates, ...secondary.candidates].filter((candidate) => {
    const key = [
      candidate.identity.id,
      candidate.identity.setId,
      candidate.identity.number,
      candidate.identity.language,
    ].filter(Boolean).join('|').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...primary,
    candidates,
    acceptedCandidate: primary.outcome === 'accepted' ? candidates[0] ?? null : null,
    diagnostics: {
      ...primary.diagnostics,
      notes: [
        ...(primary.diagnostics.notes ?? []),
        ...(secondary.candidates.length ? [`merged-local-candidates:${secondary.candidates.length}`] : []),
      ],
    },
  };
}

function engineStartEvent(request: RecognitionRequest, engine: RecognitionEngine) {
  return buildRecognitionEvent({
    anonymousScanId: request.anonymousScanId,
    stage: 'engine_start',
    durationMs: 0,
    resultState: 'not_started',
    engineId: engine.id,
    modelManifest: engine.modelManifest,
    catalogueManifest: engine.catalogueManifest,
    candidates: [],
    quality: request.quality,
  });
}

function engineFailureEvent(
  request: RecognitionRequest,
  engine: RecognitionEngine,
  run: Extract<EngineRunResult, { ok: false }>
) {
  return buildRecognitionEvent({
    anonymousScanId: request.anonymousScanId,
    stage: run.failureReason === 'engine_timeout'
      ? 'engine_timeout'
      : run.failureReason === 'malformed_engine_response'
        ? 'engine_malformed'
        : 'engine_error',
    durationMs: run.durationMs,
    resultState: 'failed',
    engineId: engine.id,
    modelManifest: engine.modelManifest,
    catalogueManifest: engine.catalogueManifest,
    candidates: [],
    quality: request.quality,
    qualityFailureReasons: [run.failureReason],
    errorCode: run.errorCode,
  });
}

export async function recognizeCard(
  request: RecognitionRequest,
  options: RecognitionOrchestratorOptions = {}
): Promise<RecognitionResult> {
  const flags = options.featureFlags ?? getRecognitionFeatureFlags();
  const legacyEngine = options.engines?.legacy ?? null;
  const localEngine = options.engines?.local ?? localOnDeviceV1Engine;
  const timeoutMs = options.engineTimeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS;
  const startedAt = Date.now();
  let shadowSource: ShadowRunSnapshotSource | null = null;
  let localVisibleReview: RecognitionResult | null = null;
  const events = [
    buildRecognitionEvent({
      anonymousScanId: request.anonymousScanId,
      stage: 'orchestrator_start',
      durationMs: 0,
      resultState: 'not_started',
      candidates: [],
      quality: request.quality,
    }),
  ];

  if (flags.localRecognitionEnabled || flags.onDeviceEmbeddingEnabled) {
    events.push(engineStartEvent(request, localEngine));
    const localRun = await runEngineWithTimeout(localEngine, request, timeoutMs);
    if (localRun.ok) {
      if (localRun.result.outcome === 'accepted') {
        return attachOrchestratorEvents(localRun.result, localEngine, events, Date.now() - startedAt);
      }
      if (localRun.result.outcome === 'review_required') {
        localVisibleReview = localRun.result;
        if (!flags.stackrApiEnabled || !flags.stackrRecognitionPrimary) {
          return attachOrchestratorEvents(localRun.result, localEngine, events, Date.now() - startedAt);
        }
      }
      events.push(buildRecognitionEvent({
        anonymousScanId: request.anonymousScanId,
        stage: 'engine_completed',
        durationMs: localRun.durationMs,
        resultState: localRun.result.outcome,
        engineId: localEngine.id,
        modelManifest: localEngine.modelManifest,
        catalogueManifest: localEngine.catalogueManifest,
        candidates: localRun.result.candidates,
        quality: request.quality,
        qualityFailureReasons: localRun.result.error?.code === 'LOCAL_ENGINE_NOT_READY'
          ? ['engine_not_ready']
          : [],
        errorCode: localRun.result.error?.code ?? null,
      }));
    } else {
      events.push(engineFailureEvent(request, localEngine, localRun));
    }
  } else {
    events.push(buildRecognitionEvent({
      anonymousScanId: request.anonymousScanId,
      stage: 'engine_skipped',
      durationMs: 0,
      resultState: 'not_started',
      engineId: localEngine.id,
      modelManifest: localEngine.modelManifest,
      catalogueManifest: localEngine.catalogueManifest,
      candidates: [],
      quality: request.quality,
    }));
  }

  if (flags.stackrApiEnabled && flags.stackrRecognitionPrimary) {
    const stackrApiEngine = options.engines?.stackrApi
      ?? (await import('./engines/stackrApiV1')).stackrApiV1RecognitionEngine;
    events.push(engineStartEvent(request, stackrApiEngine));
    const stackrRun = await runEngineWithTimeout(stackrApiEngine, request, timeoutMs);
    if (stackrRun.ok) {
      events.push(buildRecognitionEvent({
        anonymousScanId: request.anonymousScanId,
        stage: 'engine_completed',
        durationMs: stackrRun.durationMs,
        resultState: stackrRun.result.outcome,
        engineId: stackrApiEngine.id,
        modelManifest: stackrApiEngine.modelManifest,
        catalogueManifest: stackrApiEngine.catalogueManifest,
        candidates: stackrRun.result.candidates,
        quality: request.quality,
        errorCode: stackrRun.result.error?.code ?? null,
      }));
      if (stackrRun.result.outcome !== 'rescan_required') {
        return attachShadowModeSnapshot(
          attachOrchestratorEvents(
            mergeVisibleCandidates(stackrRun.result, localVisibleReview),
            stackrApiEngine,
            events,
            Date.now() - startedAt
          ),
          request,
          shadowSource
        );
      }
    } else {
      events.push(engineFailureEvent(request, stackrApiEngine, stackrRun));
    }

    if (localVisibleReview?.candidates.length) {
      return attachShadowModeSnapshot(
        attachOrchestratorEvents(localVisibleReview, localEngine, events, Date.now() - startedAt),
        request,
        shadowSource
      );
    }
  }

  if (flags.localRecognitionShadowMode) {
    events.push(engineStartEvent(request, localEngine));
    const shadowRun = await runEngineWithTimeout(localEngine, request, Math.min(timeoutMs, 1000));
    if (shadowRun.ok) {
      shadowSource = {
        result: shadowRun.result,
        durationMs: shadowRun.durationMs,
      };
      events.push(buildRecognitionEvent({
        anonymousScanId: request.anonymousScanId,
        stage: 'engine_completed',
        durationMs: shadowRun.durationMs,
        resultState: shadowRun.result.outcome,
        engineId: localEngine.id,
        modelManifest: localEngine.modelManifest,
        catalogueManifest: localEngine.catalogueManifest,
        candidates: shadowRun.result.candidates,
        quality: request.quality,
        errorCode: shadowRun.result.error?.code ?? null,
      }));
    } else {
      shadowSource = {
        result: buildEngineFailureResult(request, localEngine, shadowRun),
        durationMs: shadowRun.durationMs,
      };
      events.push(engineFailureEvent(request, localEngine, shadowRun));
    }
  }

  const legacyFallbackEnabled = flags.legacyCloudFallbackEnabled && flags.ximilarEmergencyFallback;
  if (!legacyFallbackEnabled || !legacyEngine) {
    return attachShadowModeSnapshot(buildFailureResult(
      request,
      events,
      startedAt,
      'RECOGNITION_ENGINES_DISABLED',
      'Recognition engines are disabled or not ready.',
      ['recognition_unavailable']
    ), request, shadowSource);
  }

  events.push(engineStartEvent(request, legacyEngine));
  const legacyRun = await runEngineWithTimeout(legacyEngine, request, timeoutMs);
  if (legacyRun.ok) {
    return attachShadowModeSnapshot(
      attachOrchestratorEvents(legacyRun.result, legacyEngine, events, Date.now() - startedAt),
      request,
      shadowSource
    );
  }
  events.push(engineFailureEvent(request, legacyEngine, legacyRun));

  return attachShadowModeSnapshot(buildFailureResult(
    request,
    events,
    startedAt,
    'NO_RECOGNITION_RESULT',
    'No recognition engine returned a usable card result.',
    ['recognition_unavailable']
  ), request, shadowSource);
}

export function createRecognitionRequest(input: Partial<RecognitionRequest> & {
  cards: RecognitionRequest['cards'];
}): RecognitionRequest {
  return {
    anonymousScanId: input.anonymousScanId ?? createAnonymousScanId(),
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    cards: input.cards,
    binderId: input.binderId ?? null,
    scanMode: input.scanMode ?? null,
    itemType: input.itemType ?? null,
    isSlab: input.isSlab ?? null,
    quality: input.quality ?? null,
    ocrEvidence: input.ocrEvidence ?? null,
    visualEvidence: input.visualEvidence ?? null,
    legacyContext: input.legacyContext,
  };
}
