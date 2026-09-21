import {
  validateReferenceImage,
  type DecodedImageMetadata,
  type ReferenceImageValidation,
} from './reference-ocr-benchmark-core';

export type ReferenceFetchResponse = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  body?: { cancel(): Promise<void> } | null;
};

export type ReferenceDownloadAttempt = {
  url: string;
  attempt: number;
  responseStatus: number | null;
  contentType: string | null;
  bytes: number | null;
  validationErrors: string[];
  error: string | null;
};

export type ReferenceDownloadResult = {
  status: 'ready' | 'error';
  url: string | null;
  body: Buffer | null;
  validation: ReferenceImageValidation | null;
  attempts: ReferenceDownloadAttempt[];
  error: string | null;
};

type DownloadOptions = {
  urls: string[];
  fetchImpl?: (url: string, init?: RequestInit) => Promise<ReferenceFetchResponse>;
  decodeImage: (body: Buffer) => Promise<DecodedImageMetadata>;
  maxAttempts?: number;
  timeoutMs?: number;
  maxBytes?: number;
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retryDelayMs(response: ReferenceFetchResponse | null, attempt: number) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 100), 10_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 100), 10_000);
  }
  return Math.min(250 * (2 ** (attempt - 1)), 2_000);
}

async function cancelBody(response: ReferenceFetchResponse) {
  await response.body?.cancel().catch(() => undefined);
}

function withDecodeError(validation: ReferenceImageValidation, error: unknown) {
  const message = `decode-error:${errorMessage(error)}`;
  return {
    ...validation,
    valid: false,
    errors: [...validation.errors, message],
  };
}

export async function downloadReferenceImage(options: DownloadOptions): Promise<ReferenceDownloadResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as DownloadOptions['fetchImpl'])!;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const timeoutMs = Math.max(100, options.timeoutMs ?? 15_000);
  const maxBytes = Math.max(1, options.maxBytes ?? 20 * 1024 * 1024);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts: ReferenceDownloadAttempt[] = [];
  const urls = [...new Set(options.urls.map((url) => url.trim()).filter(Boolean))];
  let lastError = urls.length ? 'reference-image-download-failed' : 'reference-image-url-missing';
  let lastValidation: ReferenceImageValidation | null = null;

  for (const url of urls) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: ReferenceFetchResponse | null = null;
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
            'User-Agent': 'StackR-reference-ocr-benchmark/1.0',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const contentType = response.headers.get('content-type');
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          await cancelBody(response);
          const error = `content-length-too-large:${contentLength}`;
          attempts.push({
            url,
            attempt,
            responseStatus: response.status,
            contentType,
            bytes: contentLength,
            validationErrors: [error],
            error,
          });
          lastError = error;
          break;
        }

        if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
          await cancelBody(response);
          attempts.push({
            url,
            attempt,
            responseStatus: response.status,
            contentType,
            bytes: null,
            validationErrors: [`http-status:${response.status}`],
            error: `retryable-http-status:${response.status}`,
          });
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        const body = Buffer.from(await response.arrayBuffer());
        let validation: ReferenceImageValidation;
        try {
          const metadata = await options.decodeImage(body);
          validation = validateReferenceImage({
            responseStatus: response.status,
            contentType,
            body,
            metadata,
            maxBytes,
          });
        } catch (error) {
          validation = withDecodeError(validateReferenceImage({
            responseStatus: response.status,
            contentType,
            body,
            metadata: {},
            maxBytes,
          }), error);
        }

        attempts.push({
          url,
          attempt,
          responseStatus: response.status,
          contentType,
          bytes: body.length,
          validationErrors: validation.errors,
          error: validation.valid ? null : validation.errors.join(','),
        });
        if (validation.valid) {
          return { status: 'ready', url, body, validation, attempts, error: null };
        }

        lastValidation = validation;
        lastError = validation.errors.join(',') || 'reference-image-invalid';
        if (response.status === 401 || response.status === 403) {
          return { status: 'error', url, body: null, validation, attempts, error: lastError };
        }
        break;
      } catch (error) {
        const message = errorMessage(error);
        attempts.push({
          url,
          attempt,
          responseStatus: response?.status ?? null,
          contentType: response?.headers.get('content-type') ?? null,
          bytes: null,
          validationErrors: [],
          error: message,
        });
        lastError = message;
        if (attempt < maxAttempts) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
      }
    }
  }

  return {
    status: 'error',
    url: attempts.at(-1)?.url ?? null,
    body: null,
    validation: lastValidation,
    attempts,
    error: lastError,
  };
}
