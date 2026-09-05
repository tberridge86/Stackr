export const TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY = {
  classification: 'green',
  authorityPath: 'docs/stackrtcg-ip-operating-boundary.md',
  evidencePath: 'catalogue/rights-evidence/tcgdex-low-resolution-card-reference.2026-09-04.json',
  decisionPath: 'catalogue/rights-reviews/tcgdex-low-resolution-card-reference-green.2026-09-04.json',
  decisionSha256: '1cdfac042494f4ec3f78ef23de1a6bf0d1cc351eba43a0bedb000923bf8520ba',
  activationAuthorized: true,
  publicRuntimeDisplayAuthorized: true,
  canonicalDatabaseWriteAuthorized: false,
  assetPersistenceAuthorized: false,
  providerHost: 'assets.tcgdex.net',
  rendition: 'low.webp',
  cachePolicy: 'memory',
  attributionText: 'TCGdex reference',
  languages: ['ja', 'zh-tw', 'zh-cn'],
} as const;

type ControlledLanguage = (typeof TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.languages)[number];

export type TcgdexCardReferenceInput = {
  language?: string | null;
  providerCardId?: string | null;
  providerSetId?: string | null;
  localId?: string | number | null;
  providerImageBase?: string | null;
  providerLowResolutionUri?: string | null;
  provenance?: 'tcgdex_live_or_ttl_cached_provider_card_record' | null;
};

export type TcgdexControlledCardReference = {
  uri: string;
  sourceCode: 'tcgdex';
  attributionText: typeof TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.attributionText;
  cachePolicy: typeof TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.cachePolicy;
  denialKey: string;
};

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const issuedReferences = new Map<string, string>();
const MAX_ISSUED_REFERENCES = 20_000;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function controlledLanguage(value: unknown): ControlledLanguage | null {
  const language = clean(value).toLowerCase().replace(/_/g, '-');
  return TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.languages.includes(language as ControlledLanguage)
    ? language as ControlledLanguage
    : null;
}

function sourceDisabled() {
  return process.env.EXPO_PUBLIC_DISABLE_TCGDEX_CARD_REFERENCES === 'true'
    || process.env.STACKR_DISABLE_TCGDEX_CARD_REFERENCES === 'true';
}

export function isTcgdexControlledCardReferenceSourceEnabled() {
  return TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.activationAuthorized
    && TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.publicRuntimeDisplayAuthorized
    && !sourceDisabled();
}

function strictTcgdexUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:'
    || url.hostname !== TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.providerHost
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.some((segment) => !SAFE_PATH_SEGMENT.test(segment))) return null;
  return { url, segments };
}

function hasExactTcgdexHost(value: unknown) {
  try {
    const hostname = new URL(clean(value)).hostname.toLowerCase().replace(/\.$/, '');
    return hostname === TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.providerHost;
  } catch {
    return false;
  }
}

function providerSetIdFromCardId(providerCardId: string, localId: string) {
  const suffix = `-${localId}`;
  return providerCardId.endsWith(suffix) ? providerCardId.slice(0, -suffix.length) : null;
}

export function getTcgdexCardReferenceDenialKey(
  language: ControlledLanguage,
  providerSetId: string,
  providerCardId: string,
) {
  return `${language}:${providerSetId}:${providerCardId}`;
}

function isDenied(key: string) {
  const raw = clean(process.env.EXPO_PUBLIC_TCGDEX_CARD_REFERENCE_DENYLIST);
  if (!raw) return false;
  if (raw.length > 16_384) return true;
  const normalizedKey = key.toLowerCase();
  return raw.split(',').some((entry) => entry.trim().toLowerCase() === normalizedKey);
}

function rememberIssuedReference(uri: string, denialKey: string) {
  if (issuedReferences.has(uri)) issuedReferences.delete(uri);
  issuedReferences.set(uri, denialKey);
  while (issuedReferences.size > MAX_ISSUED_REFERENCES) {
    const oldest = issuedReferences.keys().next().value;
    if (!oldest) break;
    issuedReferences.delete(oldest);
  }
}

