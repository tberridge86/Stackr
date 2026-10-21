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
  const groups = new Map<string, CatalogueQualityRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.game_code, row.language_code]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const summary = rows.reduce(
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
  // View-level set totals repeat per game/language; count each group once.
  for (const field of ['expectedSetTotal', 'importedSetTotal', 'expectedVsImportedSetDelta'] as const) summary[field] = 0;
  for (const group of groups.values()) {
    summary.expectedSetTotal += Math.max(...group.map(row => Number(row.expected_set_total ?? 0)));
    summary.importedSetTotal += Math.max(...group.map(row => Number(row.imported_set_total ?? 0)));
    summary.expectedVsImportedSetDelta += Math.max(...group.map(row => Number(row.expected_vs_imported_set_delta ?? 0)));
  }
  return { ...summary, unknownExpectedCardTotalSets: rows.filter(row => row.expected_card_total == null).length };
}

export async function fetchCatalogueQualityReport(
  db: SupabaseClientLike,
  options: { language?: string; limit?: number } = {},
) {
  const pageSize = 250;
  const maxPages = 20;
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error('catalogue_quality_limit_must_be_positive_integer');
  }
  const rows: CatalogueQualityRow[] = [];
  let cursor: string | null = null;
  let complete = false;
  let terminationReason = 'page_budget';
  let pagesFetched = 0;
  for (; pagesFetched < maxPages;) {
    // An extra one-row read distinguishes an exact limit from a partial sample.
    const remaining = options.limit === undefined ? pageSize : options.limit - rows.length;
    const requested = remaining === 0 ? 1 : Math.min(pageSize, remaining);
    let query = db.schema('ingest').from('catalogue_quality_report')
      .select('*').order('set_id', { ascending: true }).limit(requested);
    if (options.language) query = query.eq('language_code', options.language);
    if (cursor) query = query.gt('set_id', cursor);
    const { data, error } = await query;
    pagesFetched += 1;
    if (error) throw error;
    if (!Array.isArray(data) || data.length > requested) throw new Error('catalogue_quality_invalid_page');
    if (data.length === 0) {
      complete = true;
      terminationReason = 'end_of_results';
      break;
    }
    for (const row of data as CatalogueQualityRow[]) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.set_id)
        || (cursor !== null && row.set_id <= cursor)
        || (options.language !== undefined && row.language_code !== options.language)) {
        throw new Error('catalogue_quality_page_identity_mismatch');
      }
      cursor = row.set_id;
    }
    if (remaining === 0) {
      terminationReason = 'requested_limit';
      break;
    }
    rows.push(...data);
  }
  const groups = new Map<string, CatalogueQualityRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.game_code, row.language_code]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return {
    generatedAt: new Date().toISOString(),
    pagination: { complete, terminationReason, rowsFetched: rows.length, pagesFetched,
      pageSize, maxPages, requestedLimit: options.limit ?? null,
      language: options.language ?? null, consistency: 'keyset_scan_not_snapshot' },
    summary: summariseQualityRows(rows),
    byGameAndLanguage: [...groups.values()].map(group => ({
      game: group[0].game_code, language: group[0].language_code,
      summary: summariseQualityRows(group),
    })),
    rows,
  };
}
