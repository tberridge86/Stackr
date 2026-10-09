import assert from 'node:assert/strict';
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
  'Loading more...', 'Results will appear as loading completes.',
]) {
  assert.ok(code.includes(Buffer.from(phrase)), `Recovery UI content is absent from the exported iOS code: ${phrase}`);
}
const bundled = new Set(ios.assets.map(asset => path.basename(asset.path.replaceAll('\\', '/'))));
const required = [
  'assets/startup/stackr-premium-opening.mp4',
  'assets/startup/stackr-premium-poster.png',
  'assets/loading/card.png', 'assets/loading/sleeve.png',
  'assets/loading/loader.png', 'assets/loading/sheen.png',
  'assets/rev2/01-brand/logos/stackr-letter-s.png',
];
const covers = [...readFileSync('lib/corocoroSuppliedCovers.ts', 'utf8').matchAll(/require\('([^']+)'\)/g)]
  .map(match => path.join('lib', match[1]));
assert.equal(covers.length, 26);
for (const file of [...required, ...covers]) {
  const digest = createHash('md5').update(readFileSync(file)).digest('hex');
  assert.ok(bundled.has(digest), `Required source asset is absent from the exported iOS bundle: ${file}`);
  const exported = path.join(directory, 'assets', digest);
  assert.equal(createHash('md5').update(readFileSync(exported)).digest('hex'), digest,
    `Exported asset bytes differ from the reviewed source: ${file}`);
}
console.log('iOS recovery bundle: recovery UI content, premium opening, card loader, original S and 26 CoroCoro covers verified (33 assets).');
