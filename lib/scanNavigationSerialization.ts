import { stripTcgdexReferencesFromValueBeforePersistence } from './tcgdexControlledCardReference';

export type ScanResultNavigationCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total?: number | null;
  series: string;
  rarity: string;
  image_small: string;
  image_large?: string | null;
  raw_data?: any;
  external_ids?: Record<string, unknown> | null;
  language?: string | null;
  release_date: string;
  scan_provider?: string | null;
  scan_confidence?: number | null;
  scan_visual_similarity?: number | null;
  scan_final_score?: number | null;
};

/**
 * Keep provider identity (but not provider image URLs) across scan navigation,
 * so the result screen can perform a fresh, exact live reference lookup.
 */
export function toScanResultNavigationCard(row: any): ScanResultNavigationCard {
  const raw = row.raw_data ?? {};
  const set = raw.set ?? row.set ?? {};
  const images = raw.images ?? {};
  const externalIds = row.external_ids && typeof row.external_ids === 'object'
    ? row.external_ids
    : raw.external_ids && typeof raw.external_ids === 'object'
      ? raw.external_ids
      : null;

  return {
    id: String(row.id),
    name: String(row.name ?? raw.name ?? 'Unknown card'),
    number: String(row.number ?? raw.number ?? ''),
    set_id: String(row.set_id ?? set.id ?? ''),
    set_name: String(row.set_name ?? set.name ?? row.set_id ?? 'Unknown set'),
    set_printed_total: set.printedTotal ?? set.total ?? row.set_printed_total ?? null,
    series: String(row.series ?? set.series ?? ''),
    rarity: String(row.rarity ?? raw.rarity ?? ''),
    image_small: String(row.image_small ?? images.small ?? row.image_large ?? images.large ?? ''),
    image_large: row.image_large ?? images.large ?? row.image_small ?? images.small ?? null,
    raw_data: {
      images,
      set,
      rarity: raw.rarity,
      subtypes: raw.subtypes,
      tcgplayer: raw.tcgplayer,
    },
    external_ids: externalIds,
    language: row.language ?? raw.language ?? null,
    release_date: String(row.release_date ?? set.releaseDate ?? set.release_date ?? ''),
    scan_provider: row.scan_provider ?? raw.scan_provider ?? null,
    scan_confidence: row.scan_confidence ?? raw.scan_confidence ?? null,
    scan_visual_similarity: row.scan_visual_similarity ?? raw.scan_visual_similarity ?? null,
    scan_final_score: row.scan_final_score ?? raw.scan_final_score ?? null,
  };
}

/**
 * Scan-result navigation params are persisted by the router as JSON. Runtime
 * TCGdex display overlays therefore must be removed at this boundary, without
 * changing the in-memory card used by the scanner UI.
 */
export function serializeScanCardsForNavigation(cards: unknown[]) {
  return JSON.stringify(stripTcgdexReferencesFromValueBeforePersistence(cards));
}
