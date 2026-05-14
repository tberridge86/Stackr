import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import { supabase } from './supabase';
import type { LocalScanCard } from './localCardIndex';

const ON_DEVICE_VISUAL_ENABLED = process.env.EXPO_PUBLIC_ON_DEVICE_VISUAL === 'true';
const ON_DEVICE_VISUAL_MODEL_PATH = process.env.EXPO_PUBLIC_ON_DEVICE_VISUAL_MODEL_PATH ?? '';
const ON_DEVICE_VISUAL_MODEL_ID = process.env.EXPO_PUBLIC_ON_DEVICE_VISUAL_MODEL_ID ?? 'Xenova/clip-vit-base-patch32';
const INPUT_SIZE = 224;
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073];
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711];

type OrtModule = typeof import('onnxruntime-react-native');

type CandidateEmbedding = {
  card_id: string;
  embedding: number[];
};

export type OnDeviceVisualResult = {
  match?: LocalScanCard | null;
  similarity?: number | null;
  status: 'disabled' | 'unavailable' | 'no-candidates' | 'no-embeddings' | 'resolved' | 'ambiguous' | 'error';
  reason?: string;
};

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<import('onnxruntime-react-native').InferenceSession> | null = null;
let bundledModel: number | null = null;

function getOrt() {
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

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (!aNorm || !bNorm) return -1;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
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

async function fetchCandidateEmbeddings(candidates: LocalScanCard[]) {
  const ids = candidates.map((candidate) => candidate.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('card_clip_embeddings')
    .select('card_id, embedding')
    .eq('model', ON_DEVICE_VISUAL_MODEL_ID)
    .in('card_id', ids);

  if (error) throw error;
  return (data ?? []) as CandidateEmbedding[];
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
    const session = await getSession();
    if (!session) {
      return { status: 'unavailable', reason: 'Missing ONNX model path or bundled model asset' };
    }

    const embeddings = await fetchCandidateEmbeddings(candidates);
    if (embeddings.length === 0) return { status: 'no-embeddings' };

    const { Tensor } = await getOrt();
    const tensorData = await imageBase64ToClipTensor(base64Image);
    const inputName = session.inputNames[0];
    const output = await session.run({
      [inputName]: new Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });
    const queryEmbedding = getFirstTensorOutput(output);

    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const scored = embeddings
      .map((embedding) => ({
        candidate: byId.get(embedding.card_id) ?? null,
        similarity: cosineSimilarity(queryEmbedding, embedding.embedding),
      }))
      .filter((item): item is { candidate: LocalScanCard; similarity: number } => Boolean(item.candidate))
      .sort((a, b) => b.similarity - a.similarity);

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
