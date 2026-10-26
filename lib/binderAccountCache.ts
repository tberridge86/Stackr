import { supabase } from './supabase';
import { getCachedOrFetch, invalidateRequestCache } from './requestCache';
import { getCollectionSummaryVersion } from './collectionSummaryInvalidation';
import { withPersonalDataReadTimeout } from './personalDataRead';

export type BinderAccountScope = {
  userId: string | null;
  generation: number;
  revision: number;
  signal: AbortSignal;
};
let identity: { userId: string | null; token: string | null } | undefined;
let generation = 0;
let controller = new AbortController();
let observing = false;
const listeners = new Set<() => void>();

function cancelled() {
  return Object.assign(new Error('The binder account or collection changed. Please retry.'), { name: 'AbortError' });
}
function bindIdentity(userId: string | null, token: string | null, boundary: boolean) {
  identity = { userId, token };
  if (!boundary) return;
  generation += 1;
  controller.abort();
  controller = new AbortController();
  invalidateRequestCache('binder:account:');
  invalidateRequestCache('binders:');
  for (const listener of listeners) {
    try { listener(); } catch { /* Optional view cleanup cannot break auth. */ }
  }
}
function observeIdentity() {
  if (observing) return;
  observing = true;
  // This observer remains active while entries are idle, including logout/A.
  // It never awaits Auth APIs inside the SDK's auth callback.
  supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user.id ?? null;
    const token = session?.access_token ?? null;
    const boundary = event === 'SIGNED_OUT' || (identity !== undefined && identity.userId !== userId)
      || (event === 'SIGNED_IN' && identity !== undefined && identity.token !== token)
      || (identity === undefined && event !== 'INITIAL_SESSION' && event !== 'TOKEN_REFRESHED');
    bindIdentity(userId, token, boundary);
  });
}
export function subscribeBinderAccountChanges(listener: () => void) {
  observeIdentity();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function isBinderAccountScopeCurrent(scope: BinderAccountScope) {
  return generation === scope.generation && identity?.userId === scope.userId
    && getCollectionSummaryVersion() === scope.revision && !scope.signal.aborted;
}
export async function captureBinderAccountScope(): Promise<BinderAccountScope> {
  observeIdentity();
  const capturedGeneration = generation;
  const capturedSignal = controller.signal;
  const { data: { session }, error } = await withPersonalDataReadTimeout(() => supabase.auth.getSession(), { signal: capturedSignal });
  if (error) throw error;
  if (generation !== capturedGeneration || capturedSignal.aborted) throw cancelled();
  const userId = session?.user.id ?? null;
  const token = session?.access_token ?? null;
  bindIdentity(userId, token, identity !== undefined && identity.userId !== userId);
  return { userId, generation, revision: getCollectionSummaryVersion(), signal: controller.signal };
}
export async function assertBinderAccountScope(scope: BinderAccountScope) {
  if (!isBinderAccountScopeCurrent(scope)) throw cancelled();
  const { data: { session }, error } = await withPersonalDataReadTimeout(() => supabase.auth.getSession(), { signal: scope.signal });
  if (error) throw error;
  if (!isBinderAccountScopeCurrent(scope) || (session?.user.id ?? null) !== scope.userId) throw cancelled();
}
export function invalidateBinderAccountCache(binderId?: string) {
  invalidateRequestCache(binderId ? `binder:account:${binderId}:` : 'binder:account:');
}

/** RLS authorizes misses; current local identity scopes every hit and late fill. */
export async function readBinderAccountCache<T>(
  binderId: string, resource: string, ttlMs: number,
  read: (scope: BinderAccountScope) => Promise<T>,
  options: { shouldCache?: () => boolean } = {},
): Promise<T> {
  const scope = await captureBinderAccountScope();
  const key = `binder:account:${binderId}:${scope.userId ?? 'anonymous'}:${scope.generation}:${resource}`;
  const value = await getCachedOrFetch(key, ttlMs, () => withPersonalDataReadTimeout(async (signal) => {
    const result = await read({ ...scope, signal });
    await assertBinderAccountScope({ ...scope, signal });
    return result;
  }, { signal: scope.signal }), { shouldCache: () => isBinderAccountScopeCurrent(scope) && options.shouldCache?.() !== false });
  await assertBinderAccountScope(scope);
  return value;
}
