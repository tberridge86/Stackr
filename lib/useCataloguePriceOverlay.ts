import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/auth-context';
import { stackrApiClient, type StackrCataloguePriceRow } from './stackrApiV1';
import { cataloguePriceCache, cataloguePriceDisplay, cataloguePriceScope, fetchCataloguePrices, type CataloguePriceDisplay } from './cataloguePrices';
import { toStackrApiLanguage } from './stackrDomainAdapter';
import { provisionalCataloguePriceDisplay } from './cataloguePriceBaseline';

type DisplayCard = { id: string; language?: string | null; rarity?: string | null; productType?: string | null; set?: unknown; pricing?: { displayPrice?: number | null } | null; externalIds?: Record<string, unknown> | null; raw_data?: any; raw?: any; card?: any };

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
  const value = (set as Record<string, unknown>).releaseDate;
  return typeof value === 'string' ? value : undefined;
}

function provisionalDisplay(card: DisplayCard, reference: string, language: string) {
  const raw = card.raw ?? card.raw_data ?? card.card?.raw ?? card.card?.raw_data ?? {};
  return provisionalCataloguePriceDisplay({
    variantId: reference,
    printingId: raw.printing_id ?? raw.printingId ?? card.id,
    language,
    rarity: card.rarity ?? raw.rarity ?? raw.rarity_code,
    releaseDate: releaseDateFor(card.set) ?? raw.set?.releaseDate ?? raw.set?.release_date ?? raw.set_release_date,
    productType: card.productType ?? raw.productType ?? raw.product_type,
  });
}

/** Read-only general-price decoration. It stays out of catalogue records and holdings. */
export function useCataloguePriceOverlay<T extends DisplayCard>(cards: T[]): (T & { runtimeCataloguePricing?: CataloguePriceDisplay })[] {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [saved, setSaved] = useState<{ ownerId: string | null; rows: Map<string, StackrCataloguePriceRow> }>({ ownerId: null, rows: new Map() });
  const identityKey = cards.map((card) => `${card.id}:${languageFor(card)}:${referenceFor(card)}`).join('|');
  const groups = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const card of cards) {
      const language = languageFor(card); const reference = referenceFor(card);
      result.set(language, [...(result.get(language) ?? []), reference]);
    }
    return result;
    // Only catalogue identity changes resubscribe the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);
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
      setSaved({ ownerId, rows });
    };
    const unsubscribe = cataloguePriceCache.subscribe((scope) => {
      if (accountScope && [...groups.keys()].some((language) => cataloguePriceScope(accountScope!, { language, estimateMode: 'general' }) === scope)) publish();
    });
    void stackrApiClient.getPricingCacheScope().then((scope) => {
      if (!active) return; accountScope = scope; publish();
      for (const [language, references] of groups) void fetchCataloguePrices(references, { language, estimateMode: 'general' }).then(publish).catch(() => undefined);
    }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [groups, ownerId]);
  return useMemo(() => cards.map((card) => {
    const language = languageFor(card); const reference = referenceFor(card);
    const row = saved.ownerId === ownerId && ownerId ? saved.rows.get(`${language}:${reference}`) : undefined;
    const stored = row ? cataloguePriceDisplay(row) : undefined;
    if (stored?.displayPrice == null && typeof card.pricing?.displayPrice === 'number'
      && Number.isFinite(card.pricing.displayPrice) && card.pricing.displayPrice > 0) return card;
    const pricing = stored?.displayPrice != null ? stored : provisionalDisplay(card, reference, language);
    return pricing ? { ...card, runtimeCataloguePricing: pricing } : card;
  }), [cards, ownerId, saved]);
}
