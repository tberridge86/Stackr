import type { StackrCard } from './stackrApiV1';

/** Public catalogue facts only. Private collection state must never enter this store. */
export type SetFactsKey = { namespace: string; setId: string; language: string; expectedCount: number };
export type SetFactsSnapshot = SetFactsKey & { schema: 1; fetchedAt: number; cards: StackrCard[] };
export type SetFactsStore = {
  read(key: SetFactsKey): Promise<unknown>;
  write(snapshot: SetFactsSnapshot): Promise<void>;
  clear(namespace: string): Promise<void>;
};
export type SetFactsResult = { setId: string; cards: StackrCard[]; source: 'memory' | 'disk' | 'network'; fetchedAt: number };
export type SetFactsPage = { cards: StackrCard[]; nextCursor: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 24;

function cancelled(): Error { return new Error('Catalogue request cancelled'); }
function check(signal?: AbortSignal) { if (signal?.aborted) throw signal.reason ?? cancelled(); }
function keyOf(key: SetFactsKey) { return JSON.stringify([key.namespace, key.setId, key.language, key.expectedCount]); }
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Whitelist, rather than spreading responses, so prices, ownership and image references cannot persist. */
export function publicSetCardFacts(card: StackrCard): StackrCard {
  return {
    cardId: card.cardId, catalogueVersionId: card.catalogueVersionId ?? null,
    game: card.game, languageCode: card.languageCode,
    set: { setId: card.set.setId, setCode: text(card.set.setCode), nativeName: text(card.set.nativeName), englishDisplayName: text(card.set.englishDisplayName) },
    collectorNumber: { value: card.collectorNumber.value, prefix: text(card.collectorNumber.prefix), sort: number(card.collectorNumber.sort), suffix: text(card.collectorNumber.suffix), sortKey: text(card.collectorNumber.sortKey) },
    names: { native: card.names.native, englishDisplay: text(card.names.englishDisplay), englishDisplaySource: card.names.englishDisplaySource ?? null },
    rarity: { code: text(card.rarity?.code), label: text(card.rarity?.label) },
    details: { supertype: text(card.details?.supertype), subtypes: Array.isArray(card.details?.subtypes) ? card.details.subtypes.filter((v) => typeof v === 'string') : [], artist: text(card.details?.artist) },
    defaultVariantId: card.defaultVariantId,
    variants: card.variants.map((variant) => ({
      variantId: variant.variantId, canonicalId: variant.canonicalId, variantCode: variant.variantCode,
      variantLabel: text(variant.variantLabel), finishCode: text(variant.finishCode), finishLabel: text(variant.finishLabel),
      artworkKey: text(variant.artworkKey), nativeImageStatus: variant.nativeImageStatus,
      sameArtworkAsVariantId: text(variant.sameArtworkAsVariantId), imageVariantId: variant.imageVariantId,
      image: null, updatedAt: text(variant.updatedAt),
    })),
    updatedAt: text(card.updatedAt),
  };
}

export function validateCompleteSet(cards: StackrCard[], key: SetFactsKey): void {
  if (!Number.isSafeInteger(key.expectedCount) || key.expectedCount < 1 || key.expectedCount > 2000
    || cards.length !== key.expectedCount) throw new Error(`Incomplete catalogue: expected ${key.expectedCount}, received ${cards.length}`);
  const cardIds = new Set<string>();
  const variants = new Set<string>();
  const versions = new Set<string>();
  for (const card of cards) {
    if (!UUID.test(card.cardId) || cardIds.has(card.cardId) || card.set?.setId !== key.setId
      || card.languageCode !== key.language || !card.collectorNumber?.value || !card.names?.native
      || !Array.isArray(card.variants) || !card.variants.length
      || !card.variants.some((v) => v.variantId === card.defaultVariantId)) throw new Error('Invalid or mixed catalogue identity');
    cardIds.add(card.cardId);
    if (card.catalogueVersionId) versions.add(card.catalogueVersionId);
    for (const variant of card.variants) {
      if (!UUID.test(variant.variantId) || variants.has(variant.variantId) || !variant.canonicalId || !variant.variantCode) throw new Error('Invalid or duplicate catalogue variant');
      variants.add(variant.variantId);
    }
  }
  if (versions.size > 1) throw new Error('Catalogue changed during pagination; retry a consistent version');
}

/** Pagination remains terminal-cursor driven. A 500 limit is not a completeness guarantee. */
export async function loadCompleteSetPages(
  key: SetFactsKey,
  load: (cursor: string | null, signal?: AbortSignal) => Promise<SetFactsPage>,
  normalize: (cards: StackrCard[]) => StackrCard[],
  signal?: AbortSignal,
): Promise<StackrCard[]> {
  const rows: StackrCard[] = [];
  const cursors = new Set<string>();
  const versions = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 32; page += 1) {
    check(signal);
    const result = await load(cursor, signal);
    check(signal);
    for (const card of result.cards) if (card.catalogueVersionId) versions.add(card.catalogueVersionId);
    if (versions.size > 1) throw new Error('Catalogue version changed during pagination');
    rows.push(...result.cards);
    if (rows.length > 16000) throw new Error('Catalogue response exceeded bounded retrieval budget');
    cursor = result.nextCursor;
    if (!cursor) {
      const cards = normalize(rows);
      validateCompleteSet(cards, key);
      return cards.map(publicSetCardFacts);
    }
    if (cursors.has(cursor)) throw new Error('Catalogue pagination cursor repeated');
    cursors.add(cursor);
  }
  throw new Error('Catalogue exceeded bounded pagination budget');
}

