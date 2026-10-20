import type { StackrCataloguePricePage, StackrCataloguePriceRow } from './stackrApiV1';

export type PriceCacheStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
type Entry = { row: StackrCataloguePriceRow; checkedAt: number; retryAfter: number; refreshFailed?: boolean };
type FetchPage = (references: string[], knownRevisions: Record<string, string>) => Promise<StackrCataloguePricePage>;
export class CataloguePricePartialReadError extends Error {
  readonly code = 'catalogue_price_partial_read';
  constructor(readonly readErrors: { reference: string; code: string }[]) {
    super('Some stored catalogue prices could not be read.');
  }
}
function fatalReadError(error: unknown) {
  const failure = error as { status?: number; code?: string } | null;
  return [400, 401, 403, 404, 405, 501].includes(failure?.status ?? 0)
    || failure?.code === 'pricing_account_changed';
}
const PREFIX = 'stackr:catalogue-prices:v1:';
const FRESH_MS = 5 * 60_000;
const FAILURE_BACKOFF_MS = 30_000;
const MAX_SHARD_ENTRIES = 256;
const MAX_MEMORY_ENTRIES = 3000;
const SHARDS = 32;

function bucket(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash * 31) + value.charCodeAt(i)) >>> 0;
  return hash % SHARDS;
}

function validRow(row: StackrCataloguePriceRow, reference: string) {
  return row?.reference === reference && /^[a-f0-9]{64}$/.test(row.revision ?? '')
    && (row.price == null || (row.price.variantId === row.variantId && row.price.currency === 'GBP'
      && row.price.productType === 'raw_card' && row.price.estimates != null
      && (row.price.estimates.central == null || (Number.isFinite(row.price.estimates.central) && row.price.estimates.central >= 0))));
}

/** Stored raw quotes only. Scopes include account, server, language and estimate mode.
 * Disk shards survive restarts; errors never replace a valid quote with null. */
export class CataloguePriceCache {
  private memory = new Map<string, Entry>();
  private loads = new Map<string, Promise<void>>();
  private inflight = new Map<string, Promise<void>>();
  private pendingReferences = new Map<string, Promise<void>>();
  private listeners = new Set<(scope: string, references: string[]) => void>();
  private writes: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(private storage: PriceCacheStorage, private now: () => number = Date.now) {}

  private key(scope: string, reference: string) { return `${scope}\n${reference}`; }
  private shard(scope: string, reference: string) { return `${PREFIX}${encodeURIComponent(scope)}:${bucket(reference)}`; }

  private remember(scope: string, reference: string, entry: Entry) {
    const key = this.key(scope, reference);
    this.memory.delete(key);
    this.memory.set(key, entry);
    while (this.memory.size > MAX_MEMORY_ENTRIES) this.memory.delete(this.memory.keys().next().value!);
  }

  private async hydrate(scope: string, references: string[]) {
    const generation = this.generation;
    // Re-read evicted shards on demand rather than assuming hydrated means resident.
    const shards = new Set(references.filter((ref) => !this.memory.has(this.key(scope, ref))).map((ref) => this.shard(scope, ref)));
    await Promise.all([...shards].map(async (key) => {
      const existing = this.loads.get(key);
      if (existing) return existing;
      const work = (async () => {
        try {
          const raw = await this.storage.getItem(key);
          const values: Record<string, Entry> = raw ? JSON.parse(raw) : {};
          if (!values || typeof values !== 'object' || Array.isArray(values)) return;
          if (generation !== this.generation) return;
          for (const [ref, entry] of Object.entries(values).slice(-MAX_SHARD_ENTRIES)) {
            if (validRow(entry?.row, ref) && Number.isFinite(entry.checkedAt) && Number.isFinite(entry.retryAfter)
              && !this.memory.has(this.key(scope, ref))) this.remember(scope, ref, entry);
          }
        } catch { /* A corrupt/unavailable disk cache is a miss, never a pricing error. */ }
      })();
      this.loads.set(key, work);
      try { await work; } finally { if (this.loads.get(key) === work) this.loads.delete(key); }
    }));
  }

