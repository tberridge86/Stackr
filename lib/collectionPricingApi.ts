import type {
  StackrApiClient,
  StackrCardPrice,
  StackrPriceSnapshotHistoryItem,
  StackrMarketProductType,
} from './stackrApiV1';
import type { StackrResolvedCard } from './stackrDomainAdapter';

export type CollectionPriceInput = {
  key: string;
  references: string[];
  quantity: number;
  language?: string | null;
  setId?: string | null;
  variantCode?: string | null;
  productType?: StackrMarketProductType;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
  /** Canonical printing UUID persisted when a binder row was catalogue-matched. */
  canonicalPrintingId?: string | null;
  legacyReference?: string | null;
  legacySetId?: string | null;
  edition?: string | null;
  /**
   * Canonical facts carried by an already-resolved catalogue row. They are
   * structurally verified before use so display aliases never bypass identity
   * resolution.
   */
  trustedResolution?: CollectionPriceResolution | null;
};

export type CollectionPriceResolution = {
  canonical: true;
  cardId: string;
  setId?: string | null;
  language?: string | null;
  defaultVariantId: string;
  variants: { variantId: string; variantCode: string | null }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CollectionPriceRequestFailure = {
  kind: 'authentication_required' | 'access_denied' | 'rate_limited' | 'service_error' | 'network_error';
  status: number | null;
  code: string | null;
  requestId: string | null;
  /** True means this item was not requested after a sibling stopped the batch. */
  deferred: boolean;
};

export type CollectionPriceResult = {
  key: string;
  quantity: number;
  reference: string | null;
  variantId: string | null;
  central: number | null;
  status: StackrCardPrice['status'];
  freshness: StackrCardPrice['freshness'];
  calculatedAt: string | null;
  staleAfter: string | null;
  quoteScope?: StackrCardPrice['quoteScope'];
  fallbackEstimate?: StackrCardPrice['fallbackEstimate'];
  pricingKind?: 'exact' | 'general' | 'unknown';
  unavailableReason: string | null;
  requestError: string | null;
  /** Missing quotes have no request failure; transport/access failures do. */
  requestFailure?: CollectionPriceRequestFailure;
};

type CollectionPriceClient = Pick<StackrApiClient, 'cardPrice'>;
// Catalogue identity is public and already has bounded, invalidatable caching.
// Keep this dedicated client stable across reads; never cache an owner's quotes here.
let collectionPriceClient: Promise<StackrApiClient> | undefined;
type CollectionPriceResolver = (
  reference: string,
  options: { language?: string | null; setId?: string | null },
  client: StackrApiClient,
) => Promise<StackrResolvedCard | null>;

export type CollectionPriceLoaderOptions = {
  /** A dedicated client bypasses the wider catalogue feature flag for this bounded API read. */
  client?: StackrApiClient;
  resolver?: CollectionPriceResolver;
  concurrency?: number;
  /** Stop scheduling work after the screen/account request is superseded. */
  isCurrent?: () => boolean;
  /** Pending entries remain unavailable, so the UI can display an honest partial subtotal. */
  onProgress?: (results: CollectionPriceResult[], completed: number) => void;
  /** Reports a systemic interruption once so a viewport scheduler can back off. */
  onInterrupted?: (failure: CollectionPriceRequestFailure) => void;
};

const RAW_CONDITIONS: Record<string, string> = {
  mint: 'raw_mint',
  near_mint: 'raw_near_mint',
  nm: 'raw_near_mint',
  lightly_played: 'raw_lightly_played',
  lp: 'raw_lightly_played',
  moderately_played: 'raw_moderately_played',
  mp: 'raw_moderately_played',
  heavily_played: 'raw_heavily_played',
  hp: 'raw_heavily_played',
  damaged: 'raw_damaged',
  dmg: 'raw_damaged',
};

const LEGACY_VARIANT_CODES: Record<string, string> = {
  holofoil: 'holo',
  reverse_holofoil: 'reverse_holo',
  reverse_holo_pokeball: 'poke_ball',
  master_ball_pattern_holofoil: 'master_ball',
  '1st_edition': 'first_edition',
};

function normaliseToken(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normaliseCollectionVariantCode(value?: string | null) {
  const normalized = normaliseToken(value);
  return LEGACY_VARIANT_CODES[normalized] ?? normalized;
}

export function normaliseCollectionMarketCondition(
  condition?: string | null,
  productType: StackrMarketProductType = 'raw_card',
) {
  if (productType === 'graded_card') return 'graded';
  const normalized = normaliseToken(condition);
  if (!normalized) return undefined;
  const mapped = RAW_CONDITIONS[normalized];
  if (mapped) return mapped;

  // Accept the canonical values we emit ourselves, but never forward an
  // arbitrary raw_* token to an endpoint that could select a different
  // condition than the one the owner recorded.
  return Object.values(RAW_CONDITIONS).includes(normalized) ? normalized : undefined;
}

export function unavailableCollectionPrice(input: CollectionPriceInput, details: Partial<CollectionPriceResult> = {}): CollectionPriceResult {
  return {
    key: input.key,
    quantity: Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0),
    reference: null,
    variantId: null,
    central: null,
    status: 'unavailable',
    freshness: 'unknown',
    calculatedAt: null,
    staleAfter: null,
    pricingKind: 'unknown',
    unavailableReason: 'No matching Stackr price is available.',
    requestError: null,
    ...details,
  };
}

/** The server must explicitly mark any non-exact estimate; absent scope is a legacy exact response. */
export function collectionPriceKind(price: Pick<StackrCardPrice, 'fallbackEstimate' | 'quoteScope' | 'estimates' | 'status'>): CollectionPriceResult['pricingKind'] {
  const central = price.estimates?.central;
  if (!Number.isFinite(central) || (central as number) < 0 || String(price.status ?? '').toLowerCase() === 'unavailable') return 'unknown';
  return price.fallbackEstimate != null || price.quoteScope === 'printing_level' ? 'general' : 'exact';
}

function trustedResolution(input: CollectionPriceInput): StackrResolvedCard | null {
  const trusted = input.trustedResolution;
  if (!trusted) return null;
  const cardId = String(trusted.cardId ?? '').trim();
  const defaultVariantId = String(trusted.defaultVariantId ?? '').trim();
  const references = new Set(input.references.map((value) => String(value ?? '').trim()).filter(Boolean));
  if (trusted.canonical !== true || !UUID.test(cardId) || !UUID.test(defaultVariantId) || !references.has(cardId)) return null;
  const requestedSetId = String(input.setId ?? '').trim();
  const trustedSetId = String(trusted.setId ?? '').trim();
  if (!UUID.test(requestedSetId) || !UUID.test(trustedSetId) || requestedSetId !== trustedSetId) return null;
  const requestedLanguage = String(input.language ?? '').trim().toLowerCase();
  const trustedLanguage = String(trusted.language ?? '').trim().toLowerCase();
  if (!requestedLanguage || !trustedLanguage || requestedLanguage !== trustedLanguage) return null;
  const variants = Array.isArray(trusted.variants) ? trusted.variants
    .map((variant) => ({ variantId: String(variant?.variantId ?? '').trim(), variantCode: String(variant?.variantCode ?? '').trim() || null }))
    .filter((variant) => UUID.test(variant.variantId)) : [];
  if (!variants.length || !variants.some((variant) => variant.variantId === defaultVariantId)) return null;
  return {
    card: { cardId, variants } as StackrResolvedCard['card'],
    variantId: defaultVariantId,
    matchedBy: 'canonical_uuid',
  };
}

/** Return a canonical raw/NM variant only when saved facts prove its scope. */
export function exactTrustedRawNearMintVariantId(input: CollectionPriceInput): string | null {
  if ((input.productType ?? 'raw_card') !== 'raw_card') return null;
  if (normaliseCollectionMarketCondition(input.condition, 'raw_card') !== 'raw_near_mint') return null;
  const resolved = trustedResolution(input);
  if (!resolved) return null;
  const requestedVariant = normaliseCollectionVariantCode(input.variantCode);
  const variants = resolved.card.variants ?? [];
  if (requestedVariant) {
    const matches = variants.filter((candidate) => normaliseCollectionVariantCode(candidate.variantCode) === requestedVariant);
    return matches.length === 1 ? matches[0].variantId : null;
  }
  return variants.length === 1 && variants[0].variantId === resolved.variantId ? resolved.variantId : null;
}

export function exactCanonicalNormalPrintingId(input: CollectionPriceInput): string | null {
  if (exactTrustedRawNearMintVariantId(input)) return null;
  if ((input.productType ?? 'raw_card') !== 'raw_card'
    || normaliseCollectionMarketCondition(input.condition, 'raw_card') !== 'raw_near_mint'
    || !['normal', 'standard'].includes(normaliseCollectionVariantCode(input.variantCode))) return null;
  const printingId = String(input.canonicalPrintingId ?? '').trim();
  const setId = String(input.setId ?? '').trim();
  const language = String(input.language ?? '').trim();
  return UUID.test(printingId) && UUID.test(setId) && Boolean(language) ? printingId : null;
}

export function exactLegacyRawNearMintReference(input: CollectionPriceInput): string | null {
  if ((input.productType ?? 'raw_card') !== 'raw_card'
    || normaliseCollectionMarketCondition(input.condition, 'raw_card') !== 'raw_near_mint') return null;
  const edition = normaliseCollectionVariantCode(input.edition);
  if (edition && !['normal', 'standard', 'unlimited'].includes(edition)) return null;
  const variant = normaliseCollectionVariantCode(input.variantCode);
  if (variant && !['normal', 'standard'].includes(variant)) return null;
  const reference = String(input.legacyReference ?? '').trim();
  const setId = String(input.legacySetId ?? '').trim();
  return reference && setId && input.language ? reference : null;
}

export type ExactCollectionSnapshotRead = {
  results: Map<number, CollectionPriceResult>;
  attemptedVariantIds: string[];
  failure: CollectionPriceRequestFailure | null;
};

export type LegacyCollectionSnapshotRead = Pick<ExactCollectionSnapshotRead, 'results' | 'failure'>;

export type ExactCollectionSnapshotOptions = {
  client: Pick<StackrApiClient, 'marketPriceSnapshots'>;
  concurrency?: number;
  isCurrent?: () => boolean;
  onProgress?: (read: ExactCollectionSnapshotRead) => void;
};

function snapshotResult(input: CollectionPriceInput, variantId: string, snapshot: StackrPriceSnapshotHistoryItem): CollectionPriceResult | null {
  if (snapshot.variantId !== variantId || snapshot.quoteScope !== 'exact_variant' || snapshot.currency !== 'GBP') return null;
  if (!Number.isFinite(snapshot.marketCentral) || (snapshot.marketCentral ?? 0) <= 0) return null;
  return {
    key: input.key,
    quantity: Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0),
    reference: input.references[0] ?? null,
    variantId,
    central: snapshot.marketCentral,
    status: snapshot.priceType as StackrCardPrice['status'],
    freshness: snapshot.freshness,
    calculatedAt: snapshot.calculatedAt ?? snapshot.snapshotAt,
    staleAfter: snapshot.staleAfter ?? null,
    quoteScope: snapshot.quoteScope,
    fallbackEstimate: null,
    pricingKind: 'exact',
    unavailableReason: null,
    requestError: null,
  };
}

