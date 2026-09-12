import type {
  StackrApiClient,
  StackrCardPrice,
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
};

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

function unavailable(input: CollectionPriceInput, details: Partial<CollectionPriceResult> = {}): CollectionPriceResult {
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
    unavailableReason: 'No matching Stackr price is available.',
    requestError: null,
    ...details,
  };
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
  try {
    resolution = await resolveAnyReference(input, resolver, client);
  } catch (error) {
    onReadFailure?.(error);
    const failure = readInterruption(error);
    return unavailable(input, failure ? interruptionDetails(failure) : {
      unavailableReason: 'Card resolution failed.',
      requestError: error instanceof Error ? error.message : String(error),
    });
  }
  const { reference, resolved, requestError: resolveError } = resolution;
  if (isCurrent && !isCurrent()) return unavailable(input, { unavailableReason: 'Stored price read superseded.' });
  if (!resolved || !reference) {
    return unavailable(input, {
      unavailableReason: resolveError ? 'Card resolution failed.' : 'No exact Stackr card match was found.',
      requestError: resolveError,
    });
  }

  const requestedVariant = normaliseCollectionVariantCode(input.variantCode);
  const variants = resolved.card.variants ?? [];
  const matchingVariants = requestedVariant
    ? variants.filter((candidate) => normaliseCollectionVariantCode(candidate.variantCode) === requestedVariant)
    : [];
  if (requestedVariant && matchingVariants.length !== 1) {
    return unavailable(input, {
      reference,
      unavailableReason: matchingVariants.length === 0
        ? `The requested variant \"${input.variantCode}\" was not found for this card.`
        : `The requested variant \"${input.variantCode}\" is ambiguous for this card.`,
    });
  }

  // A card-level match normally resolves to the default variant. Without an
  // explicit requested variant, that is only safe when the response itself
  // proves there is exactly one candidate and it is the resolved identity.
  const variant = requestedVariant ? matchingVariants[0] : null;
  if (!requestedVariant && (variants.length !== 1 || variants[0].variantId !== resolved.variantId)) {
    return unavailable(input, {
      reference,
      unavailableReason: 'A unique exact variant was not supplied for this card.',
    });
  }

  const productType = input.productType ?? 'raw_card';
  const variantId = variant?.variantId ?? resolved.variantId;
  const condition = normaliseCollectionMarketCondition(input.condition, productType);
  if (productType === 'raw_card' && !condition) {
    return unavailable(input, {
      reference,
      variantId,
      unavailableReason: 'A recognized raw-card condition is required for an exact price.',
    });
  }
  const grader = String(input.grader ?? '').trim();
  const grade = String(input.grade ?? '').trim();
  if (productType === 'graded_card' && (!grader || !grade)) {
    return unavailable(input, {
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
    });
    const price = response.data;
    return {
      key: input.key,
      quantity: Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0),
      reference,
      variantId,
      central: price.estimates.central,
      status: price.status,
      freshness: price.freshness,
      calculatedAt: price.calculatedAt,
      staleAfter: price.staleAfter,
      unavailableReason: price.unavailableReason,
      requestError: null,
    };
  } catch (error) {
    onReadFailure?.(error);
    const failure = readInterruption(error);
    return unavailable(input, {
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
  const results = inputs.map((input) => unavailable(input, { unavailableReason: 'Stored price read pending.' }));
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
  if (batch.failure && nextIndex < inputs.length && (options.isCurrent?.() ?? true)) {
    for (let index = nextIndex; index < inputs.length; index += 1) {
      results[index] = unavailable(inputs[index], interruptionDetails(batch.failure, true));
    }
    // completed counts attempted items, not deferred rows. Unknown values
    // remain null; stopping a batch does not invent collection coverage.
    options.onProgress?.([...results], completed);
  }
  return results;
}
