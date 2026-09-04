/**
 * Provider set logos and expansion symbols are amber under Stackr's IP
 * operating boundary. The review owner has now recorded a source- and
 * feature-specific approval for exact TCGdex CJK set marks. Existing catalogue
 * values remain untouched: this module is a runtime URL allow-list only.
 */
type ProviderSetMarkRuntimePolicy = {
  classification: 'amber';
  authorityPath: string;
  recordedReviewPath: string;
  recordedReviewSha256: string;
  activationAuthorized: boolean;
  publicRuntimeDisplayAuthorized: boolean;
  canonicalDatabaseWriteAuthorized: false;
  assetPersistenceAuthorized: false;
  providerHost: 'assets.tcgdex.net';
  languages: readonly ['ja', 'zh-tw', 'zh-cn'];
  attributionText: 'TCGdex reference';
};

export const PROVIDER_SET_MARK_RUNTIME_POLICY: ProviderSetMarkRuntimePolicy = {
  classification: 'amber',
  authorityPath: 'docs/stackrtcg-ip-operating-boundary.md',
  recordedReviewPath: 'catalogue/rights-reviews/tcgdex-cjk-set-marks-owner-approved.2026-09-04.json',
  recordedReviewSha256: '6f8152e827d70b8a8ee09c023620332815f9a2183017c822dc5f86d60411c072',
  activationAuthorized: true,
  publicRuntimeDisplayAuthorized: true,
  canonicalDatabaseWriteAuthorized: false,
  assetPersistenceAuthorized: false,
  providerHost: 'assets.tcgdex.net',
  languages: ['ja', 'zh-tw', 'zh-cn'],
  attributionText: 'TCGdex reference',
};

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const ALLOWED_SCOPES = new Set<string>([...PROVIDER_SET_MARK_RUNTIME_POLICY.languages, 'univ']);

function sourceDisabled() {
  return process.env.EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS === 'true'
    || process.env.STACKR_DISABLE_TCGDEX_SET_MARKS === 'true';
}

function isDenied(scope: string, seriesId: string, setId: string, markType: string) {
  const raw = String(
    process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST
      ?? process.env.STACKR_TCGDEX_SET_MARK_DENYLIST
      ?? '',
  ).trim();
  if (!raw) return false;
  if (raw.length > 16_384) return true;
  const key = `${scope}:${seriesId}:${setId}:${markType}`.toLowerCase();
  return raw.split(',').some((entry) => entry.trim().toLowerCase() === key);
}

export function isTcgdexProviderSetMarkUrl(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw || sourceDisabled()) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:'
    || url.hostname !== PROVIDER_SET_MARK_RUNTIME_POLICY.providerHost
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash) return false;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 4 || segments.some((segment) => !SAFE_PATH_SEGMENT.test(segment))) return false;
  const [scope, seriesId, setId, filename] = segments;
  if (!ALLOWED_SCOPES.has(scope)) return false;
  if (filename !== 'logo.webp' && filename !== 'symbol.webp') return false;
  if (scope === 'univ' && filename !== 'symbol.webp') return false;
  const markType = filename === 'logo.webp' ? 'logo' : 'symbol';
  return !isDenied(scope, seriesId, setId, markType);
}

/**
 * Runtime-only delivery gate. It intentionally does not rewrite persistence
 * payloads or remove values already stored in historical records.
 */
export function enforceProviderSetMarkRuntimePolicy(value: string | null | undefined) {
  const url = String(value ?? '').trim();
  if (!url) return undefined;
  if (
    !PROVIDER_SET_MARK_RUNTIME_POLICY.activationAuthorized
    || !PROVIDER_SET_MARK_RUNTIME_POLICY.publicRuntimeDisplayAuthorized
  ) return undefined;
  return isTcgdexProviderSetMarkUrl(url) ? url : undefined;
}

/**
 * Final display guard for a set visual. Existing non-TCGdex catalogue and
 * Stackr-hosted values remain available exactly as stored; only values on the
 * TCGdex asset host are interpreted as provider marks and subjected to the
 * bounded owner-approved allow-list above.
 *
 * This distinction is important: the provider decision must not become a
 * catalogue-cleanup policy or erase an unrelated stored cover/logo merely
 * because it is not a TCGdex URL.
 */
export function enforceSetVisualRuntimePolicy(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw, 'https://stackr.invalid');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (hostname === PROVIDER_SET_MARK_RUNTIME_POLICY.providerHost) {
      return enforceProviderSetMarkRuntimePolicy(raw);
    }
  } catch {
    // Relative Stackr delivery paths and bundled runtime identifiers are not
    // provider URLs. Preserve them for their existing resolver.
  }

  return raw;
}
