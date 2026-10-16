import { supabase } from './supabase';
import { MOBILE_RUNTIME_CONFIG } from './mobileRuntimeConfig';
import { stackrApiClient } from './stackrApiV1';
import { subscribeRequestCacheInvalidation } from './requestCache';
import { BINDER_REOPEN_STORED_BYTES, BINDER_REOPEN_STORED_ENTRIES, createBinderReopenCache, type BinderReopenScope, type BinderReopenStore } from './binderReopenSnapshot';
import { fetchBinderById, fetchBinderCards, type BinderCardRecord, type BinderRecord } from './binders';

declare const require: (name: string) => any;

type SnapshotDatabase = {
  execAsync(sql: string): Promise<unknown>;
  getFirstAsync(sql: string, params: unknown[]): Promise<{ payload: string } | null>;
  withExclusiveTransactionAsync(work: (tx: { runAsync(sql: string, params?: unknown[]): Promise<unknown> }) => Promise<void>): Promise<unknown>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
};

/** Kept separate from the public catalogue; parameterised owner+environment reads only. */
export async function createBinderReopenSqliteStore(db: SnapshotDatabase): Promise<BinderReopenStore> {
  await db.execAsync('CREATE TABLE IF NOT EXISTS binder_reopen_v1 (namespace TEXT NOT NULL, account_id TEXT NOT NULL, binder_id TEXT NOT NULL, saved_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(namespace, account_id, binder_id))');
  return {
    async read(scope, binderId) {
      const row = await db.getFirstAsync('SELECT payload FROM binder_reopen_v1 WHERE namespace = ? AND account_id = ? AND binder_id = ?', [scope.namespace, scope.accountId, binderId]);
      if (!row || row.payload.length * 2 > 2 * 1024 * 1024) return null;
      try { return JSON.parse(row.payload); } catch { return null; }
    },
    async write(snapshot) {
      const payload = JSON.stringify(snapshot);
      if (payload.length * 2 > 2 * 1024 * 1024) return;
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT OR REPLACE INTO binder_reopen_v1(namespace, account_id, binder_id, saved_at, payload) VALUES (?, ?, ?, ?, ?)', [snapshot.namespace, snapshot.accountId, snapshot.binder.id, snapshot.savedAt, payload]);
        await tx.runAsync('DELETE FROM binder_reopen_v1 WHERE rowid IN (SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (ORDER BY saved_at DESC, rowid DESC) AS position, SUM(LENGTH(CAST(payload AS BLOB))) OVER (ORDER BY saved_at DESC, rowid DESC ROWS UNBOUNDED PRECEDING) AS total_bytes FROM binder_reopen_v1) WHERE position > ? OR total_bytes > ?)', [BINDER_REOPEN_STORED_ENTRIES, BINDER_REOPEN_STORED_BYTES]);
      });
    },
    async clear() { await db.runAsync('DELETE FROM binder_reopen_v1'); },
  };
}
let storePromise: Promise<BinderReopenStore | null> | null = null;
function getStore() {
  if (!storePromise) storePromise = (async () => {
    const sqlite = require('expo-sqlite');
    if (!sqlite?.openDatabaseAsync) return null;
    return createBinderReopenSqliteStore(await sqlite.openDatabaseAsync('stackr_binder_reopen.db'));
  })().catch(() => null);
  return storePromise;
}
export const binderReopenCache = createBinderReopenCache({ store: getStore });
export function binderReopenScope(accountId: string): BinderReopenScope {
  return { namespace: JSON.stringify([MOBILE_RUNTIME_CONFIG.supabaseUrl, stackrApiClient.catalogueCacheNamespace]), accountId };
}
let preserveForRefresh = 0;
export function retainBinderPreviewDuringRefresh(work: () => void) {
  preserveForRefresh++;
  try { work(); } finally { preserveForRefresh--; }
}
subscribeRequestCacheInvalidation((prefix) => {
  if (!preserveForRefresh && (!prefix || prefix.startsWith('binder'))) binderReopenCache.invalidate();
});
let observedAccount: string | null | undefined;
// App-lifetime listener: it also purges on sign-out while the binder screen is unmounted.
supabase.auth.onAuthStateChange((event, session) => {
  const next = session?.user.id ?? null;
  if (event === 'SIGNED_OUT' || (observedAccount !== undefined && observedAccount !== next)) binderReopenCache.invalidate();
  observedAccount = next;
});

