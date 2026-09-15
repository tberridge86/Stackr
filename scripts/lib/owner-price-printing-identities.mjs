import { isUuid, ownedRowEligibility } from './owner-provider-price-refresh-core.mjs';

const normalise = (value) => String(value ?? '').trim().toLowerCase();
const READ_BATCH = 100;
const READ_MAX_ROWS = 1000;

/**
 * Read only published printings referenced by eligible saved rows. This is
 * identity retrieval, not a provider lookup, alias insertion or approval.
 * Exact variant aliases never broaden to their printing's other finishes.
 */
export async function readOwnerPrintingCatalogue(supabase, ownedRows, identifierRows, directCatalogueRows) {
  const savedIds = new Set(ownedRows.filter((row) => !ownedRowEligibility(row))
    .map((row) => normalise(row.card_id)));
  const knownVariants = new Set(directCatalogueRows.map((row) => normalise(row.variant_id)));
  const printingIds = [...new Set([
    ...[...savedIds].filter((id) => isUuid(id) && !knownVariants.has(id)),
    ...identifierRows
      .filter((row) => normalise(row.source_entity_type) === 'card')
      .filter((row) => savedIds.has(normalise(row.external_id)))
      .filter((row) => !normalise(row.variant_id))
      .map((row) => normalise(row.printing_id)).filter(isUuid),
  ])];
  const rows = [];
  for (let offset = 0; offset < printingIds.length; offset += READ_BATCH) {
    const { data, error } = await supabase.schema('api').from('catalogue_cards')
      .select('variant_id,printing_id,set_id,language_code,collector_number,variant_code,finish_code')
      .in('printing_id', printingIds.slice(offset, offset + READ_BATCH))
      .limit(READ_MAX_ROWS + 1);
    if (error) throw error;
    // The project's 1000-row cap can truncate even a requested 1001 rows.
    // Refuse an incomplete candidate set before it appears uniquely matched.
    if ((data ?? []).length >= READ_MAX_ROWS) {
      throw new Error('Owner printing identity read reached its safe result bound.');
    }
    rows.push(...(data ?? []));
  }
  return rows;
}
