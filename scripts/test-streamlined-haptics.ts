import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tab = fs.readFileSync('components/haptic-tab.tsx','utf8');
const listing = fs.readFileSync('features/listing/CreateListingScreen.tsx','utf8');
const haptics = fs.readFileSync('lib/haptics.ts','utf8');

assert.match(tab,/stackrHaptics\.selection\(\)/,'tab feedback must use the shared semantic haptic facade');
assert.doesNotMatch(tab,/preferenceAwareHaptics|ImpactFeedbackStyle/,'tab code must not choose native haptic strength locally');

assert.doesNotMatch(listing,/preferenceAwareHaptics|\bHaptics\./,'listing flow must not bypass the semantic Stackr facade');
assert.match(listing,/stackrHaptics\.selection\(\)/,'listing choices keep embedded selection feedback');
assert.match(listing,/stackrHaptics\.captureSaved\(\)/,'successful photo capture uses semantic capture feedback');
assert.match(listing,/stackrHaptics\.analysisCompleted\(\)/,'completed analysis has one semantic completion cue');
assert.match(listing,/stackrHaptics\.listingCompleted\(\)/,'publishing a listing uses listing completion feedback');

assert.match(haptics,/\| 'analysis_completed'/);
assert.match(haptics,/analysisCompleted: \(\) => haptic\('analysis_completed'\)/);
assert.match(haptics,/Legacy screens keep their existing effect/,'legacy compatibility wrapper remains explicit until all callers are migrated');

console.log('Streamlined haptics passed: active tab/listing interactions use one preference-aware semantic facade.');

async function runtimeChecks() {
  const calls: string[] = [];
  let enabled = true;
  let now = 10000;
  let failNative = false;
  const platform = { OS: 'ios' };
  const native = {
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Soft: 'soft', Rigid: 'rigid' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    async selectionAsync() { calls.push('selection'); if (failNative) throw new Error('unavailable'); },
    async impactAsync(style: string) { calls.push(style); if (failNative) throw new Error('unavailable'); },
    async notificationAsync(type: string) { calls.push(type); if (failNative) throw new Error('unavailable'); },
  };
  const dependencies: Record<string, unknown> = {
    'expo-haptics': native, 'react-native': { Platform: platform },
    './hapticPreference': {
      getStoredHapticsEnabled: () => enabled,
      hydrateStoredHapticsPreference: async () => enabled,
      setTransientHapticsEnabled: (value: boolean) => { enabled = value; },
      saveStoredHapticsEnabled: async (value: boolean) => { enabled = value; return value; },
    },
  };
  const output = ts.transpileModule(haptics, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(output, { exports: module.exports, require: (name: string) => {
    assert(Object.hasOwn(dependencies, name), `Unexpected haptic dependency ${name}`); return dependencies[name];
  }, Date: { now: () => now }, setTimeout });
  const facade = module.exports.stackrHaptics;
  await facade.selection(); await facade.selection();
  assert.deepEqual(calls, ['selection'], 'semantic selection retains its shared cooldown');
  now += 100;
  await facade.captureSaved(); await facade.analysisCompleted(); await facade.listingCompleted();
  await facade.scannerCaptureLocked(); await facade.scannerAmbiguous();
  assert.deepEqual(calls, ['selection', 'success', 'success', 'success', 'light', 'warning']);
  enabled = false;
  const before = calls.length;
  await facade.analysisCompleted(); await facade.captureSaved(); await facade.listingCompleted();
  assert.equal(calls.length, before, 'all completion events honour the saved disabled preference');
  enabled = true; platform.OS = 'web';
  await facade.analysisCompleted(); assert.equal(calls.length, before, 'web remains silent');
  platform.OS = 'ios'; failNative = true;
  await facade.analysisCompleted();
  assert.equal(calls.length, before + 1, 'native failure is contained rather than failing the completed action');
  assert.equal(typeof module.exports.preferenceAwareHaptics.impactAsync, 'function', 'unmigrated callers retain compatibility');
  console.log('Semantic haptic runtime passed: event mapping, cooldown, disabled/web states, native failure and compatibility.');
}
void runtimeChecks().catch((error) => { console.error(error); process.exitCode = 1; });

