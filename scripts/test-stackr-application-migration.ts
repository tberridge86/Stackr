import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  STACKR_LEGACY_CACHE_BACKUP_KEY,
  STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY,
  activateLegacyCatalogueCacheMigration,
  getLegacyCacheMigrationState,
  prepareLegacyCatalogueCacheMigration,
  rollbackLegacyCatalogueCacheMigration,
  type LegacyCacheStorage,
} from '../lib/stackrLegacyCacheMigration';

class MemoryStorage implements LegacyCacheStorage {
  readonly values = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value);
  }

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async multiGet(keys: readonly string[]) {
    return keys.map((key) => [key, this.values.get(key) ?? null] as [string, string | null]);
  }

  async multiSet(entries: readonly [string, string][]) {
    for (const [key, value] of entries) this.values.set(key, value);
  }

  async multiRemove(keys: readonly string[]) {
    for (const key of keys) this.values.delete(key);
  }
}

async function cacheMigrationIsReversibleAndIsolated() {
  const storage = new MemoryStorage({
    'stackr:local-card-index-built-at:v2': '123',
    'stackr:local-card-index-chunks:v2': '2',
    'stackr:local-card-index-chunk:v2:0': '[{"id":"legacy-a"}]',
    'stackr:local-card-index-chunk:v2:1': '[{"id":"legacy-b"}]',
    'stackr:home-collection-cache:v1': '{"owned":7}',
    'stackr:listing-draft:v1': '{"title":"keep me"}',
  });

  const prepared = await prepareLegacyCatalogueCacheMigration({
    storage,
    operationId: 'catalogue:test-v1',
    now: () => '2026-07-28T10:00:00.000Z',
  });
  assert.equal(prepared.status, 'prepared');
  assert.equal(storage.values.has('stackr:local-card-index-chunk:v2:0'), true);
  assert.equal(storage.values.has(STACKR_LEGACY_CACHE_BACKUP_KEY), true);

  await assert.rejects(() => activateLegacyCatalogueCacheMigration({
    storage,
    operationId: 'catalogue:test-v1',
    activeCatalogueVersion: null,
  }), /verified active Stackr catalogue/);

  const activated = await activateLegacyCatalogueCacheMigration({
    storage,
    operationId: 'catalogue:test-v1',
    activeCatalogueVersion: 'test-v1',
    now: () => '2026-07-28T10:01:00.000Z',
  });
  assert.equal(activated.status, 'activated');
  assert.equal(storage.values.has('stackr:local-card-index-chunk:v2:0'), false);
  assert.equal(storage.values.get('stackr:home-collection-cache:v1'), '{"owned":7}');
  assert.equal(storage.values.get('stackr:listing-draft:v1'), '{"title":"keep me"}');

  const idempotent = await activateLegacyCatalogueCacheMigration({
    storage,
    operationId: 'catalogue:test-v1',
    activeCatalogueVersion: 'test-v1',
  });
  assert.equal(idempotent.status, 'activated');

  const rolledBack = await rollbackLegacyCatalogueCacheMigration({
    storage,
    now: () => '2026-07-28T10:02:00.000Z',
  });
  assert.equal(rolledBack.status, 'rolled_back');
  assert.equal(storage.values.get('stackr:local-card-index-chunk:v2:0'), '[{"id":"legacy-a"}]');
  assert.equal(storage.values.get('stackr:home-collection-cache:v1'), '{"owned":7}');
  assert.equal((await getLegacyCacheMigrationState(storage))?.status, 'rolled_back');
  assert.equal(storage.values.has(STACKR_LEGACY_CACHE_MIGRATION_STATE_KEY), true);
}

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(fullPath));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function clientBoundaryIsEnforced() {
  const roots = ['app', 'components', 'features'].map((folder) => path.resolve(folder));
  const files = (await Promise.all(roots.map(listSourceFiles))).flat();
  const directDomainPattern = /\.from\(['"](?:pokemon_cards|pokemon_sets|tcg_cards|tcg_sets|card_previews|market_price_snapshots|market_price_observations|market_price_estimates)['"]\)/g;
  const directProviderPattern = /(?:api\.pokemontcg\.io|api\.tcgdex\.net|api\.ebay\.com|ximilar\.com|\/api\/price\/ebay)/g;
  const allowedUiExceptions = new Map([
    [path.resolve('app/prices/index.tsx'), 'dormant'],
    [path.resolve('app/(tabs)/binder.tsx'), 'collection_tracker_parity_hold'],
  ]);
  const violations: string[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const markers = [...source.matchAll(directDomainPattern), ...source.matchAll(directProviderPattern)];
    if (!markers.length) continue;
    const exception = allowedUiExceptions.get(file);
    if (exception === 'dormant' && source.includes('if (false) {')) continue;
    if (exception === 'collection_tracker_parity_hold') {
      assert.doesNotMatch(source, directProviderPattern, 'Binder tracker parity hold must not call providers directly');
      const unexpectedTables = markers
        .map((marker) => marker[0])
        .filter((marker) => !/(?:pokemon_cards|pokemon_sets|tcg_cards|tcg_sets)/.test(marker));
      assert.deepEqual(unexpectedTables, [], 'Binder tracker parity hold may only read legacy set/card totals');
      continue;
    }
    violations.push(path.relative(process.cwd(), file));
  }

  assert.deepEqual(violations, [], `UI domain boundary violations: ${violations.join(', ')}`);

  const clientFiles = [
    ...files,
    ...await listSourceFiles(path.resolve('lib')),
  ];
  const secretPattern = /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|DATABASE_PASSWORD|EBAY_CLIENT_SECRET|XIMILAR_(?:TOKEN|KEY|SECRET))/g;
  const secretViolations: string[] = [];
  for (const file of clientFiles) {
    const source = await readFile(file, 'utf8');
    if (secretPattern.test(source)) secretViolations.push(path.relative(process.cwd(), file));
    secretPattern.lastIndex = 0;
  }
  assert.deepEqual(secretViolations, [], `Client secret references: ${secretViolations.join(', ')}`);
}

async function migrationContractIsPrivateAndReversible() {
  const migration = await readFile(
    path.resolve('supabase/migrations/20260728202949_stackr_application_migration_provider_retirement.sql'),
    'utf8',
  );
  const rollback = await readFile(
    path.resolve('supabase/manual/rollback_20260728202949_stackr_application_migration_provider_retirement.sql'),
    'utf8',
  );
  assert.match(migration, /status in \('pending', 'mapped', 'quarantined', 'applied', 'rolled_back', 'superseded'\)/);
  assert.match(migration, /status <> 'quarantined' or quarantine_reason is not null/);
  assert.match(migration, /unique \(scan_id, primary_engine, shadow_engine\)/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on table audit\.application_identity_migrations from anon, authenticated/);
  assert.doesNotMatch(migration, /grant .* to (?:anon|authenticated)/i);
  assert.match(rollback, /rollback blocked: applied identity mappings/i);
  assert.match(rollback, /drop table if exists audit\.application_identity_migrations/);
}

async function run() {
  await cacheMigrationIsReversibleAndIsolated();
  await clientBoundaryIsEnforced();
  await migrationContractIsPrivateAndReversible();
  console.log('stackr application migration checks passed');
}

void run();
