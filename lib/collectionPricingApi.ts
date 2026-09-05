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
};

type CollectionPriceClient = Pick<StackrApiClient, 'cardPrice'>;
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
      requestError = error instanceof Error ? error.message : String(error);
    }
  }
  return { reference: null, resolved: null, requestError };
}

async function loadOne(
  input: CollectionPriceInput,
  client: StackrApiClient,
  resolver: CollectionPriceResolver,
): Promise<CollectionPriceResult> {
  const { reference, resolved, requestError: resolveError } = await resolveAnyReference(input, resolver, client);
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
    return unavailable(input, {
      reference,
      variantId,
      unavailableReason: 'Stackr price request failed.',
      requestError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Bounded, read-only collection price fetch. Each item is isolated so a failed
 * resolution or price request cannot discard its siblings.
 */
export async function loadCollectionPrices(
  inputs: CollectionPriceInput[],
  options: CollectionPriceLoaderOptions = {},
): Promise<CollectionPriceResult[]> {
  const client = options.client ?? new (await import('./stackrApiV1')).StackrApiClient();
  const resolver = options.resolver ?? (await import('./stackrDomainAdapter')).resolveStackrCard;
  const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? 4)));
  const results = new Array<CollectionPriceResult>(inputs.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      results[index] = await loadOne(inputs[index], client, resolver);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return results;
}
