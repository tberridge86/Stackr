/* eslint-env node */

const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UpstreamHttpError extends Error {
  constructor(message, {
    code = 'upstream_request_failed',
    provider = 'upstream',
    url = null,
    status = null,
    retryable = false,
    attempts = 1,
    responseBody = null,
    cause = null,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'UpstreamHttpError';
    this.code = code;
    this.provider = provider;
    this.url = url;
    this.status = status;
    this.retryable = retryable;
    this.attempts = attempts;
    this.responseBody = responseBody;
  }
}

export function parseRetryAfterMs(value, now = Date.now()) {
  const raw = clean(value);
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now);
}

function retryDelayMs(response, attempt, random = Math.random) {
  const providerDelay = parseRetryAfterMs(response?.headers?.get?.('retry-after'));
  if (providerDelay != null) return Math.min(Math.max(providerDelay, 100), 30_000);
  const exponential = Math.min(500 * (2 ** Math.max(0, attempt - 1)), 10_000);
  const jitter = Math.round(exponential * 0.2 * Math.max(0, Math.min(1, Number(random()) || 0)));
  return exponential + jitter;
}

function abortError(provider, url, attempts, cause) {
  return new UpstreamHttpError(`${provider} request timed out.`, {
    code: 'upstream_request_timeout',
    provider,
    url,
    retryable: true,
    attempts,
    cause,
  });
}

function networkError(provider, url, attempts, cause) {
  return new UpstreamHttpError(`${provider} request failed before a response was received.`, {
    code: 'upstream_network_error',
    provider,
    url,
    retryable: true,
    attempts,
    cause,
  });
}

export async function fetchJsonWithPolicy(url, {
  provider = 'upstream',
  headers = {},
  timeoutMs = 15_000,
  maxAttempts = 3,
  retryStatuses = DEFAULT_RETRY_STATUSES,
  allowStatuses = [],
  fetchImpl = globalThis.fetch,
  sleepImpl = delay,
  random = Math.random,
  signal = null,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new UpstreamHttpError(`${provider} fetch implementation is unavailable.`, {
      code: 'upstream_fetch_unavailable',
      provider,
      url,
    });
  }

  const attemptsLimit = Math.max(1, Math.min(Number(maxAttempts) || 1, 6));
  const requestTimeout = Math.max(250, Math.min(Number(timeoutMs) || 15_000, 120_000));
  const allowed = new Set(allowStatuses);
  let lastError = null;

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    if (signal?.aborted) throw signal.reason ?? new Error('Request aborted.');

    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('request_timeout')), requestTimeout);

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (signal?.aborted) throw signal.reason ?? error;
      lastError = controller.signal.aborted
        ? abortError(provider, url, attempt, error)
        : networkError(provider, url, attempt, error);
      if (attempt >= attemptsLimit) throw lastError;
      await sleepImpl(retryDelayMs(null, attempt, random));
      continue;
    }

    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);

    const status = Number(response.status);
    const responseText = status === 204 || status === 205 || status === 304
      ? ''
      : await response.text();
    const retryable = retryStatuses.has(status);

    if (!response.ok && !allowed.has(status)) {
      lastError = new UpstreamHttpError(`${provider} request failed with HTTP ${status}.`, {
        code: status === 429 ? 'upstream_rate_limited' : 'upstream_http_error',
        provider,
        url,
        status,
        retryable,
        attempts: attempt,
        responseBody: responseText.slice(0, 500),
      });
      if (retryable && attempt < attemptsLimit) {
        await sleepImpl(retryDelayMs(response, attempt, random));
        continue;
      }
      throw lastError;
    }

    let value = null;
    if (responseText) {
      try {
        value = JSON.parse(responseText);
      } catch (error) {
        throw new UpstreamHttpError(`${provider} returned invalid JSON.`, {
          code: 'upstream_invalid_json',
          provider,
          url,
          status,
          attempts: attempt,
          responseBody: responseText.slice(0, 500),
          cause: error,
        });
      }
    }

    return {
      value,
      status,
      attempts: attempt,
      headers: response.headers,
      metadata: {
        provider,
        status,
        attempts: attempt,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        retryAfter: response.headers.get('retry-after'),
      },
    };
  }

  throw lastError ?? networkError(provider, url, attemptsLimit, null);
}

export const upstreamJsonInternals = {
  DEFAULT_RETRY_STATUSES,
  retryDelayMs,
};
