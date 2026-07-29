export const STACKR_LEGACY_CACHE_MIGRATION_VERSION = 1;
export const STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY = 'stackr:catalogue-cache-migration:v1';
export const STACKR_LEGACY_CACHE_BACKUP_KEY = 'stackr:catalogue-cache-migration-backup:v1';

const LEGACY_INDEX_KEY = 'stackr:local-card-index:v2';
const LEGACY_INDEX_BUILT_AT_KEY = 'stackr:local-card-index-built-at:v2';
const LEGACY_INDEX_CHUNK_COUNT_KEY = 'stackr:local-card-index-chunks:v2';
const LEGACY_INDEX_CHUNK_PREFIX = 'stackr:local-card-index-chunk:v2:';

export type LegacyCacheMigrationStatus = 'prepared' | 'activated' | 'rolled_back';

export type LegacyCacheMigrationState = {
  version: 1;
  operationId: string;
  status: LegacyCacheMigrationStatus;
  legacyKeys: string[];
  preparedAt: string;
  activatedAt: string | null;
  rolledBackAt: string | null;
};

export type LegacyCacheStorage = {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly [string, string | null][]>;
  multiSet(entries: readonly [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
};

function parseState(raw: string | null): LegacyCacheMigrationState | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<LegacyCacheMigrationState>;
  if (value.version !== STACKR_LEGACY_CACHE_MIGRATION_VERSION) return null;
  if (!['prepared', 'activated', 'rolled_back'].includes(String(value.status))) return null;
  if (!value.operationId || !Array.isArray(value.legacyKeys) || !value.preparedAt) return null;
  return value as LegacyCacheMigrationState;
}

function parseBackup(raw: string | null): [string, string][] {
  if (!raw) return [];
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) throw new Error('Legacy catalogue cache backup is malformed.');
  return value.filter((entry): entry is [string, string] => (
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === 'string'
    && typeof entry[1] === 'string'
  ));
}

async function legacyIndexKeys(storage: LegacyCacheStorage) {
  const chunkCountRaw = await storage.getItem(LEGACY_INDEX_CHUNK_COUNT_KEY);
  const chunkCount = Math.max(0, Math.min(10000, Number(chunkCountRaw) || 0));
  return [
    LEGACY_INDEX_KEY,
    LEGACY_INDEX_BUILT_AT_KEY,
    LEGACY_INDEX_CHUNK_COUNT_KEY,
    ...Array.from({ length: chunkCount }, (_, index) => `${LEGACY_INDEX_CHUNK_PREFIX}${index}`),
  ];
}

export async function getLegacyCacheMigrationState(storage: LegacyCacheStorage) {
  return parseState(await storage.getItem(STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY));
}

export async function prepareLegacyCatalogueCacheMigration(input: {
  storage: LegacyCacheStorage;
  operationId: string;
  now?: () => string;
}) {
  const existing = await getLegacyCacheMigrationState(input.storage);
  if (existing?.status === 'activated') return existing;
  if (existing?.status === 'prepared' && existing.operationId === input.operationId) return existing;

  const keys = await legacyIndexKeys(input.storage);
  const rows = await input.storage.multiGet(keys);
  const backup = rows.filter((entry): entry is [string, string] => entry[1] != null);
  const prepared: LegacyCacheMigrationState = {
    version: STACKR_LEGACY_CACHE_MIGRATION_VERSION,
    operationId: input.operationId,
    status: 'prepared',
    legacyKeys: keys,
    preparedAt: input.now?.() ?? new Date().toISOString(),
    activatedAt: null,
    rolledBackAt: null,
  };

  await input.storage.multiSet([
    [STACKR_LEGACY_CACHE_BACKUP_KEY, JSON.stringify(backup)],
    [STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY, JSON.stringify(prepared)],
  ]);
  return prepared;
}

export async function activateLegacyCatalogueCacheMigration(input: {
  storage: LegacyCacheStorage;
  operationId: string;
  activeCatalogueVersion: string | null;
  now?: () => string;
}) {
  if (!input.activeCatalogueVersion) {
    throw new Error('A verified active Stackr catalogue is required before retiring the legacy cache.');
  }
  const state = await getLegacyCacheMigrationState(input.storage);
  if (!state) throw new Error('Legacy catalogue cache migration must be prepared before activation.');
  if (state.operationId !== input.operationId) {
    throw new Error('Legacy catalogue cache migration operation does not match the prepared backup.');
  }
  if (state.status === 'activated') return state;
  if (state.status !== 'prepared') throw new Error(`Legacy catalogue cache migration is ${state.status}.`);

  await input.storage.multiRemove(state.legacyKeys);
  const activated: LegacyCacheMigrationState = {
    ...state,
    status: 'activated',
    activatedAt: input.now?.() ?? new Date().toISOString(),
    rolledBackAt: null,
  };
  await input.storage.multiSet([
    [STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY, JSON.stringify(activated)],
  ]);
  return activated;
}

export async function rollbackLegacyCatalogueCacheMigration(input: {
  storage: LegacyCacheStorage;
  now?: () => string;
}) {
  const state = await getLegacyCacheMigrationState(input.storage);
  if (!state) throw new Error('No legacy catalogue cache migration is available to roll back.');
  const backup = parseBackup(await input.storage.getItem(STACKR_LEGACY_CACHE_BACKUP_KEY));
  if (backup.length) await input.storage.multiSet(backup);
  const rolledBack: LegacyCacheMigrationState = {
    ...state,
    status: 'rolled_back',
    rolledBackAt: input.now?.() ?? new Date().toISOString(),
  };
  await input.storage.multiSet([
    [STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY, JSON.stringify(rolledBack)],
  ]);
  return rolledBack;
}
