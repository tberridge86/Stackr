import type { CollectionSummary } from './collectionSummary';

/** Stored estimates retain their coverage; missing prices are never displayed as zero. */
export function getCoreHomeValuePresentation(summary: CollectionSummary | null) {
  if (!summary) return { amount: '—', coverage: 'Your saved collection value', detail: null, pricedPercent: null };
  const { valuation, collectionValue } = summary;
  const available = valuation.state === 'empty' || valuation.pricedUnits > 0;
  const amount = available && collectionValue !== null && Number.isFinite(collectionValue)
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(collectionValue)
    : '—';
  return {
    amount,
    coverage: valuation.state === 'empty' ? 'Add your first card to start your collection'
      : valuation.state === 'unavailable' ? 'Prices unavailable for your saved cards'
        : `${valuation.pricedUnits.toLocaleString()} of ${valuation.totalUnits.toLocaleString()} copies priced`,
    detail: valuation.state === 'empty' ? null : 'Stored estimate · price dates unavailable',
    pricedPercent: valuation.totalUnits > 0 ? Math.min(100, Math.max(0, valuation.pricedUnits / valuation.totalUnits * 100)) : null,
  };
}
