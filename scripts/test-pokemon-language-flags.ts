import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function run() {
  const badgeSource = source('components/PokemonLanguageBadge.tsx');
  assert.match(badgeSource, /const rearOffset = size \* \(2 \/ 3\)/);
  const englishFlagBlock = badgeSource.match(/if \(language === 'en'\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  const usIndex = englishFlagBlock.indexOf('<CircularFlag country="US"');
  const ukIndex = englishFlagBlock.indexOf('<CircularFlag country="UK"');
  assert.ok(usIndex >= 0 && ukIndex >= 0 && usIndex < ukIndex, 'US flag must render first behind the foreground UK flag');
  assert.match(englishFlagBlock, /country="US" size=\{size\} style=\{\{ position: 'absolute', left: rearOffset, top: 0 \}\}/);
  assert.match(englishFlagBlock, /country="UK" size=\{size\} style=\{\{ position: 'absolute', left: 0, top: 0 \}\}/);
  for (const code of ['en', 'ja', 'fr', 'de', 'es', 'it', 'pt-br', 'zh-cn', 'zh-tw', 'id', 'th', 'ko']) {
    assert.ok(badgeSource.includes(code), `missing language descriptor: ${code}`);
  }
  assert.match(
    badgeSource,
    /POKEMON_CATALOGUE_LANGUAGE_CODES = \[\s*'en', 'ja', 'zh-cn', 'zh-tw',\s*\]/s,
    'shared catalogue options must include English, Japanese, Simplified Chinese, and Traditional Chinese',
  );

  const flaggedControls = [
    'app/binder/new.tsx',
    'app/(tabs)/explore.tsx',
    'app/(tabs)/search.tsx',
    'features/market/MarketTabScreen.tsx',
    'features/listing/CreateListingScreen.tsx',
  ];
  for (const file of flaggedControls) {
    assert.match(source(file), /PokemonLanguageFlagIcon/);
  }

  const binderPickerSource = source('app/binder/new.tsx');
  assert.match(binderPickerSource, /const nativeSetName = item\.localName \?\? item\.name/);
  assert.match(binderPickerSource, /English: \{englishSetName\}/);
  assert.match(binderPickerSource, /POKEMON_CATALOGUE_LANGUAGE_OPTIONS/);

  for (const file of [
    'app/(tabs)/explore.tsx',
    'app/(tabs)/search.tsx',
    'features/market/MarketTabScreen.tsx',
  ]) {
    assert.match(source(file), /POKEMON_CATALOGUE_LANGUAGE_OPTIONS/, `${file} must consume shared catalogue language options`);
  }
  const marketSource = source('features/market/MarketTabScreen.tsx');
  assert.match(marketSource, /language: value/);
  assert.match(marketSource, /language=\{chip\.language\}/);

  console.log('shared language flags and native-first binder labels passed');
}

run();
