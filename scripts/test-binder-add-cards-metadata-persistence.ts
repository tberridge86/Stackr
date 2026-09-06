import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectTcgdexReferencePersistenceImage } from '../lib/tcgdexReferencePersistence';

const source = readFileSync('app/binder/add-cards.tsx', 'utf8');

assert.match(
  source,
  /selectedList\.map\(\(card\) => \(\{[\s\S]*?cardId: card\.id,[\s\S]*?setId: card\.set\?\.id \?\? '',[\s\S]*?language: card\.language \?\? binderLanguage,[\s\S]*?cardName: getCardPrimaryName\(card\),[\s\S]*?imageUrl: card\.images\?\.small \?\? card\.images\?\.large \?\? null,[\s\S]*?setName: getSetPrimaryName\(card, getDisplaySetName\(/,
  'binder card selections must retain their displayed name, image candidate, and set name through addCardsToBinder',
);

const displayOnlyReference = 'https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp';
const approvedAsset = 'https://catalogue.stackr.test/cards/157.webp';
assert.equal(
  selectTcgdexReferencePersistenceImage(displayOnlyReference),
  null,
  'passing a displayed reference through the UI must not make it persistable',
);
assert.equal(
  selectTcgdexReferencePersistenceImage(approvedAsset),
  approvedAsset,
  'an approved stored asset remains available as the resilience fallback',
);

console.log('Binder add-card selections retain metadata while the existing image persistence policy remains enforced.');
