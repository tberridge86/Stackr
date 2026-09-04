import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getEnglishSetDisplaySupplement,
  getPreferredCardDisplayName,
  getPreferredSetDisplayName,
} from '../lib/pokemonDisplayNames';
import {
  getEnglishSetDisplaySupplement as getBackendSetSupplement,
  getPreferredSetDisplayName as getBackendSetName,
} from '../backend/lib/cardDisplayNames.js';
import { searchTcgdexCards } from '../backend/lib/tcgdex.js';

const japanese = { language: 'ja', setCode: 'SGG', localName: 'ハイクラスデッキ「ゲンガーVMAX」' };
const chinese = { language: 'zh-cn', setCode: 'CS5.5C', localName: '暗影夺辉' };

assert.equal(getPreferredSetDisplayName({ ...japanese, englishDisplayName: 'Manual English' }), japanese.localName);
assert.equal(getPreferredSetDisplayName(japanese), japanese.localName);
assert.equal(getBackendSetName(japanese), japanese.localName);
assert.equal(getPreferredSetDisplayName(chinese), chinese.localName);
assert.equal(
  getPreferredCardDisplayName({ language: 'ja', localName: 'フシギバナex', englishDisplayName: 'Venusaur ex' }),
  'フシギバナex',
);

const manual = getEnglishSetDisplaySupplement({ ...japanese, englishDisplayName: 'Manual English' });
assert.deepEqual(manual, {
  value: 'Manual English',
  label: 'English set:',
  status: 'authoritative_english_display_name',
  provenance: 'canonical_or_provider_english_display_name',
  authoritative: true,
});

const provider = getEnglishSetDisplaySupplement(japanese);
assert.deepEqual(provider, {
  value: 'High-Class Deck Gengar VMAX',
  label: 'English set:',
  status: 'provider_metadata_english_supplement',
  provenance: 'tcgdex_mit_pinned_japanese_set_code_map+stackr_catalog_sets_identity_snapshot',
  authoritative: false,
});
assert.deepEqual(getBackendSetSupplement(japanese), provider);

const editorial = getEnglishSetDisplaySupplement(chinese);
assert.deepEqual(editorial, {
  value: 'Shadow Seizes the Light',
  label: 'English translation:',
  status: 'model_translation_draft',
  provenance: 'stackr_owner_approved_editorial_set_translation_runtime_map',
  authoritative: false,
});
assert.deepEqual(getBackendSetSupplement(chinese), editorial);
assert.equal(getEnglishSetDisplaySupplement({ ...chinese, localName: 'different title' }), null);

async function assertNativePrimaryRuntimeAdapters() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([{
    id: 'sv2a-006',
    localId: '006',
    name: 'リザードンex',
    set: { id: 'sv2a', name: 'ポケモンカード151' },
  }]), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try {
    const [card] = await searchTcgdexCards({ query: 'native-primary-runtime-check', language: 'ja', limit: 1 });
    assert.equal(card.name, 'リザードンex');
    assert.equal(card.localName, 'リザードンex');
    assert.equal(card.englishDisplayName, 'Charizard ex');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const binderSource = readFileSync('app/(tabs)/binder.tsx', 'utf8');
  assert.match(
    binderSource,
    /name: card\.local_name \?\? card\.raw_payload\?\.local_name \?\? card\.canonical_name \?\? card\.english_display_name/,
  );

  const binderDetailSource = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
  const previewCardDisplay = binderDetailSource.slice(
    binderDetailSource.indexOf('function getPreviewCardDisplayName'),
    binderDetailSource.indexOf('function getPreviewCardSupportingName'),
  );
  assert.doesNotMatch(previewCardDisplay, /if \(englishName\) return englishName/);
  assert.match(previewCardDisplay, /localName,\s+englishDisplayName: englishName/);
  const previewSetDisplay = binderDetailSource.slice(
    binderDetailSource.indexOf('function getPreviewSetDisplayName'),
    binderDetailSource.indexOf('function getPreviewSetSupportingName'),
  );
  assert.doesNotMatch(previewSetDisplay, /return cleanPreviewText\(card\.english_set_name\)/);
  assert.match(previewSetDisplay, /localName: localSetName,\s+englishDisplayName: englishSetName/);

  const catalogueCacheSource = readFileSync('lib/stackrCatalogueCache.ts', 'utf8');
  const cachedCardAdapter = catalogueCacheSource.slice(
    catalogueCacheSource.indexOf('export function stackrCachedCardToIdentifiedCard'),
  );
  assert.match(cachedCardAdapter, /name: card\.nativeName/);
  assert.match(cachedCardAdapter, /local_name: card\.nativeName/);
  assert.match(cachedCardAdapter, /english_display_name: card\.englishDisplayName/);

  const searchAdapterSource = readFileSync('lib/pokemonTcgSearch.ts', 'utf8');
  assert.match(searchAdapterSource, /name: cleanText\(localName \?\? card\.name \?\? englishName\)/);
  const addCardsSource = readFileSync('app/binder/add-cards.tsx', 'utf8');
  assert.match(addCardsSource, /getCardPrimaryName[\s\S]*cleanCardText\(item\.localName\)[\s\S]*cleanCardText\(item\.englishName\)/);
  assert.match(addCardsSource, /getSetPrimaryName[\s\S]*cleanCardText\(item\.set\?\.localName\)[\s\S]*cleanCardText\(item\.set\?\.englishName\)/);

  const backendCatalogueSource = readFileSync('backend/lib/tcgdexCatalogue.js', 'utf8');
  assert.match(backendCatalogueSource, /const displayName = localName \?\? englishDisplayName/);
  assert.match(backendCatalogueSource, /const name = card\.local_name \?\? card\.canonical_name \?\? englishDisplayName/);
  const legacyJapaneseSource = readFileSync('backend/lib/japaneseCatalogue.js', 'utf8');
  assert.match(legacyJapaneseSource, /display_name: localName \?\? englishDisplayName/);
  assert.match(legacyJapaneseSource, /name: canonical\.local_name \?\? canonical\.english_display_name/);

  const pricingSource = readFileSync('lib/pricing.ts', 'utf8');
  assert.match(pricingSource, /name: card\.names\.native \?\? card\.names\.englishDisplay/);
  assert.match(pricingSource, /setName: card\.set\.nativeName \?\? card\.set\.englishDisplayName/);

  const pricingV2EngineSource = readFileSync('backend/lib/pricingV2/engine.js', 'utf8');
  assert.match(
    pricingV2EngineSource,
    /name: canonicalCard\.local_name \?\? canonicalCard\.canonical_name \?\? canonicalCard\.english_display_name/,
    'pricing V2 must keep the native card name primary and English supplemental',
  );
}

void assertNativePrimaryRuntimeAdapters().then(() => {
  console.log('Native-language primary display and English supplemental precedence passed.');
});