  private persist(scope: string, references: string[], generation: number) {
    const changed = new Map<string, Record<string, Entry>>();
    for (const ref of references) {
      const entry = this.memory.get(this.key(scope, ref));
      if (!entry) continue;
      const key = this.shard(scope, ref);
      const values = changed.get(key) ?? {};
      values[ref] = entry;
      changed.set(key, values);
    }
    // Serialize read/merge/write to prevent overlapping pages losing each other's rows.
    this.writes = this.writes.then(async () => {
      if (generation !== this.generation) return;
      for (const [key, entries] of changed) {
        try {
          const raw = await this.storage.getItem(key);
          let previous: Record<string, Entry> = {};
          try { previous = raw ? JSON.parse(raw) : {}; } catch { /* Replace corrupt shard. */ }
          if (!previous || typeof previous !== 'object' || Array.isArray(previous)) previous = {};
          const merged = Object.entries({ ...previous, ...entries })
            .filter(([ref, entry]) => validRow(entry?.row, ref))
            .sort((a, b) => b[1].checkedAt - a[1].checkedAt).slice(0, MAX_SHARD_ENTRIES);
          if (generation === this.generation) await this.storage.setItem(key, JSON.stringify(Object.fromEntries(merged)));
        } catch { /* Keep the memory result if persistence is unavailable. */ }
      }
    }).catch(() => undefined);
  }

  peek(scope: string, references: string[]) {
    const result = new Map<string, StackrCataloguePriceRow>();
    for (const ref of references) {
      const entry = this.memory.get(this.key(scope, ref));
      if (!entry) continue;
      let price = entry.row.price;
      if (price && (entry.refreshFailed || (price.staleAfter != null && Date.parse(price.staleAfter) <= this.now()))) {
        price = { ...price, freshness: 'stale' };
      }
      result.set(ref, { ...entry.row, price });
    }
    return result;
  }

