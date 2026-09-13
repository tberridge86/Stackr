import { loadCollectionPrices, loadExactCollectionSnapshotPrices, loadLegacyCollectionSnapshotPrices, type CollectionPriceInput, type CollectionPriceLoaderOptions, type CollectionPriceResolution, type CollectionPriceResult } from './collectionPricingApi';
import type { StackrApiClient } from './stackrApiV1';
import type { BinderCardMode, BinderCardRecord } from './binders';

type BinderPriceDefaults = {
  language?: string | null;
  cardMode?: BinderCardMode | null;
  defaultCondition?: string | null;
  defaultGradeCompany?: string | null;
  defaultGrade?: string | null;
  edition?: string | null;
};

export type BinderPriceProgressOptions = Pick<CollectionPriceLoaderOptions, 'client' | 'concurrency' | 'isCurrent' | 'resolver' | 'onInterrupted'> & {
  /** Receives only safe, exact quotes merged over the current binder rows. */
  onProgress?: (rows: BinderCardRecord[], completed: number, total: number) => void;
};

type ScheduledBinderPrice = {
  row: BinderCardRecord;
  input: CollectionPriceInput;
};

function nonEmpty(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A variant code is usable only when the canonical variant UUID names it. */
export function binderCanonicalVariantCode(row: BinderCardRecord) {
  const card = row.card as any;
  const raw = card?.raw_data ?? card?.rawData ?? {};
  const canonicalVariantId = nonEmpty(card?.externalIds?.stackrVariant ?? raw?.stackr?.defaultVariantId);
  if (!canonicalVariantId) return null;
  const variants = Array.isArray(raw?.stackr?.variants) ? raw.stackr.variants : [];
  const variant = variants.find((candidate: any) => nonEmpty(candidate?.variantId) === canonicalVariantId);
  return nonEmpty(variant?.variantCode ?? variant?.finishCode);
}

/** Reuse only catalogue-attested facts; saved aliases never become trusted IDs. */
export function binderTrustedResolution(row: BinderCardRecord): CollectionPriceResolution | null {
  const card = row.card as any;
  const raw = card?.raw_data ?? card?.rawData ?? {};
  const stackr = raw?.stackr;
  const cardId = nonEmpty(stackr?.cardId);
  const presentationCardId = nonEmpty(card?.id);
  const setId = nonEmpty(card?.set?.id);
  const language = nonEmpty(card?.language ?? raw?.language);
  const rowLanguage = nonEmpty(row.language);
  const defaultVariantId = nonEmpty(card?.externalIds?.stackrVariant ?? stackr?.defaultVariantId);
  if (row.catalogue_match_status !== 'catalogue' || stackr?.canonical !== true
    || !cardId || !presentationCardId || cardId !== presentationCardId || !setId
    || !language || !rowLanguage || language.toLowerCase() !== rowLanguage.toLowerCase()
    || !defaultVariantId || !UUID.test(cardId) || !UUID.test(setId) || !UUID.test(defaultVariantId)) return null;
  const variants = Array.isArray(stackr?.variants) ? stackr.variants.map((variant: any) => ({
    variantId: nonEmpty(variant?.variantId),
    variantCode: nonEmpty(variant?.variantCode ?? variant?.finishCode),
  })).filter((variant: { variantId: string | null }) => Boolean(variant.variantId && UUID.test(variant.variantId))) : [];
  if (!variants.some((variant: { variantId: string | null }) => variant.variantId === defaultVariantId)) return null;
  return {
    canonical: true,
    cardId,
    setId,
    language,
    defaultVariantId,
    variants: variants as { variantId: string; variantCode: string | null }[],
  };
}

export function binderPriceInputForRow(
  row: BinderCardRecord,
  defaults: BinderPriceDefaults = {},
): CollectionPriceInput {
  const graded = row.grade_company || row.grade || defaults.cardMode === 'graded';
  const trustedResolution = binderTrustedResolution(row);
  return {
    key: row.id,
    // Do not use display names as aliases. A binder price must begin from the
    // canonical facts already attached to this particular row.
    references: [...new Set([trustedResolution?.cardId, row.api_card_id, row.card_id]
      .map(nonEmpty)
      .filter((value): value is string => Boolean(value)))],
    quantity: Math.max(1, Number(row.owned_quantity ?? 1) || 1),
    language: trustedResolution?.language ?? row.language ?? defaults.language,
    setId: trustedResolution?.setId ?? row.api_set_id ?? row.set_id,
    variantCode: binderCanonicalVariantCode(row) ?? undefined,
    legacyReference: row.card_id,
    legacySetId: row.set_id,
    edition: defaults.edition,
    trustedResolution,
    productType: graded ? 'graded_card' : 'raw_card',
    // Existing binder estimates apply the saved condition multiplier at render
    // time. Retain a Near Mint base here so condition is never applied twice.
    condition: graded ? null : 'Near Mint',
    grader: graded ? row.grade_company ?? defaults.defaultGradeCompany : null,
    grade: graded ? row.grade ?? defaults.defaultGrade : null,
  };
}

/**
 * Apply only an exact, finite quote. An unavailable/superseded read must not
 * erase a saved price or replace it with a sibling's result.
 */
export function mergeBinderPriceResults(
  rows: BinderCardRecord[],
  results: CollectionPriceResult[],
): BinderCardRecord[] {
  const pricesByRowId = new Map(results.map((result) => [result.key, result]));
  return rows.map((row) => {
    const result = pricesByRowId.get(row.id);
    // The binder explicitly labels these as cached estimates with their source
    // timestamp. Keep useful older evidence, but never replace newer evidence.
    if (!result || !Number.isFinite(result.central) || result.freshness === 'expired'
      || (result.calculatedAt && row.last_price_update && Date.parse(result.calculatedAt) < Date.parse(row.last_price_update))) return row;
    return {
      ...row,
      tcg_price: result.central,
      last_price_update: result.calculatedAt ?? row.last_price_update ?? null,
    };
  });
}

/**
 * Fetch exact binder quotes with bounded backpressure and publish useful rows
 * as they arrive. Owned cards run first; unowned catalogue slots follow.
 */
export async function loadProgressiveBinderPrices(
  rows: BinderCardRecord[],
  defaults: BinderPriceDefaults = {},
  options: BinderPriceProgressOptions = {},
): Promise<BinderCardRecord[]> {
  const scheduled: ScheduledBinderPrice[] = rows.map((row) => ({
    row,
    input: binderPriceInputForRow(row, defaults),
  })).sort((left, right) => Number(right.row.owned) - Number(left.row.owned));
  if (!scheduled.length || !(options.isCurrent?.() ?? true)) return rows;

  const publish = (results: CollectionPriceResult[], completed: number) => {
    if (!(options.isCurrent?.() ?? true)) return;
    const orderedResults = results.map((result) => result);
    options.onProgress?.(mergeBinderPriceResults(rows, orderedResults), completed, scheduled.length);
  };
  const results = await loadCollectionPrices(scheduled.map(({ input }) => input), {
    client: options.client,
    concurrency: options.concurrency ?? 4,
    isCurrent: options.isCurrent,
    resolver: options.resolver,
    onProgress: publish,
    onInterrupted: options.onInterrupted,
  });
  return mergeBinderPriceResults(rows, results);
}

/**
 * Viewport callers use this before the slower compatibility loader. It reads
 * only exact raw/NM variants and leaves misses unchanged, so a 12-card visible
 * batch never resolves every virtual slot in the binder.
 */
export async function loadLatestSnapshotBinderPrices(
  rows: BinderCardRecord[],
  defaults: BinderPriceDefaults,
  client: Pick<StackrApiClient, 'marketPriceSnapshots'>,
  isCurrent?: () => boolean,
) {
  const inputs = rows.map((row) => binderPriceInputForRow(row, defaults));
  const read = await loadExactCollectionSnapshotPrices(inputs, { client, concurrency: 1, isCurrent });
  const legacy = read.failure
    ? { results: new Map<number, CollectionPriceResult>(), failure: read.failure }
    : await loadLegacyCollectionSnapshotPrices(inputs, client, isCurrent);
  const results: CollectionPriceResult[] = inputs.map((input) => ({
    key: input.key,
    quantity: input.quantity,
    reference: null,
    variantId: null,
    central: null,
    status: 'unavailable' as const,
    freshness: 'unknown' as const,
    calculatedAt: null,
    staleAfter: null,
    unavailableReason: 'No matching Stackr price is available.',
    requestError: null,
  }));
  for (const [index, result] of read.results) results[index] = result;
  for (const [index, result] of legacy.results) {
    if (results[index].central == null) results[index] = result;
  }
  return { rows: mergeBinderPriceResults(rows, results), failure: read.failure ?? legacy.failure };
}
