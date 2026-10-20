import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getEnglishCardDisplayName,
  getEnglishSetDisplaySupplement,
  getPreferredCardDisplayName,
  getPreferredSetDisplayName,
} from '../lib/pokemonDisplayNames';
import {
  getEnglishCardDisplaySupplement as getBackendCardSupplement,
  getEnglishSetDisplaySupplement as getBackendSetSupplement,
  getPreferredSetDisplayName as getBackendSetName,
} from '../backend/lib/cardDisplayNames.js';
import { searchTcgdexCards } from '../backend/lib/tcgdex.js';
import { buildForeignCardPresentation } from '../lib/foreignCardPresentation';

const japanese = { language: 'ja', setCode: 'SGG', localName: 'ハイクラスデッキ「ゲンガーVMAX」' };
const chinese = { language: 'zh-cn', setCode: 'CS5.5C', localName: '暗影夺辉' };

assert.equal(getPreferredSetDisplayName({ ...japanese, englishDisplayName: 'Manual English' }), 'Manual English');
assert.equal(getPreferredSetDisplayName(japanese), 'High-Class Deck Gengar VMAX');
assert.equal(getBackendSetName(japanese), japanese.localName);
assert.equal(getPreferredSetDisplayName(chinese), 'Shadow Seizes the Light');
assert.equal(
  getPreferredCardDisplayName({ language: 'ja', localName: 'フシギバナex', englishDisplayName: 'Venusaur ex' }),
  'Venusaur ex',
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

type CardInput = Parameters<typeof getEnglishCardDisplayName>[0];
type CardContractCase = { label: string; input: CardInput; expected: string | null };
const cardContractCases: CardContractCase[] = [
  { label: 'legacy Trainer with scalar dex', input: { language: 'ja', localName: 'マリィ', raw: { dexId: 25 } }, expected: null },
  { label: 'legacy Trainer with dex array', input: { language: 'ja', localName: 'マリィ', raw: { dexId: [25] } }, expected: null },
  { label: 'legacy Trainer with dexIds', input: { language: 'ja', localName: 'マリィ', raw: { dexIds: [25] } }, expected: null },
  { label: 'legacy Trainer with National Dex numbers', input: { language: 'ja', localName: 'マリィ', raw: { nationalPokedexNumbers: [25] } }, expected: null },
  { label: 'legacy Trainer with National Dex number', input: { language: 'ja', localName: 'マリィ', raw: { nationalPokedexNumber: 25 } }, expected: null },
  { label: 'legacy Trainer with 151 collector number', input: { language: 'ja', localName: 'マリィ', setId: 'ja:sv2a', collectorNumber: '025' }, expected: null },
  { label: 'unknown native title with 151 collector number', input: { language: 'ja', localName: '未知のカード', setId: 'ja:sv2a', collectorNumber: '025' }, expected: null },
  { label: 'unknown native title with raw 151 number', input: { language: 'ja', localName: '未知のカード', raw: { set_id: 'sv2a', number: '025' } }, expected: null },
  { label: 'unknown native title with nested 151 localId', input: { language: 'ja', localName: '未知のカード', raw: { set: { tcgdex_id: 'sv2a' }, localId: '025' } }, expected: null },
  { label: 'unknown native title with raw dex', input: { language: 'ja', localName: '未知のカード', raw: { dexId: 25 } }, expected: null },
  { label: 'species prefix with unknown decoration', input: { language: 'ja', localName: 'ピカチュウ未知の装飾' }, expected: null },
  { label: 'species prefix with unknown decoration and known ending', input: { language: 'ja', localName: 'ピカチュウ未知の装飾ex' }, expected: null },
  { label: 'species prefix with unknown form', input: { language: 'ja', localName: 'ピカチュウ未知のフォルム' }, expected: null },
  { label: 'species prefix with unknown partner', input: { language: 'ja', localName: 'ピカチュウ＆未知のポケモンGX' }, expected: null },
  { label: 'species prefix with form qualifier', input: { language: 'ja', localName: 'ピカチュウ（未知のすがた）' }, expected: null },
  { label: 'unknown prefix retains unresolved region', input: { language: 'ja', localName: '未知のピカチュウex', raw: { dexId: 25 } }, expected: null },
  { label: 'wrong-case Ex is unreviewed', input: { language: 'ja', localName: 'ピカチュウEx' }, expected: null },
  { label: 'wrong-case lowercase vmax is unreviewed', input: { language: 'ja', localName: 'ピカチュウvmax' }, expected: null },
  { label: 'existing exact Trainer map remains valid', input: { language: 'ja', localName: 'エリカの招待', raw: { dexId: 25 } }, expected: "Erika's Invitation" },
  { label: 'existing exact Energy map remains valid', input: { language: 'ja', localName: '基本超エネルギー', raw: { dexId: 25 } }, expected: 'Basic Psychic Energy' },
  { label: 'canonical null stays unresolved despite exact species title', input: { language: 'ja', localName: 'ピカチュウ', raw: { stackr: { canonical: true }, dexId: 25 } }, expected: null },
  { label: 'canonical null Trainer stays unresolved', input: { language: 'ja', localName: 'マリィ', raw: { stackr: { canonical: true }, dexId: 25 } }, expected: null },
  { label: 'direct English Trainer retains precedence', input: { language: 'ja', localName: 'マリィ', englishDisplayName: 'Marnie', raw: { dexId: 25 } }, expected: 'Marnie' },
  { label: 'canonical direct English Trainer remains valid', input: { language: 'ja', localName: 'マリィ', raw: { english_display_name: 'Marnie', stackr: { canonical: true }, dexId: 25 } }, expected: 'Marnie' },
];
for (const suffix of ['', 'ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR', 'BREAK', 'LV.X', 'V-UNION']) {
  cardContractCases.push({
    label: `complete species title with ${suffix || 'no'} suffix`,
    input: { language: 'ja', localName: `ピカチュウ${suffix}`, raw: { dexId: 150 } },
    expected: `Pikachu${suffix ? ` ${suffix}` : ''}`,
  });
}
cardContractCases.push({ label: 'whitespace around complete reviewed mechanic', input: { language: 'ja', localName: ' ピカチュウ EX ' }, expected: 'Pikachu EX' });

const cardFailures: string[] = [];
for (const { label, input, expected } of cardContractCases) {
  const raw = {
    ...input.raw,
    ...(input.englishDisplayName ? { english_display_name: input.englishDisplayName } : {}),
    native_name: input.localName,
    finish: 'reverse_holo',
    edition: 'unlimited',
    printing_id: 'fixture-printing-preserved',
    provenance: { source: 'fixture_native_record', sourceLanguage: 'ja', status: 'unverified' },
  };
  const card = {
    id: 'ja:fixture-printing-preserved', name: input.localName, localName: input.localName,
    language: 'ja', number: String(input.collectorNumber ?? raw.localId ?? raw.number ?? '025'),
    set: { id: input.setId ?? raw.set_id ?? raw.set?.tcgdex_id ?? 'ja:fixture-set', name: '元のセット', localName: '元のセット' },
    rules: ['日本語のルールを保持'], raw_data: raw,
  };
  const beforeInput = structuredClone(input);
  const beforeCard = structuredClone(card);
  try {
    assert.equal(getEnglishCardDisplayName(input), expected, `${label}: actual helper`);
    const presentation = buildForeignCardPresentation(card);
    assert.equal(presentation.englishDisplayName, expected, `${label}: actual presentation alias`);
    assert.equal(presentation.name, expected ?? `Japanese card · ${card.number} (translation pending)`, `${label}: pending display policy`);
    assert.equal(presentation.nativeName, input.localName?.trim(), `${label}: complete native title retained after existing outer-whitespace cleaning`);
    assert.equal(presentation.nativeSetName, card.set.localName, `${label}: native set retained`);
    assert.equal(presentation.languageCode, 'ja', `${label}: language retained`);
    assert.equal(presentation.translationStatus, expected ? 'partial' : 'pending', `${label}: unverified rules status`);
    assert.equal(presentation.withheldNativeDetails, true, `${label}: no invented rules translation`);
    assert.equal(presentation.details.rules, undefined, `${label}: native rules remain outside English display`);
    assert.deepEqual(input, beforeInput, `${label}: helper input retained`);
    assert.deepEqual(card, beforeCard, `${label}: printing/number/finish/edition/provenance retained`);
  } catch (error) {
    cardFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Named, existing approved backend results travel through the actual consumer.
// The client does not need a second generated name registry or new form aliases.
const approvedTitles = [
  { nativeName: 'ニドラン♀', englishName: 'Nidoran♀' },
  { nativeName: 'ニドラン♂', englishName: 'Nidoran♂' },
  { nativeName: 'アローラライチュウ', englishName: 'Alolan Raichu' },
  { nativeName: 'デオキシス', englishName: 'Deoxys' },
];
for (const { nativeName, englishName } of approvedTitles) {
  try {
    const supplement = getBackendCardSupplement({ language: 'ja', localName: nativeName });
    assert.equal(supplement?.value, englishName, `${nativeName}: existing approved backend name`);
    assert.equal(supplement?.provenance, 'published_stackr_exact_native_name');
    assert.equal(supplement?.authoritative, false);
    assert.ok(supplement, `${nativeName}: approved alias must retain its supplement`);
    const sourceCardIds = supplement.sourceCardIds;
    assert.ok(sourceCardIds && sourceCardIds.length > 0, `${nativeName}: approved provenance must retain source printing IDs`);
    const card = {
      id: sourceCardIds[0], name: nativeName, localName: nativeName, language: 'ja', number: '025',
      set: { id: 'fixture-original-set', name: '元のセット', localName: '元のセット' },
      raw_data: {
        stackr: { canonical: true }, english_display_name: supplement.value, english_display_supplement: supplement,
        printing_id: sourceCardIds[0], edition: 'unlimited', finish: 'holo',
        native_name: nativeName,
      },
    };
    const before = structuredClone(card);
    const presentation = buildForeignCardPresentation(card);
    assert.equal(presentation.name, englishName);
    assert.equal(presentation.englishDisplayName, englishName);
    assert.equal(presentation.nativeName, nativeName);
    assert.equal(presentation.nativeSetName, '元のセット');
    assert.equal(presentation.languageCode, 'ja');
    assert.equal(presentation.translationStatus, 'partial', 'non-authoritative approved-name status remains visible');
    assert.deepEqual(card, before, `${nativeName}: approved provenance and exact input identity retained`);
  } catch (error) {
    cardFailures.push(`${nativeName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
assert.equal(cardFailures.length, 0, `${cardFailures.length}/${cardContractCases.length + approvedTitles.length} card contract cases failed:\n${cardFailures.join('\n')}`);

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
  assert.match(addCardsSource, /getCardPrimaryName[\s\S]*getPreferredCardDisplayName\([\s\S]*localName: item\.localName,[\s\S]*englishDisplayName: item\.englishName/);
  assert.match(addCardsSource, /getSetPrimaryName[\s\S]*getPreferredSetDisplayName\([\s\S]*localName: item\.set\?\.localName,[\s\S]*englishDisplayName: item\.set\?\.englishName/);
  assert.doesNotMatch(addCardsSource, /getCardSupportingName|getSetSupportingName/);

  assert.match(binderDetailSource, /function getBinderSetDisplayName[\s\S]*getPreferredSetDisplayName/);
  assert.match(binderDetailSource, /<SlabStickerLabel[\s\S]*setName=\{setName\}/);
  assert.match(binderDetailSource, /<StackrCardIdentity[\s\S]*setName=\{getBinderSetDisplayName\(selectedCard, selectedCard\.set_id\)\}/);

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
  console.log(`English metadata display, translation fallbacks and original-language identity preservation passed; ${cardContractCases.length + approvedTitles.length} actual helper/presentation contract cases passed.`);
});