/** Local session selects a saved read-only view, never authorises a server read/write. */
export async function readBinderReopenPreview(binderId: string) {
  const lease = binderReopenCache.lease();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user?.id || !session.expires_at || session.expires_at * 1000 <= Date.now()) return null;
  if (lease !== binderReopenCache.lease()) return null;
  const snapshot = await binderReopenCache.read(binderReopenScope(session.user.id), binderId);
  return lease === binderReopenCache.lease() && session.expires_at * 1000 > Date.now() ? snapshot : null;
}

export function isBinderAccessDenied(error: unknown) {
  const candidate = error as { status?: number; code?: string } | null;
  return candidate?.status === 401 || candidate?.status === 403 || candidate?.code === '42501'
    || candidate?.code === 'PGRST301' || candidate?.code === 'session_not_found';
}

/**
 * Warms the bounded reopen cache after Home or the binder library is usable.
 * This reads private rows through the normal RLS-backed binder functions; it
 * never turns a local cache into authorisation or downloads optional assets.
 */
export async function preloadBinderReopenViews(
  binders: BinderRecord[],
  accountId: string,
  isCurrent: () => boolean,
  options: { completeSavedCardsByBinder?: Map<string, BinderCardRecord[]> } = {},
): Promise<void> {
  const trustedAccountId = String(accountId ?? '').trim();
  if (!trustedAccountId || !isCurrent()) return;
  const lease = binderReopenCache.lease();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user?.id || session.user.id !== trustedAccountId
    || !session.expires_at || session.expires_at * 1000 <= Date.now()
    || !isCurrent() || lease !== binderReopenCache.lease()) return;
  const sessionExpiresAt = session.expires_at;
  const isEligible = () => isCurrent()
    && lease === binderReopenCache.lease()
    && sessionExpiresAt * 1000 > Date.now();

  const scope = binderReopenScope(trustedAccountId);
  const seen = new Set<string>();
  const candidates = binders
    .filter((binder) => binder?.user_id === trustedAccountId && (binder.type === 'official' || binder.type === 'custom') && Boolean(binder.id))
    .sort((left, right) => Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? ''))
    .filter((binder) => {
      if (seen.has(binder.id)) return false;
      seen.add(binder.id);
      return true;
    })
    .slice(0, BINDER_REOPEN_STORED_ENTRIES);

  for (const candidate of candidates) {
    if (!isEligible()) return;
    // A complete current snapshot needs no network work.
    if (await binderReopenCache.read(scope, candidate.id)) {
      if (!isEligible()) return;
      continue;
    }
    if (!isEligible()) return;

    try {
      if (candidate.type === 'custom' && options.completeSavedCardsByBinder?.has(candidate.id)) {
        const completeCards = options.completeSavedCardsByBinder?.get(candidate.id);
        if (!completeCards || completeCards.some((row) => row?.binder_id !== candidate.id)) continue;
        if (!isEligible()) return;
        binderReopenCache.save(scope, candidate, completeCards, lease, undefined, {
          customSource: { kind: 'home-saved-cards-v1', cardCount: completeCards.length },
        });
        continue;
      }
      const binder = await fetchBinderById(candidate.id, { includeAssets: false });
      if (!binder || binder.id !== candidate.id || binder.user_id !== trustedAccountId || !isEligible()) return;
      const cards = await fetchBinderCards(candidate.id, { includePrices: false, includeAssets: false });
      if (!isEligible()) return;
      // save() is the authoritative completeness/whitelist/size gate. A
      // partial catalogue, foreign row, or oversized payload simply is not
      // cached and this low-priority pass proceeds to the next candidate.
      binderReopenCache.save(scope, binder, cards, lease, undefined, binder.type === 'custom' ? {
        customSource: { kind: 'binder-saved-cards-v1', cardCount: cards.length },
      } : {});
    } catch {
      // Preloading is opportunistic: a single unavailable binder must not fan
      // out retries or delay the remaining bounded candidates.
    }
  }
}