  subscribe(listener: (scope: string, references: string[]) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(scope: string, references: string[]) {
    for (const listener of this.listeners) {
      try { listener(scope, references); } catch { /* A screen listener cannot fail a cache update. */ }
    }
  }

  private async refresh(scope: string, references: string[], fetchPage: FetchPage) {
    const shared = [...new Set(references.flatMap((ref) => {
      const pending = this.pendingReferences.get(this.key(scope, ref));
      return pending ? [pending] : [];
    }))];
    references = references.filter((ref) => !this.pendingReferences.has(this.key(scope, ref)));
    if (!references.length) { await Promise.all(shared); return; }
    const key = this.key(scope, [...references].sort().join(','));
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const generation = this.generation;
    const work = (async () => {
      let partialError: CataloguePricePartialReadError | undefined;
      try {
        const knownRevisions = Object.fromEntries(references.flatMap((ref) => {
          const entry = this.memory.get(this.key(scope, ref));
          return entry ? [[ref, entry.row.revision]] : [];
        }));
        const page = await fetchPage(references, knownRevisions);
        const returned = new Map(page.prices.map((row) => [row.reference, row]));
        const unchanged = new Set(page.unchangedReferences);
        const errors = page.readErrors ?? [];
        if (!Array.isArray(errors)) throw new Error('Invalid catalogue price errors.');
        const failed = new Map(errors.map(error => [error?.reference, error]));
        // Partial/malformed pages must not advance checkpoints or erase valid data.
        if (page.prices.length !== returned.size || page.unchangedReferences.length !== unchanged.size
          || errors.length !== failed.size || returned.size + unchanged.size + failed.size !== references.length
          || page.prices.some((row) => !references.includes(row.reference) || unchanged.has(row.reference) || failed.has(row.reference) || !validRow(row, row.reference))
          || [...unchanged].some((ref) => !references.includes(ref) || failed.has(ref) || !knownRevisions[ref])
          || errors.some(error => !references.includes(error?.reference) || !/^[A-Za-z0-9._-]{1,80}$/.test(error?.code ?? ''))) throw new Error('Incomplete catalogue price page.');
        if (generation !== this.generation) return;
        for (const ref of references) {
          const previous = this.memory.get(this.key(scope, ref));
          if (failed.has(ref)) {
            if (previous) this.remember(scope, ref, { ...previous, retryAfter: this.now() + FAILURE_BACKOFF_MS, refreshFailed: true });
            continue;
          }
          const row = returned.get(ref) ?? previous!.row;
          const retryDate = Date.parse(row.nextRetryAt ?? '');
          const unavailable = row.price?.estimates.central == null;
          this.remember(scope, ref, { row, checkedAt: this.now(),
            retryAfter: unavailable && Number.isFinite(retryDate)
              ? Math.min(this.now() + 30 * 60_000, Math.max(this.now() + FRESH_MS, retryDate)) : this.now() + FRESH_MS });
        }
        this.persist(scope, references, generation);
        this.notify(scope, references);
        if (errors.length) partialError = new CataloguePricePartialReadError(errors);
      } catch (error) {
        if (generation !== this.generation) return;
        for (const ref of references) {
          const previous = this.memory.get(this.key(scope, ref));
          if (previous) this.remember(scope, ref, { ...previous, retryAfter: this.now() + FAILURE_BACKOFF_MS, refreshFailed: true });
        }
        this.persist(scope, references, generation);
        this.notify(scope, references);
        throw error;
      }
      // Successful rows were committed above. Surface partial failure without
      // running the whole-page catch and marking those successful rows failed.
      if (partialError) throw partialError;
    })();
    this.inflight.set(key, work);
    for (const ref of references) this.pendingReferences.set(this.key(scope, ref), work);
    try { await Promise.all([...shared, work]); } finally {
      if (this.inflight.get(key) === work) this.inflight.delete(key);
      for (const ref of references) {
        if (this.pendingReferences.get(this.key(scope, ref)) === work) this.pendingReferences.delete(this.key(scope, ref));
      }
    }
  }

  async read(scope: string, references: string[], fetchPage: FetchPage, force = false) {
    const refs = [...new Set(references)];
    if (!refs.length) return new Map<string, StackrCataloguePriceRow>();
    const coordinatePages = refs.length > 100;
    const generation = this.generation;
    const assertGeneration = () => {
      if (generation !== this.generation) throw Object.assign(new Error('Catalogue price cache changed during the read.'),
        { code: 'catalogue_price_read_cancelled' });
    };
    const partialErrors = new Map<string, { reference: string; code: string }>();
    await this.hydrate(scope, refs);
    assertGeneration();
    this.notify(scope, refs);
    for (let offset = 0; offset < refs.length; offset += 100) {
      assertGeneration();
      const page = refs.slice(offset, offset + 100);
      const due = page.filter((ref) => force || (this.memory.get(this.key(scope, ref))?.retryAfter ?? 0) <= this.now());
      if (!due.length) continue;
      const hasMissing = due.some((ref) => !this.memory.has(this.key(scope, ref)));
      const refresh = this.refresh(scope, due, fetchPage);
      // Multi-page callers must observe a due cached page's fatal failure before
      // issuing the next page. Single-page cached reads still refresh in background.
      if (force || hasMissing || coordinatePages) {
        try { await refresh; } catch (error) {
          if (error instanceof CataloguePricePartialReadError) {
            // A completed partial batch has already committed its good rows.
            // Continue independent batches, then report the combined failures.
            for (const failure of error.readErrors) if (refs.includes(failure.reference)) partialErrors.set(failure.reference, failure);
          } else if (fatalReadError(error) || force || !this.peek(scope, page).size) throw error;
        }
        assertGeneration();
      }
      else void refresh.catch(() => undefined);
    }
    assertGeneration();
    if (partialErrors.size) throw new CataloguePricePartialReadError([...partialErrors.values()]);
    return this.peek(scope, refs);
  }

  /** Used by restart tests and storage lifecycle callers; does not erase disk. */
  async flush() { await this.writes; }

  clearMemory() {
    this.generation++;
    this.memory.clear(); this.loads.clear(); this.inflight.clear(); this.pendingReferences.clear();
  }
}