export function resolveTcgdexControlledCardReference(
  input: TcgdexCardReferenceInput,
): TcgdexControlledCardReference | null {
  if (!isTcgdexControlledCardReferenceSourceEnabled()
    || input.provenance !== 'tcgdex_live_or_ttl_cached_provider_card_record') return null;

  const language = controlledLanguage(input.language);
  const providerCardId = clean(input.providerCardId);
  const localId = clean(input.localId);
  const baseParsed = strictTcgdexUrl(input.providerImageBase);
  const lowParsed = strictTcgdexUrl(input.providerLowResolutionUri);
  if (baseParsed && lowParsed) return null;
  const parsed = baseParsed ?? lowParsed;
  if (!language || !providerCardId || !localId || !parsed) return null;
  const expectedLength = lowParsed ? 5 : 4;
  if (parsed.segments.length !== expectedLength) return null;
  const baseSegments = lowParsed ? parsed.segments.slice(0, -1) : parsed.segments;
  if (lowParsed
    && parsed.segments[parsed.segments.length - 1] !== TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.rendition) return null;

  const derivedSetId = providerSetIdFromCardId(providerCardId, localId);
  const providerSetId = clean(input.providerSetId) || derivedSetId;
  if (!providerSetId || providerSetId !== derivedSetId) return null;
  if (providerCardId !== `${providerSetId}-${localId}`) return null;

  const [urlLanguage, resourceType, urlSetId, urlLocalId] = baseSegments;
  if (urlLanguage !== language
    || resourceType !== 'cards'
    || urlSetId !== providerSetId
    || urlLocalId !== localId) return null;

  const denialKey = getTcgdexCardReferenceDenialKey(language, providerSetId, providerCardId);
  if (isDenied(denialKey)) return null;

  const uri = `${parsed.url.origin}/${baseSegments.join('/')}/${TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.rendition}`;
  rememberIssuedReference(uri, denialKey);
  return {
    uri,
    sourceCode: 'tcgdex',
    attributionText: TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.attributionText,
    cachePolicy: TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.cachePolicy,
    denialKey,
  };
}

export function isTcgdexAssetUrl(value: unknown) {
  return Boolean(strictTcgdexUrl(value));
}

export function isTcgdexControlledCardReferenceUrl(value: unknown) {
  if (sourceDisabled()) return false;
  const parsed = strictTcgdexUrl(value);
  if (!parsed || parsed.segments.length !== 5) return false;
  const [languageValue, resourceType, setId, localId, rendition] = parsed.segments;
  const language = controlledLanguage(languageValue);
  if (!language
    || resourceType !== 'cards'
    || !setId
    || !localId
    || rendition !== TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.rendition) return false;
  const providerCardId = `${setId}-${localId}`;
  const denialKey = getTcgdexCardReferenceDenialKey(language, setId, providerCardId);
  return issuedReferences.get(parsed.url.toString()) === denialKey && !isDenied(denialKey);
}

/** Last-mile guard: non-TCGdex images are unchanged; controlled-language TCGdex assets fail closed. */
export function enforceTcgdexRuntimeImagePolicy(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return null;
  if (!hasExactTcgdexHost(raw)) return raw;
  return isTcgdexControlledCardReferenceUrl(raw) ? raw : null;
}

/**
 * Attach a provider-issued image to a transient display object without making
 * it copyable by object spreads or JSON serialization. This is deliberately
 * limited to URLs issued by the controlled TCGdex route; existing stored
 * fields are never altered by this helper.
 */
export function defineTcgdexRuntimeImageOverlay<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  referenceUrl: string | null | undefined = typeof value === 'string' ? value : null,
): T {
  const image = enforceTcgdexRuntimeImagePolicy(referenceUrl);
  if (!image || !hasExactTcgdexHost(image)) return target;
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return target;
}

/** True only for a composite object value attached by the transient overlay helper. */
export function hasTcgdexRuntimeImageOverlay(target: object, key: PropertyKey) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  return descriptor?.enumerable === false
    && typeof descriptor.value === 'object'
    && descriptor.value !== null;
}

