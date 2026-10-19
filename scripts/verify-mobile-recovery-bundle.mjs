import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
assert.ok(directory, 'Pass the directory of the exported iOS bundle.');
const metadata = JSON.parse(readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
const ios = metadata.fileMetadata?.ios;
assert.ok(ios?.bundle && ios.assets?.length, 'The export must contain an iOS bundle and its asset manifest.');
const code = readFileSync(path.join(directory, ios.bundle));
for (const phrase of [
  'The CoroCoro library', 'Catalogue match pending', 'Test touch feedback',
  'stackr-premium-opening', 'stackr-premium-poster',
  'Estimated price (provisional baseline)',
  'catalogue-rarity-era-baseline-v2', 'retired_provisional_baseline',
  'Verified sale prices exclude delivery.', 'unsupported_graded_history_identity',
  'Loading more...', 'Results will appear as loading completes.',
  'activity_read_identity_changed', 'Your card is saved. Its history entry',
]) {
  assert.ok(code.includes(Buffer.from(phrase)), `Recovery UI content is absent from the exported iOS code: ${phrase}`);
}
const bundled = new Set(ios.assets.map(asset => path.basename(asset.path.replaceAll('\\', '/'))));
const stormLogo = JSON.parse(readFileSync('assets/rev2/11-japanese-set-logo/storm-m6-owner-supplied-20261018.json', 'utf8'));
assert.equal(stormLogo.setId, '903d5baa-27c7-5690-b1d7-2395c770204a');
assert.equal(stormLogo.setCode, 'M6');
assert.equal(stormLogo.assetPath, 'assets/rev2/11-japanese-set-logo/logos-owner-supplied-20261018/m6.png');
assert.equal(createHash('sha256').update(readFileSync(stormLogo.assetPath)).digest('hex'), stormLogo.sha256,
  'The Storm logo must retain its verified source bytes.');
const required = [
  'assets/startup/stackr-premium-opening.mp4',
  'assets/startup/stackr-premium-poster.png',
  'assets/loading/card.png', 'assets/loading/sleeve.png',
  'assets/loading/loader.png', 'assets/loading/sheen.png',
  'assets/rev2/01-brand/logos/stackr-letter-s.png',
  stormLogo.assetPath,
];
const covers = [...readFileSync('lib/corocoroSuppliedCovers.ts', 'utf8').matchAll(/require\('([^']+)'\)/g)]
  .map(match => path.join('lib', match[1]));
assert.equal(covers.length, 27, 'The new regular November2023 cover must not be dropped.');
const chineseLogos = JSON.parse(readFileSync('assets/rev2/12-traditional-chinese-set-logo/high-resolution-20261016.json', 'utf8')).logos;
const chinesePackArt = JSON.parse(readFileSync('assets/rev2/12-traditional-chinese-set-logo/owner-supplied-three-pack-art-20261018.json', 'utf8')).assets;
assert.equal(chineseLogos.length, 36);
assert.equal(chinesePackArt.length, 3);
for (const asset of [...chineseLogos, ...chinesePackArt]) {
  assert.equal(createHash('sha256').update(readFileSync(asset.assetPath)).digest('hex'), asset.sha256,
    'Retained approved Chinese artwork must preserve its reviewed source bytes.');
}
const requiredAssets = [...required, ...covers, ...chineseLogos.map(asset => asset.assetPath), ...chinesePackArt.map(asset => asset.assetPath)];
assert.equal(requiredAssets.length, 74);
assert.equal(new Set(requiredAssets).size, 74, 'Every promised source asset must be checked once.');
assert.equal(new Set(requiredAssets.map(file => createHash('sha256').update(readFileSync(file)).digest('hex'))).size, 74);
assert.equal(stormLogo.sha256, '383905581374e6a41be583303354be84a34891d52f8b6420ea632ff61a07f7ba',
  'The selected English-lettered Storm source supersedes the earlier Japanese-only logo.');
assert.equal(createHash('sha256').update(readFileSync('assets/magazine-covers/2023-11-corocoro-regular.jpg')).digest('hex'),
  'f4c2b52e01077cb532acfd6118243767d4f7194b8f80204e19eb5b6441dc77ca');
for (const file of requiredAssets) {
  const digest = createHash('md5').update(readFileSync(file)).digest('hex');
  assert.ok(bundled.has(digest), `Required source asset is absent from the exported iOS bundle: ${file}`);
  const exported = path.join(directory, 'assets', digest);
  assert.equal(createHash('sha256').update(readFileSync(exported)).digest('hex'),
    createHash('sha256').update(readFileSync(file)).digest('hex'),
    `Exported asset bytes differ from the reviewed source: ${file}`);
}
console.log('iOS recovery bundle: recovery UI content, premium opening, card loader, original S, English-lettered Storm logo, 27 CoroCoro covers, 36 retained Chinese logos and 3 pack-art fallbacks verified (74 assets).');
