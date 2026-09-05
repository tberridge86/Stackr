import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildForeignCardPresentation } from '../lib/foreignCardPresentation';

const japanese = buildForeignCardPresentation({
  id: 'ja:sv2a:006',
  name: 'リザードンex',
  localName: 'リザードンex',
  number: '006/165',
  language: 'ja',
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
        attacks: [{ name: 'Brave Wing', damage: '60', text: 'English effect text.' }],
      },
    },
  },
});

assert.equal(japanese.name, 'リザードンex');
assert.equal(japanese.nativeName, 'リザードンex');
assert.equal(japanese.englishDisplayName, 'Charizard ex');
assert.equal(japanese.setName, 'ポケモンカード151');
assert.equal(japanese.englishSetDisplayName, 'Pokemon Card 151');
assert.equal(japanese.details.attacks?.[0]?.name, 'Brave Wing');
assert.equal(japanese.details.attacks?.[0]?.text, 'English effect text.');
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

assert.equal(chinese.name, '皮卡丘');
assert.equal(chinese.nativeName, '皮卡丘');
assert.equal(chinese.englishDisplayName, 'Pikachu');
assert.equal(chinese.setName, '朱&紫');
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
  assert.match(
    cardScreen,
    /uri=\{card\.images\?\.large \|\| card\.images\?\.small\}/,
    'the card detail image must remain the selected native variant image',
  );
  assert.match(cardScreen, /name=\{presentation\.name\}/);
  assert.match(cardScreen, /English name: \{presentation\.englishDisplayName\}/);
  assert.match(cardScreen, /English set: \{presentation\.englishSetDisplayName\}/);

  const adapter = await readFile(path.resolve(process.cwd(), 'lib/stackrDomainAdapter.ts'), 'utf8');
  assert.equal((adapter.match(/const name = localName \?\? englishDisplayName/g) ?? []).length, 2);
  assert.match(adapter, /card\.defaultVariantId/);
  assert.match(adapter, /selected_image_variant_id: primary\?\.variantId \?\? null/);
  assert.match(adapter, /native_image_retained: true/);
  assert.match(adapter, /return 'zh-cn'/);
  assert.match(adapter, /return 'zh-tw'/);
}

void assertNativeImageBoundary().then(() => {
  console.log('Foreign-card English presentation checks passed');
});
