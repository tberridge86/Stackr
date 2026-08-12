const CONNECTION_LIMIT_PATTERN = /too many connections issued to the database/i;
const THROTTLE_PATTERN = /(?:too many connections issued to the database|too_many_connections|\bslowdown\b)/i;
const TRANSIENT_MESSAGE_PATTERN = /(?:fetch failed|network error|socket hang up|connection reset|temporarily unavailable|timed? out|timeout|econnreset|econnrefused|etimedout|eai_again)/i;
const TRANSIENT_STATUS_CODES = new Set([408, 423, 425, 429, 500, 502, 503, 504, 520, 522, 524, 544]);
const TRANSIENT_ERROR_CODES = new Set([
  'ABORT_ERR',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function errorValues(error, property) {
  return [error?.[property], error?.cause?.[property]].filter((value) => value != null);
}

function storageErrorStatus(error) {
  for (const value of [
    ...errorValues(error, 'status'),
    ...errorValues(error, 'statusCode'),
  ]) {
    const status = Number(value);
    if (Number.isInteger(status)) return status;
  }
  return null;
}

function storageErrorCode(error) {
  const code = errorValues(error, 'code').map(String).find(Boolean);
  if (code) return code;
  return errorValues(error, 'statusCode')
    .map(String)
    .find((value) => !/^\d+$/.test(value.trim())) ?? null;
}

export function isStorageConnectionLimitError(error) {
  return CONNECTION_LIMIT_PATTERN.test(String(error?.message ?? error ?? ''));
}

export function isStorageThrottleError(error) {
  return storageErrorStatus(error) === 429
    || THROTTLE_PATTERN.test(String(error?.message ?? error ?? ''))
    || THROTTLE_PATTERN.test(String(storageErrorCode(error) ?? ''));
}

export function isRetryableStorageError(error, options = {}) {
  const status = storageErrorStatus(error);
  if (status === 400 && options.retryAbortedUploadBadRequest === true) {
    return storageErrorCode(error) == null
      && /^upload_production_object:.+:Bad Request$/i.test(String(error?.message ?? ''));
  }
  if (status != null) return TRANSIENT_STATUS_CODES.has(status);
  const code = storageErrorCode(error);
  if (code && TRANSIENT_ERROR_CODES.has(code.toUpperCase())) return true;
  return isStorageThrottleError(error)
    || TRANSIENT_MESSAGE_PATTERN.test(String(error?.message ?? error ?? ''));
}

export async function retryStorageOperation(operation, options = {}) {
  const attempts = options.attempts ?? 6;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const random = options.random ?? Math.random;
  const onRetry = options.onRetry ?? (() => {});
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableStorageError(error, options)) throw error;
      if (attempt >= attempts) break;

      const throttled = isStorageThrottleError(error);
      const abortedUpload = storageErrorStatus(error) === 400
        && options.retryAbortedUploadBadRequest === true;
      const baseDelay = throttled ? 5_000 : abortedUpload ? 2_000 : 500;
      const maximumDelay = throttled ? 60_000 : abortedUpload ? 15_000 : 8_000;
      const exponentialDelay = Math.min(maximumDelay, baseDelay * (2 ** (attempt - 1)));
      const jitter = Math.floor(exponentialDelay * 0.25 * random());
      const delayMilliseconds = Math.min(maximumDelay, exponentialDelay + jitter);
      onRetry({ attempt, throttled, abortedUpload, delayMilliseconds });
      await wait(delayMilliseconds);
    }
  }

  throw lastError;
}
