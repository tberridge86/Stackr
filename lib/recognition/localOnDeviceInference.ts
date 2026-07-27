import type { CardIdentityCatalogueManifest } from '../cardIdentityCataloguePack';
import type { CardIdentityOnnxManifest } from '../cardIdentityOnnxExport';
import type {
  CardIdentitySearchCandidate,
  CardIdentitySearchLoadResult,
  CardIdentitySearchResult,
} from '../stackrCardVision';
import type {
  OcrEvidence,
  RecognitionCandidate,
  RecognitionRequest,
} from './types';

const bundledModelManifest = require('../../assets/models/card_identity/model-manifest.json') as CardIdentityOnnxManifest;
const bundledCatalogueManifest = require('../../assets/catalogue/catalogue-manifest.json') as CardIdentityCatalogueManifest;

export const LOCAL_ON_DEVICE_V1_INFERENCE_VERSION = 'stackr-local-on-device-inference-v1.0.0';
export const LOCAL_ON_DEVICE_V1_DEFAULT_TOP_K = 10;
export const LOCAL_ON_DEVICE_V1_INFERENCE_TIMEOUT_MS = 8_000;

type OrtSession = {
  inputNames?: string[];
  outputNames?: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
  release?: () => Promise<void> | void;
};

type OrtModule = {
  InferenceSession: {
    create(modelUri: string): Promise<OrtSession>;
  };
  Tensor: new (
    type: 'float32',
    data: Float32Array,
    dims: readonly number[]
  ) => unknown;
};

export type LocalOnDeviceInferenceErrorCode =
  | 'LOCAL_MODEL_BLOCKED'
  | 'LOCAL_MODEL_MISSING'
  | 'LOCAL_MODEL_CORRUPT'
  | 'LOCAL_CATALOGUE_MISSING'
  | 'LOCAL_CATALOGUE_BLOCKED'
  | 'LOCAL_MODEL_CATALOGUE_INCOMPATIBLE'
  | 'LOCAL_IMAGE_URI_REQUIRED'
  | 'LOCAL_PREPROCESSOR_UNAVAILABLE'
  | 'LOCAL_INVALID_TENSOR'
  | 'LOCAL_ONNX_RUNTIME_UNAVAILABLE'
  | 'LOCAL_INFERENCE_TIMEOUT'
  | 'LOCAL_OUT_OF_MEMORY'
  | 'LOCAL_SEARCH_UNAVAILABLE'
  | 'LOCAL_NO_CANDIDATES';

export type LocalOnDeviceInferenceTimings = {
  rectificationMs: number | null;
  preprocessingMs: number | null;
  modelLoadMs: number | null;
  warmupMs: number | null;
  inferenceMs: number | null;
  searchMs: number | null;
  totalMs: number;
};

export type LocalOnDeviceReadiness = {
  ready: boolean;
  modelManifest: CardIdentityOnnxManifest;
  catalogueManifest: CardIdentityCatalogueManifest;
  modelVersion: string;
  catalogueVersion: string;
  blockers: LocalOnDeviceInferenceErrorCode[];
  message: string;
};

export type LocalOnDeviceInferenceSuccess = {
  status: 'success';
  scanImageUri: string;
  candidates: CardIdentitySearchCandidate[];
  searchResult: CardIdentitySearchResult;
  embedding: number[];
  timings: LocalOnDeviceInferenceTimings;
  modelVersion: string;
  catalogueVersion: string;
  ocrEvidence?: OcrEvidence | null;
};

export type LocalOnDeviceInferenceFailure = {
  status: 'blocked' | 'failed';
  scanImageUri?: string | null;
  candidates: [];
  timings: LocalOnDeviceInferenceTimings;
  modelVersion: string;
  catalogueVersion: string;
  readiness: LocalOnDeviceReadiness;
  error: {
    code: LocalOnDeviceInferenceErrorCode;
    message: string;
    retriable: boolean;
  };
  ocrEvidence?: OcrEvidence | null;
};

