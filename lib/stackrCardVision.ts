import { Asset } from 'expo-asset';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import type {
  CardFrameAnalyserFailureReason,
  CardFrameAnalysisResult,
} from './cardVisionFrameAnalyser';
import {
  DEFAULT_CARD_ROI_MANIFEST,
  type CardRectificationRequest,
  type CardRectificationResult,
} from './cardRectification';
import type { CardIdentitySearchFilters } from './cardIdentitySearchReference';

const HEALTH_CHECK_MODEL_ASSET = require('../assets/models/stackr-card-vision-healthcheck.onnx');

export type StackrCardVisionRuntimeInfo = {
  platform: 'android' | 'ios' | 'web' | 'unknown';
  moduleVersion: string;
  onnxRuntimeAvailable: boolean;
  cameraFrameAccessAvailable: boolean;
  nativeImageProcessingAvailable: boolean;
  onnxRuntimeDetail?: string | null;
  cameraFrameAccessDetail?: string | null;
  nativeImageProcessingDetail?: string | null;
  opencvAvailable?: boolean;
  opencvVersion?: string | null;
  error?: string | null;
};

export type OnnxRuntimeSessionHealthCheck = {
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  modelUri?: string | null;
  message: string;
};

export type CardFrameAnalyserFixtureTest = {
  name: string;
  passed: boolean;
  expectedReasons: CardFrameAnalyserFailureReason[];
  actualReasons: CardFrameAnalyserFailureReason[];
  result: CardFrameAnalysisResult;
};

export type CardFrameAnalyserFixtureTestReport = {
  status: 'passed' | 'failed' | 'skipped';
  configVersion: string;
  fixtureCount: number;
  passedCount: number;
  failedCount: number;
  tests: CardFrameAnalyserFixtureTest[];
  message: string;
};

export type CardFrameAnalyserBenchmarkReport = {
  status: 'passed' | 'failed' | 'skipped';
  configVersion: string;
  fixtureCount: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  message: string;
};

export type CardFrameAnalyserInstrumentation = {
  scanId?: string | null;
  analysisFramesReceived: number;
  framesProcessed: number;
  framesDropped: number;
  focusFailures: number;
  analyserP50Ms: number;
  analyserP95Ms: number;
  timeToStableCaptureMs?: number | null;
  captureSource?: 'auto' | 'manual' | null;
};

export type CardFrameAnalysisEvent = CardFrameAnalyserInstrumentation & {
  result?: CardFrameAnalysisResult | null;
  message?: string | null;
};

export type CardIdentitySearchLoadRequest = {
  embeddingsPath?: string | null;
  embeddingsUri?: string | null;
  sqlitePath?: string | null;
  sqliteUri?: string | null;
  embeddingSha256?: string | null;
  embeddingsSha256?: string | null;
  expectedModelVersion?: string | null;
  modelVersion?: string | null;
  packVersion?: string | null;
};

