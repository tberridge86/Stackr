import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getMagazineSetCoverForSet,
  getMagazineSetCoverSourceForSet,
  MAGAZINE_SET_COVER_METADATA,
} from '../lib/magazineSetCovers';
import { MAGAZINE_SET_COVER_ASSET_KEYS } from '../lib/magazineSetCoverAssets';

const source = (key: string) => `stub:${key}` as any;

assert.equal(MAGAZINE_SET_COVER_METADATA.length, 81, 'every supplied cover needs one explicit issue metadata row');
assert.equal(new Set(MAGAZINE_SET_COVER_METADATA.map((cover) => cover.key)).size, 81);
assert.deepEqual(
  [...MAGAZINE_SET_COVER_ASSET_KEYS].sort(),
  MAGAZINE_SET_COVER_METADATA.map((cover) => cover.key).sort(),
  'every exact issue key must have one separate static PNG source mapping',
);

for (const cover of MAGAZINE_SET_COVER_METADATA) {
  for (const id of cover.stableIds) {
    const byId = getMagazineSetCoverForSet({ id, language: cover.language }, undefined, source);
    assert.deepEqual(byId, { key: cover.key, name: cover.name, language: cover.language, source: `stub:${cover.key}` });
  }
  for (const name of cover.exactNames) {
    const byName = getMagazineSetCoverForSet({ englishDisplayName: name, language: cover.language }, undefined, source);
    assert.equal(byName?.key, cover.key, `exact issue name must resolve ${cover.key}`);
  }
}

const sourceFile = readFileSync('lib/magazineSetCoverAssets.ts', 'utf8');
const requiredPaths = [...sourceFile.matchAll(/require\('([^']+Pokemon_Magazine_Cover_Art_PNGs[^']+\.png)'\)/g)].map((match) => match[1]);
assert.equal(requiredPaths.length, 81, 'every cover must have a static Metro require path');
assert.equal(new Set(requiredPaths).size, 81, 'static source paths must not duplicate an issue');
for (const relativePath of requiredPaths) {
  assert.ok(existsSync(resolve('lib', relativePath)), `missing static magazine cover: ${relativePath}`);
}
const assetRoot = 'assets/Pokemon_Magazine_Cover_Art_PNGs';
const actualRelativePaths = readdirSync(assetRoot, { recursive: true })
  .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.png'))
  .map((entry) => `../assets/Pokemon_Magazine_Cover_Art_PNGs/${entry.replace(/\\/g, '/')}`)
  .sort();
assert.deepEqual([...requiredPaths].sort(), actualRelativePaths, 'static require paths must exactly cover the supplied PNG population');

assert.equal(
  getMagazineSetCoverForSet({ id: 'ja:corocoro-comic-february-1997-promo', language: 'ja' }, undefined, source)?.key,
  'corocoro-comic-1997-02',
);
assert.equal(
  getMagazineSetCoverForSet({ id: 'corocoro-comic-february-1997-promo', language: 'ja' }, undefined, source)?.key,
  'corocoro-comic-1997-02',
  'the existing binder/pokemonTcg stripped February promo ID must remain exact',
);
assert.equal(
  getMagazineSetCoverForSet({ id: 'corocoro-comic-may-2001-promo', language: 'ja' }, undefined, source)?.key,
  'corocoro-comic-2001-05',
  'the existing binder/pokemonTcg stripped May promo ID must remain exact',
);
assert.equal(
  getMagazineSetCoverForSet({ englishDisplayName: 'CoroCoro Comic Promo (May 2001)', language: 'ja' }, undefined, source)?.key,
  'corocoro-comic-2001-05',
);
assert.equal(getMagazineSetCoverForSet({ name: 'CoroCoro Comic', language: 'ja' }, undefined, source), null, 'a publication without an issue is ambiguous');
assert.equal(getMagazineSetCoverForSet({ name: 'February 1997', language: 'ja' }, undefined, source), null, 'a date alone is never a set/card inference');
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'en' }, undefined, source), null);
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'zh-tw' }, undefined, source), null);
assert.equal(getMagazineSetCoverForSet({ id: 'en:magazine:pokemon-fan-us:issue-01', language: 'zh-cn' }, undefined, source), null);
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, 'en', source), null, 'input and fallback language must agree');
assert.equal(getMagazineSetCoverForSet({ id: 'en:any', englishDisplayName: 'CoroCoro Comic Promo (May 2001)' }, undefined, source), null, 'an English identity prefix cannot resolve a Japanese issue name');
assert.equal(getMagazineSetCoverForSet({ id: 'zh-tw:any', englishDisplayName: 'CoroCoro Comic Promo (May 2001)' }, undefined, source), null, 'a Chinese identity prefix cannot resolve a Japanese issue name');
assert.equal(getMagazineSetCoverForSet({ id: 'CA775304-419D-4F6D-9D3E-14661EF010A6', englishDisplayName: 'CoroCoro Comic Promo (May 2001)' }, undefined, source)?.key, 'corocoro-comic-2001-05', 'an unprefixed canonical UUID may accompany an exact issue name');
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', setId: 'ja:magazine:corocoro-comic:1997-03', language: 'ja' }, undefined, source), null, 'conflicting exact issues must fail closed');
assert.equal(getMagazineSetCoverSourceForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), 'stub:corocoro-comic-1997-02');
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, () => null), null, 'an absent static source must fall back to no cover');
assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:2099-01', language: 'ja' }, undefined, source), null, 'unknown issues must not be invented');

const environmentKeys = [
  'EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS', 'STACKR_DISABLE_MAGAZINE_SET_COVERS',
  'EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST', 'STACKR_MAGAZINE_SET_COVER_DENYLIST',
] as const;
const previous = new Map(environmentKeys.map((key) => [key, process.env[key]]));
try {
  process.env.EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS = 'true';
  assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), null);
  delete process.env.EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS;
  process.env.STACKR_DISABLE_MAGAZINE_SET_COVERS = 'true';
  assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), null);
  delete process.env.STACKR_DISABLE_MAGAZINE_SET_COVERS;
  process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST = 'COROCORO-COMIC-1997-02';
  assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), null);
  process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST = 'x'.repeat(16_385);
  assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), null);
  delete process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST;
  process.env.STACKR_MAGAZINE_SET_COVER_DENYLIST = 'corocoro-comic-1997-02';
  assert.equal(getMagazineSetCoverForSet({ id: 'ja:magazine:corocoro-comic:1997-02', language: 'ja' }, undefined, source), null);
} finally {
  for (const key of environmentKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('Magazine set-cover issue matching is exact, language-safe, and fail-closed.');