export type LocalOnDeviceInferenceResult =
  | LocalOnDeviceInferenceSuccess
  | LocalOnDeviceInferenceFailure;

export type LocalOnDeviceComparisonSnapshot = {
  status: LocalOnDeviceInferenceResult['status'];
  scanImageUri?: string | null;
  topCandidates: CardIdentitySearchCandidate[];
  ocrEvidence?: OcrEvidence | null;
  timings: LocalOnDeviceInferenceTimings;
  modelVersion: string;
  catalogueVersion: string;
  message?: string | null;
};

export type PreprocessCardIdentityImage = (input: {
  imageUri: string;
  modelManifest: CardIdentityOnnxManifest;
}) => Promise<Float32Array>;

export type CreateOnnxSession = (input: {
  modelUri: string;
  modelManifest: CardIdentityOnnxManifest;
}) => Promise<OrtSession>;

export type RunEmbeddingSearch = (input: {
  queryEmbedding: readonly number[];
  topK: number;
  filters?: RecognitionRequest['ocrEvidence'] | null;
}) => Promise<CardIdentitySearchResult> | CardIdentitySearchResult;

export type LocalOnDeviceInferenceEnvironment = {
  modelManifest?: CardIdentityOnnxManifest;
  catalogueManifest?: CardIdentityCatalogueManifest;
  modelUri?: string | null;
  sqliteUri?: string | null;
  embeddingsUri?: string | null;
  createOnnxSession?: CreateOnnxSession;
  createTensor?: (input: {
    data: Float32Array;
    dims: readonly number[];
    modelManifest: CardIdentityOnnxManifest;
  }) => unknown;
  preprocessImageToTensor?: PreprocessCardIdentityImage;
  runEmbeddingSearch?: RunEmbeddingSearch;
  loadSearchCatalogue?: () => Promise<CardIdentitySearchLoadResult> | CardIdentitySearchLoadResult;
  now?: () => number;
  inferenceTimeoutMs?: number;
};

type SessionCache = {
  key: string;
  promise: Promise<{
    session: OrtSession;
    ort: OrtModule | null;
    loadMs: number;
    warmupMs: number | null;
  }>;
};

let sessionCache: SessionCache | null = null;

function nowMs(env?: LocalOnDeviceInferenceEnvironment) {
  return env?.now?.() ?? Date.now();
}

function emptyTimings(totalMs = 0): LocalOnDeviceInferenceTimings {
  return {
    rectificationMs: null,
    preprocessingMs: null,
    modelLoadMs: null,
    warmupMs: null,
    inferenceMs: null,
    searchMs: null,
    totalMs,
  };
}

function isOutOfMemory(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /out.of.memory|oom|allocation failed/i.test(text);
}

function firstRectifiedImageUri(request: RecognitionRequest): string | null {
  for (const card of request.cards) {
    if (card.uri) return card.uri;
  }
  return null;
}

function tensorDimensions(modelManifest: CardIdentityOnnxManifest): readonly number[] {
  const dimensions = modelManifest.preprocessing.inputDimensions;
  return [
    dimensions.batch,
    dimensions.channels,
    dimensions.height,
    dimensions.width,
  ] as const;
}

function expectedTensorLength(modelManifest: CardIdentityOnnxManifest) {
  const dimensions = modelManifest.preprocessing.inputDimensions;
  return dimensions.batch * dimensions.channels * dimensions.height * dimensions.width;
}

function normalizeEmbedding(values: readonly number[] | Float32Array): number[] {
  let sumSquares = 0;
  const normalizedInput = Array.from(values, (value) => {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding output contains non-finite values.');
    }
    sumSquares += value * value;
    return value;
  });
  if (sumSquares <= 0) {
    throw new Error('Embedding output norm must be greater than zero.');
  }
  const norm = Math.sqrt(sumSquares);
  return normalizedInput.map((value) => value / norm);
}

