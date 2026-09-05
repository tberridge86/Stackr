import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  enforceProviderSetMarkRuntimePolicy,
  enforceSetVisualRuntimePolicy,
  PROVIDER_SET_MARK_RUNTIME_POLICY,
} from '../lib/providerSetMarkRuntimePolicy';
import { enforceTcgdexRuntimeImagePolicy } from '../lib/tcgdexControlledCardReference';

assert.equal(PROVIDER_SET_MARK_RUNTIME_POLICY.classification, 'amber');
assert.equal(
  createHash('sha256').update(readFileSync(PROVIDER_SET_MARK_RUNTIME_POLICY.recordedReviewPath)).digest('hex'),
  PROVIDER_SET_MARK_RUNTIME_POLICY.recordedReviewSha256,
);
assert.equal(PROVIDER_SET_MARK_RUNTIME_POLICY.activationAuthorized, true);
assert.equal(PROVIDER_SET_MARK_RUNTIME_POLICY.publicRuntimeDisplayAuthorized, true);
assert.equal(PROVIDER_SET_MARK_RUNTIME_POLICY.canonicalDatabaseWriteAuthorized, false);
assert.equal(PROVIDER_SET_MARK_RUNTIME_POLICY.assetPersistenceAuthorized, false);

for (const providerSetMark of [
  'https://assets.tcgdex.net/ja/sets/sv1/logo.webp',
  'https://assets.tcgdex.net/zh-tw/sv/sv1/logo.webp',
  'https://assets.tcgdex.net/zh-cn/sv/sv1/symbol.webp',
  'https://assets.tcgdex.net/univ/sv/sv1/symbol.webp',
]) {
  assert.equal(
    enforceProviderSetMarkRuntimePolicy(providerSetMark),
    providerSetMark,
    'exact reviewed TCGdex CJK set marks must be available at runtime',
  );
}

for (const rejected of [
  'http://assets.tcgdex.net/ja/sets/sv1/logo.webp',
  'https://user:password@assets.tcgdex.net/ja/sets/sv1/logo.webp',
  'https://assets.tcgdex.net:444/ja/sets/sv1/logo.webp',
  'https://assets.tcgdex.net/ja/sets/sv1/logo.png',
  'https://assets.tcgdex.net/ja/sets/sv1/logo.webp?download=1',
  'https://assets.tcgdex.net/univ/sets/sv1/logo.webp',
  'https://assets.tcgdex.net/en/sets/sv1/logo.webp',
  'https://assets.pokedata.example/sets/sv1/logo.png',
  'https://catalogue.stackr.example/assets/set-cover.webp',
]) {
  assert.equal(enforceProviderSetMarkRuntimePolicy(rejected), undefined);
}

const originalDenylist = process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST;
const originalDisabled = process.env.EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS;
try {
  process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST = 'ja:sets:sv1:logo';
  assert.equal(
    enforceProviderSetMarkRuntimePolicy('https://assets.tcgdex.net/ja/sets/sv1/logo.webp'),
    undefined,
  );
  delete process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST;
  process.env.EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS = 'true';
  assert.equal(
    enforceProviderSetMarkRuntimePolicy('https://assets.tcgdex.net/ja/sets/sv1/logo.webp'),
    undefined,
  );
} finally {
  if (originalDenylist === undefined) delete process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST;
  else process.env.EXPO_PUBLIC_TCGDEX_SET_MARK_DENYLIST = originalDenylist;
  if (originalDisabled === undefined) delete process.env.EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS;
  else process.env.EXPO_PUBLIC_DISABLE_TCGDEX_SET_MARKS = originalDisabled;
}

const ordinaryCardImage = 'https://images.example/cards/sv1-001.jpg';
assert.equal(
  enforceTcgdexRuntimeImagePolicy(ordinaryCardImage),
  ordinaryCardImage,
  'the set-mark gate must not alter ordinary card-image policy',
);
for (const existingSetVisual of [
  'https://catalogue.stackr.example/assets/set-logo.webp',
  'https://catalogue.stackr.example/assets/set-cover.webp',
  '/assets/reviewed/set-symbol.png',
]) {
  assert.equal(
    enforceSetVisualRuntimePolicy(existingSetVisual),
    existingSetVisual,
    'the provider gate must not strip an existing non-TCGdex set visual',
  );
}
assert.equal(
  enforceSetVisualRuntimePolicy('https://assets.tcgdex.net/ja/sets/sv1/logo.webp'),
  'https://assets.tcgdex.net/ja/sets/sv1/logo.webp',
);
assert.equal(
  enforceSetVisualRuntimePolicy('https://assets.tcgdex.net/ja/cards/sv1/001/high.webp'),
  undefined,
  'a TCGdex card image cannot be relabelled as a set visual',
);
assert.equal(
  enforceSetVisualRuntimePolicy('//assets.tcgdex.net/ja/sets/sv1/logo.webp'),
  undefined,
  'a scheme-relative TCGdex URL cannot bypass the exact HTTPS rule',
);
assert.equal(
  enforceSetVisualRuntimePolicy('https://assets.tcgdex.net./ja/sets/sv1/logo.webp'),
  undefined,
  'a DNS-equivalent trailing-dot TCGdex host cannot bypass the exact-host gate',
);

