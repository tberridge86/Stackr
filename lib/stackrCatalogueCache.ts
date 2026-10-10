import type { SetFactsKey, SetFactsSnapshot, SetFactsStore } from './stackrSetRetrieval';
import type {
  StackrApiClient,
  StackrApiLanguageCode,
  StackrCard,
  StackrCardVariant,
  StackrCatalogueManifest,
  StackrDeltaChange,
  StackrSet,
} from './stackrApiV1';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  activateLegacyCatalogueCacheMigration,
  prepareLegacyCatalogueCacheMigration,
  type LegacyCacheStorage,
} from './stackrLegacyCacheMigration';

declare const require: ((id: string) => any) | undefined;

export const STACKR_CATALOGUE_CACHE_SCHEMA_VERSION = 'stackr-mobile-catalogue-cache-v1';
// Exact reviewed false zh-cn sets. Replay even when an older app already consumed
// their delta cursor without removing rows. This touches catalogue cache only.
export const RETIRED_CHINESE_DUPLICATE_SET_IDS = [
  '1dbfe92e-8914-49b2-974c-47683cf51d4d', '4719ccc9-35c0-406a-b2c2-989af15d77b0',
  '66d9e865-7d40-4b2e-8ef0-ae24fca87673', 'a16f8d4c-d648-4bee-a219-9abc2aae49a6',
  'b67bee5b-da76-4575-a263-ab9cb69d4d7b',
];

export type StackrCatalogueCacheManifest = {
  currentCatalogueVersion: string;
  catalogueVersionId: string | null;
  minCompatibleAppSchemaVersion: string;
  latestChangeSequence: number;
  activeModelVersion: string | null;
  activeIndexVersion: string | null;
  etag: string | null;
  generatedAt: string;
  activatedAt: string;
  checksum: string;
};

export type StackrCachedSet = {
  setId: string;
  game: string;
  languageCode: string;
  setCode: string | null;
  nativeName: string | null;
  englishDisplayName: string | null;
  releaseDate: string | null;
  updatedAt: string | null;
};

export type StackrCachedCardIdentity = {
  cardId: string;
  canonicalId: string | null;
  game: string;
  languageCode: string;
  setId: string;
  setCode: string | null;
  collectorNumber: string;
  collectorNumberSortKey: string | null;
  nativeName: string;
  englishDisplayName: string | null;
  defaultVariantId: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  updatedAt: string | null;
};

export type StackrCachedVariant = {
  variantId: string;
  cardId: string;
  canonicalId: string;
  variantCode: string;
  variantLabel: string | null;
  finishCode: string | null;
  finishLabel: string | null;
  artworkKey: string | null;
  updatedAt: string | null;
};

export type StackrCachedAlias = {
  aliasId: string;
  cardId: string;
  languageCode: string;
  name: string;
  nameType: string;
};

export type StackrCachedExternalId = {
  externalId: string;
  cardId: string;
  provider: string;
  providerCardId: string;
};

export type StackrQueuedOfflineScan = {
  id: string;
  createdAt: string;
  request: Record<string, unknown>;
  status: 'queued' | 'processing' | 'failed';
  attempts: number;
};

export type StackrCatalogueShard = {
  languageCode: StackrApiLanguageCode;
  generatedAt: string;
  checksum?: string | null;
  sets: StackrSet[];
  cards: StackrCard[];
  aliases?: StackrCachedAlias[];
  externalIds?: StackrCachedExternalId[];
};

export type StackrCatalogueLookupInput = {
  game?: string | null;
  languageCode?: string | null;
  setId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | number | null;
  limit?: number;
};

export type StackrCatalogueStoreSnapshot = {
  manifest: StackrCatalogueCacheManifest | null;
  sets: StackrCachedSet[];
  cards: StackrCachedCardIdentity[];
  variants: StackrCachedVariant[];
  aliases: StackrCachedAlias[];
  externalIds: StackrCachedExternalId[];
  pendingScans: StackrQueuedOfflineScan[];
};

