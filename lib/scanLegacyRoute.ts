export type LegacyCameraParams = {
  intent?: string | string[];
  mode?: string | string[];
  flow?: string | string[];
  type?: string | string[];
  binderId?: string | string[];
  parentSessionId?: string | string[];
  replacePocketIndex?: string | string[];
  layout?: string | string[];
  scanMode?: string | string[];
  reason?: string | string[];
  q?: string | string[];
};

export type ScanRedirect = {
  pathname: '/scan';
  params: Record<string, string>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Keeps every legacy camera-route value understood by the canonical scanner.
 * Expo can supply duplicate query values as arrays; routing has always used
 * the first value, so preserve that behavior deliberately.
 */
export function getLegacyCameraRedirect(params: LegacyCameraParams): ScanRedirect {
  const canonicalParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const resolved = firstParam(value);
    if (typeof resolved === 'string') canonicalParams[key] = resolved;
  }
  return { pathname: '/scan', params: canonicalParams };
}
