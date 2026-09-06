import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const localArtwork = readFileSync('lib/localSetArtwork.ts', 'utf8');
assert.match(localArtwork, /getMagazineSetCoverSourceForSet\(input, fallbackLanguage\)\s*\?\?/,
  'local set art must give an exact magazine-cover match first priority');
assert.match(localArtwork, /getJapaneseSetLogoSourceForSet\(input, fallbackLanguage\)/,
  'existing Japanese logos remain the fallback when no exact magazine issue matches');

for (const path of [
  'app/binder/new.tsx',
  'app/(tabs)/binder.tsx',
  'features/binder/BinderDetailScreen.tsx',
  'components/BinderArtwork.tsx',
  'app/(tabs)/explore.tsx',
  'app/card/[id].tsx',
  'app/set/[id].tsx',
  'components/HomeCommandCenter.tsx',
]) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /getLocalSetArtworkSourceForSet/,
    `${path} must use the shared local set-art resolver`);
  assert.doesNotMatch(source, /getJapaneseSetLogoSourceForSet/,
    `${path} must not bypass magazine-first set-art resolution`);
}

const searchRails = readFileSync('components/search/SearchResults.tsx', 'utf8');
assert.match(searchRails, /setLogoSource\?: ImageSourcePropType \| null/,
  'card search rails must accept a bundled set-art source separately from card art');
assert.match(searchRails, /artworkSource\?: ImageSourcePropType \| null/,
  'set search rails must accept a bundled set-art source separately from remote set marks');
assert.match(searchRails, /<StackrImage\s+uri=\{imageUri\}/,
  'card result artwork must continue using its original card image URI');

const searchScreen = readFileSync('app/(tabs)/search.tsx', 'utf8');
assert.match(searchScreen, /<SearchCardRailItem[\s\S]{0,1800}setLogoSource=\{getLocalSetArtworkSourceForSet\(/,
  'search cards must pass local set art as a badge, not as card art');
assert.match(searchScreen, /<SearchSetRailItem[\s\S]{0,1800}artworkSource=\{getLocalSetArtworkSourceForSet\(/,
  'search sets must pass local set art through the dedicated source prop');

const market = readFileSync('features/market/MarketTabScreen.tsx', 'utf8');
assert.match(market, /setArtworkSource\?: ImageSourcePropType \| null/,
  'market catalogue suggestions must retain set-art separately from card images');
assert.match(market, /setArtworkSource: getLocalSetArtworkSourceForSet\(/,
  'market catalogue suggestions must resolve bundled set art from complete available set identity');
assert.match(market, /item\.setArtworkSource \? \(\s*<Image source=\{item\.setArtworkSource\}/,
  'market catalogue suggestion actions must visibly retain the set-art badge beside, never instead of, the card image');
assert.match(market, /imageUri: card\.image_small \?\? card\.image_large \?\? card\.raw_data\?\.images\?\.small \?\? null/,
  'market card imagery must remain sourced from the card, never the magazine cover');

console.log('Magazine set-cover presentation surfaces use local set art without replacing card or seller imagery.');
