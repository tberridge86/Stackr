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
  return value.slice(0, CORE_HOME_BINDER_LIMIT).map(({ id, user_id, name, type, created_at }) => ({ id, user_id, name, type, created_at }));
}

/** Home reads only compact private totals and six saved binder names. Optional
 * storage never gates either live read, and either section may settle first.
 * Shared query lifetimes belong to the query cache, not a screen subscriber. */
export function startCoreHomeRead(options: Options) {
  let active = true;
  let freshBinders = false;
  let cachedBinders = false;
  let binderAccessDenied = false;
  const revision = getCollectionSummaryVersion();
  const current = () => active && options.isCurrent() && revision === getCollectionSummaryVersion();
  const summaryKey = stackrQueryKeys.collectionSummary(options.userId);
  const overviewKey = stackrQueryKeys.binderLibrary(options.userId);
  // Never cache a six-row preview under the complete library's key.
  const previewKey = [...overviewKey, 'core-preview', CORE_HOME_BINDER_LIMIT];

  try {
    const cached = stackrQueryClient.getQueryData(summaryKey);
    if (cached && current()) options.onSummary(parseCollectionSummary(cached, options.userId), true);
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
                const summary = await readCompactCollectionSummary(options.userId, signal);
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
                  .select('id,user_id,name,type,created_at').eq('user_id', options.userId)
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
