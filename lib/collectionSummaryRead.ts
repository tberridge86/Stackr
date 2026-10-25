import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CollectionSummary } from './collectionSummary';
import { withPersonalDataReadTimeout } from './personalDataRead';
import { supabase } from './supabase';
import { COLLECTION_SUMMARY_USD_TO_GBP } from './collectionSummaryValue';

const MASTER_PREFIX = 'stackr:binder-master-set:';
const COUNT_KEYS = ['totalOwnedItems', 'totalCardsOwned', 'uniqueCards', 'rawCardsOwned', 'gradedSlabsOwned',
  'sealedProductsOwned', 'duplicateCopies', 'binderCount', 'completedSets'] as const;
const COVERAGE_KEYS = ['totalUnits', 'pricedUnits', 'unpricedUnits', 'unsupportedUnits', 'missingPriceUnits'] as const;
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

export function parseCollectionSummary(value: unknown, userId: string): CollectionSummary {
  const invalid = () => new Error('The collection summary did not reconcile. Please retry.');
  if (!object(value) || value.schemaVersion !== 'collection-summary-v1' || value.subjectUserId !== userId
    || COUNT_KEYS.some((key) => !count(value[key])) || !object(value.valuation)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw invalid();
  const coverage = value.valuation;
  if (coverage.basis !== 'stored_tcg_raw_estimate' || coverage.currency !== 'GBP' || coverage.freshness !== 'unknown'
    || coverage.usdToGbp !== COLLECTION_SUMMARY_USD_TO_GBP || COVERAGE_KEYS.some((key) => !count(coverage[key]))
    || value.totalCardsOwned !== value.rawCardsOwned + value.gradedSlabsOwned
    || value.totalOwnedItems !== value.totalCardsOwned + value.sealedProductsOwned
    || value.uniqueCards > value.totalCardsOwned || value.completedSets > value.binderCount
    || value.duplicateCopies > value.totalOwnedItems
    || coverage.totalUnits !== value.totalOwnedItems
    || coverage.pricedUnits + coverage.unpricedUnits !== coverage.totalUnits
    || coverage.unsupportedUnits + coverage.missingPriceUnits !== coverage.unpricedUnits
    || coverage.unsupportedUnits < value.gradedSlabsOwned) throw invalid();
  const state = !coverage.totalUnits ? 'empty' : !coverage.pricedUnits ? 'unavailable' : coverage.unpricedUnits ? 'partial' : 'available';
  if (coverage.state !== state || (state === 'unavailable' ? value.collectionValue !== null
    : typeof value.collectionValue !== 'number' || !Number.isFinite(value.collectionValue) || value.collectionValue < 0
      || !Number.isSafeInteger(Math.round(value.collectionValue * 100)))
    || (state === 'empty' && value.collectionValue !== 0)) throw invalid();
  return value as CollectionSummary;
}

async function localMasterOverrides(signal: AbortSignal): Promise<string[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(MASTER_PREFIX));
  if (keys.length > 10_000) throw new Error('Too many local master-set preferences. Please retry.');
  const overrides: string[] = [];
  for (let from = 0; from < keys.length; from += 50) {
    if (signal.aborted) throw new Error('The collection summary was cancelled.');
    for (const [key, value] of await AsyncStorage.multiGet(keys.slice(from, from + 50))) {
      const binderId = key.slice(MASTER_PREFIX.length);
      if (value === 'true' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(binderId)) overrides.push(binderId);
    }
  }
  return overrides;
}

/** A missing new RPC keeps the older database compatible; other failures remain errors. */
export async function readCompactCollectionSummary(userId: string, signal?: AbortSignal): Promise<CollectionSummary | null> {
  return withPersonalDataReadTimeout(async (requestSignal) => {
    const p_master_binder_ids = await localMasterOverrides(requestSignal);
    if (requestSignal.aborted) throw new Error('The collection summary was cancelled.');
    const { data, error } = await supabase.rpc('collection_summary_v1', { p_master_binder_ids }).abortSignal(requestSignal);
    if (requestSignal.aborted) throw new Error('The collection summary was cancelled.');
    if (error) {
      if (error.code === 'PGRST202' && /\bcollection_summary_v1\b/.test(error.message ?? '')) return null;
      throw new Error('The collection summary could not load. Please retry.', { cause: error });
    }
    return parseCollectionSummary(data, userId);
  }, { signal });
}

export function collectionSummaryCoverageText(summary: Pick<CollectionSummary, 'valuation'>): string {
  const coverage = summary.valuation;
  return coverage.state === 'empty' ? 'No cards owned'
    : `${coverage.pricedUnits}/${coverage.totalUnits} copies priced · Freshness unknown`;
}
