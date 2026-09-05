import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function run() {
  const badgeSource = source('components/PokemonLanguageBadge.tsx');
  assert.match(badgeSource, /const rearOffset = size \* \(2 \/ 3\)/);
  for (const code of ['en', 'ja', 'fr', 'de', 'es', 'it', 'pt-br', 'zh-cn', 'zh-tw', 'id', 'th', 'ko']) {
    assert.ok(badgeSource.includes(code), `missing language descriptor: ${code}`);
  }

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

  const marketSource = source('features/market/MarketTabScreen.tsx');
  assert.match(marketSource, /language: value/);
  assert.match(marketSource, /language=\{chip\.language\}/);

  console.log('shared language flags and native-first binder labels passed');
}

run();
