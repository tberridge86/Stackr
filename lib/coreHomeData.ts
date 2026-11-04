import type { CollectionSummary } from './collectionSummary';
import { parseCollectionSummary, readCompactCollectionSummary } from './collectionSummaryRead';
import { getCollectionSummaryVersion } from './collectionSummaryInvalidation';
import { captureBinderAccountScope, assertBinderAccountScope, isBinderAccountScopeCurrent } from './binderAccountCache';
import { isBinderLibraryOverviewForUser, readPersistedBinderOverview } from './binderLibraryCache';
import { stackrQueryClient, stackrQueryKeys, stackrQueryTiming } from './stackrQuery';
import { withPersonalDataReadTimeout } from './personalDataRead';
import { supabase } from './supabase';

export const CORE_HOME_BINDER_LIMIT = 6;
export type CoreHomeBinder = {
  id: string;
  user_id: string;
  name: string;
  type: 'official' | 'custom';
  created_at: string;
  cover_key?: string | null;
  color?: string | null;
  source_set_id?: string | null;
  language?: string | null;
  source_set_logo_url?: string | null;
  source_set_display_name?: string | null;
};
export type CoreHomeSection = 'summary' | 'binders';
type Options = {
  userId: string;
  forceRefresh?: boolean;
  isCurrent: () => boolean;
  isAccessDenied: (error: unknown) => boolean;
  onSummary: (value: CollectionSummary, cached: boolean) => void;
  onBinders: (value: CoreHomeBinder[], cached: boolean) => void;
  onError: (section: CoreHomeSection, error: unknown) => void;
  onDone: () => void;
};

function binderPreview(value: unknown, userId: string): CoreHomeBinder[] {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row.id !== 'string' || !row.id
    || row.user_id !== userId || typeof row.name !== 'string'
    || (row.type !== 'official' && row.type !== 'custom') || typeof row.created_at !== 'string')
    || new Set(value.map((row) => row.id)).size !== value.length) {
    throw new Error('The saved binders did not match your account. Please retry.');
  }
  const optionalText = (field: unknown) => typeof field === 'string' && field.trim() ? field : null;
  return value.slice(0, CORE_HOME_BINDER_LIMIT).map((row) => ({
    id: row.id, user_id: row.user_id, name: row.name, type: row.type, created_at: row.created_at,
    cover_key: optionalText(row.cover_key), color: optionalText(row.color),
    source_set_id: optionalText(row.source_set_id), language: optionalText(row.language),
    source_set_logo_url: optionalText(row.source_set_logo_url),
    source_set_display_name: optionalText(row.source_set_display_name),
  }));
}

/** Home reads compact private totals and six saved binder previews. Optional
 * storage never gates either live read, and either section may settle first.
 * Shared query lifetimes belong to the query cache, not a screen subscriber. */
