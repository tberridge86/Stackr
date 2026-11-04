import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { CORE_COLLECTION_MODE } from '../lib/appCapabilities.ts';
import { verifyRecoveryUiContent } from './lib/mobile-recovery-content.mjs';

const common = [
  'The CoroCoro library', 'Catalogue match pending', 'Test touch feedback',
  'stackr-premium-opening', 'stackr-premium-poster',
  'Estimated price (provisional baseline)', 'catalogue-rarity-era-baseline-v2',
  'retired_provisional_baseline', 'Verified sale prices exclude delivery.',
  'unsupported_graded_history_identity', 'Loading more...',
  'Results will appear as loading completes.', 'Your card is saved. Its history entry',
];
const core = [
  'COLLECTION VALUE', 'Copies with a stored price', 'Browse every release',
  'Start a binder for the cards you collect.', 'View saved binders', 'core-preview',
  'The saved binders did not match your account. Please retry.',
  'Your sign-in changed. Please retry.',
  'The collection account changed. Please retry.',
  'Try a different name, number, or region.',
];
const legacy = 'activity_read_identity_changed';
const homeEntrySource = readFileSync('app/(tabs)/index.tsx', 'utf8');
const current = { homeEntrySource, coreCollectionMode: CORE_COLLECTION_MODE };
const legacyPolicy = { homeEntrySource: "export { default } from '../../features/home/HubScreen';", coreCollectionMode: false };
const bundle = (phrases) => Buffer.from(phrases.join('\0'));

assert.equal(CORE_COLLECTION_MODE, true);
const activeBundle = bundle([...common, ...core]);
assert.equal(activeBundle.includes(Buffer.from(legacy)), false,
  'The core fixture reproduces omission of unreachable legacy Home history.');
assert.equal(verifyRecoveryUiContent(activeBundle, current).homeSurface, 'CoreHomeScreen');
for (const phrase of [...common, ...core]) {
  assert.throws(() => verifyRecoveryUiContent(bundle([...common, ...core].filter(value => value !== phrase)), current),
    { message: `Recovery UI content is absent from the exported iOS code: ${phrase}` });
}
const legacyBundle = bundle([...common, legacy]);
assert.equal(verifyRecoveryUiContent(legacyBundle, legacyPolicy).homeSurface, 'HubScreen');
assert.throws(() => verifyRecoveryUiContent(bundle(common), legacyPolicy),
  { message: `Recovery UI content is absent from the exported iOS code: ${legacy}` });
assert.throws(() => verifyRecoveryUiContent(legacyBundle, current), /COLLECTION VALUE/);
const previousCoreBundle = bundle([...common, ...core.filter(phrase => ![
  'COLLECTION VALUE', 'Copies with a stored price', 'Browse every release',
  'Start a binder for the cards you collect.',
].includes(phrase)), 'Your cards. Your binders.']);
assert.throws(() => verifyRecoveryUiContent(previousCoreBundle, current), /COLLECTION VALUE/,
  'The previous minimal Home must not pass as the restored collection experience.');
assert.throws(() => verifyRecoveryUiContent(activeBundle, legacyPolicy), /activity_read_identity_changed/);
for (const home of ["export { default } from '../../features/home/UnknownScreen';", '', homeEntrySource + '\nexport const bypass = true;']) {
  assert.throws(() => verifyRecoveryUiContent(activeBundle, { ...current, homeEntrySource: home }), /explicitly export a supported Home screen/);
}
assert.throws(() => verifyRecoveryUiContent(activeBundle, { ...current, coreCollectionMode: false }), /capability policy must agree/);
assert.throws(() => verifyRecoveryUiContent(activeBundle, { ...legacyPolicy, coreCollectionMode: true }), /capability policy must agree/);
assert.throws(() => verifyRecoveryUiContent(activeBundle, { ...current, coreCollectionMode: 'true' }), /reviewed capability policy/);
assert.throws(() => verifyRecoveryUiContent('', current), /actual exported iOS bundle bytes/);

