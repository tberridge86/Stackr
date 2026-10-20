import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import { buildForeignCardPresentation } from '../lib/foreignCardPresentation';
import { getEditionVariantImageUrl } from '../lib/editionImages';

const japanese = buildForeignCardPresentation({
  id: 'ja:sv2a:006',
  name: 'リザードンex',
  localName: 'リザードンex',
  number: '006/165',
  language: 'ja',
  artist: '未翻訳の画家',
  set: {
    id: 'ja:sv2a',
    name: 'ポケモンカード151',
    localName: 'ポケモンカード151',
    englishDisplayName: 'Pokemon Card 151',
  },
  attacks: [{ name: 'ブレイブウイング', damage: '60', text: '日本語の効果' }],
  raw_data: {
    english_display_name: 'Charizard ex',
    translations: {
      en: {
        provenance: 'reviewed_translation',
        attacks: [{ name: 'Brave Wing', damage: '60', text: 'English effect text.' }],
      },
    },
  },
});

assert.equal(japanese.name, 'Charizard ex');
assert.equal(japanese.nativeName, 'リザードンex');
assert.equal(japanese.englishDisplayName, 'Charizard ex');
assert.equal(japanese.setName, 'Pokemon Card 151');
assert.equal(japanese.englishSetDisplayName, 'Pokemon Card 151');
assert.equal(japanese.details.attacks?.[0]?.name, 'Brave Wing');
assert.equal(japanese.details.attacks?.[0]?.text, 'English effect text.');
assert.equal(japanese.details.artist, undefined, 'native artist names must not bypass English metadata presentation');
assert.equal(japanese.translationStatus, 'verified');

const falselyLabelledEnglish = buildForeignCardPresentation({
  id: 'ja:unknown:001',
  name: '謎のカード',
  localName: '謎のカード',
  number: '001',
  language: 'ja',
  set: { id: 'ja:unknown', name: '日本語セット', localName: '日本語セット' },
  rules: ['日本語のルール'],
  raw_data: {
    english_display_name: '謎のカード',
    set: { english_display_name: '日本語セット' },
  },
});

assert.equal(falselyLabelledEnglish.englishDisplayName, null);
assert.equal(falselyLabelledEnglish.englishSetDisplayName, null);
assert.equal(falselyLabelledEnglish.name, 'Japanese card · 001 (translation pending)');
assert.equal(falselyLabelledEnglish.setName, 'Japanese set (translation pending)');
assert.equal(falselyLabelledEnglish.translationStatus, 'pending');
assert.equal(falselyLabelledEnglish.details.rules, undefined);
assert.equal(falselyLabelledEnglish.withheldNativeDetails, true);

const chinese = buildForeignCardPresentation({
  id: 'zh-cn:sv:025',
  name: '皮卡丘',
  localName: '皮卡丘',
  number: '025',
  language: 'zh-cn',
  set: { id: 'zh-cn:sv', name: '朱&紫', localName: '朱&紫' },
  raw_data: {
    english_display_name: 'Pikachu',
    set: { english_display_name: 'Scarlet & Violet' },
  },
});

assert.equal(chinese.name, 'Pikachu');
assert.equal(chinese.nativeName, '皮卡丘');
assert.equal(chinese.englishDisplayName, 'Pikachu');
assert.equal(chinese.setName, 'Scarlet & Violet');
assert.equal(chinese.englishSetDisplayName, 'Scarlet & Violet');

const frenchWithoutTranslation = buildForeignCardPresentation({
  id: 'fr:base:004',
  name: 'Salamèche',
  localName: 'Salamèche',
  language: 'fr',
  set: { id: 'fr:base', name: 'Set de Base', localName: 'Set de Base' },
});

assert.equal(frenchWithoutTranslation.englishDisplayName, null);
assert.equal(frenchWithoutTranslation.englishSetDisplayName, null);
assert.equal(frenchWithoutTranslation.translationStatus, 'pending');

const english = buildForeignCardPresentation({
  id: 'en:sv:001',
  name: 'Sprigatito',
  language: 'en',
  set: { id: 'en:sv', name: 'Scarlet & Violet' },
  rules: ['English rule text.'],
  attacks: [{ name: 'Scratch', damage: '10' }],
});

assert.equal(english.translationStatus, 'not_required');
assert.deepEqual(english.details.rules, ['English rule text.']);
assert.equal(english.details.attacks?.[0]?.name, 'Scratch');

async function assertNativeImageBoundary() {
  const cardScreen = await readFile(path.resolve(process.cwd(), 'app/card/[id].tsx'), 'utf8');
  const inspectionExpression = cardScreen.match(/const inspectionImageUri = ([^;]+);/)?.[1];
  assert.ok(inspectionExpression, 'the detail inspection must select its image explicitly');
  const card = { images: { large: 'https://native.example/large', small: 'https://native.example/small' },
    raw_data: { variants: [{ name: '1st edition', images: [{ large: 'https://native.example/first-edition' }] }] } };
  const imageFor = (editionHint: string | null, selectedCard: unknown = card) => vm.runInNewContext(inspectionExpression,
    { card: selectedCard, editionHint, getEditionVariantImageUrl });
  assert.equal(imageFor(null), card.images.large, 'inspection must retain the native printing image');
  assert.equal(imageFor('1st_edition'), 'https://native.example/first-edition', 'a selected native edition takes precedence');
  assert.equal(imageFor(null, { ...card, images: { small: card.images.small } }), card.images.small,
    'inspection must fall back to the same native thumbnail when its larger image is unavailable');
  assert.match(cardScreen, /<EditionAwareCardImage\s+uri=\{card\.images\?\.small\}/,
    'the detail preview must start with the selected native thumbnail');
  assert.match(cardScreen, /fullUri=\{card\.images\?\.large\}/,
    'the larger detail image must retain the selected native printing');
  assert.match(cardScreen, /name=\{presentation\.name\}/);

  const adapter = await readFile(path.resolve(process.cwd(), 'lib/stackrDomainAdapter.ts'), 'utf8');
  assert.match(adapter, /card\.defaultVariantId/);
  assert.match(adapter, /selected_image_variant_id: primary\?\.variantId \?\? null/);
  assert.match(adapter, /native_image_retained: true/);
  assert.match(adapter, /return 'zh-cn'/);
  assert.match(adapter, /return 'zh-tw'/);
}

void assertNativeImageBoundary().then(() => {
  console.log('Foreign-card English presentation checks passed');
});

const unprovenEnglishDetails = buildForeignCardPresentation({
  id: 'ja:unproven:001', name: '未検証', localName: '未検証', language: 'ja',
  set: { id: 'ja:unproven', name: '未検証セット', localName: '未検証セット' },
  attacks: [{ name: '技', text: '日本語' }],
  raw_data: { translations: { en: { attacks: [{ name: 'Unproven Attack', text: 'Unproven text.' }] } } },
});
assert.equal(unprovenEnglishDetails.details.attacks, undefined, 'unproven Latin-script payload must not be displayed as an English translation');
assert.equal(unprovenEnglishDetails.withheldNativeDetails, true);
