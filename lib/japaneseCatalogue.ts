import { supabase } from './supabase';

export type JapaneseCatalogueStatus =
  | 'Complete'
  | 'Card metadata incomplete'
  | 'Images incomplete'
  | 'Pricing incomplete'
  | 'Products incomplete'
  | 'Sync failed'
  | 'Needs review';

export type JapaneseCatalogueHealthRow = {
  language: string;
  region: string | null;
  english_sets_stored: number;
  japanese_sets_stored: number;
  cards_stored: number;
  cards_with_resolved_images: number;
  cards_using_secondary_images: number;
  cards_missing_images: number;
  cards_with_current_prices: number;
  cards_with_stale_prices: number;
  cards_without_provider_mappings: number;
  cards_with_no_pricing_support: number;
  image_resolution_failures: number;
  pricing_provider_failures: number;
  duplicate_records: number;
  last_successful_sync: string | null;
  last_repair_run: string | null;
  current_status: JapaneseCatalogueStatus;
};

export type JapaneseCatalogueHealthSummary = {
  sets: number;
  completeSets: number;
  englishSets: number;
  japaneseSets: number;
  cardsStored: number;
  cardsMissingImages: number;
  cardsMissingPrices: number;
  cardsWithResolvedImages: number;
  cardsUsingSecondaryImages: number;
  cardsWithCurrentPrices: number;
  cardsWithStalePrices: number;
  providerFailures: number;
  duplicateRecords: number;
  productsLinked: number;
  statuses: Record<string, number>;
};

function countStatus(rows: JapaneseCatalogueHealthRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.current_status ?? 'Needs review';
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export function summarizeJapaneseCatalogueHealth(
  rows: JapaneseCatalogueHealthRow[]
): JapaneseCatalogueHealthSummary {
  const englishSets = rows.reduce((sum, row) => sum + Number(row.english_sets_stored ?? 0), 0);
  const japaneseSets = rows.reduce((sum, row) => sum + Number(row.japanese_sets_stored ?? 0), 0);
  const cardsWithoutPrices = rows.reduce(
    (sum, row) => sum + Number(row.cards_without_provider_mappings ?? 0) + Number(row.cards_with_no_pricing_support ?? 0),
    0
  );
  return {
    sets: englishSets + japaneseSets,
    completeSets: rows.filter((row) => row.current_status === 'Complete').length,
    englishSets,
    japaneseSets,
    cardsStored: rows.reduce((sum, row) => sum + Number(row.cards_stored ?? 0), 0),
    cardsMissingImages: rows.reduce((sum, row) => sum + Number(row.cards_missing_images ?? 0), 0),
    cardsMissingPrices: cardsWithoutPrices,
    cardsWithResolvedImages: rows.reduce((sum, row) => sum + Number(row.cards_with_resolved_images ?? 0), 0),
    cardsUsingSecondaryImages: rows.reduce((sum, row) => sum + Number(row.cards_using_secondary_images ?? 0), 0),
    cardsWithCurrentPrices: rows.reduce((sum, row) => sum + Number(row.cards_with_current_prices ?? 0), 0),
    cardsWithStalePrices: rows.reduce((sum, row) => sum + Number(row.cards_with_stale_prices ?? 0), 0),
    providerFailures: rows.reduce(
      (sum, row) => sum + Number(row.image_resolution_failures ?? 0) + Number(row.pricing_provider_failures ?? 0),
      0
    ),
    duplicateRecords: rows.reduce((sum, row) => sum + Number(row.duplicate_records ?? 0), 0),
    productsLinked: 0,
    statuses: countStatus(rows),
  };
}

function statusForCatalogueHealth(row: Omit<JapaneseCatalogueHealthRow, 'current_status'>): JapaneseCatalogueStatus {
  if (Number(row.duplicate_records ?? 0) > 0) return 'Needs review';
  if (Number(row.cards_missing_images ?? 0) > 0) return 'Images incomplete';
  if (Number(row.cards_without_provider_mappings ?? 0) > 0 || Number(row.cards_with_no_pricing_support ?? 0) > 0) {
    return 'Pricing incomplete';
  }
  if (Number(row.image_resolution_failures ?? 0) > 0 || Number(row.pricing_provider_failures ?? 0) > 0) return 'Needs review';
  return 'Complete';
}

export async function fetchJapaneseCatalogueHealth() {
  const { data, error } = await supabase
    .from('catalogue_health')
    .select('*')
    .order('language', { ascending: true });

  if (error) {
    if (/catalogue_health|schema cache|relation/i.test(error.message ?? '')) {
      throw new Error('TCGdex catalogue repair migration has not been applied yet.');
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row: any) => {
    const mapped = {
      language: row.language ?? '',
      region: row.region ?? null,
      english_sets_stored: Number(row.english_sets_stored ?? 0),
      japanese_sets_stored: Number(row.japanese_sets_stored ?? 0),
      cards_stored: Number(row.cards_stored ?? 0),
      cards_with_resolved_images: Number(row.cards_with_resolved_images ?? 0),
      cards_using_secondary_images: Number(row.cards_using_secondary_images ?? 0),
      cards_missing_images: Number(row.cards_missing_images ?? 0),
      cards_with_current_prices: Number(row.cards_with_current_prices ?? 0),
      cards_with_stale_prices: Number(row.cards_with_stale_prices ?? 0),
      cards_without_provider_mappings: Number(row.cards_without_provider_mappings ?? 0),
      cards_with_no_pricing_support: Number(row.cards_with_no_pricing_support ?? 0),
      image_resolution_failures: Number(row.image_resolution_failures ?? 0),
      pricing_provider_failures: Number(row.pricing_provider_failures ?? 0),
      duplicate_records: Number(row.duplicate_records ?? 0),
      last_successful_sync: row.last_successful_sync ?? null,
      last_repair_run: row.last_repair_run ?? null,
    };
    return {
      ...mapped,
      current_status: statusForCatalogueHealth(mapped),
    };
  }) as JapaneseCatalogueHealthRow[];
  return {
    rows,
    summary: summarizeJapaneseCatalogueHealth(rows),
  };
}
