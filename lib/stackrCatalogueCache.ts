import type {
  StackrApiClient,
  StackrApiLanguageCode,
  StackrCard,
  StackrCardVariant,
  StackrCatalogueManifest,
  StackrDeltaChange,
  StackrSet,
} from './stackrApiV1';

declare const require: ((id: string) => any) | undefined;

export const STACKR_CATALOGUE_CACHE_SCHEMA_VERSION = 'stackr-mobile-catalogue-cache-v1';

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
  findExactIdentities(input: StackrCatalogueLookupInput): Promise<StackrCachedCardIdentity[]>;
  enqueueOfflineScan(scan: StackrQueuedOfflineScan): Promise<void>;
  listOfflineScans(): Promise<StackrQueuedOfflineScan[]>;
  snapshot?(): StackrCatalogueStoreSnapshot;
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
    imageSmall: null,
    imageLarge: null,
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
  const writeKey = async (key: keyof StackrCatalogueStoreSnapshot, value: unknown) => {
    await execAsync(
      'insert or replace into stackr_cache (key, payload) values (?, ?)',
      [key, JSON.stringify(value)]
    );
  };

  const memory = createInMemoryStackrCatalogueStore(await readSnapshot());
  const persist = async () => {
    const snapshot = memory.snapshot?.();
    if (!snapshot) return;
    await writeKey('manifest', snapshot.manifest);
    await writeKey('sets', snapshot.sets);
    await writeKey('cards', snapshot.cards);
    await writeKey('variants', snapshot.variants);
    await writeKey('aliases', snapshot.aliases);
    await writeKey('externalIds', snapshot.externalIds);
    await writeKey('pendingScans', snapshot.pendingScans);
  };

  return {
    ...memory,
    async transaction(work) {
      const result = await memory.transaction(work);
      await persist();
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
}) {
  const cache = input.cache ?? await getPersistentStackrCatalogueCache();
  if (!cache) return { status: 'sqlite_unavailable' as const };

  const current = await cache.getManifest();
  try {
    const manifestEnvelope = await input.client.catalogManifest(current?.etag ?? undefined);
    const manifest = manifestEnvelope.data;
    if (!current) {
      return {
        status: 'manifest_loaded' as const,
        manifest,
        requiresBootstrap: true,
      };
    }
    const deltaEnvelope = await input.client.catalogDelta({
      since: current.latestChangeSequence,
      limit: 500,
    });
    await cache.applyDelta(deltaEnvelope.data.changes);
    return {
      status: 'delta_applied' as const,
      latestChangeSequence: deltaEnvelope.data.changes.at(-1)?.sequence ?? current.latestChangeSequence,
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
    name: card.englishDisplayName ?? card.nativeName,
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
      reasons: ['exact_cached_identity'],
    },
  };
}
