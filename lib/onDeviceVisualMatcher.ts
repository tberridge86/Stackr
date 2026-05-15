import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import { NativeModules } from 'react-native';
import type { LocalScanCard } from './localCardIndex';
import {
  scannerPackCardToLocalCard,
  searchScannerPack,
} from './scannerPack';

const ON_DEVICE_VISUAL_ENABLED = process.env.EXPO_PUBLIC_ON_DEVICE_VISUAL === 'true';
const ON_DEVICE_VISUAL_MODEL_PATH = process.env.EXPO_PUBLIC_ON_DEVICE_VISUAL_MODEL_PATH ?? '';
const INPUT_SIZE = 224;
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073];
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711];

type OrtModule = typeof import('onnxruntime-react-native');

export type OnDeviceVisualResult = {
  match?: LocalScanCard | null;
  similarity?: number | null;
  status: 'disabled' | 'unavailable' | 'no-candidates' | 'no-embeddings' | 'resolved' | 'ambiguous' | 'error';
  reason?: string;
};

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<import('onnxruntime-react-native').InferenceSession> | null = null;
let bundledModel: number | null = null;
const embeddingCache = new Map<string, Float32Array>();

function getImageCacheKey(base64Image: string) {
  return `${base64Image.length}:${base64Image.slice(0, 64)}:${base64Image.slice(-64)}`;
}

function getOrt() {
  if (!NativeModules.Onnxruntime?.install) {
    throw new Error('ONNX Runtime native module is not installed in this build');
  }

  if (!ortPromise) {
    ortPromise = import('onnxruntime-react-native');
  }
  return ortPromise;
}

async function getSession() {
  let modelPath = ON_DEVICE_VISUAL_MODEL_PATH;
  if (!modelPath && bundledModel) {
    const asset = Asset.fromModule(bundledModel);
    await asset.downloadAsync();
    modelPath = asset.localUri ?? asset.uri;
  }

  if (!modelPath) return null;
  if (!sessionPromise) {
    sessionPromise = getOrt().then(({ InferenceSession }) => InferenceSession.create(modelPath));
  }
  return sessionPromise;
}

export function setBundledOnDeviceVisualModel(modelModule: number) {
  bundledModel = modelModule;
}

