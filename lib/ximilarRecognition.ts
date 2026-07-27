import { supabase } from './supabase';

export type XimilarRecognitionEndpoint =
  | 'tcg_id'
  | 'card_ocr_id'
  | 'slab_id'
  | 'slab_grade'
  | 'detect'
  | 'analyze';

export type XimilarRecognitionRequest = {
  base64Image?: string;
  base64Images?: string[];
  images?: {
    base64Image: string;
    mimeType?: string;
    side?: 'front' | 'back' | 'Front' | 'Back';
  }[];
  mimeType?: string;
  endpoint?: XimilarRecognitionEndpoint;
  requestedEndpoint?: XimilarRecognitionEndpoint;
  scanSessionId?: string | null;
  binderId?: string | null;
  itemType?: string | null;
  isSlab?: boolean;
  gradeOnly?: boolean;
  detectMultiple?: boolean;
  remoteConditionAnalysis?: boolean;
  recognitionReason?: string | null;
  localConfidence?: number | null;
  signals?: Record<string, unknown> | null;
};

export type XimilarRecognitionInvokeResult = {
  ok: boolean;
  status: number;
  parsed: any;
  durationMs: number;
};

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Supabase Ximilar recognition timed out')), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function invokeXimilarRecognition(
  body: XimilarRecognitionRequest,
  timeoutMs = 12_000
): Promise<XimilarRecognitionInvokeResult> {
  const startedAt = Date.now();
  const result = await timeout(
    supabase.functions.invoke('stackr-card-recognition', { body }),
    timeoutMs
  );

  const data = result.data as any;
  const error = result.error as any;
  const status = Number(
    data?.httpStatus
    ?? error?.context?.status
    ?? error?.status
    ?? (error ? 500 : data?.ok === false ? 422 : 200)
  );

  return {
    ok: !error && data?.ok !== false,
    status,
    parsed: error
      ? {
          ok: false,
          error: error.message ?? 'Supabase recognition function failed',
          details: data ?? null,
        }
      : data,
    durationMs: Date.now() - startedAt,
  };
}
