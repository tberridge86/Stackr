import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/auth-context';
import { stackrApiClient, type StackrCataloguePriceRow } from './stackrApiV1';
import { cataloguePriceCache, cataloguePriceDisplay, cataloguePriceScope, fetchCataloguePrices, type CataloguePriceDisplay } from './cataloguePrices';
import { toStackrApiLanguage } from './stackrDomainAdapter';
import { PROVISIONAL_CATALOGUE_PRICE_MODEL, provisionalCataloguePriceDisplay } from './cataloguePriceBaseline';

type DisplayCard = { id: string; language?: string | null; rarity?: string | null; productType?: string | null; set?: unknown; pricing?: { displayPrice?: number | null } | null; estimated_value?: number | null; price_source?: string | null; externalIds?: Record<string, unknown> | null; raw_data?: any; raw?: any; card?: any };
type CataloguePriceOverlayOptions<T extends DisplayCard> = {
  /** Cards whose saved quotes may be read now. Every display card still receives
   * an eligible modern bulk-card fallback immediately when a quote is unavailable. */
  requestCards?: T[];
};

/** Bound stored-quote reads to an incremental list's visible and next window.
 * This does not limit offline fallback decoration for the rest of the list. */
export function cataloguePriceReadWindow<T>(cards: T[], visibleCount: number, nearbyCount: number) {
  const visible = Number.isFinite(visibleCount) ? Math.max(0, Math.floor(visibleCount)) : 0;
  const nearby = Number.isFinite(nearbyCount) ? Math.max(0, Math.floor(nearbyCount)) : 0;
  return cards.slice(0, Math.min(cards.length, visible + nearby));
}

function referenceFor(card: DisplayCard) {
  return String(card.externalIds?.stackrVariant
    ?? card.externalIds?.stackr_variant
    ?? card.raw_data?.external_ids?.stackrVariant
    ?? card.raw_data?.stackr?.defaultVariantId
    ?? card.raw?.external_ids?.stackrVariant
    ?? card.raw?.stackr?.defaultVariantId
    ?? card.raw?.raw_data?.external_ids?.stackrVariant
    ?? card.raw?.raw_data?.stackr?.defaultVariantId
    ?? card.card?.externalIds?.stackrVariant
    ?? card.card?.raw_data?.external_ids?.stackrVariant
    ?? card.card?.raw_data?.stackr?.defaultVariantId
    ?? card.id);
}
function languageFor(card: DisplayCard) { return toStackrApiLanguage(card.language ?? card.raw_data?.language ?? card.raw?.language ?? card.raw?.raw_data?.language ?? card.card?.language ?? card.card?.raw_data?.language) ?? 'en'; }

function releaseDateFor(set: unknown) {
  if (!set || typeof set !== 'object') return undefined;
  const value = (set as Record<string, unknown>).releaseDate ?? (set as Record<string, unknown>).release_date;
  return typeof value === 'string' ? value : undefined;
}

function provisionalDisplay(card: DisplayCard, reference: string, language: string) {
  const sources = [card, card.raw, card.raw?.raw_data, card.raw_data, card.card, card.card?.raw, card.card?.raw_data].filter(Boolean);
  const first = (read: (source: any) => unknown) => sources.map(read).find(value => value != null && value !== '');
  const stackr = first(source => source.stackr) as any;
  const variants = Array.isArray(stackr?.variants) ? stackr.variants : [];
  const selected = variants.find((variant: any) => variant.variantId === reference);
  return provisionalCataloguePriceDisplay({
    variantId: reference,
    printingId: String(first(source => source.printing_id ?? source.printingId) ?? card.id),
    language,
    rarity: first(source => source.rarity?.label ?? source.rarity?.code ?? source.rarity ?? source.rarity_code),
    releaseDate: first(source => releaseDateFor(source.set) ?? source.set_release_date),
    productType: first(source => source.productType ?? source.product_type),
    finish: selected?.finishCode ?? first(source => source.finishCode ?? source.finish_code ?? source.finish),
    variant: selected?.variantCode ?? (variants.length ? 'unresolved' : first(source => source.variantCode ?? source.variant_code ?? source.variant)),
    edition: first(source => source.edition ?? (source.firstEdition === true || source.first_edition === true ? 'first_edition' : undefined)),
  });
}