export type StackrCatalogueStore = {
  transaction<T>(work: () => Promise<T> | T): Promise<T>;
  getManifest(): Promise<StackrCatalogueCacheManifest | null>;
  setManifest(manifest: StackrCatalogueCacheManifest): Promise<void>;
  upsertSets(sets: StackrCachedSet[]): Promise<void>;
  upsertCards(cards: StackrCachedCardIdentity[]): Promise<void>;
  upsertVariants(variants: StackrCachedVariant[]): Promise<void>;
  upsertAliases(aliases: StackrCachedAlias[]): Promise<void>;
  upsertExternalIds(externalIds: StackrCachedExternalId[]): Promise<void>;
  removeCatalogueIdentities(changes: StackrDeltaChange[]): Promise<void>;
  findExactIdentities(input: StackrCatalogueLookupInput): Promise<StackrCachedCardIdentity[]>;
  enqueueOfflineScan(scan: StackrQueuedOfflineScan): Promise<void>;
  listOfflineScans(): Promise<StackrQueuedOfflineScan[]>;
  snapshot?(): StackrCatalogueStoreSnapshot;
  restore?(snapshot: StackrCatalogueStoreSnapshot): Promise<void> | void;
};

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
  )).join(',')}}`;
}

export function calculateCatalogueChecksum(value: unknown) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function cleanString(value?: string | number | null) {
  const text = String(value ?? '').normalize('NFKC').trim();
  return text || null;
}

function normaliseSetCode(value?: string | null) {
  return cleanString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? null;
}

function normaliseCollectorNumber(value?: string | number | null) {
  return cleanString(value)?.toLowerCase().replace(/^0+(?=\d)/, '') ?? null;
}

function normaliseLanguage(value?: string | null) {
  const language = cleanString(value)?.toLowerCase();
  if (!language || language === 'unknown') return null;
  if (language === 'zh') return 'zh-Hans';
  if (language === 'zh-hans' || language === 'zh-cn') return 'zh-Hans';
  if (language === 'zh-hant' || language === 'zh-tw' || language === 'zh-hk') return 'zh-Hant';
  return language;
}

function toCachedSet(set: StackrSet): StackrCachedSet {
  return {
    setId: set.setId,
    game: set.game,
    languageCode: set.languageCode,
    setCode: set.setCode,
    nativeName: set.nativeName,
    englishDisplayName: set.englishDisplayName,
    releaseDate: set.releaseDate,
    updatedAt: set.updatedAt,
  };
}

function cardImageUrl(card: StackrCard, roles: string[]) {
  const defaultVariant = card.variants.find((variant) => variant.variantId === card.defaultVariantId)
    ?? card.variants[0];
  const image = defaultVariant?.image;
  if (!image) return null;
  for (const derivative of image.derivatives ?? []) {
    const role = cleanString(derivative.role)?.toLowerCase();
    if (role && roles.includes(role)) {
      const url = cleanString(derivative.deliveryUrl ?? derivative.deliveryPath);
      if (url) return url;
    }
  }
  return cleanString(image.deliveryUrl ?? image.deliveryPath);
}

function toCachedCard(card: StackrCard): StackrCachedCardIdentity {
  return {
    cardId: card.cardId,
    canonicalId: card.cardId,
    game: card.game,
    languageCode: card.languageCode,
    setId: card.set.setId,
    setCode: card.set.setCode,
    collectorNumber: card.collectorNumber.value,
    collectorNumberSortKey: card.collectorNumber.sortKey,
    nativeName: card.names.native,
    englishDisplayName: card.names.englishDisplay,
    defaultVariantId: card.defaultVariantId,
    imageSmall: cardImageUrl(card, ['card-grid', 'search-result']),
    imageLarge: cardImageUrl(card, ['detail-page']),
    updatedAt: card.updatedAt,
  };
}

function toCachedVariant(cardId: string, variant: StackrCardVariant): StackrCachedVariant {
  return {
    variantId: variant.variantId,
    cardId,
    canonicalId: variant.canonicalId,
    variantCode: variant.variantCode,
    variantLabel: variant.variantLabel,
    finishCode: variant.finishCode,
    finishLabel: variant.finishLabel,
    artworkKey: variant.artworkKey,
    updatedAt: variant.updatedAt,
  };
}

function cloneSnapshot(snapshot: StackrCatalogueStoreSnapshot): StackrCatalogueStoreSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as StackrCatalogueStoreSnapshot;
}

function upsertByKey<T>(rows: T[], incoming: T[], key: keyof T) {
  const byKey = new Map(rows.map((row) => [String(row[key]), row]));
  for (const row of incoming) byKey.set(String(row[key]), row);
  return [...byKey.values()];
}

export function createInMemoryStackrCatalogueStore(
  seed: Partial<StackrCatalogueStoreSnapshot> = {}
): StackrCatalogueStore {
  let state: StackrCatalogueStoreSnapshot = {
    manifest: seed.manifest ?? null,
    sets: seed.sets ?? [],
    cards: seed.cards ?? [],
    variants: seed.variants ?? [],
    aliases: seed.aliases ?? [],
    externalIds: seed.externalIds ?? [],
    pendingScans: seed.pendingScans ?? [],
  };

  return {
    async transaction(work) {
      const before = cloneSnapshot(state);
      try {
        return await work();
      } catch (error) {
        state = before;
        throw error;
      }
    },
    async getManifest() {
      return state.manifest;
    },
    async setManifest(manifest) {
      state.manifest = manifest;
    },
    async upsertSets(sets) {
      state.sets = upsertByKey(state.sets, sets, 'setId');
    },
    async upsertCards(cards) {
      state.cards = upsertByKey(state.cards, cards, 'cardId');
    },
    async upsertVariants(variants) {
      state.variants = upsertByKey(state.variants, variants, 'variantId');
    },
    async upsertAliases(aliases) {
      state.aliases = upsertByKey(state.aliases, aliases, 'aliasId');
    },
    async upsertExternalIds(externalIds) {
      state.externalIds = upsertByKey(state.externalIds, externalIds, 'externalId');
    },
    async removeCatalogueIdentities(changes) {
      const removedSets = new Set(changes.filter(c => ['sets', 'set'].includes(c.entityType)).map(c => c.entityId));
      const removedCards = new Set(changes.filter(c => ['card-printings', 'card_printings', 'card', 'printing'].includes(c.entityType)).map(c => c.entityId));
      const removedVariants = new Set(changes.filter(c => ['card-variants', 'card_variants', 'variant'].includes(c.entityType)).map(c => c.entityId));
      for (const card of state.cards) if (removedSets.has(card.setId)) removedCards.add(card.cardId);
      state.sets = state.sets.filter(row => !removedSets.has(row.setId));
      state.cards = state.cards.filter(row => !removedCards.has(row.cardId)).map(row =>
        removedVariants.has(row.defaultVariantId ?? '') ? { ...row, defaultVariantId: null, imageSmall: null, imageLarge: null } : row);
      state.variants = state.variants.filter(row => !removedCards.has(row.cardId) && !removedVariants.has(row.variantId));
      state.aliases = state.aliases.filter(row => !removedCards.has(row.cardId));
      state.externalIds = state.externalIds.filter(row => !removedCards.has(row.cardId));
    },
    async findExactIdentities(input) {
      const language = normaliseLanguage(input.languageCode);
      const setCode = normaliseSetCode(input.setCode);
      const collectorNumber = normaliseCollectorNumber(input.collectorNumber);
      const game = cleanString(input.game)?.toLowerCase() ?? null;
      const limit = Math.max(1, Math.min(20, Number(input.limit ?? 5) || 5));
      if (!collectorNumber) return [];

      return state.cards.filter((card) => {
        if (game && card.game.toLowerCase() !== game) return false;
        if (language && normaliseLanguage(card.languageCode) !== language) return false;
        if (input.setId && card.setId !== input.setId) return false;
        if (setCode && normaliseSetCode(card.setCode) !== setCode) return false;
        return normaliseCollectorNumber(card.collectorNumber) === collectorNumber;
      }).slice(0, limit);
    },
    async enqueueOfflineScan(scan) {
      state.pendingScans = upsertByKey(state.pendingScans, [scan], 'id');
    },
    async listOfflineScans() {
      return state.pendingScans;
    },
    snapshot() {
      return cloneSnapshot(state);
    },
    restore(snapshot) {
      state = cloneSnapshot(snapshot);
    },
  };
}

function getOptionalExpoSqlite() {
  try {
    return typeof require === 'function' ? require('expo-sqlite') : null;
  } catch {
    return null;
  }
}

export async function createExpoSqliteStackrCatalogueStore(): Promise<StackrCatalogueStore> {
  const sqlite = getOptionalExpoSqlite();
  if (!sqlite) {
    throw new Error('STACKR_SQLITE_UNAVAILABLE: install expo-sqlite to enable the persistent Stackr catalogue cache.');
  }

  const db = sqlite.openDatabaseSync
    ? sqlite.openDatabaseSync('stackr_catalogue_cache.db')
    : await sqlite.openDatabaseAsync('stackr_catalogue_cache.db');
  const execAsync = async (sql: string, params: unknown[] = []) => {
    if (db.runAsync) return db.runAsync(sql, params);
    return new Promise<void>((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(sql, params, () => resolve(), (_: unknown, error: Error) => {
          reject(error);
          return false;
        });
      });
    });
  };
  const getAllAsync = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    if (db.getAllAsync) return db.getAllAsync(sql, params);
    return new Promise<T[]>((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(sql, params, (_: unknown, result: { rows: { _array?: T[] } }) => {
          resolve(result.rows._array ?? []);
        }, (_: unknown, error: Error) => {
          reject(error);
          return false;
        });
      });
    });
  };

  await execAsync('create table if not exists stackr_cache (key text primary key, payload text not null)');

  const readSnapshot = async (): Promise<StackrCatalogueStoreSnapshot> => {
    const rows = await getAllAsync<{ key: string; payload: string }>('select key, payload from stackr_cache');
    const parsed = new Map(rows.map((row) => [row.key, JSON.parse(row.payload)]));
    return {
      manifest: parsed.get('manifest') ?? null,
      sets: parsed.get('sets') ?? [],
      cards: parsed.get('cards') ?? [],
      variants: parsed.get('variants') ?? [],
      aliases: parsed.get('aliases') ?? [],
      externalIds: parsed.get('externalIds') ?? [],
      pendingScans: parsed.get('pendingScans') ?? [],
    };
  };
  const memory = createInMemoryStackrCatalogueStore(await readSnapshot());
  const persist = async () => {
    const snapshot = memory.snapshot?.();
    if (!snapshot) return;
    const entries = Object.entries(snapshot) as [keyof StackrCatalogueStoreSnapshot, unknown][];
    if (db.withExclusiveTransactionAsync) {
      await db.withExclusiveTransactionAsync(async (transaction: any) => {
        for (const [key, value] of entries) {
          await transaction.runAsync(
            'insert or replace into stackr_cache (key, payload) values (?, ?)',
            [key, JSON.stringify(value)]
          );
        }
      });
      return;
    }

    await execAsync('begin immediate transaction');
    try {
      for (const [key, value] of entries) {
        await execAsync(
          'insert or replace into stackr_cache (key, payload) values (?, ?)',
          [key, JSON.stringify(value)]
        );
      }
      await execAsync('commit');
    } catch (error) {
      await execAsync('rollback').catch(() => undefined);
      throw error;
    }
  };

  return {
    ...memory,
    async transaction(work) {
      const before = memory.snapshot?.();
      const result = await memory.transaction(work);
      try {
        await persist();
      } catch (error) {
        if (before) await memory.restore?.(before);
        throw error;
      }
      return result;
    },
  };
}

export class StackrCatalogueCache {
  constructor(private readonly store: StackrCatalogueStore) {}

  getManifest() {
    return this.store.getManifest();
  }

  async bootstrap(input: {
    manifest: StackrCatalogueManifest;
    shards: StackrCatalogueShard[];
    expectedChecksum?: string | null;
  }) {
    const checksum = calculateCatalogueChecksum({
      manifest: input.manifest,
      shards: input.shards,
    });
    if (input.expectedChecksum && input.expectedChecksum !== checksum) {
      throw new Error(`Catalogue bootstrap checksum mismatch: expected ${input.expectedChecksum}, got ${checksum}`);
    }

    const sets = input.shards.flatMap((shard) => shard.sets.map(toCachedSet));
    const cards = input.shards.flatMap((shard) => shard.cards.map(toCachedCard));
    const variants = input.shards.flatMap((shard) => (
      shard.cards.flatMap((card) => card.variants.map((variant) => toCachedVariant(card.cardId, variant)))
    ));
    const aliases = input.shards.flatMap((shard) => shard.aliases ?? []);
    const externalIds = input.shards.flatMap((shard) => shard.externalIds ?? []);
    const cacheManifest: StackrCatalogueCacheManifest = {
      currentCatalogueVersion: input.manifest.currentCatalogueVersion,
      catalogueVersionId: input.manifest.catalogueVersionId,
      minCompatibleAppSchemaVersion: input.manifest.minCompatibleAppSchemaVersion,
      latestChangeSequence: input.manifest.latestChangeSequence,
      activeModelVersion: input.manifest.modelIndexVersion,
      activeIndexVersion: input.manifest.modelIndexVersion,
      etag: input.manifest.etag,
      generatedAt: input.manifest.generatedAt,
      activatedAt: new Date().toISOString(),
      checksum,
    };

    await this.store.transaction(async () => {
      await this.store.upsertSets(sets);
      await this.store.upsertCards(cards);
      await this.store.upsertVariants(variants);
      await this.store.upsertAliases(aliases);
      await this.store.upsertExternalIds(externalIds);
      await this.store.setManifest(cacheManifest);
    });

    return cacheManifest;
  }

  async applyDelta(changes: StackrDeltaChange[]) {
    if (!changes.length) return this.store.getManifest();
    const manifest = await this.store.getManifest();
    const latestChangeSequence = Math.max(
      manifest?.latestChangeSequence ?? 0,
      ...changes.map((change) => Number(change.sequence) || 0)
    );
    await this.store.transaction(async () => {
      await this.store.removeCatalogueIdentities(changes.filter(change =>
        change.operation === 'deprecation' || change.operation === 'delete_marker'));
      if (manifest) {
        await this.store.setManifest({
          ...manifest,
          latestChangeSequence,
          activatedAt: new Date().toISOString(),
          checksum: calculateCatalogueChecksum({ ...manifest, latestChangeSequence }),
        });
      }
    });
    return this.store.getManifest();
  }

  async retireReviewedChineseDuplicates() {
    await this.store.transaction(() => this.store.removeCatalogueIdentities(RETIRED_CHINESE_DUPLICATE_SET_IDS.map(entityId => ({
      entityId, entityType: 'sets', entityKey: entityId, sequence: 0, operation: 'deprecation',
      changedAt: '2026-10-10T00:00:00Z', summary: { reason: 'incorrect_simplified_chinese_duplicate' },
    }))));
  }

  findExactIdentities(input: StackrCatalogueLookupInput) {
    return this.store.findExactIdentities(input);
  }

  async enqueueOfflineScan(request: Record<string, unknown>) {
    const scan: StackrQueuedOfflineScan = {
      id: `offline-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      request,
      status: 'queued',
      attempts: 0,
    };
    await this.store.enqueueOfflineScan(scan);
    return scan;
  }

  listOfflineScans() {
    return this.store.listOfflineScans();
  }
}

