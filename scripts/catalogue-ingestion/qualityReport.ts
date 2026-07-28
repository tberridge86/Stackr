type SupabaseClientLike = {
  schema: (schema: string) => { from: (table: string) => any };
};

export type CatalogueQualityRow = {
  set_id: string;
  game_code: string;
  language_code: string;
  set_code: string | null;
  provider_set_code: string | null;
  native_name: string;
  english_display_name: string | null;
  expected_set_total: number;
  imported_set_total: number;
  expected_vs_imported_set_delta: number;
  expected_card_total: number | null;
  imported_card_total: number;
  expected_vs_imported_card_delta: number;
  cards_missing_images: number;
  set_missing_logo: boolean;
  duplicate_canonical_keys: number;
  unresolved_variants: number;
  conflicting_names: number;
  stale_source_records: number;
  records_without_legal_use_status: number;
  reported_at: string;
};

export function summariseQualityRows(rows: CatalogueQualityRow[]) {
  return rows.reduce(
    (summary, row) => ({
      sets: summary.sets + 1,
      expectedSetTotal: Math.max(summary.expectedSetTotal, Number(row.expected_set_total ?? 0)),
      importedSetTotal: Math.max(summary.importedSetTotal, Number(row.imported_set_total ?? 0)),
      expectedVsImportedSetDelta: Math.max(summary.expectedVsImportedSetDelta, Number(row.expected_vs_imported_set_delta ?? 0)),
      expectedCardTotal: summary.expectedCardTotal + Number(row.expected_card_total ?? 0),
      importedCardTotal: summary.importedCardTotal + Number(row.imported_card_total ?? 0),
      expectedVsImportedCardDelta: summary.expectedVsImportedCardDelta + Number(row.expected_vs_imported_card_delta ?? 0),
      cardsMissingImages: summary.cardsMissingImages + Number(row.cards_missing_images ?? 0),
      setsMissingLogos: summary.setsMissingLogos + (row.set_missing_logo ? 1 : 0),
      duplicateCanonicalKeys: summary.duplicateCanonicalKeys + Number(row.duplicate_canonical_keys ?? 0),
      unresolvedVariants: summary.unresolvedVariants + Number(row.unresolved_variants ?? 0),
      conflictingNames: summary.conflictingNames + Number(row.conflicting_names ?? 0),
      staleSourceRecords: summary.staleSourceRecords + Number(row.stale_source_records ?? 0),
      recordsWithoutLegalUseStatus: summary.recordsWithoutLegalUseStatus + Number(row.records_without_legal_use_status ?? 0),
    }),
    {
      sets: 0,
      expectedSetTotal: 0,
      importedSetTotal: 0,
      expectedVsImportedSetDelta: 0,
      expectedCardTotal: 0,
      importedCardTotal: 0,
      expectedVsImportedCardDelta: 0,
      cardsMissingImages: 0,
      setsMissingLogos: 0,
      duplicateCanonicalKeys: 0,
      unresolvedVariants: 0,
      conflictingNames: 0,
      staleSourceRecords: 0,
      recordsWithoutLegalUseStatus: 0,
    },
  );
}

export async function fetchCatalogueQualityReport(
  db: SupabaseClientLike,
  options: { language?: string; limit?: number } = {},
) {
  let query = db.schema('ingest')
    .from('catalogue_quality_report')
    .select('*')
    .order('language_code', { ascending: true })
    .order('native_name', { ascending: true })
    .limit(options.limit ?? 500);
  if (options.language) query = query.eq('language_code', options.language);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as CatalogueQualityRow[];
  return {
    generatedAt: new Date().toISOString(),
    summary: summariseQualityRows(rows),
    rows,
  };
}
