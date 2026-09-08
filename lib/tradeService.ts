/** Release planning contract only. No live selector or fulfilment is activated. */
export const TRADE_SERVICE_SELECTION_ENABLED = false;

/**
 * The service selected with an offer is a record of agreed trade terms, not a
 * promise of protection. Keep this module dependency-free so its rules can be
 * reused by offer creation, review, fixtures, and future server validation.
 */

export const TRADE_SERVICE_TERMS_VERSION = 'direct-tracked-v1' as const;

export const TRADE_SERVICE_LEVELS = ['direct', 'tracked'] as const;

export type TradeServiceLevel = (typeof TRADE_SERVICE_LEVELS)[number];
export type TradeCardSide = 'sender' | 'receiver';

export type TradeServiceDefinition = {
  level: TradeServiceLevel;
  label: string;
  compactLabel: string;
  selectorDescription: string;
  termsDescription: string;
  termsVersion: typeof TRADE_SERVICE_TERMS_VERSION;
};

/**
 * Copy deliberately describes only services Stackr can provide today. In
 * particular, neither level implies escrow, insurance, authentication, a
 * payment hold, a refund, or a delivery guarantee.
 */
export const TRADE_SERVICE_DEFINITIONS: Record<
  TradeServiceLevel,
  TradeServiceDefinition
> = {
  direct: {
    level: 'direct',
    label: 'Direct',
    compactLabel: 'Direct',
    selectorDescription: 'Arrange delivery directly with the other collector.',
    termsDescription:
      'Collectors arrange delivery directly. Stackr does not hold payment, provide delivery cover, authenticate cards or guarantee an outcome.',
    termsVersion: TRADE_SERVICE_TERMS_VERSION,
  },
  tracked: {
    level: 'tracked',
    label: 'Tracked',
    compactLabel: 'Tracked',
    selectorDescription: 'Use tracked postage for every card shipment.',
    termsDescription:
      'Each collector sending physical cards agrees to use tracked postage if the offer is accepted. Stackr does not collect or verify tracking in this phase, hold payment, provide delivery cover, authenticate cards or guarantee delivery.',
    termsVersion: TRADE_SERVICE_TERMS_VERSION,
  },
};

export function isTradeServiceLevel(value: unknown): value is TradeServiceLevel {
  return typeof value === 'string'
    && (TRADE_SERVICE_LEVELS as readonly string[]).includes(value);
}

/** Existing offers and unknown input safely retain the original Direct terms. */
export function normaliseTradeServiceLevel(value: unknown): TradeServiceLevel {
  return isTradeServiceLevel(value) ? value : 'direct';
}

export function getTradeServiceDefinition(value: unknown): TradeServiceDefinition {
  return TRADE_SERVICE_DEFINITIONS[normaliseTradeServiceLevel(value)];
}

export function getTradeServiceTermsVersion(value: unknown): typeof TRADE_SERVICE_TERMS_VERSION {
  return getTradeServiceDefinition(value).termsVersion;
}

/**
 * Returns the sides that must provide tracking evidence when the requested
 * service is actually agreed. Cash-only offers return no sides because there
 * is no physical card delivery to track.
 */
export function getTradeServiceTrackingRequiredSides(input: {
  serviceLevel: unknown;
  senderCardCount?: number | null;
  receiverCardCount?: number | null;
}): TradeCardSide[] {
  if (normaliseTradeServiceLevel(input.serviceLevel) !== 'tracked') return [];

  const sides: TradeCardSide[] = [];
  if (Number(input.senderCardCount ?? 0) > 0) sides.push('sender');
  if (Number(input.receiverCardCount ?? 0) > 0) sides.push('receiver');
  return sides;
}

/**
 * Allows callers to offer a graceful Direct-only fallback while a newly added
 * Supabase column is still absent from the target schema cache. It is narrow
 * by design so ordinary offer failures are never hidden.
 */
export function isTradeServiceSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(candidate.code ?? '');
  const message = [candidate.message, candidate.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const identifiesTradeServiceField = /service_level|service_terms_version|trade service/.test(message);
  const indicatesMissingSchema = code === '42703'
    || code === 'PGRST204'
    || /schema cache|column.*(does not exist|could not find)|could not find.*column/.test(message);

  return identifiesTradeServiceField && indicatesMissingSchema;
}
