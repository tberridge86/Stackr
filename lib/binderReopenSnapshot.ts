import type { BinderRecord, BinderCardRecord } from './binders';
import { stripTcgdexReferencesFromValueBeforePersistence } from './tcgdexControlledCardReference';

/** An owner-only, read-only view snapshot. Never an authorization or mutation source. */
export type BinderReopenScope = { namespace: string; accountId: string };
export type BinderReopenSnapshot = BinderReopenScope & {
  schema: 1;
  savedAt: number;
  binder: BinderRecord;
  cards: BinderCardRecord[];
};
export type BinderReopenStore = {
  read(scope: BinderReopenScope, binderId: string): Promise<unknown>;
  write(snapshot: BinderReopenSnapshot): Promise<void>;
  clear(): Promise<void>;
};
export const BINDER_REOPEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key = (scope: BinderReopenScope, binderId: string) => JSON.stringify([scope.namespace, scope.accountId, binderId]);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function pick<T extends object>(value: T, keys: readonly string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const name of keys) {
    if (!Object.prototype.propertyIsEnumerable.call(value, name)) continue;
    const field = (value as any)[name];
    if (field == null || ['string', 'number', 'boolean'].includes(typeof field)) result[name] = field;
    else if (Array.isArray(field) && field.every((item) => typeof item === 'string')) result[name] = [...field];
  }
  return result as Partial<T>;
}

/** Whitelist data needed for read-only presentation; exclude prices, tokens and arbitrary raw payloads. */
export function snapshotBinderView(scope: BinderReopenScope, binder: BinderRecord, cards: BinderCardRecord[], savedAt: number): BinderReopenSnapshot {
  const record = pick(binder, [
    'id', 'user_id', 'name', 'color', 'gradient', 'cover_key', 'type', 'is_public', 'source_set_id', 'language', 'created_at',
    'edition', 'default_condition', 'master_set_enabled', 'card_mode', 'default_grade_company', 'default_grade',
    'source_set_logo_url', 'source_set_symbol_url', 'source_set_cover_url', 'source_set_display_name',
    'source_set_local_name', 'source_set_english_display_name', 'catalogue_set_id', 'catalogue_set_references',
    'catalogue_set_total', 'catalogue_set_printed_total', 'catalogue_identity_status',
  ]) as BinderRecord;
  const rows = cards.map((row) => {
    const result = pick(row, [
      'id', 'binder_id', 'card_id', 'set_id', 'language', 'api_card_id', 'card_name', 'api_set_id', 'card_number',
      'image_url', 'set_name', 'set_total', 'slot_order', 'owned', 'owned_quantity', 'condition', 'grade_company',
      'grade', 'notes', 'created_at', 'catalogue_match_status', 'catalogue_incomplete',
    ]) as BinderCardRecord;
    // Cached prices require their own provenance/freshness protocol. Do not carry arbitrary provider prices here.
    result.ebay_price = result.tcg_price = result.cardmarket_price = null;
    result.last_price_update = null;
    if (row.card) {
      const card = pick(row.card, ['id', 'name', 'number', 'language', 'rarity']);
      card.set = row.card.set ? pick(row.card.set, ['id', 'name']) : null;
      const transient = Object.getOwnPropertyDescriptor(row.card, 'images')?.enumerable === false;
      card.images = !transient && row.card.images ? pick(row.card.images, ['small', 'large']) : { small: result.image_url ?? null, large: null };
      const raw = row.card.raw_data;
      const canonical = raw?.stackr;
      if (canonical) {
        card.raw_data = {
          ...pick(raw, ['local_name', 'english_display_name', 'language', 'number', 'localId', 'supertype', 'subtypes', 'artist']),
          stackr: {
            ...pick(canonical, ['cardId', 'catalogueVersionId', 'defaultVariantId', 'canonical']),
            variants: Array.isArray(canonical.variants) ? canonical.variants.map((variant: any) => ({
              ...pick(variant, ['variantId', 'canonicalId', 'variantCode', 'variantLabel', 'finishCode', 'finishLabel', 'artworkKey', 'imageVariantId', 'sameArtworkAsVariantId', 'updatedAt']),
              image: null,
            })) : [],
          },
        };
      }
      result.card = card;
    }
    return result;
  });
  return copy(stripTcgdexReferencesFromValueBeforePersistence({ ...scope, schema: 1 as const, savedAt, binder: record, cards: rows }));
}