function outputToEmbedding(output: unknown): number[] {
  if (output instanceof Float32Array) {
    return normalizeEmbedding(output);
  }
  if (Array.isArray(output)) {
    return normalizeEmbedding(output.map(Number));
  }
  if (output && typeof output === 'object' && 'data' in output) {
    const data = (output as { data?: unknown }).data;
    if (data instanceof Float32Array) return normalizeEmbedding(data);
    if (Array.isArray(data)) return normalizeEmbedding(data.map(Number));
  }
  throw new Error('ONNX output tensor did not contain a readable embedding.');
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: LocalOnDeviceInferenceErrorCode
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getEnvModelManifest(env?: LocalOnDeviceInferenceEnvironment) {
  return env?.modelManifest ?? bundledModelManifest;
}

function getEnvCatalogueManifest(env?: LocalOnDeviceInferenceEnvironment) {
  return env?.catalogueManifest ?? bundledCatalogueManifest;
}

export function getLocalOnDeviceReadiness(
  env: LocalOnDeviceInferenceEnvironment = {}
): LocalOnDeviceReadiness {
  const modelManifest = getEnvModelManifest(env);
  const catalogueManifest = getEnvCatalogueManifest(env);
  const blockers: LocalOnDeviceInferenceErrorCode[] = [];

  if (modelManifest.status !== 'exported' || !modelManifest.approvedForMobileInference || modelManifest.blockers.length > 0) {
    blockers.push('LOCAL_MODEL_BLOCKED');
  }
  if (!modelManifest.files.fullPrecisionModel.exists || !modelManifest.files.fullPrecisionModel.sha256) {
    blockers.push('LOCAL_MODEL_MISSING');
  }
  if (catalogueManifest.status !== 'ready' || !catalogueManifest.approvedForInstall) {
    blockers.push('LOCAL_CATALOGUE_BLOCKED');
  }
  if (catalogueManifest.embeddings.count <= 0) {
    blockers.push('LOCAL_CATALOGUE_MISSING');
  }
  if (catalogueManifest.requiredInstalledModelVersion !== modelManifest.modelVersion) {
    blockers.push('LOCAL_MODEL_CATALOGUE_INCOMPATIBLE');
  }
  if (modelManifest.preprocessing.output.dimensions !== 128 || catalogueManifest.embeddings.dimensions !== 128) {
    blockers.push('LOCAL_MODEL_CATALOGUE_INCOMPATIBLE');
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    ready: uniqueBlockers.length === 0,
    modelManifest,
    catalogueManifest,
    modelVersion: modelManifest.modelVersion,
    catalogueVersion: catalogueManifest.packVersion,
    blockers: uniqueBlockers,
    message: uniqueBlockers.length === 0
      ? 'Local on-device model and catalogue are compatible.'
      : `Local on-device recognition is blocked: ${uniqueBlockers.join(', ')}.`,
  };
}

async function defaultCreateOnnxSession({
  modelUri,
}: {
  modelUri: string;
  modelManifest: CardIdentityOnnxManifest;
}): Promise<OrtSession> {
  const ort = await import('onnxruntime-react-native') as unknown as OrtModule;
  return ort.InferenceSession.create(modelUri);
}

async function defaultPreprocessImageToTensor(): Promise<Float32Array> {
  throw new Error('LOCAL_PREPROCESSOR_UNAVAILABLE');
}

async function createCachedSession(
  readiness: LocalOnDeviceReadiness,
  env: LocalOnDeviceInferenceEnvironment
) {
  const modelUri = env.modelUri;
  if (!modelUri) {
    throw new Error('LOCAL_MODEL_MISSING');
  }

  const cacheKey = `${readiness.modelVersion}:${modelUri}`;
  if (sessionCache?.key === cacheKey) {
    return sessionCache.promise;
  }

  const promise = (async () => {
    const startedAt = nowMs(env);
    const createSession = env.createOnnxSession ?? defaultCreateOnnxSession;
    const session = await createSession({
      modelUri,
      modelManifest: readiness.modelManifest,
    });
    const loadMs = nowMs(env) - startedAt;
    return {
      session,
      ort: null,
      loadMs,
      warmupMs: null,
    };
  })();

  sessionCache = { key: cacheKey, promise };
  return promise;
}

async function ensureSearchCatalogueLoaded(
  readiness: LocalOnDeviceReadiness,
  env: LocalOnDeviceInferenceEnvironment
) {
  if (env.loadSearchCatalogue) {
    return env.loadSearchCatalogue();
  }
  const { loadNativeCardIdentitySearchCatalogue } = await import('../stackrCardVision');
  return loadNativeCardIdentitySearchCatalogue({
    sqliteUri: env.sqliteUri ?? readiness.catalogueManifest.files.sqlite.path,
    embeddingsUri: env.embeddingsUri ?? readiness.catalogueManifest.files.embeddings.path,
    embeddingsSha256: readiness.catalogueManifest.files.embeddings.sha256,
    expectedModelVersion: readiness.modelVersion,
    modelVersion: readiness.modelVersion,
    packVersion: readiness.catalogueVersion,
  });
}

function failureResult({
  status,
  code,
  message,
  startedAt,
  readiness,
  imageUri,
  ocrEvidence,
  retriable = true,
  timings,
  env,
}: {
  status: 'blocked' | 'failed';
  code: LocalOnDeviceInferenceErrorCode;
  message: string;
  startedAt: number;
  readiness: LocalOnDeviceReadiness;
  imageUri?: string | null;
  ocrEvidence?: OcrEvidence | null;
  retriable?: boolean;
  timings?: LocalOnDeviceInferenceTimings;
  env?: LocalOnDeviceInferenceEnvironment;
}): LocalOnDeviceInferenceFailure {
  return {
    status,
    scanImageUri: imageUri ?? null,
    candidates: [],
    timings: timings ?? emptyTimings(nowMs(env) - startedAt),
    modelVersion: readiness.modelVersion,
    catalogueVersion: readiness.catalogueVersion,
    readiness,
    error: { code, message, retriable },
    ocrEvidence: ocrEvidence ?? null,
  };
}

export async function warmLocalOnDeviceV1(
  env: LocalOnDeviceInferenceEnvironment = {}
): Promise<LocalOnDeviceInferenceFailure | {
  status: 'ready';
  modelVersion: string;
  catalogueVersion: string;
  loadMs: number | null;
  warmupMs: number | null;
}> {
  const startedAt = nowMs(env);
  const readiness = getLocalOnDeviceReadiness(env);
  if (!readiness.ready) {
    return failureResult({
      status: 'blocked',
      code: readiness.blockers[0] ?? 'LOCAL_MODEL_BLOCKED',
      message: readiness.message,
      startedAt,
      readiness,
      env,
      retriable: false,
    });
  }

  try {
    const loaded = await createCachedSession(readiness, env);
    await ensureSearchCatalogueLoaded(readiness, env);
    return {
      status: 'ready',
      modelVersion: readiness.modelVersion,
      catalogueVersion: readiness.catalogueVersion,
      loadMs: loaded.loadMs,
      warmupMs: loaded.warmupMs,
    };
  } catch (error) {
    const code = isOutOfMemory(error)
      ? 'LOCAL_OUT_OF_MEMORY'
      : String(error).includes('LOCAL_MODEL_MISSING')
        ? 'LOCAL_MODEL_MISSING'
        : 'LOCAL_ONNX_RUNTIME_UNAVAILABLE';
    return failureResult({
      status: 'failed',
      code,
      message: error instanceof Error ? error.message : String(error),
      startedAt,
      readiness,
      env,
    });
  }
}

export async function runLocalOnDeviceV1Inference(
  request: RecognitionRequest,
  env: LocalOnDeviceInferenceEnvironment = {}
): Promise<LocalOnDeviceInferenceResult> {
  const startedAt = nowMs(env);
  const readiness = getLocalOnDeviceReadiness(env);
  const imageUri = firstRectifiedImageUri(request);
  const ocrEvidence = request.ocrEvidence ?? null;

  if (!readiness.ready) {
    return failureResult({
      status: 'blocked',
      code: readiness.blockers[0] ?? 'LOCAL_MODEL_BLOCKED',
      message: readiness.message,
      startedAt,
      readiness,
      imageUri,
      ocrEvidence,
      retriable: false,
      env,
    });
  }
  if (!imageUri) {
    return failureResult({
      status: 'failed',
      code: 'LOCAL_IMAGE_URI_REQUIRED',
      message: 'Local on-device inference requires a rectified image URI; base64 images are not accepted.',
      startedAt,
      readiness,
      imageUri,
      ocrEvidence,
      env,
    });
  }

  const timings = emptyTimings();
  try {
    const loadStartedAt = nowMs(env);
    const loaded = await createCachedSession(readiness, env);
    timings.modelLoadMs = loaded.loadMs;
    timings.warmupMs = loaded.warmupMs;
    await ensureSearchCatalogueLoaded(readiness, env);
    timings.modelLoadMs = timings.modelLoadMs ?? nowMs(env) - loadStartedAt;

    const preprocessStartedAt = nowMs(env);
    const preprocess = env.preprocessImageToTensor ?? defaultPreprocessImageToTensor;
    const tensorData = await preprocess({
      imageUri,
      modelManifest: readiness.modelManifest,
    });
    timings.preprocessingMs = nowMs(env) - preprocessStartedAt;

    if (!(tensorData instanceof Float32Array) || tensorData.length !== expectedTensorLength(readiness.modelManifest)) {
      return failureResult({
        status: 'failed',
        code: 'LOCAL_INVALID_TENSOR',
        message: 'Local preprocessing returned an invalid tensor shape.',
        startedAt,
        readiness,
        imageUri,
        ocrEvidence,
        timings: { ...timings, totalMs: nowMs(env) - startedAt },
        env,
      });
    }

    const inferenceStartedAt = nowMs(env);
    const inputName = loaded.session.inputNames?.[0] ?? 'input';
    const outputName = loaded.session.outputNames?.[0] ?? 'embedding';
    const dims = tensorDimensions(readiness.modelManifest);
    const tensor = env.createTensor
      ? env.createTensor({ data: tensorData, dims, modelManifest: readiness.modelManifest })
      : new ((await import('onnxruntime-react-native')) as unknown as OrtModule).Tensor('float32', tensorData, dims);
    const outputs = await withTimeout(
      loaded.session.run({ [inputName]: tensor }),
      env.inferenceTimeoutMs ?? LOCAL_ON_DEVICE_V1_INFERENCE_TIMEOUT_MS,
      'LOCAL_INFERENCE_TIMEOUT'
    );
    timings.inferenceMs = nowMs(env) - inferenceStartedAt;
    const embedding = outputToEmbedding(outputs[outputName] ?? Object.values(outputs)[0]);

    const searchStartedAt = nowMs(env);
    const search = env.runEmbeddingSearch
      ? await env.runEmbeddingSearch({
        queryEmbedding: embedding,
        topK: LOCAL_ON_DEVICE_V1_DEFAULT_TOP_K,
        filters: ocrEvidence,
      })
      : await (async () => {
        const { searchNativeCardIdentityEmbedding } = await import('../stackrCardVision');
        return searchNativeCardIdentityEmbedding({
        queryEmbedding: embedding,
        topK: LOCAL_ON_DEVICE_V1_DEFAULT_TOP_K,
        filters: {
          language: ocrEvidence?.language ?? null,
          setId: ocrEvidence?.setId ?? ocrEvidence?.setCode ?? null,
          collectorNumber: ocrEvidence?.printedNumber?.number != null
            ? String(ocrEvidence.printedNumber.number)
            : null,
        },
        });
      })();
    timings.searchMs = nowMs(env) - searchStartedAt;
    timings.totalMs = nowMs(env) - startedAt;

    if (search.status !== 'success' || search.candidates.length === 0) {
      return failureResult({
        status: search.status === 'empty' ? 'blocked' : 'failed',
        code: search.status === 'empty' ? 'LOCAL_NO_CANDIDATES' : 'LOCAL_SEARCH_UNAVAILABLE',
        message: search.message ?? 'Local embedding search did not return candidates.',
        startedAt,
        readiness,
        imageUri,
        ocrEvidence,
        timings: { ...timings, totalMs: nowMs(env) - startedAt },
        env,
      });
    }

    return {
      status: 'success',
      scanImageUri: imageUri,
      candidates: search.candidates.slice(0, LOCAL_ON_DEVICE_V1_DEFAULT_TOP_K),
      searchResult: search,
      embedding,
      timings,
      modelVersion: readiness.modelVersion,
      catalogueVersion: readiness.catalogueVersion,
      ocrEvidence,
    };
  } catch (error) {
    const code: LocalOnDeviceInferenceErrorCode = String(error).includes('LOCAL_INFERENCE_TIMEOUT')
      ? 'LOCAL_INFERENCE_TIMEOUT'
      : String(error).includes('LOCAL_PREPROCESSOR_UNAVAILABLE')
        ? 'LOCAL_PREPROCESSOR_UNAVAILABLE'
        : isOutOfMemory(error)
          ? 'LOCAL_OUT_OF_MEMORY'
          : 'LOCAL_ONNX_RUNTIME_UNAVAILABLE';
    return failureResult({
      status: 'failed',
      code,
      message: error instanceof Error ? error.message : String(error),
      startedAt,
      readiness,
      imageUri,
      ocrEvidence,
      env,
    });
  }
}

export function localSearchCandidateToRecognitionCandidate(
  candidate: CardIdentitySearchCandidate,
  modelVersion: string,
  secondCandidate?: CardIdentitySearchCandidate | null
): RecognitionCandidate {
  const margin = secondCandidate
    ? candidate.similarity - secondCandidate.similarity
    : null;
  return {
    identity: {
      id: candidate.canonicalCardId,
      name: candidate.canonicalCardId,
      number: candidate.collectorNumber ?? null,
      setId: candidate.setId ?? null,
      language: candidate.language ?? null,
    },
    confidence: Math.max(0, Math.min(1, candidate.similarity)),
    evidence: {
      visual: {
        modelVersion,
        similarity: candidate.similarity,
        marginToSecond: margin,
      },
      reasons: ['local_embedding_search'],
    },
    engineId: 'local_on_device_v1',
    requiresReview: true,
    raw: candidate,
  };
}

export function buildLocalOnDeviceComparisonSnapshot(
  result: LocalOnDeviceInferenceResult
): LocalOnDeviceComparisonSnapshot {
  return {
    status: result.status,
    scanImageUri: result.scanImageUri ?? null,
    topCandidates: result.candidates.slice(0, LOCAL_ON_DEVICE_V1_DEFAULT_TOP_K),
    ocrEvidence: result.ocrEvidence ?? null,
    timings: result.timings,
    modelVersion: result.modelVersion,
    catalogueVersion: result.catalogueVersion,
    message: result.status === 'success' ? null : result.error.message,
  };
}

export async function resetLocalOnDeviceV1SessionForTests() {
  const current = sessionCache;
  sessionCache = null;
  const loaded = await current?.promise.catch(() => null);
  await loaded?.session.release?.();
}