/** The server can verify published set metadata absent from a facts-only card. */
function publishedProvisional(row: StackrCataloguePriceRow | undefined, reference: string, language: string) {
  const price = row?.price;
  const fallback = price?.fallbackEstimate as Record<string, unknown> | null | undefined;
  return row?.reference === reference && row.language === language && row.cardId != null && row.variantId != null
    && price?.variantId === row.variantId && price.productType === 'raw_card' && price.currency === 'GBP'
    && price.estimateVersion === PROVISIONAL_CATALOGUE_PRICE_MODEL
    && fallback?.reason === 'provisional_catalogue_baseline' && fallback.exact === false
    && fallback.identityKey === row.variantId && fallback.baseVariantId === row.variantId
    && fallback.printingId === row.cardId && fallback.language === language
    && price.sourceBreakdown.some(source => source.provider === 'stackr_catalogue_baseline'
      && source.modelVersion === PROVISIONAL_CATALOGUE_PRICE_MODEL && source.metadataStatus === 'published_card_and_set'
      && ['common', 'uncommon'].includes(String(source.rarity))
      && source.usableForExactVariant === false && source.usableForHoldingsValuation === false);
}

/** Read-only general-price decoration. It stays out of catalogue records and holdings. */
export function useCataloguePriceOverlay<T extends DisplayCard>(cards: T[], options: CataloguePriceOverlayOptions<T> = {}): (T & { runtimeCataloguePricing?: CataloguePriceDisplay })[] {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [saved, setSaved] = useState<{ ownerId: string | null; rows: Map<string, StackrCataloguePriceRow> }>({ ownerId: null, rows: new Map() });
  const requestCards = options.requestCards ?? cards;
  const displayIdentityKey = cards.map((card) => `${languageFor(card)}:${referenceFor(card)}`).join('|');
  const displayKeys = useMemo(() => new Set(displayIdentityKey.split('|')), [displayIdentityKey]);
  const requestIdentityKey = requestCards.map((card) => `${card.id}:${languageFor(card)}:${referenceFor(card)}`).join('|');
  const groups = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const card of requestCards) {
      const language = languageFor(card); const reference = referenceFor(card);
      const references = result.get(language);
      if (references) references.push(reference);
      else result.set(language, [reference]);
    }
    return result;
    // Only requested catalogue identities resubscribe the stored-price reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestIdentityKey]);
  useEffect(() => {
    if (!ownerId || (process.env.EXPO_PUBLIC_STACKR_API_ENABLED !== 'true' && process.env.EXPO_PUBLIC_STACKR_API_ENABLED !== '1')) return;
    let active = true; let accountScope: string | null = null;
    const publish = () => {
      if (!active || !accountScope) return;
      const rows = new Map<string, StackrCataloguePriceRow>();
      for (const [language, references] of groups) {
        const scope = cataloguePriceScope(accountScope, { language, estimateMode: 'general' });
        for (const [reference, row] of cataloguePriceCache.peek(scope, references)) rows.set(`${language}:${reference}`, row);
      }
      setSaved((previous) => {
        // A moving list window must never make already-read prices disappear.
        // Account changes still discard the previous account's rows.
        const nextRows = previous.ownerId === ownerId
          ? new Map([...previous.rows].filter(([key]) => displayKeys.has(key)))
          : new Map<string, StackrCataloguePriceRow>();
        for (const [key, row] of rows) nextRows.set(key, row);
        return { ownerId, rows: nextRows };
      });
    };
    const unsubscribe = cataloguePriceCache.subscribe((scope) => {
      if (accountScope && [...groups.keys()].some((language) => cataloguePriceScope(accountScope!, { language, estimateMode: 'general' }) === scope)) publish();
    });
    void stackrApiClient.getPricingCacheScope().then((scope) => {
      if (!active) return; accountScope = scope; publish();
      for (const [language, references] of groups) void fetchCataloguePrices(references, { language, estimateMode: 'general' }).then(publish).catch(() => undefined);
    }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [displayKeys, groups, ownerId]);
  return useMemo(() => cards.map((card) => {
    const language = languageFor(card); const reference = referenceFor(card);
    const row = saved.ownerId === ownerId && ownerId ? saved.rows.get(`${language}:${reference}`) : undefined;
    const stored = row ? cataloguePriceDisplay(row) : undefined;
    const embedded = card.pricing?.displayPrice ?? (card.price_source === 'stackr-api' ? card.estimated_value : null);
    if ((stored?.displayPrice == null || stored.provisional) && typeof embedded === 'number'
      && Number.isFinite(embedded) && embedded > 0) return card;
    const baseline = stored?.displayPrice != null && !stored.provisional ? undefined : provisionalDisplay(card, reference, language);
    const pricing = stored?.displayPrice != null && (!stored.provisional || baseline || publishedProvisional(row, reference, language)) ? stored : baseline;
    return pricing ? { ...card, runtimeCataloguePricing: pricing } : card;
  }), [cards, ownerId, saved]);
}