export function startCoreHomeRead(options: Options) {
  let active = true;
  let freshBinders = false;
  let cachedBinders = false;
  let binderAccessDenied = false;
  const revision = getCollectionSummaryVersion();
  const current = () => active && options.isCurrent() && revision === getCollectionSummaryVersion();
  const completeSummaryKey = stackrQueryKeys.collectionSummary(options.userId);
  // Home shows stored value and owned/unique/binder counts, independent of local master
  // preferences. Keep its RPC snapshot separate from full completion coverage.
  const summaryKey = stackrQueryKeys.coreHomeTotals(options.userId);
  const overviewKey = stackrQueryKeys.binderLibrary(options.userId);
  // Never cache a six-row preview under the complete library's key.
  const previewKey = [...overviewKey, 'core-preview', CORE_HOME_BINDER_LIMIT];

  try {
    const complete = stackrQueryClient.getQueryState<CollectionSummary>(completeSummaryKey);
    const core = stackrQueryClient.getQueryState<CollectionSummary>(summaryKey);
    const cached = complete?.data && (!core?.data || complete.dataUpdatedAt > core.dataUpdatedAt) ? complete : core;
    if (cached?.data && current()) {
      const value = parseCollectionSummary(cached.data, options.userId);
      if (cached === complete) {
        stackrQueryClient.setQueryData(summaryKey, value, { updatedAt: cached.dataUpdatedAt });
      }
      options.onSummary(value, true);
    }
  } catch { /* An invalid persisted value is not a live result. */ }
  try {
    const complete = stackrQueryClient.getQueryData(overviewKey);
    const cached = isBinderLibraryOverviewForUser(complete, options.userId)
      ? complete.binders : stackrQueryClient.getQueryData(previewKey);
    if (cached && current()) {
      options.onBinders(binderPreview(cached, options.userId), true);
      cachedBinders = true;
    }
  } catch { /* A stale or mismatched cache cannot supply private rows. */ }

  if (!cachedBinders) void readPersistedBinderOverview(options.userId).then((saved) => {
    if (saved && current() && !freshBinders && !binderAccessDenied) options.onBinders(binderPreview(saved.binders, options.userId), true);
  }).catch(() => undefined);

  const done = (async () => {
    try {
      const scope = await captureBinderAccountScope();
      if (!current()) return;
      if (scope.userId !== options.userId) throw Object.assign(new Error('Your sign-in changed. Please retry.'), { status: 403 });
      const eligible = () => current() && isBinderAccountScopeCurrent(scope);
      const staleTime = options.forceRefresh ? 0 : stackrQueryTiming.hotPathStaleMs;
      await Promise.allSettled([
        (async () => {
          try {
            const value = await stackrQueryClient.fetchQuery({
              queryKey: summaryKey,
              staleTime,
              retry: false,
              queryFn: () => withPersonalDataReadTimeout(async (signal) => {
                const summary = await readCompactCollectionSummary(options.userId, signal, { includeLocalMasterOverrides: false });
                if (!summary) throw new Error('Collection totals are unavailable. Your binders are still available below.');
                await assertBinderAccountScope(scope);
                return parseCollectionSummary(summary, options.userId);
              }, { signal: scope.signal }),
            });
            await assertBinderAccountScope(scope);
            if (eligible()) options.onSummary(parseCollectionSummary(value, options.userId), false);
          } catch (error) {
            if (eligible()) options.onError('summary', error);
          }
        })(),
        (async () => {
          try {
            const value = await stackrQueryClient.fetchQuery({
              queryKey: previewKey,
              staleTime,
              retry: false,
              queryFn: () => withPersonalDataReadTimeout(async (signal) => {
                const { data, error } = await supabase.from('binders')
                  .select('id,user_id,name,type,created_at,cover_key,color,source_set_id,language,source_set_logo_url,source_set_display_name').eq('user_id', options.userId)
                  .order('sort_order', { ascending: true }).order('created_at', { ascending: false })
                  .order('id', { ascending: true }).limit(CORE_HOME_BINDER_LIMIT).abortSignal(signal);
                if (error) throw error;
                if (!Array.isArray(data) || data.length > CORE_HOME_BINDER_LIMIT) throw new Error('The binder preview could not load. Please retry.');
                await assertBinderAccountScope(scope);
                return binderPreview(data, options.userId);
              }, { signal: scope.signal }),
            });
            await assertBinderAccountScope(scope);
            if (eligible()) {
              freshBinders = true;
              options.onBinders(binderPreview(value, options.userId), false);
            }
          } catch (error) {
            if (options.isAccessDenied(error)) binderAccessDenied = true;
            if (eligible()) options.onError('binders', error);
          }
        })(),
      ]);
    } catch (error) {
      if (options.isAccessDenied(error)) binderAccessDenied = true;
      if (current()) {
        options.onError('summary', error);
        options.onError('binders', error);
      }
    } finally {
      if (current()) options.onDone();
    }
  })();
  return { done, dispose: () => { active = false; } };
}