export function isCompleteBinderSnapshot(value: unknown, scope: BinderReopenScope, binderId: string, now: number): value is BinderReopenSnapshot {
  try {
    const s = value as BinderReopenSnapshot;
    if (!scope.accountId || !scope.namespace || !s || s.schema !== 1 || s.namespace !== scope.namespace || s.accountId !== scope.accountId
      || !Number.isFinite(s.savedAt) || s.savedAt > now || now - s.savedAt >= BINDER_REOPEN_MAX_AGE_MS
      || s.binder?.id !== binderId || s.binder.user_id !== scope.accountId || s.binder.type !== 'official'
      || s.binder.catalogue_identity_status !== 'resolved' || !UUID.test(s.binder.catalogue_set_id ?? '')
      || !Array.isArray(s.cards) || s.cards.length > 2500) return false;
    const count = s.binder.catalogue_set_total ?? s.binder.catalogue_set_printed_total;
    if (!Number.isSafeInteger(count) || !count || count < 1 || count > 2000) return false;
    const rows = new Set<string>();
    const identities = new Set<string>();
    const versions = new Set<string>();
    for (const row of s.cards) {
      if (!row.id || rows.has(row.id) || row.binder_id !== binderId || row.catalogue_incomplete
        || typeof row.owned !== 'boolean' || !Number.isFinite(row.owned_quantity) || row.owned_quantity < 1) return false;
      rows.add(row.id);
      if (row.catalogue_match_status !== 'catalogue') continue;
      const c = row.card;
      const identity = c?.raw_data?.stackr;
      if (!UUID.test(c?.id ?? '') || identities.has(c.id) || c.set?.id !== s.binder.catalogue_set_id
        || row.language !== s.binder.language || !c.name || !c.number || identity?.canonical !== true
        || typeof identity.catalogueVersionId !== 'string' || !UUID.test(identity.catalogueVersionId)
        || identity.cardId !== c.id || !UUID.test(identity.defaultVariantId ?? '') || !Array.isArray(identity.variants)
        || !identity.variants.some((v: any) => v.variantId === identity.defaultVariantId)) return false;
      identities.add(c.id);
      versions.add(identity.catalogueVersionId.toLowerCase());
    }
    return identities.size === count && versions.size === 1;
  } catch { return false; }
}

export function createBinderReopenCache(options: { store: () => Promise<BinderReopenStore | null>; now?: () => number }) {
  const now = options.now ?? Date.now;
  const memory = new Map<string, { snapshot: BinderReopenSnapshot; bytes: number }>();
  let generation = 0;
  let bytes = 0;
  let diskAllowed = true;
  let writes: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => { writes = writes.then(task).catch(() => undefined); };
  const remember = (snapshot: BinderReopenSnapshot) => {
    const size = JSON.stringify(snapshot).length * 2;
    if (size > MAX_ENTRY_BYTES) return false;
    const id = key(snapshot, snapshot.binder.id);
    const old = memory.get(id);
    if (old && old.snapshot.savedAt > snapshot.savedAt) return false;
    if (old) { bytes -= old.bytes; memory.delete(id); }
    while (memory.size >= MAX_ENTRIES || bytes + size > MAX_BYTES) {
      const oldest = memory.keys().next().value;
      if (!oldest) break;
      bytes -= memory.get(oldest)!.bytes; memory.delete(oldest);
    }
    memory.set(id, { snapshot, bytes: size }); bytes += size;
    return true;
  };
  return {
    lease() { return generation; },
    async read(scope: BinderReopenScope, binderId: string): Promise<BinderReopenSnapshot | null> {
      const lease = generation;
      const cached = memory.get(key(scope, binderId));
      if (cached && isCompleteBinderSnapshot(cached.snapshot, scope, binderId, now())) return copy(cached.snapshot);
      if (!diskAllowed) return null;
      try {
        const store = await options.store();
        if (lease !== generation) return null;
        const stored = await store?.read(scope, binderId);
        if (lease !== generation || !isCompleteBinderSnapshot(stored, scope, binderId, now())) return null;
        // Disk contents pass the same whitelist as fresh responses, not only shape checks.
        const snapshot = snapshotBinderView(scope, stored.binder, stored.cards, stored.savedAt);
        const newer = memory.get(key(scope, binderId))?.snapshot;
        if (newer && newer.savedAt >= snapshot.savedAt && isCompleteBinderSnapshot(newer, scope, binderId, now())) return copy(newer);
        remember(snapshot);
        return copy(snapshot);
      } catch { return null; }
    },
    save(scope: BinderReopenScope, binder: BinderRecord, cards: BinderCardRecord[], lease: number, savedAt = now()) {
      if (lease !== generation) return false;
      let snapshot: BinderReopenSnapshot;
      try { snapshot = snapshotBinderView(scope, binder, cards, savedAt); } catch { return false; }
      if (!isCompleteBinderSnapshot(snapshot, scope, binder.id, now()) || !remember(snapshot)) return false;
      enqueue(async () => {
        const store = await options.store();
        if (store && lease === generation) await store.write(snapshot);
      });
      return true;
    },
    invalidate() {
      generation++;
      memory.clear(); bytes = 0;
      // Fail closed until the clear has actually completed, including stalled/failed storage.
      diskAllowed = false;
      const lease = generation;
      enqueue(async () => {
        const store = await options.store();
        if (!store) return;
        await store.clear();
        if (lease === generation) diskAllowed = true;
      });
    },
    async flush() { await writes; },
  };
}
