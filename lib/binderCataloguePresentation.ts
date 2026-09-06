import { enforceTcgdexRuntimeImagePolicy } from './tcgdexControlledCardReference';

type BinderCardDisplay = {
  image_url?: string | null;
  card?: {
    images?: { small?: string | null; large?: string | null } | null;
  } | null;
};

/** A missing live image must not hide the same saved card's usable image. */
export function getBinderCardImageUri(row: BinderCardDisplay, size: 'small' | 'large' = 'small') {
  const images = row.card?.images;
  const candidates = size === 'large'
    ? [images?.large, images?.small, row.image_url]
    : [images?.small, images?.large, row.image_url];
  for (const candidate of candidates) {
    const accepted = enforceTcgdexRuntimeImagePolicy(candidate);
    if (accepted) return accepted;
  }
  return null;
}

export function positiveCatalogueCount(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Keep unmatched saved records visible; a partial catalogue is not a deletion. */
export function preserveUnmatchedBinderRows<T extends { id: string }>(catalogueRows: T[], savedRows: T[]): T[] {
  const represented = new Set(catalogueRows.map((row) => row.id));
  return [...catalogueRows, ...savedRows.filter((row) => !represented.has(row.id)).map((row) => ({
    ...row,
    catalogue_match_status: 'saved-only' as const,
  }))];
}

/** Totals come from resolved set metadata, never from the number of owned rows. */
export function getBinderCatalogueTotal(input: {
  printedTotal?: unknown;
  total?: unknown;
  masterSetEnabled: boolean;
  regularCardsOnly?: boolean;
}) {
  const printedTotal = positiveCatalogueCount(input.printedTotal);
  const total = positiveCatalogueCount(input.total);
  return !input.masterSetEnabled && input.regularCardsOnly
    ? printedTotal ?? total
    : total ?? printedTotal;
}

/** Numeric secret-card slots can be identified even when rarity is absent. */
export function isBinderCardBeyondPrintedTotal(number: unknown, printedTotal: unknown) {
  const total = positiveCatalogueCount(printedTotal);
  const collector = String(number ?? '').normalize('NFKC').trim().split('/')[0].trim();
  return total !== null && /^\d+$/.test(collector) && Number(collector) > total;
}