/** A caller may leave a shared request without aborting the other callers. */
function forCaller<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  check(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? cancelled()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then((value) => { cleanup(); if (signal.aborted) reject(signal.reason ?? cancelled()); else resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

function diskWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(null); });
  });
}

export function createSetFactsReader(options: {
  store: () => Promise<SetFactsStore | null>;
  now?: () => number;
  ttlMs?: number;
  diskBudgetMs?: number;
  networkTimeoutMs?: number;
}) {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? TTL_MS;
  const memory = new Map<string, { snapshot: SetFactsSnapshot; bytes: number }>();
  const inflight = new Map<string, { namespace: string; controller: AbortController; promise: Promise<SetFactsResult> }>();
  const generations = new Map<string, number>();
  const bypassDisk = new Set<string>();
  let bytes = 0;
  let persistence: Promise<void> = Promise.resolve();
  const epoch = (namespace: string) => generations.get(namespace) ?? 0;
  const remove = (key: string) => { const old = memory.get(key); if (old) bytes -= old.bytes; memory.delete(key); };
  const queue = (work: () => Promise<void>) => { persistence = persistence.then(work).catch(() => undefined); };
  const remember = (key: string, snapshot: SetFactsSnapshot) => {
    const size = JSON.stringify(snapshot).length * 2;
    if (size > MAX_ENTRY_BYTES) return false;
    remove(key);
    while (memory.size >= MAX_ENTRIES || bytes + size > MAX_CACHE_BYTES) {
      const first = memory.keys().next().value;
      if (!first) break;
      remove(first);
    }
    memory.set(key, { snapshot, bytes: size }); bytes += size;
    return true;
  };
  const acceptable = (value: unknown, key: SetFactsKey): SetFactsSnapshot | null => {
    try {
      const snapshot = value as SetFactsSnapshot;
      if (!snapshot || snapshot.schema !== 1 || snapshot.namespace !== key.namespace || snapshot.setId !== key.setId
        || snapshot.language !== key.language || snapshot.expectedCount !== key.expectedCount || !Number.isFinite(snapshot.fetchedAt)
        || snapshot.fetchedAt > now() || now() - snapshot.fetchedAt >= ttl) return null;
      validateCompleteSet(snapshot.cards, key);
      return { ...key, schema: 1, fetchedAt: snapshot.fetchedAt, cards: snapshot.cards.map(publicSetCardFacts) };
    } catch { return null; }
  };
  const result = (snapshot: SetFactsSnapshot, source: SetFactsResult['source']): SetFactsResult => ({
    setId: snapshot.setId, cards: snapshot.cards.map(publicSetCardFacts), fetchedAt: snapshot.fetchedAt, source,
  });
  return {
    read(key: SetFactsKey, load: (signal: AbortSignal) => Promise<StackrCard[]>, signal?: AbortSignal): Promise<SetFactsResult> {
      check(signal);
      const id = keyOf(key);
      const cached = memory.get(id)?.snapshot;
      if (cached && now() >= cached.fetchedAt && now() - cached.fetchedAt < ttl) {
        const entry = memory.get(id)!; memory.delete(id); memory.set(id, entry);
        return forCaller(Promise.resolve(result(cached, 'memory')), signal);
      }
      remove(id);
      const joined = inflight.get(id);
      if (joined) return forCaller(joined.promise, signal);
      const generation = epoch(key.namespace);
      const controller = new AbortController();
      const current = () => { check(controller.signal); if (epoch(key.namespace) !== generation) throw cancelled(); };
      const promise = (async (): Promise<SetFactsResult> => {
        if (!bypassDisk.has(key.namespace)) {
          const stored = await diskWithin(options.store().then((store) => store?.read(key) ?? null), options.diskBudgetMs ?? 25);
          current();
          const snapshot = acceptable(stored, key);
          if (snapshot) { remember(id, snapshot); return result(snapshot, 'disk'); }
        }
        const deadline = setTimeout(() => controller.abort(new Error('Catalogue network deadline exceeded')), options.networkTimeoutMs ?? 8000);
        let cards: StackrCard[];
        try { cards = await forCaller(Promise.resolve().then(() => load(controller.signal)), controller.signal); }
        finally { clearTimeout(deadline); }
        current();
        validateCompleteSet(cards, key);
        const snapshot: SetFactsSnapshot = { ...key, schema: 1, fetchedAt: now(), cards: cards.map(publicSetCardFacts) };
        if (remember(id, snapshot)) queue(async () => {
          const store = await options.store();
          if (store && epoch(key.namespace) === generation) await store.write(snapshot);
        });
        return result(snapshot, 'network');
      })();
      const entry = { namespace: key.namespace, controller, promise };
      inflight.set(id, entry);
      void promise.finally(() => { if (inflight.get(id) === entry) inflight.delete(id); }).catch(() => undefined);
      return forCaller(promise, signal);
    },
    invalidate(namespace: string) {
      generations.set(namespace, epoch(namespace) + 1);
      // Until process restart, explicit refresh bypasses old disk data. Network results remain memory cached.
      bypassDisk.add(namespace);
      for (const [id, entry] of memory) if (entry.snapshot.namespace === namespace) remove(id);
      for (const [id, entry] of inflight) if (entry.namespace === namespace) { entry.controller.abort(cancelled()); inflight.delete(id); }
      queue(async () => { await (await options.store())?.clear(namespace); });
    },
    async flush() { await persistence; },
  };
}