/** Read owner-authorised exact GBP snapshots in 24-ID batches before fallback. */
export async function loadExactCollectionSnapshotPrices(
  inputs: CollectionPriceInput[],
  options: ExactCollectionSnapshotOptions,
): Promise<ExactCollectionSnapshotRead> {
  const indexesByVariant = new Map<string, number[]>();
  const indexesByPrinting = new Map<string, number[]>();
  inputs.forEach((input, index) => {
    const variantId = exactTrustedRawNearMintVariantId(input);
    if (variantId) {
      const indexes = indexesByVariant.get(variantId) ?? [];
      indexes.push(index);
      indexesByVariant.set(variantId, indexes);
      return;
    }
    const printingId = exactCanonicalNormalPrintingId(input);
    if (!printingId) return;
    const indexes = indexesByPrinting.get(printingId) ?? [];
    indexes.push(index);
    indexesByPrinting.set(printingId, indexes);
  });
  const attemptedVariantIds = [...indexesByVariant.keys(), ...indexesByPrinting.keys()];
  const result: ExactCollectionSnapshotRead = { results: new Map(), attemptedVariantIds, failure: null };
  const chunks = [
    ...Array.from({ length: Math.ceil(indexesByVariant.size / 24) }, (_, index) => ({ kind: 'variant' as const, ids: [...indexesByVariant.keys()].slice(index * 24, index * 24 + 24) })),
    ...Array.from({ length: Math.ceil(indexesByPrinting.size / 24) }, (_, index) => ({ kind: 'printing' as const, ids: [...indexesByPrinting.keys()].slice(index * 24, index * 24 + 24) })),
  ];
  let next = 0;
  const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? 4)));
  const worker = async () => {
    while (next < chunks.length && !result.failure && (options.isCurrent?.() ?? true)) {
      const batch = chunks[next++];
      try {
        const response = await options.client.marketPriceSnapshots(batch.kind === 'variant'
          ? { variantIds: batch.ids, latestOnly: true } as Parameters<StackrApiClient['marketPriceSnapshots']>[0]
          : { printingIds: batch.ids, latestOnly: true } as Parameters<StackrApiClient['marketPriceSnapshots']>[0]);
        const snapshotsByVariant = new Map<string, StackrPriceSnapshotHistoryItem>();
        for (const snapshot of response.data.snapshots) {
          const current = snapshotsByVariant.get(snapshot.variantId);
          const timestamp = Date.parse(String(snapshot.snapshotAt ?? snapshot.calculatedAt ?? ''));
          const currentTimestamp = Date.parse(String(current?.snapshotAt ?? current?.calculatedAt ?? ''));
          if (!current || (Number.isFinite(timestamp) && (!Number.isFinite(currentTimestamp) || timestamp > currentTimestamp))) {
            snapshotsByVariant.set(snapshot.variantId, snapshot);
          }
        }
        for (const id of batch.ids) {
          const snapshot = batch.kind === 'variant'
            ? snapshotsByVariant.get(id)
            : response.data.snapshots.find((item) => item.printingId === id);
          if (!snapshot) continue;
          for (const index of (batch.kind === 'variant' ? indexesByVariant.get(id) : indexesByPrinting.get(id)) ?? []) {
            const variantId = snapshot.variantId;
            const input = inputs[index];
            if (batch.kind === 'printing' && (snapshot.setId !== input.setId
              || String(snapshot.languageCode ?? '').toLowerCase() !== String(input.language ?? '').toLowerCase()
              || !['normal', 'standard'].includes(String(snapshot.variantCode ?? '').toLowerCase()))) continue;
            const priced = snapshotResult(input, variantId, snapshot);
            if (priced) result.results.set(index, priced);
          }
        }
      } catch (error) {
        const failure = readInterruption(error);
        if (failure) result.failure = { ...failure, deferred: false };
      }
      if (options.isCurrent?.() ?? true) options.onProgress?.({ ...result, results: new Map(result.results) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return result;
}

/** Read scoped legacy base-printing caches without resolving card aliases. */
export async function loadLegacyCollectionSnapshotPrices(
  inputs: CollectionPriceInput[],
  client: Pick<StackrApiClient, 'marketPriceSnapshots'>,
  isCurrent?: () => boolean,
  onProgress?: (read: LegacyCollectionSnapshotRead) => void,
) {
  const groups = new Map<string, { language: string; legacySetId: string; indexes: number[] }>();
  inputs.forEach((input, index) => {
    const reference = exactLegacyRawNearMintReference(input);
    if (!reference) return;
    const language = String(input.language).toLowerCase();
    const legacySetId = String(input.legacySetId);
    const key = JSON.stringify([language, legacySetId]);
    const group = groups.get(key) ?? { language, legacySetId, indexes: [] };
    group.indexes.push(index);
    groups.set(key, group);
  });
  const results = new Map<number, CollectionPriceResult>();
  let failure: CollectionPriceRequestFailure | null = null;
  for (const { language, legacySetId, indexes } of groups.values()) {
    for (let offset = 0; offset < indexes.length && (isCurrent?.() ?? true); offset += 24) {
      const batchIndexes = indexes.slice(offset, offset + 24);
      const byReference = new Map(batchIndexes.map((index) => [inputs[index].legacyReference as string, index]));
      const legacyIds = [...byReference.keys()];
      let response: Awaited<ReturnType<StackrApiClient['marketPriceSnapshots']>>;
      try {
        response = await client.marketPriceSnapshots({ legacyIds, legacySetId, language, latestOnly: true });
      } catch (error) {
        // Keep already-read groups; callers can apply the same viewport cooldown
        // used by exact batches when the service explicitly interrupted the read.
        const interruption = readInterruption(error);
        if (interruption && !failure) {
          failure = { ...interruption, deferred: false };
          if (isCurrent?.() ?? true) onProgress?.({ results: new Map(results), failure });
          // A systemic auth, rate, service or network interruption must stop
          // this collection read; continuing groups recreates the request storm.
          return { results, failure };
        }
        if (isCurrent?.() ?? true) onProgress?.({ results: new Map(results), failure });
        continue;
      }
      const byId = new Map((response.data.legacySnapshots ?? []).map((item) => [item.cardId, item]));
      for (const index of batchIndexes) {
        const input = inputs[index]; const snapshot = byId.get(input.legacyReference as string);
        if (!snapshot || snapshot.legacySetId !== legacySetId || snapshot.languageCode.toLowerCase() !== language.toLowerCase()
          || snapshot.currency !== 'GBP' || !Number.isFinite(snapshot.marketCentral) || (snapshot.marketCentral ?? 0) <= 0) continue;
        results.set(index, { key: input.key, quantity: input.quantity, reference: input.legacyReference ?? null, variantId: null,
          central: snapshot.marketCentral, status: snapshot.priceType as StackrCardPrice['status'], freshness: 'stale',
          calculatedAt: snapshot.calculatedAt ?? snapshot.snapshotAt, staleAfter: snapshot.staleAfter ?? null,
          quoteScope: 'printing_level', fallbackEstimate: { identityKey: null, reason: 'legacy_printing_level_snapshot', exact: false }, pricingKind: 'general',
          unavailableReason: null, requestError: null });
      }
      if (isCurrent?.() ?? true) onProgress?.({ results: new Map(results), failure });
    }
  }
  return { results, failure };
}

type ReadInterruption = Omit<CollectionPriceRequestFailure, 'deferred'>;

function readInterruption(error: unknown): ReadInterruption | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as { status?: unknown; code?: unknown; requestId?: unknown; name?: unknown; message?: unknown };
  const status = typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : null;
  const code = typeof value.code === 'string' && /^[a-z0-9_]{1,80}$/.test(value.code) ? value.code : null;
  const requestId = typeof value.requestId === 'string' ? value.requestId : null;
  const kind = status === 401 ? 'authentication_required'
    : status === 403 ? 'access_denied'
    : status === 429 ? 'rate_limited'
    : status !== null && status >= 500 && status <= 599 ? 'service_error'
    : value.name === 'AbortError' || value.name === 'TimeoutError'
      || value.name === 'TypeError' && ['Network request failed', 'Failed to fetch', 'fetch failed'].includes(String(value.message))
      ? 'network_error' : null;
  return kind ? { kind, status, code, requestId } : null;
}

function interruptionDetails(failure: ReadInterruption, deferred = false): Partial<CollectionPriceResult> {
  const messages: Record<ReadInterruption['kind'], string> = {
    authentication_required: 'Sign in is required to read prices.',
    access_denied: 'Price access was denied for this account.',
    rate_limited: 'Price lookup is temporarily rate-limited. Retry later.',
    service_error: 'The price service is temporarily unavailable or timed out.',
    network_error: 'The price lookup could not connect or timed out.',
  };
  return {
    unavailableReason: messages[failure.kind],
    requestError: failure.code ?? failure.kind,
    // A deferred item has no request of its own. Never attach a sibling's
    // request ID as though it were proof that this card reached the API.
    requestFailure: { ...failure, requestId: deferred ? null : failure.requestId, deferred },
  };
}

async function resolveAnyReference(
  input: CollectionPriceInput,
  resolver: CollectionPriceResolver,
  client: StackrApiClient,
) {
  let requestError: string | null = null;
  for (const reference of [...new Set(input.references.map((value) => String(value ?? '').trim()).filter(Boolean))]) {
    try {
      const resolved = await resolver(reference, { language: input.language, setId: input.setId }, client);
      if (resolved) return { reference, resolved, requestError };
    } catch (error) {
      // A different alias cannot repair quota, auth or a service outage.
      // Preserve genuine no-match fallbacks, but propagate backpressure.
      if (readInterruption(error)) throw error;
      requestError = error instanceof Error ? error.message : String(error);
    }
  }
  return { reference: null, resolved: null, requestError };
}

async function loadOne(
  input: CollectionPriceInput,
  client: StackrApiClient,
  resolver: CollectionPriceResolver,
  isCurrent?: () => boolean,
  onReadFailure?: (error: unknown) => void,
): Promise<CollectionPriceResult> {
  let resolution: Awaited<ReturnType<typeof resolveAnyReference>>;
  const trusted = trustedResolution(input);
  if (trusted) {
    resolution = { reference: trusted.card.cardId, resolved: trusted, requestError: null };
  } else {
    try {
      resolution = await resolveAnyReference(input, resolver, client);
    } catch (error) {
      onReadFailure?.(error);
      const failure = readInterruption(error);
      return unavailableCollectionPrice(input, failure ? interruptionDetails(failure) : {
        unavailableReason: 'Card resolution failed.',
        requestError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const { reference, resolved, requestError: resolveError } = resolution;
  if (isCurrent && !isCurrent()) return unavailableCollectionPrice(input, { unavailableReason: 'Stored price read superseded.' });
  if (!resolved || !reference) {
    return unavailableCollectionPrice(input, {
      unavailableReason: resolveError ? 'Card resolution failed.' : 'No exact Stackr card match was found.',
      requestError: resolveError,
    });
  }

  const productType = input.productType ?? 'raw_card';
  const condition = normaliseCollectionMarketCondition(input.condition, productType);
  const requestedVariant = normaliseCollectionVariantCode(input.variantCode);
  const variants = resolved.card.variants ?? [];
  const matchingVariants = requestedVariant
    ? variants.filter((candidate) => normaliseCollectionVariantCode(candidate.variantCode) === requestedVariant)
    : [];
  // A saved finish absent from an otherwise proven catalogue card can use one
  // unambiguous raw/NM base as a labelled general estimate. It never changes
  // the saved finish or presents the base quote as an exact variant price.
  const mayUseGeneralBase = productType === 'raw_card'
    && condition === 'raw_near_mint';
  const normalBases = variants.filter((candidate) => ['normal', 'standard'].includes(normaliseCollectionVariantCode(candidate.variantCode)));
  const holoBases = variants.filter((candidate) => normaliseCollectionVariantCode(candidate.variantCode) === 'holo');
  let generalBase: typeof variants[number] | null = null;
  if (requestedVariant && matchingVariants.length === 0 && mayUseGeneralBase) {
    if (normalBases.length === 1) generalBase = normalBases[0];
    else if (normalBases.length === 0 && holoBases.length === 1) generalBase = holoBases[0];
  }
  if (requestedVariant && matchingVariants.length !== 1 && !generalBase) {
    return unavailableCollectionPrice(input, {
      reference,
      unavailableReason: matchingVariants.length === 0
        ? `The requested variant \"${input.variantCode}\" was not found for this card.`
        : `The requested variant \"${input.variantCode}\" is ambiguous for this card.`,
    });
  }

  // A card-level match normally resolves to the default variant. Without an
  // explicit requested variant, that is only safe when the response itself
  // proves there is exactly one candidate and it is the resolved identity.
  const variant = requestedVariant ? matchingVariants[0] ?? generalBase : null;
  if (!requestedVariant && (variants.length !== 1 || variants[0].variantId !== resolved.variantId)) {
    return unavailableCollectionPrice(input, {
      reference,
      unavailableReason: 'A unique exact variant was not supplied for this card.',
    });
  }

  const variantId = variant?.variantId ?? resolved.variantId;
  if (productType === 'raw_card' && !condition) {
    return unavailableCollectionPrice(input, {
      reference,
      variantId,
      unavailableReason: 'A recognized raw-card condition is required for an exact price.',
    });
  }
  const grader = String(input.grader ?? '').trim();
  const grade = String(input.grade ?? '').trim();
  if (productType === 'graded_card' && (!grader || !grade)) {
    return unavailableCollectionPrice(input, {
      reference,
      variantId,
      unavailableReason: 'Both grader and grade are required for an exact graded-card price.',
    });
  }
  try {
    const response = await (client as CollectionPriceClient).cardPrice(variantId, {
      productType,
      currency: 'GBP',
      condition,
      grader: grader || undefined,
      grade: grade || undefined,
      estimateMode: 'general',
    });
    const price = response.data;
    // The endpoint may have an exact quote for the selected base variant, but
    // that is still a printing-level general estimate for the saved normal.
    const displayedPrice = generalBase ? {
      ...price,
      // A base-variant sale is never a sale of the requested saved finish.
      // Keep an unavailable base unavailable; otherwise present it as a market
      // estimate and remove sale-specific evidence from this derived quote.
      status: price.estimates.central == null ? 'unavailable' as const : 'market_estimate' as const,
      priceType: price.estimates.central == null ? 'unavailable' as const : 'market_estimate' as const,
      sample: { ...price.sample, sold: 0, active: 0 },
      lastSoldEvidence: null,
      provenLastSold: false,
      quoteScope: 'printing_level' as const,
      fallbackEstimate: { identityKey: null, reason: 'same_printing_general_base', exact: false as const },
    } : price;
    return {
      key: input.key,
      quantity: Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0),
      reference,
      variantId,
      central: displayedPrice.estimates.central,
      status: displayedPrice.status,
      freshness: displayedPrice.freshness,
      calculatedAt: displayedPrice.calculatedAt,
      staleAfter: displayedPrice.staleAfter,
      quoteScope: displayedPrice.quoteScope,
      fallbackEstimate: displayedPrice.fallbackEstimate,
      pricingKind: collectionPriceKind(displayedPrice),
      unavailableReason: displayedPrice.unavailableReason,
      requestError: null,
    };
  } catch (error) {
    onReadFailure?.(error);
    const failure = readInterruption(error);
    return unavailableCollectionPrice(input, {
      reference,
      variantId,
      unavailableReason: 'Stackr price request failed.',
      requestError: error instanceof Error ? error.message : String(error),
      ...(failure ? interruptionDetails(failure) : {}),
    });
  }
}

/**
 * Bounded, read-only collection price fetch. Each item is isolated so a failed
 * resolution or price request cannot discard its siblings. Systemic failures
 * stop new work in this load; completed quotes and in-flight work are retained.
 */
export async function loadCollectionPrices(
  inputs: CollectionPriceInput[],
  options: CollectionPriceLoaderOptions = {},
): Promise<CollectionPriceResult[]> {
  const client = options.client ?? await (collectionPriceClient ??= import('./stackrApiV1')
    .then(({ StackrApiClient }) => new StackrApiClient()));
  const resolve = options.resolver ?? (await import('./stackrDomainAdapter')).resolveCachedStackrCard;
  // Sharing is scoped to this load: never retain authenticated prices across accounts.
  const batch: { failure: ReadInterruption | null; error?: unknown } = { failure: null };
  const onReadFailure = (error: unknown) => {
    const failure = readInterruption(error);
    if (failure && !batch.failure) {
      batch.failure = failure;
      batch.error = error;
    }
  };
  const resolutions = new Map<string, ReturnType<CollectionPriceResolver>>();
  const resolver: CollectionPriceResolver = (reference, constraints, activeClient) => {
    if (batch.failure) return Promise.reject(batch.error);
    const key = JSON.stringify([reference, constraints.language ?? null, constraints.setId ?? null]);
    let pending = resolutions.get(key);
    if (!pending) {
      pending = resolve(reference, constraints, activeClient);
      resolutions.set(key, pending);
    }
    return pending;
  };
  const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? 4)));
  const results = inputs.map((input) => unavailableCollectionPrice(input, { unavailableReason: 'Stored price read pending.' }));
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (!batch.failure && nextIndex < inputs.length && (options.isCurrent?.() ?? true)) {
      const index = nextIndex++;
      results[index] = await loadOne(inputs[index], client, resolver, options.isCurrent, onReadFailure);
      completed += 1;
      if (options.isCurrent?.() ?? true) options.onProgress?.([...results], completed);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  if (batch.failure) options.onInterrupted?.({ ...batch.failure, deferred: false });
  if (batch.failure && nextIndex < inputs.length && (options.isCurrent?.() ?? true)) {
    for (let index = nextIndex; index < inputs.length; index += 1) {
      results[index] = unavailableCollectionPrice(inputs[index], interruptionDetails(batch.failure, true));
    }
    // completed counts attempted items, not deferred rows. Unknown values
    // remain null; stopping a batch does not invent collection coverage.
    options.onProgress?.([...results], completed);
  }
  return results;
}
