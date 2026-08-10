const SLOW_FETCH_MS = 10000;

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'apikey',
  'api_key',
  'authorization',
  'client_secret',
  'key',
  'password',
  'refresh_token',
  'secret',
  'service_role',
  'token',
]);

let installed = false;

function getRequestUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input === 'object' && 'url' in input && typeof (input as { url?: unknown }).url === 'string') {
    return (input as { url: string }).url;
  }
  return String(input ?? 'unknown-url');
}

function getRequestMethod(input: unknown, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input && typeof input === 'object' && 'method' in input && typeof (input as { method?: unknown }).method === 'string') {
    return (input as { method: string }).method.toUpperCase();
  }
  return 'GET';
}

function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.forEach((_, key) => {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]');
      }
    });
    return parsed.toString();
  } catch {
    return rawUrl.replace(
      /([?&](?:access_token|apikey|api_key|authorization|client_secret|key|password|refresh_token|secret|service_role|token)=)[^&]+/gi,
      '$1[redacted]',
    );
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown fetch error');
}

export function installRuntimeFetchDiagnostics() {
  const forceEnabled = process.env.EXPO_PUBLIC_FETCH_DIAGNOSTICS === 'true';
  const disabled = process.env.EXPO_PUBLIC_FETCH_DIAGNOSTICS === 'false';

  if (installed || disabled || (!__DEV__ && !forceEnabled)) return;
  if (typeof globalThis.fetch !== 'function') return;

  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = Date.now();
    const method = getRequestMethod(input, init);
    const url = redactUrl(getRequestUrl(input));

    try {
      const response = await originalFetch(input, init);
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        console.warn(
          `[Stackr fetch:error] ${method} ${url} -> ${response.status} ${response.statusText || 'HTTP error'} (${durationMs}ms)`,
        );
      } else if (durationMs >= SLOW_FETCH_MS) {
        console.warn(`[Stackr fetch:slow] ${method} ${url} -> ${response.status} (${durationMs}ms)`);
      }

      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.warn(`[Stackr fetch:failed] ${method} ${url} (${durationMs}ms): ${getErrorMessage(error)}`);
      throw error;
    }
  }) as typeof fetch;
}
