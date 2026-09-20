import assert from 'node:assert/strict';
import { createHapticPreference, HAPTICS_ENABLED_STORAGE_KEY } from '../lib/hapticPreference';

class MemoryStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('disk unavailable');
    this.values.set(key, value);
  }
}

async function main() {
  const storage = new MemoryStorage();
  storage.values.set(HAPTICS_ENABLED_STORAGE_KEY, 'false');

  const firstLaunch = createHapticPreference(storage);
  assert.equal(await firstLaunch.hydrate(), false, 'a stored off value must suppress first native feedback');
  assert.equal(await firstLaunch.save(true), true, 'the saved setting must become the active setting');
  assert.equal(await firstLaunch.hydrate(), true,
    'reentering Settings in the same process must not return the original cached hydration value');
  await firstLaunch.save(false);
  assert.equal(await firstLaunch.hydrate(), false, 'later toggles must remain visible to the same process');
  await firstLaunch.save(true);

  const reopened = createHapticPreference(storage);
  assert.equal(await reopened.hydrate(), true, 'reopening Settings must read the most recently saved setting');

  storage.failWrites = true;
  await assert.rejects(() => reopened.save(false), /disk unavailable/);
  assert.equal(reopened.get(), true, 'a failed write must retain the previous active setting');
  assert.equal(storage.values.get(HAPTICS_ENABLED_STORAGE_KEY), 'true', 'a failed write must not replace the saved setting');
  let failRead = true;
  const readFailure = createHapticPreference({
    getItem: async () => { if (failRead) throw new Error('unreadable'); return 'true'; },
    setItem: async () => {},
  });
  assert.equal(await readFailure.hydrate(), false, 'unreadable stored preference must suppress feedback');
  failRead = false;
  assert.equal(await readFailure.hydrate(), true, 'a later read can recover without a restart');

  console.log('Haptic preference persistence, reopen, and failed-write recovery checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