async function imageBase64ToClipTensor(base64Image: string) {
  const resized = await ImageManipulator.manipulateAsync(
    `data:image/jpeg;base64,${base64Image}`,
    [{ resize: { width: INPUT_SIZE, height: INPUT_SIZE } }],
    {
      base64: true,
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  if (!resized.base64) throw new Error('Image preprocessing did not return base64');

  const decoded = decodeJpeg(Buffer.from(resized.base64, 'base64'), { useTArray: true });
  const pixels = decoded.data;
  const tensor = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE);
  const planeSize = INPUT_SIZE * INPUT_SIZE;

  for (let y = 0; y < INPUT_SIZE; y += 1) {
    for (let x = 0; x < INPUT_SIZE; x += 1) {
      const sourceIndex = (y * decoded.width + x) * 4;
      const targetIndex = y * INPUT_SIZE + x;
      tensor[targetIndex] = ((pixels[sourceIndex] / 255) - CLIP_MEAN[0]) / CLIP_STD[0];
      tensor[planeSize + targetIndex] = ((pixels[sourceIndex + 1] / 255) - CLIP_MEAN[1]) / CLIP_STD[1];
      tensor[(planeSize * 2) + targetIndex] = ((pixels[sourceIndex + 2] / 255) - CLIP_MEAN[2]) / CLIP_STD[2];
    }
  }

  return tensor;
}

function getFirstTensorOutput(outputs: import('onnxruntime-react-native').InferenceSession.OnnxValueMapType) {
  const first = Object.values(outputs)[0];
  const data = first?.data;
  if (data instanceof Float32Array) return data;
  if (Array.isArray(data) && data.every((value) => typeof value === 'number')) {
    return data as number[];
  }
  {
    throw new Error('ONNX model did not return a numeric tensor output');
  }
}

export function isOnDeviceVisualEnabled() {
  return ON_DEVICE_VISUAL_ENABLED;
}

export function isOnDeviceVisualAvailable() {
  return Boolean(ON_DEVICE_VISUAL_ENABLED && NativeModules.Onnxruntime?.install);
}

export async function embedImageOnDevice(base64Image: string | null | undefined) {
  if (!ON_DEVICE_VISUAL_ENABLED) {
    return { status: 'disabled' as const, reason: 'EXPO_PUBLIC_ON_DEVICE_VISUAL is not true' };
  }

  if (!base64Image) return { status: 'unavailable' as const, reason: 'No image supplied' };

  try {
    const cacheKey = getImageCacheKey(base64Image);
    const cached = embeddingCache.get(cacheKey);
    if (cached) return { status: 'ready' as const, embedding: cached, cached: true };

    const startedAt = Date.now();
    const session = await getSession();
    if (!session) {
      return { status: 'unavailable' as const, reason: 'Missing ONNX model path or bundled model asset' };
    }

    const sessionReadyAt = Date.now();
    const { Tensor } = await getOrt();
    const tensorData = await imageBase64ToClipTensor(base64Image);
    const preprocessDoneAt = Date.now();
    const inputName = session.inputNames[0];
    const output = await session.run({
      [inputName]: new Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });
    const inferenceDoneAt = Date.now();
    const rawEmbedding = getFirstTensorOutput(output);
    const embedding = rawEmbedding instanceof Float32Array
      ? rawEmbedding
      : Float32Array.from(rawEmbedding);

    let norm = 0;
    for (const value of embedding) norm += value * value;
    norm = Math.sqrt(norm) || 1;
    for (let index = 0; index < embedding.length; index += 1) {
      embedding[index] /= norm;
    }

    embeddingCache.set(cacheKey, embedding);
    if (embeddingCache.size > 3) {
      const oldestKey = embeddingCache.keys().next().value;
      if (oldestKey) embeddingCache.delete(oldestKey);
    }

    console.log('On-device embedding timing:', {
      sessionMs: sessionReadyAt - startedAt,
      preprocessMs: preprocessDoneAt - sessionReadyAt,
      inferenceMs: inferenceDoneAt - preprocessDoneAt,
      totalMs: Date.now() - startedAt,
    });

    return { status: 'ready' as const, embedding, cached: false };
  } catch (error) {
    return {
      status: 'error' as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function rerankWithOnDeviceVisual(
  base64Image: string | null | undefined,
  candidates: LocalScanCard[] | null | undefined
): Promise<OnDeviceVisualResult> {
  if (!ON_DEVICE_VISUAL_ENABLED) {
    return { status: 'disabled', reason: 'EXPO_PUBLIC_ON_DEVICE_VISUAL is not true' };
  }

  if (!base64Image) return { status: 'unavailable', reason: 'No image supplied' };
  if (!candidates?.length) return { status: 'no-candidates' };

  try {
    const embedded = await embedImageOnDevice(base64Image);
    if (embedded.status !== 'ready') {
      return { status: embedded.status === 'disabled' ? 'disabled' : 'unavailable', reason: embedded.reason };
    }

    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const scored = (await searchScannerPack(embedded.embedding, {
      limit: 5,
      candidateIds: candidates.map((candidate) => candidate.id),
    }))
      .map((result) => ({
        candidate: byId.get(result.card.id) ?? scannerPackCardToLocalCard(result.card),
        similarity: result.similarity,
      }));

    const best = scored[0];
    const second = scored[1];
    if (!best) return { status: 'no-embeddings' };

    const margin = second ? best.similarity - second.similarity : 1;
    if (best.similarity >= 0.7 && margin >= 0.02) {
      return { status: 'resolved', match: best.candidate, similarity: Number(best.similarity.toFixed(4)) };
    }

    return { status: 'ambiguous', similarity: Number(best.similarity.toFixed(4)) };
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
