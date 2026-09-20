import assert from 'node:assert/strict';
import {
  createMintyPreferences,
  getMintyPersonalisationStorageKey,
  LEGACY_MINTY_PERSONALISATION_STORAGE_KEY,
  visibleMintyPreferenceSnapshot,
} from '../lib/mintyPreferences';

const values = new Map<string, string>();
let failWrites = false;
let failReads = false;
let pendingRead: { resolve: (value: string | null) => void } | null = null;
let readCount = 0;
let legacyRemoved = 0;
const storage = {
  async getItem(key: string) {
    readCount += 1;
    if (failReads) throw new Error('storage unavailable');
    if (pendingRead) return new Promise<string | null>((resolve) => { pendingRead = { resolve }; });
    return values.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    if (failWrites) throw new Error('disk full');
    values.set(key, value);
  },
  async removeItem(key: string) {
    if (key === LEGACY_MINTY_PERSONALISATION_STORAGE_KEY) legacyRemoved += 1;
    values.delete(key);
  },
};
async function main() {
  const preferences = createMintyPreferences(storage);
  await preferences.hydrate('account-a');
  assert.equal(legacyRemoved, 1, 'the old shared key is removed without being read');
  assert.equal(preferences.getSnapshot().settings.useChaseList, true);
  await preferences.save('account-a', { useChaseList: false });
  assert.equal(preferences.getSnapshot().settings.useChaseList, false, 'active settings change after storage write');
  assert.equal(JSON.parse(values.get(getMintyPersonalisationStorageKey('account-a'))!).useChaseList, false);

  await preferences.hydrate('account-b');
  assert.equal(preferences.getSnapshot().settings.useChaseList, true, 'one account cannot inherit another account preference');
  await preferences.save('account-b', { useMarketCatalysts: false });
  assert.equal(JSON.parse(values.get(getMintyPersonalisationStorageKey('account-a'))!).useMarketCatalysts, true);

  failWrites = true;
  await assert.rejects(preferences.save('account-b', { useChaseList: false }), /disk full/);
  assert.equal(preferences.getSnapshot().settings.useChaseList, true, 'failed writes cannot optimistically change Home behaviour');
  assert.match(preferences.getSnapshot().error ?? '', /could not be saved/i);
  failWrites = false;

  const foreign = visibleMintyPreferenceSnapshot(preferences.getSnapshot(), 'account-c');
  assert.equal(foreign.loaded, false, 'a newly mounted account must not briefly receive another account’s preferences');
  assert.equal(foreign.settings.useMarketCatalysts, true, 'foreign preferences are masked before hydration');

  pendingRead = { resolve: () => {} };
  const readsBeforeSameAccountMount = readCount;
  const firstLoad = preferences.hydrate('account-d');
  const secondLoad = preferences.hydrate('account-d');
  assert.equal(firstLoad, secondLoad, 'multiple mounted consumers share one account hydration');
  assert.equal(readCount, readsBeforeSameAccountMount + 1, 'same-account hydration reads storage once');
  pendingRead.resolve(JSON.stringify({ useChaseList: false }));
  pendingRead = null;
  await firstLoad;
  const beforeSaveHydrate = preferences.hydrate('account-d');
  await preferences.save('account-d', { useTradeHistory: false });
  await beforeSaveHydrate;
  assert.equal(preferences.getSnapshot().settings.useTradeHistory, false, 'a remounted same-account consumer cannot reset an in-flight save');

  failReads = true;
  await preferences.hydrate('account-read-failure');
  assert.equal(preferences.getSnapshot().loaded, false, 'unknown read failures keep controls disabled');
  assert.equal(preferences.getSnapshot().settings.personalisedInsights, false, 'unknown read failures fail closed for personalisation');
  assert.match(preferences.getSnapshot().error ?? '', /could not be loaded/i);
  failReads = false;
  await preferences.hydrate('account-read-failure', { retry: true });
  assert.equal(preferences.getSnapshot().loaded, true, 'a retry can re-enable controls after storage recovers');

  values.set(getMintyPersonalisationStorageKey('account-c'), JSON.stringify({ useChaseList: false, unknown: true }));
  await preferences.hydrate('account-c');
  assert.equal(preferences.getSnapshot().settings.useChaseList, false);
  assert.equal(preferences.getSnapshot().settings.useTradeHistory, true, 'missing persisted keys retain safe defaults');
  console.log('Minty preferences: account-scoped persistence and failed-write recovery passed.');
}

void main();