/** Image-only merge: current ownership, quantity, grading, ordering and pricing always win. */
export function mergeBinderArtwork<T extends { id: string; card_id: string; set_id: string; language?: string | null; card?: any; image_url?: string | null }>(current: T[], incoming: T[]): T[] {
  const identity = (row: T): string | null => {
    const card = row.card;
    const raw = card?.raw_data?.stackr;
    const cardId = raw?.cardId ?? card?.id;
    const variantId = raw?.defaultVariantId ?? card?.externalIds?.stackrVariant;
    if (!UUID.test(cardId ?? '') || !UUID.test(variantId ?? '') || !row.language) return null;
    return JSON.stringify([row.id, row.set_id, card?.set?.id ?? row.set_id, row.language, cardId, variantId]);
  };
  const artwork = new Map<string, T>();
  for (const row of incoming) { const key = identity(row); if (key) artwork.set(key, row); }
  return current.map((row) => {
    const key = identity(row);
    const enriched = key ? artwork.get(key) : null;
    if (!enriched) return row;
    const small = enriched.card?.images?.small;
    const large = enriched.card?.images?.large;
    if (!small && !large) return row;
    const card = { ...row.card, images: { ...row.card?.images, small: small ?? row.card?.images?.small, large: large ?? row.card?.images?.large } };
    // Preserve display-only provider overlays instead of making them serializable.
    if (Object.getOwnPropertyDescriptor(enriched.card, 'images')?.enumerable === false) {
      Object.defineProperty(card, 'images', { value: card.images, enumerable: false, configurable: true, writable: false });
    }
    return { ...row, card };
  });
}
