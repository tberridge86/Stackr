/**
 * The browser preview can use this same-origin route only while Metro is
 * running on a loopback address. The configured API origin remains HTTPS and
 * is validated before a request can be rewritten.
 */
export const STACKR_PREVIEW_PROXY_PREFIX = '/__stackr-preview-api/v1';

type PreviewLocation = {
  origin: string;
  hostname: string;
};

export type StackrPreviewProxyRuntime = {
  development: boolean;
  location: PreviewLocation | null;
};

export function stripStackrPreviewProxyAuthorization(headers: Record<string, string>) {
  const anonymousHeaders = { ...headers };
  for (const headerName of Object.keys(anonymousHeaders)) {
    if (headerName.toLowerCase() === 'authorization') delete anonymousHeaders[headerName];
  }
  return anonymousHeaders;
}

/**
 * Same-origin preview reads are deliberately anonymous and the Metro proxy
 * never forwards a device identifier. Resolve the identifier lazily so an
 * embedded browser does not need working persistent storage to load sets.
 */
export function resolveStackrApiDeviceIdForRequest(
  remoteUrl: string,
  requestUrl: string,
  getDeviceId: () => Promise<string>,
) {
  return requestUrl === remoteUrl ? getDeviceId() : Promise.resolve(null);
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isAllowedReadPath(pathname: string) {
  if (pathname === '/v1/sets' || pathname === '/v1/assets/manifest') return true;
  return /^\/v1\/sets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/cards)?$/i.test(pathname);
}

function defaultRuntime(): StackrPreviewProxyRuntime {
  const browserWindow = typeof window === 'undefined' ? null : window;
  return {
    development: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    location: browserWindow?.location
      ? { origin: browserWindow.location.origin, hostname: browserWindow.location.hostname }
      : null,
  };
}

export function rewriteStackrApiUrlForLoopbackPreview(
  remoteUrl: string,
  method: string | undefined,
  runtime: StackrPreviewProxyRuntime = defaultRuntime(),
) {
  if (runtime.development !== true || runtime.location === null || (method ?? 'GET').toUpperCase() !== 'GET') {
    return remoteUrl;
  }
  if (!isLoopbackHostname(runtime.location.hostname)) return remoteUrl;

  const remote = new URL(remoteUrl);
  if (remote.protocol !== 'https:' || !isAllowedReadPath(remote.pathname)) return remoteUrl;
  const origin = new URL(runtime.location.origin);
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return remoteUrl;

  return `${origin.origin}${STACKR_PREVIEW_PROXY_PREFIX}${remote.pathname.slice('/v1'.length)}${remote.search}`;
}