export type CardIdentitySearchLoadResult = {
  status: 'loaded' | 'empty' | 'failed' | 'skipped' | 'success';
  engineVersion: string;
  modelVersion?: string | null;
  packVersion?: string | null;
  dimensions?: number | null;
  embeddingCount?: number | null;
  loadMs?: number | null;
  memoryBytes?: number | null;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type CardIdentitySearchRequest = {
  queryEmbedding: readonly number[];
  topK?: number | null;
  filters?: CardIdentitySearchFilters | null;
};

export type CardIdentitySearchCandidate = {
  canonicalCardId: string;
  similarity: number;
  rank: number;
  language?: string | null;
  setId?: string | null;
  collectorNumber?: string | null;
  era?: string | null;
};

export type CardIdentitySearchResult = {
  status: 'success' | 'empty' | 'failed' | 'skipped';
  engineVersion: string;
  modelVersion?: string | null;
  packVersion?: string | null;
  dimensions?: number | null;
  embeddingCount?: number | null;
  searchedCount: number;
  candidateCount: number;
  candidates: CardIdentitySearchCandidate[];
  processingMs?: number | null;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type CardIdentitySearchBenchmarkRequest = {
  embeddingCounts?: readonly number[] | null;
  dimensions?: number | null;
  iterations?: number | null;
  topK?: number | null;
};

export type CardIdentitySearchBenchmarkTarget = {
  label: string;
  embeddingCount: number;
  loadMs?: number | null;
  memoryBytes?: number | null;
  p50SearchMs?: number | null;
  p95SearchMs?: number | null;
  maxSearchMs?: number | null;
  topKCorrect?: boolean | null;
  status: 'measured' | 'empty' | 'native_unavailable' | 'blocked_no_embeddings';
  message?: string | null;
};

export type CardIdentitySearchBenchmarkReport = {
  status: 'passed' | 'failed' | 'skipped';
  engineVersion: string;
  dimensions: number;
  iterations: number;
  topK: number;
  targets: CardIdentitySearchBenchmarkTarget[];
  message: string;
};

type NativeStackrCardVisionModule = {
  getCardVisionRuntimeInfo: () => StackrCardVisionRuntimeInfo;
  runCardFrameAnalyserFixtureTests?: () => CardFrameAnalyserFixtureTestReport;
  benchmarkCardFrameAnalyserFixtures?: (fixtureCount?: number) => CardFrameAnalyserBenchmarkReport;
  getCardFrameAnalyserInstrumentation?: () => CardFrameAnalyserInstrumentation;
  resetCardFrameAnalyserInstrumentation?: () => CardFrameAnalyserInstrumentation;
  recordCardFrameAnalyserFocusFailure?: () => CardFrameAnalyserInstrumentation;
  rectifyCapturedCard?: (request: CardRectificationRequest) => CardRectificationResult;
  deleteCardRectificationOutputs?: (scanId: string) => { status: 'success' | 'failed'; scanId: string; deletedCount: number; message?: string | null };
  loadCardIdentitySearchCatalogue?: (request: CardIdentitySearchLoadRequest) => CardIdentitySearchLoadResult;
  searchCardIdentityEmbedding?: (request: CardIdentitySearchRequest) => CardIdentitySearchResult;
  benchmarkCardIdentitySearch?: (request?: CardIdentitySearchBenchmarkRequest) => CardIdentitySearchBenchmarkReport;
  resetCardIdentitySearchCatalogue?: () => CardIdentitySearchLoadResult;
  addListener?: (
    eventName: 'onCardFrameAnalysis',
    listener: (event: CardFrameAnalysisEvent) => void
  ) => EventSubscription;
};

const NativeStackrCardVision = requireOptionalNativeModule<NativeStackrCardVisionModule>('StackrCardVision');

const CARD_IDENTITY_SEARCH_ENGINE_VERSION = 'stackr-card-identity-flat-search-v1.0.0';
const nativeSearchUnavailableMessage = 'StackrCardVision native identity search requires a native development build.';

function fallbackRuntimeInfo(error?: string | null): StackrCardVisionRuntimeInfo {
  return {
    platform: Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web'
      ? Platform.OS
      : 'unknown',
    moduleVersion: 'stackr-card-vision-js-fallback',
    onnxRuntimeAvailable: false,
    cameraFrameAccessAvailable: false,
    nativeImageProcessingAvailable: false,
    onnxRuntimeDetail: 'StackrCardVision native module is not linked.',
    cameraFrameAccessDetail: 'Native frame access unavailable until a development build includes StackrCardVision.',
    nativeImageProcessingDetail: 'Native image processing unavailable until StackrCardVision is linked.',
    opencvAvailable: false,
    opencvVersion: null,
    error: error ?? null,
  };
}

function normalizeRuntimeInfo(value: StackrCardVisionRuntimeInfo): StackrCardVisionRuntimeInfo {
  return {
    platform: value.platform,
    moduleVersion: value.moduleVersion,
    onnxRuntimeAvailable: Boolean(value.onnxRuntimeAvailable),
    cameraFrameAccessAvailable: Boolean(value.cameraFrameAccessAvailable),
    nativeImageProcessingAvailable: Boolean(value.nativeImageProcessingAvailable),
    onnxRuntimeDetail: value.onnxRuntimeDetail ?? null,
    cameraFrameAccessDetail: value.cameraFrameAccessDetail ?? null,
    nativeImageProcessingDetail: value.nativeImageProcessingDetail ?? null,
    opencvAvailable: Boolean(value.opencvAvailable),
    opencvVersion: value.opencvVersion ?? null,
    error: value.error ?? null,
  };
}

export function getCardVisionRuntimeInfo(): StackrCardVisionRuntimeInfo {
  try {
    const runtimeInfo = NativeStackrCardVision?.getCardVisionRuntimeInfo?.();
    return runtimeInfo ? normalizeRuntimeInfo(runtimeInfo) : fallbackRuntimeInfo();
  } catch (error) {
    return fallbackRuntimeInfo(error instanceof Error ? error.message : String(error));
  }
}

export async function runOnnxRuntimeControlledSessionCheck(
  modelUri?: string | null
): Promise<OnnxRuntimeSessionHealthCheck> {
  const startedAt = Date.now();
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return {
      status: 'skipped',
      durationMs: Date.now() - startedAt,
      modelUri: null,
      message: 'ONNX Runtime React Native sessions require a native development build.',
    };
  }

  try {
    const asset = modelUri ? null : Asset.fromModule(HEALTH_CHECK_MODEL_ASSET);
    if (asset && !asset.downloaded) {
      await asset.downloadAsync();
    }
    const sessionModelUri = modelUri ?? asset?.localUri ?? asset?.uri ?? null;
    if (!sessionModelUri) {
      return {
        status: 'skipped',
        durationMs: Date.now() - startedAt,
        modelUri: null,
        message: 'No ONNX health-check model URI was available.',
      };
    }

    const ort = await import('onnxruntime-react-native');
    const session = await ort.InferenceSession.create(sessionModelUri);
    await session.release();

    return {
      status: 'passed',
      durationMs: Date.now() - startedAt,
      modelUri: sessionModelUri,
      message: 'ONNX Runtime created and released the bundled health-check session.',
    };
  } catch (error) {
    return {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      modelUri: modelUri ?? null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runNativeCardFrameAnalyserFixtureTests(): CardFrameAnalyserFixtureTestReport {
  try {
    const report = NativeStackrCardVision?.runCardFrameAnalyserFixtureTests?.();
    if (report) return report;
  } catch (error) {
    return {
      status: 'failed',
      configVersion: 'unavailable',
      fixtureCount: 0,
      passedCount: 0,
      failedCount: 0,
      tests: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status: 'skipped',
    configVersion: 'unavailable',
    fixtureCount: 0,
    passedCount: 0,
    failedCount: 0,
    tests: [],
    message: 'StackrCardVision native fixture tests require a native development build.',
  };
}

export function benchmarkNativeCardFrameAnalyserFixtures(
  fixtureCount = 120
): CardFrameAnalyserBenchmarkReport {
  try {
    const report = NativeStackrCardVision?.benchmarkCardFrameAnalyserFixtures?.(fixtureCount);
    if (report) return report;
  } catch (error) {
    return {
      status: 'failed',
      configVersion: 'unavailable',
      fixtureCount: 0,
      medianMs: 0,
      p95Ms: 0,
      maxMs: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status: 'skipped',
    configVersion: 'unavailable',
    fixtureCount: 0,
    medianMs: 0,
    p95Ms: 0,
    maxMs: 0,
    message: 'StackrCardVision native benchmark requires a native development build.',
  };
}

export function loadNativeCardIdentitySearchCatalogue(
  request: CardIdentitySearchLoadRequest
): CardIdentitySearchLoadResult {
  try {
    const result = NativeStackrCardVision?.loadCardIdentitySearchCatalogue?.(request);
    if (result) {
      return {
        ...result,
        modelVersion: result.modelVersion ?? null,
        packVersion: result.packVersion ?? null,
        dimensions: result.dimensions ?? null,
        embeddingCount: result.embeddingCount ?? null,
        loadMs: result.loadMs ?? null,
        memoryBytes: result.memoryBytes ?? null,
        message: result.message ?? null,
        details: result.details ?? null,
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      loadMs: null,
      message: error instanceof Error ? error.message : String(error),
      details: null,
    };
  }

  return {
    status: 'skipped',
    engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    loadMs: null,
    message: nativeSearchUnavailableMessage,
    details: null,
  };
}

export function searchNativeCardIdentityEmbedding(
  request: CardIdentitySearchRequest
): CardIdentitySearchResult {
  try {
    const result = NativeStackrCardVision?.searchCardIdentityEmbedding?.(request);
    if (result) {
      return {
        ...result,
        modelVersion: result.modelVersion ?? null,
        packVersion: result.packVersion ?? null,
        dimensions: result.dimensions ?? null,
        embeddingCount: result.embeddingCount ?? null,
        candidates: result.candidates ?? [],
        searchedCount: Number(result.searchedCount ?? 0),
        candidateCount: Number(result.candidateCount ?? result.candidates?.length ?? 0),
        processingMs: result.processingMs ?? null,
        message: result.message ?? null,
        details: result.details ?? null,
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      searchedCount: 0,
      candidateCount: 0,
      candidates: [],
      processingMs: null,
      message: error instanceof Error ? error.message : String(error),
      details: null,
    };
  }

  return {
    status: 'skipped',
    engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    searchedCount: 0,
    candidateCount: 0,
    candidates: [],
    processingMs: null,
    message: nativeSearchUnavailableMessage,
    details: null,
  };
}

export function benchmarkNativeCardIdentitySearch(
  request: CardIdentitySearchBenchmarkRequest = {}
): CardIdentitySearchBenchmarkReport {
  try {
    const report = NativeStackrCardVision?.benchmarkCardIdentitySearch?.(request);
    if (report) {
      return {
        ...report,
        targets: report.targets ?? [],
        message: report.message ?? 'Native exact flat-search benchmark completed.',
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      dimensions: request.dimensions ?? 128,
      iterations: request.iterations ?? 0,
      topK: request.topK ?? 0,
      targets: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const counts = request.embeddingCounts ?? [0, 25_000, 50_000, 100_000];
  return {
    status: 'skipped',
    engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    dimensions: request.dimensions ?? 128,
    iterations: request.iterations ?? 0,
    topK: request.topK ?? 10,
    targets: counts.map((count) => ({
      label: count === 0 ? 'pilot catalogue' : `${count.toLocaleString('en-US')} embeddings`,
      embeddingCount: count,
      loadMs: null,
      memoryBytes: null,
      p50SearchMs: null,
      p95SearchMs: null,
      maxSearchMs: null,
      topKCorrect: null,
      status: count === 0 ? 'blocked_no_embeddings' : 'native_unavailable',
      message: nativeSearchUnavailableMessage,
    })),
    message: nativeSearchUnavailableMessage,
  };
}

export function resetNativeCardIdentitySearchCatalogue(): CardIdentitySearchLoadResult {
  try {
    const result = NativeStackrCardVision?.resetCardIdentitySearchCatalogue?.();
    if (result) return { ...result, message: result.message ?? null, details: result.details ?? null };
  } catch (error) {
    return {
      status: 'failed',
      engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
      message: error instanceof Error ? error.message : String(error),
      details: null,
    };
  }

  return {
    status: 'skipped',
    engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
    message: nativeSearchUnavailableMessage,
    details: null,
  };
}

const emptyInstrumentation = (): CardFrameAnalyserInstrumentation => ({
  scanId: null,
  analysisFramesReceived: 0,
  framesProcessed: 0,
  framesDropped: 0,
  focusFailures: 0,
  analyserP50Ms: 0,
  analyserP95Ms: 0,
  timeToStableCaptureMs: null,
  captureSource: null,
});

function normalizeInstrumentation(
  value?: Partial<CardFrameAnalyserInstrumentation> | null
): CardFrameAnalyserInstrumentation {
  const fallback = emptyInstrumentation();
  return {
    scanId: value?.scanId ?? null,
    analysisFramesReceived: Number(value?.analysisFramesReceived ?? fallback.analysisFramesReceived),
    framesProcessed: Number(value?.framesProcessed ?? fallback.framesProcessed),
    framesDropped: Number(value?.framesDropped ?? fallback.framesDropped),
    focusFailures: Number(value?.focusFailures ?? fallback.focusFailures),
    analyserP50Ms: Number(value?.analyserP50Ms ?? fallback.analyserP50Ms),
    analyserP95Ms: Number(value?.analyserP95Ms ?? fallback.analyserP95Ms),
    timeToStableCaptureMs: value?.timeToStableCaptureMs ?? null,
    captureSource: value?.captureSource ?? null,
  };
}

export function getCardFrameAnalyserInstrumentation(): CardFrameAnalyserInstrumentation {
  try {
    return normalizeInstrumentation(NativeStackrCardVision?.getCardFrameAnalyserInstrumentation?.());
  } catch {
    return emptyInstrumentation();
  }
}

export function resetCardFrameAnalyserInstrumentation(): CardFrameAnalyserInstrumentation {
  try {
    return normalizeInstrumentation(NativeStackrCardVision?.resetCardFrameAnalyserInstrumentation?.());
  } catch {
    return emptyInstrumentation();
  }
}

export function recordCardFrameAnalyserFocusFailure(): CardFrameAnalyserInstrumentation {
  try {
    return normalizeInstrumentation(NativeStackrCardVision?.recordCardFrameAnalyserFocusFailure?.());
  } catch {
    return emptyInstrumentation();
  }
}

export function addCardFrameAnalysisListener(
  listener: (event: CardFrameAnalysisEvent) => void
): EventSubscription {
  const subscription = NativeStackrCardVision?.addListener?.('onCardFrameAnalysis', listener);
  return subscription ?? { remove: () => undefined };
}

export function rectifyCapturedCard(request: CardRectificationRequest): CardRectificationResult {
  try {
    const result = NativeStackrCardVision?.rectifyCapturedCard?.(request);
    if (result) {
      return {
        ...result,
        roiManifest: result.roiManifest ?? DEFAULT_CARD_ROI_MANIFEST,
        message: result.message ?? null,
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      scanId: request.scanId,
      roiManifest: DEFAULT_CARD_ROI_MANIFEST,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status: 'skipped',
    scanId: request.scanId,
    roiManifest: DEFAULT_CARD_ROI_MANIFEST,
    message: 'StackrCardVision native rectification requires a native development build.',
  };
}

export function deleteCardRectificationOutputs(scanId: string): {
  status: 'success' | 'failed';
  scanId: string;
  deletedCount: number;
  message?: string | null;
} {
  try {
    const result = NativeStackrCardVision?.deleteCardRectificationOutputs?.(scanId);
    if (result) return { ...result, message: result.message ?? null };
  } catch (error) {
    return {
      status: 'failed',
      scanId,
      deletedCount: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status: 'success',
    scanId,
    deletedCount: 0,
    message: 'No native rectification outputs were registered for deletion.',
  };
}