// Execute the actual complete CLI verifier against an in-memory export. Its
// sources are the reviewed local assets; no image or filesystem mutation occurs.
const sourceCache = new Map();
const sourceRead = (file, encoding) => {
  const key = path.resolve(file);
  if (!sourceCache.has(key)) sourceCache.set(key, readFileSync(file));
  const value = sourceCache.get(key);
  return encoding ? value.toString(encoding) : value;
};
const storm = JSON.parse(sourceRead('assets/rev2/11-japanese-set-logo/storm-m6-owner-supplied-20261018.json', 'utf8'));
const covers = [...sourceRead('lib/corocoroSuppliedCovers.ts', 'utf8').matchAll(/require\('([^']+)'\)/g)]
  .map(match => path.join('lib', match[1]));
const chinese = JSON.parse(sourceRead('assets/rev2/12-traditional-chinese-set-logo/high-resolution-20261016.json', 'utf8')).logos;
const packs = JSON.parse(sourceRead('assets/rev2/12-traditional-chinese-set-logo/owner-supplied-three-pack-art-20261018.json', 'utf8')).assets;
const assetPaths = [
  'assets/startup/stackr-premium-opening.mp4', 'assets/startup/stackr-premium-poster.png',
  'assets/loading/card.png', 'assets/loading/sleeve.png', 'assets/loading/loader.png',
  'assets/loading/sheen.png', 'assets/rev2/01-brand/logos/stackr-letter-s.png',
  storm.assetPath, ...covers, ...chinese.map(asset => asset.assetPath), ...packs.map(asset => asset.assetPath),
];
assert.equal(assetPaths.length, 74);
const digestFor = file => createHash('md5').update(sourceRead(file)).digest('hex');
const exportedAssets = new Map(assetPaths.map(file => [digestFor(file), sourceRead(file)]));
assert.equal(exportedAssets.size, 74);
const exportDirectory = path.resolve('outputs/in-memory-ios-recovery-fixture');
const codePath = path.join(exportDirectory, 'ios.bundle');
const metadataPath = path.join(exportDirectory, 'metadata.json');
const gate = readFileSync('scripts/verify-mobile-recovery-bundle.mjs', 'utf8')
  .replace(/^import[^\n]+\r?\n/gmu, '');
assert.doesNotMatch(gate, /^\s*import\s/mu);
function runActualVerifier(policy, { missing, tampered } = {}) {
  const assets = [...exportedAssets.keys()].filter(digest => digest !== missing).map(digest => ({ path: `assets/${digest}` }));
  runInNewContext(gate, {
    assert, createHash, path, CORE_COLLECTION_MODE: policy.coreCollectionMode, verifyRecoveryUiContent,
    process: { argv: ['node', 'scripts/verify-mobile-recovery-bundle.mjs', exportDirectory] },
    console: { log() {} },
    readFileSync(file, encoding) {
      const resolved = path.resolve(file);
      if (resolved === metadataPath) return JSON.stringify({ fileMetadata: { ios: { bundle: 'ios.bundle', assets } } });
      if (resolved === codePath) return policy.coreCollectionMode ? activeBundle : legacyBundle;
      if (resolved === path.resolve('app/(tabs)/index.tsx')) return policy.homeEntrySource;
      if (path.dirname(resolved) === path.join(exportDirectory, 'assets')) {
        const digest = path.basename(resolved);
        const bytes = exportedAssets.get(digest);
        assert.ok(bytes, 'The fixture must supply the requested exported asset.');
        return digest === tampered ? Buffer.concat([bytes, Buffer.from('tampered')]) : bytes;
      }
      return sourceRead(file, encoding);
    },
  }, { filename: 'scripts/verify-mobile-recovery-bundle.mjs' });
}
const selectedAsset = 'assets/loading/card.png';
for (const policy of [current, legacyPolicy]) {
  runActualVerifier(policy);
  assert.throws(() => runActualVerifier(policy, { missing: digestFor(selectedAsset) }),
    { message: `Required source asset is absent from the exported iOS bundle: ${selectedAsset}` });
  assert.throws(() => runActualVerifier(policy, { tampered: digestFor(selectedAsset) }),
    error => error.code === 'ERR_ASSERTION'
      && error.message.startsWith(`Exported asset bytes differ from the reviewed source: ${selectedAsset}`));
}
console.log('Native recovery content: active/legacy Home, required content, fail-closed policy, and actual 74-asset verifier with missing/tampered exports in both modes passed.');