const setDisplaySource = readFileSync('lib/setDisplay.ts', 'utf8');
assert.match(
  setDisplaySource,
  /map\(\(candidate\) => enforceSetVisualRuntimePolicy\(candidate\)\)/,
  'legacy raw-data set visuals must preserve existing values while gating TCGdex marks',
);

const binderSource = readFileSync('lib/binders.ts', 'utf8');
const start = binderSource.indexOf('async function attachSetBrandingToBinders(');
const runtimeProjection = binderSource.slice(start, binderSource.indexOf('export async function fetchBinders()', start));
assert.match(
  runtimeProjection,
  /enforceSetVisualRuntimePolicy\(binder\.source_set_logo_url\)/,
  'binder read projection must preserve a legacy stored logo while gating TCGdex marks',
);
assert.match(
  runtimeProjection,
  /enforceSetVisualRuntimePolicy\(set\.images\.cover \?\? set\.images\.artwork \?\? binder\.source_set_cover_url\)/,
  'binder read projection must preserve existing cover artwork',
);

const binderListSource = readFileSync('app/(tabs)/binder.tsx', 'utf8');
assert.match(
  binderListSource,
  /enforceSetVisualRuntimePolicy\(\s*item\.source_set_logo_url\s*\?\? item\.source_set_symbol_url\s*\?\? getPokemonSetLogoUrl/s,
  'binder-list artwork must gate both stored and provider logo candidates at runtime',
);

const binderDetailSource = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
assert.match(
  binderDetailSource,
  /enforceSetVisualRuntimePolicy\(\s*binder\.source_set_logo_url\s*\?\? binder\.source_set_symbol_url\s*\?\? getPokemonSetLogoUrl/s,
  'binder-detail artwork must gate both stored and provider logo candidates at runtime',
);

const homeCommandCenterSource = readFileSync('components/HomeCommandCenter.tsx', 'utf8');
assert.match(
  homeCommandCenterSource,
  /enforceSetVisualRuntimePolicy\(\s*binder\.sourceSetLogoUrl\s*\?\? binder\.sourceSetSymbolUrl\s*\?\? getPokemonSetLogoUrl/s,
  'home binder artwork must gate both stored and provider logo candidates at runtime',
);

const globalSearchSource = readFileSync('lib/globalSearch.ts', 'utf8');
assert.match(
  globalSearchSource,
  /imageUrl:\s*enforceSetVisualRuntimePolicy\(/,
  'global set search results must gate provider marks at their final runtime projection',
);

const searchSurfaceSource = readFileSync('app/(tabs)/search.tsx', 'utf8');
assert.match(
  searchSurfaceSource,
  /logoUri=\{enforceSetVisualRuntimePolicy\(set\.images\?\.logo\)/,
  'set search rails must gate provider logos at the render boundary',
);
assert.match(
  searchSurfaceSource,
  /artworkUri=\{enforceSetVisualRuntimePolicy\(/,
  'set search rails must gate provider artwork at the render boundary',
);

const binderArtworkSource = readFileSync('components/BinderArtwork.tsx', 'utf8');
assert.match(
  binderArtworkSource,
  /resolvedLogoUrl\s*=\s*enforceSetVisualRuntimePolicy\(/,
  'shared binder artwork must re-check provider set marks at the final render boundary',
);

const searchResultsSource = readFileSync('components/search/SearchResults.tsx', 'utf8');
assert.match(
  searchResultsSource,
  /uri=\{enforceSetVisualRuntimePolicy\(logoUri\)\}/,
  'shared set search results must gate provider logos at the final render boundary',
);
assert.match(
  searchResultsSource,
  /fullUri=\{enforceSetVisualRuntimePolicy\(artworkUri\)\}/,
  'shared set search results must preserve existing artwork and gate TCGdex values at the final render boundary',
);

console.log('Reviewed TCGdex CJK set marks are bounded while existing non-provider set visuals remain unchanged');