/** Provider set marks remain amber and must never borrow the card-reference decision. */
export function suppressTcgdexSetMark(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return undefined;
  return hasExactTcgdexHost(raw) ? undefined : raw;
}

/**
 * Remove a candidate provider asset from a new persistence payload.
 * Never apply this directly to a value already read from storage; update paths
 * must use preserveExistingImageUrlBeforePersistence instead.
 */
export function stripTcgdexReferenceBeforePersistence(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return null;
  return hasExactTcgdexHost(raw) ? null : raw;
}

/**
 * Select an image value for an update without destroying a pointer that was
 * already stored. The candidate is allowed to replace the stored value only
 * when it is not a TCGdex asset. A TCGdex candidate is a display-only value,
 * so the trusted at-rest value wins instead.
 *
 * `existingValue` must come from the record/snapshot being updated, never from
 * another display model. Public rendering remains subject to
 * `enforceTcgdexRuntimeImagePolicy` even when a historical pointer is retained
 * here at rest.
 */
export function preserveExistingImageUrlBeforePersistence(
  candidateValue: string | null | undefined,
  existingValue: string | null | undefined,
) {
  const candidate = clean(candidateValue);
  const existing = clean(existingValue);
  if (!candidate) return existing || null;
  if (!hasExactTcgdexHost(candidate)) return candidate;
  return existing || null;
}

/**
 * JSON-shaped equivalent of preserveExistingImageUrlBeforePersistence.
 * It keeps a provider URL only when that exact field already held one in the
 * at-rest value. Newly introduced provider URLs still become null. Object keys
 * omitted by a partial update retain their existing values; an explicit
 * non-provider value (including null) still replaces the existing value.
 */
export function preserveExistingTcgdexReferencesBeforePersistence<T>(
  candidateValue: T,
  existingValue: unknown,
): T {
  const preserve = (candidate: unknown, existing: unknown): unknown => {
    if (typeof candidate === 'string') {
      if (!hasExactTcgdexHost(candidate)) return candidate;
      return typeof existing === 'string' && hasExactTcgdexHost(existing)
        ? existing
        : null;
    }
    if (candidate == null) {
      return typeof existing === 'string' && hasExactTcgdexHost(existing)
        ? existing
        : candidate;
    }
    if (Array.isArray(candidate)) {
      const existingArray = Array.isArray(existing) ? existing : [];
      return candidate.map((entry, index) => preserve(entry, existingArray[index]));
    }
    if (typeof candidate !== 'object') return candidate;

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) return candidate;
    const existingObject = existing
      && typeof existing === 'object'
      && !Array.isArray(existing)
      && (Object.getPrototypeOf(existing) === Object.prototype || Object.getPrototypeOf(existing) === null)
      ? existing as Record<string, unknown>
      : {};
    const preservedObject: Record<string, unknown> = { ...existingObject };
    for (const [key, entry] of Object.entries(candidate as Record<string, unknown>)) {
      preservedObject[key] = preserve(entry, existingObject[key]);
    }
    return preservedObject;
  };

  return preserve(candidateValue, existingValue) as T;
}

/**
 * Recursively remove provider asset URLs from a new JSON-shaped payload. This
 * is intentionally broad for listing drafts/public-response quarantine and is
 * not an at-rest record migration or cleanup utility.
 */
export function stripTcgdexReferencesFromValueBeforePersistence<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const strip = (candidate: unknown): unknown => {
    if (typeof candidate === 'string') {
      return hasExactTcgdexHost(candidate) ? null : candidate;
    }
    if (!candidate || typeof candidate !== 'object') return candidate;

    const existing = seen.get(candidate);
    if (existing !== undefined) return existing;

    if (Array.isArray(candidate)) {
      const sanitized: unknown[] = [];
      seen.set(candidate, sanitized);
      candidate.forEach((entry) => sanitized.push(strip(entry)));
      return sanitized;
    }

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) return candidate;

    const sanitized: Record<string, unknown> = {};
    seen.set(candidate, sanitized);
    for (const [key, entry] of Object.entries(candidate as Record<string, unknown>)) {
      sanitized[key] = strip(entry);
    }
    return sanitized;
  };

  return strip(value) as T;
}