let persistentCachePromise: Promise<StackrCatalogueCache | null> | null = null;

export async function getPersistentStackrCatalogueCache() {
  if (!persistentCachePromise) {
    persistentCachePromise = createExpoSqliteStackrCatalogueStore()
      .then((store) => new StackrCatalogueCache(store))
      .catch(() => null);
  }
  return persistentCachePromise;
}

export async function syncStackrCatalogueInBackground(input: {
  client: StackrApiClient;
  cache?: StackrCatalogueCache | null;
  legacyStorage?: LegacyCacheStorage;
}) {
  const cache = input.cache ?? await getPersistentStackrCatalogueCache();
  if (!cache) return { status: 'sqlite_unavailable' as const };

    const current = await cache.getManifest();
    await cache.retireReviewedChineseDuplicates();
  try {
    const legacyMigrationOperationId = current
      ? `catalogue:${current.currentCatalogueVersion}`
      : null;
    if (legacyMigrationOperationId) {
      await prepareLegacyCatalogueCacheMigration({
        storage: input.legacyStorage ?? AsyncStorage,
        operationId: legacyMigrationOperationId,
      });
    }
    const manifestEnvelope = await input.client.catalogManifest(current?.etag ?? undefined);
    const manifest = manifestEnvelope.data;
    if (!current) {
      return {
        status: 'manifest_loaded' as const,
        manifest,
        requiresBootstrap: true,
      };
    }
    let cursor: string | null = null;
    let latestChangeSequence = current.latestChangeSequence;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 100; page += 1) {
      const deltaEnvelope = await input.client.catalogDelta({ since: current.latestChangeSequence, cursor, limit: 500 });
      await cache.applyDelta(deltaEnvelope.data.changes);
      latestChangeSequence = (await cache.getManifest())?.latestChangeSequence ?? latestChangeSequence;
      cursor = deltaEnvelope.meta.pagination?.nextCursor ?? null;
      if (!cursor) break;
      if (seenCursors.has(cursor)) throw new Error('Catalogue delta cursor repeated');
      seenCursors.add(cursor);
      if (page === 99) throw new Error('Catalogue delta sync page limit reached; resume on next sync');
    }
    if (legacyMigrationOperationId) {
      const active = await cache.getManifest();
      await activateLegacyCatalogueCacheMigration({
        storage: input.legacyStorage ?? AsyncStorage,
        operationId: legacyMigrationOperationId,
        activeCatalogueVersion: active?.currentCatalogueVersion ?? null,
      });
    }
    return {
      status: 'delta_applied' as const,
      latestChangeSequence,
    };
  } catch (error) {
    return {
      status: 'sync_failed' as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function stackrCachedCardToIdentifiedCard(card: StackrCachedCardIdentity) {
  return {
    id: card.cardId,
    name: card.nativeName,
    number: card.collectorNumber,
    set_id: card.setId,
    set_name: card.setCode ?? card.setId,
    image_small: card.imageSmall,
    image_large: card.imageLarge,
    rarity: null,
    confidence: 0.96,
    provider: 'stackr-local-cache',
    raw: {
      stackrLocalCache: true,
      canonicalId: card.canonicalId,
      language: card.languageCode,
      local_name: card.nativeName,
      native_name: card.nativeName,
      english_display_name: card.englishDisplayName,
      reasons: ['exact_cached_identity'],
    },
  };
}


// Per-set public snapshots share the existing catalogue database, but never load
// the scanner's whole-database JSON snapshot or advance its delta cursor.
let setFactsStorePromise: Promise<SetFactsStore | null> | null = null;
export function getPersistentStackrSetFactsStore(): Promise<SetFactsStore | null> {
  if (!setFactsStorePromise) setFactsStorePromise = (async () => {
    const sqlite = getOptionalExpoSqlite();
    if (!sqlite?.openDatabaseAsync) return null;
    const db = await sqlite.openDatabaseAsync('stackr_catalogue_cache.db');
    await db.execAsync('CREATE TABLE IF NOT EXISTS stackr_set_facts_v1 (namespace TEXT NOT NULL, set_id TEXT NOT NULL, language TEXT NOT NULL, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(namespace, set_id, language))');
    return {
      async read(key: SetFactsKey) {
        const row = await db.getFirstAsync('SELECT payload FROM stackr_set_facts_v1 WHERE namespace = ? AND set_id = ? AND language = ?', [key.namespace, key.setId, key.language]);
        if (!row || row.payload.length * 2 > 2 * 1024 * 1024) return null;
        try { return JSON.parse(row.payload); } catch { return null; }
      },
      async write(snapshot: SetFactsSnapshot) {
        const payload = JSON.stringify(snapshot);
        if (payload.length * 2 > 2 * 1024 * 1024) return;
        // The mobile SDK's exclusive transaction keeps unrelated scanner writes outside this transaction.
        await db.withExclusiveTransactionAsync(async (tx: any) => {
          await tx.runAsync('INSERT OR REPLACE INTO stackr_set_facts_v1(namespace, set_id, language, fetched_at, payload) VALUES (?, ?, ?, ?, ?)', [snapshot.namespace, snapshot.setId, snapshot.language, snapshot.fetchedAt, payload]);
          await tx.runAsync('DELETE FROM stackr_set_facts_v1 WHERE rowid IN (SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (ORDER BY fetched_at DESC, rowid DESC) AS position, SUM(LENGTH(CAST(payload AS BLOB))) OVER (ORDER BY fetched_at DESC, rowid DESC ROWS UNBOUNDED PRECEDING) AS total_bytes FROM stackr_set_facts_v1) WHERE position > 24 OR total_bytes > 8388608)');
        });
      },
      async clear(namespace: string) { await db.runAsync('DELETE FROM stackr_set_facts_v1 WHERE namespace = ?', [namespace]); },
    } satisfies SetFactsStore;
  })().catch(() => null);
  return setFactsStorePromise;
}
