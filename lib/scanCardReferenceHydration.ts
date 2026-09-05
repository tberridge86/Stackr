import type { PokemonCard } from './pokemonTcg';
import {
  defineTcgdexRuntimeImageOverlay,
  enforceTcgdexRuntimeImagePolicy,
} from './tcgdexControlledCardReference';

/**
 * The scanner's exact-ID route returns persistence-shaped rows, rather than
 * PokemonCard objects. Convert only the identity fields needed by the
 * controlled TCGdex lookup, then merge a newly live-validated low reference
 * back into the in-memory display row. This deliberately never writes a URL
 * into raw_data or any persistence-bound field.
 */
export type ScanCardReferenceRow = {
  id?: unknown;
  name?: unknown;
  language?: unknown;
  number?: unknown;
  set_id?: unknown;
  external_ids?: Record<string, unknown> | null;
  image_small?: unknown;
  image_large?: unknown;
  raw_data?: Record<string, any> | null;
};

type AttachReferences = <T extends PokemonCard>(cards: T[], maxSetRequests?: number) => Promise<T[]>;

function rowImageCandidates(row: ScanCardReferenceRow) {
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const rawImages = raw.images && typeof raw.images === 'object' ? raw.images : {};
  const image = (direct: unknown, fallback: unknown) => {
    if (typeof direct === 'string') return direct;
    return typeof fallback === 'string' ? fallback : undefined;
  };
  return {
    small: image(row.image_small, rawImages.small),
    large: image(row.image_large, rawImages.large),
  };
}

function cardFromScanRow(row: ScanCardReferenceRow): PokemonCard {
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const rawSet = raw.set && typeof raw.set === 'object' ? raw.set : {};
  const externalIds = row.external_ids && typeof row.external_ids === 'object'
    ? row.external_ids
    : raw.external_ids && typeof raw.external_ids === 'object'
      ? raw.external_ids
      : {};
  const imageCandidates = rowImageCandidates(row);

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? raw.name ?? row.id ?? ''),
    number: String(row.number ?? raw.number ?? ''),
    language: String(row.language ?? raw.language ?? '') as PokemonCard['language'],
    externalIds,
    images: {
      small: enforceTcgdexRuntimeImagePolicy(imageCandidates.small) ?? undefined,
      large: enforceTcgdexRuntimeImagePolicy(imageCandidates.large) ?? undefined,
    },
    set: {
      id: String(row.set_id ?? rawSet.id ?? raw.set_id ?? ''),
      name: typeof rawSet.name === 'string' ? rawSet.name : undefined,
    },
    raw_data: raw,
  };
}

export async function hydrateScanCardRowsWithLiveTcgdexReferences<T extends ScanCardReferenceRow>(
  rows: T[],
  attachReferences: AttachReferences,
  maxSetRequests = 3,
): Promise<T[]> {
  if (!rows.length) return rows;

  const lookupCards = rows.map(cardFromScanRow);
  const originalImages = rows.map(rowImageCandidates);
  // Scanner callers use the conservative default. Larger identification
  // surfaces may opt into the controlled lookup's normal eight-set budget.
  const requestBudget = Math.max(0, Math.min(
    Math.floor(maxSetRequests),
    lookupCards.length,
  ));
  const hydratedCards = await attachReferences(lookupCards, requestBudget);

  return rows.map((row, index) => {
    const before = lookupCards[index];
    const after = hydratedCards[index];
    if (!before || !after) return row;
    const original = originalImages[index] ?? {};
    const newSmall = enforceTcgdexRuntimeImagePolicy(after.images?.small) ?? undefined;
    const newLarge = enforceTcgdexRuntimeImagePolicy(after.images?.large) ?? undefined;
    // attachLiveTcgdexCardReferences only changes these when it receives a
    // current provider-validated reference. Leave every pre-existing image,
    // including reviewed non-TCGdex imagery, untouched otherwise.
    const smallChanged = newSmall !== before.images?.small || original.small !== before.images?.small;
    const largeChanged = newLarge !== before.images?.large || original.large !== before.images?.large;
    if (!smallChanged && !largeChanged) return row;
    const displayRow = {
      ...row,
      // Empty string deliberately blocks toResultCard from falling back to an
      // unvalidated URL still present inside raw_data.images.
      ...(smallChanged ? { image_small: newSmall ?? '' } : {}),
      ...(largeChanged ? { image_large: newLarge ?? '' } : {}),
    };
    if (smallChanged) defineTcgdexRuntimeImageOverlay(displayRow, 'image_small', newSmall);
    if (largeChanged) defineTcgdexRuntimeImageOverlay(displayRow, 'image_large', newLarge);
    return displayRow;
  });
}

/**
 * Preserve every lookup alias in a fetchStackrCardRows result while replacing
 * only its in-memory row object with the live-validated display projection.
 */
export async function hydrateCardReferenceRowMapWithLiveTcgdexReferences<T extends ScanCardReferenceRow>(
  rowsByReference: Map<string, T>,
  attachReferences: AttachReferences,
  maxSetRequests = 8,
): Promise<Map<string, T>> {
  if (!rowsByReference.size) return rowsByReference;
  const uniqueRows = [...new Set(rowsByReference.values())];
  const hydratedRows = await hydrateScanCardRowsWithLiveTcgdexReferences(
    uniqueRows,
    attachReferences,
    maxSetRequests,
  );
  const replacementByRow = new Map(uniqueRows.map((row, index) => [row, hydratedRows[index] ?? row]));
  return new Map(
    [...rowsByReference.entries()].map(([reference, row]) => [
      reference,
      replacementByRow.get(row) ?? row,
    ]),
  );
}
