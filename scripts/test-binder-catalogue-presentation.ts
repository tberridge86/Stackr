import assert from 'node:assert/strict';
import { getBinderCardImageUri, getBinderCatalogueTotal, isBinderCardBeyondPrintedTotal, preserveUnmatchedBinderRows } from '../lib/binderCataloguePresentation';

const saved = {
  image_url: 'https://catalogue.stackr.test/ja/S12a/001.webp',
  owned_quantity: 3,
  card: { images: { small: null, large: null } },
};
const before = JSON.stringify(saved);
assert.equal(getBinderCardImageUri(saved), saved.image_url);
assert.equal(getBinderCardImageUri(saved, 'large'), saved.image_url);
assert.equal(JSON.stringify(saved), before, 'display resolution must preserve saved quantities and image fields');
assert.equal(getBinderCardImageUri({
  ...saved,
  card: { images: { small: 'https://assets.tcgdex.net/ja/S/S12a/001/high.webp' } },
}), saved.image_url, 'an unissued provider URL must not shadow a usable saved image');
assert.equal(getBinderCardImageUri({ card: null, image_url: null }), null);

// The live TCGdex S12a set response distinguishes regular cards from extras.
assert.equal(getBinderCatalogueTotal({ printedTotal: 172, total: 258, masterSetEnabled: false, regularCardsOnly: true }), 172);
assert.equal(getBinderCatalogueTotal({ printedTotal: 172, total: 258, masterSetEnabled: false }), 258);
assert.equal(getBinderCatalogueTotal({ printedTotal: 172, total: 258, masterSetEnabled: true }), 258);
assert.equal(getBinderCatalogueTotal({ printedTotal: 0, total: 250, masterSetEnabled: false }), 250);
assert.equal(getBinderCatalogueTotal({ printedTotal: null, total: null, masterSetEnabled: false }), null);
assert.equal(getBinderCatalogueTotal({ printedTotal: -1, total: NaN, masterSetEnabled: false }), null);
assert.equal(isBinderCardBeyondPrintedTotal('173/172', 172), true);
assert.equal(isBinderCardBeyondPrintedTotal('１７３', 172), true);
assert.equal(isBinderCardBeyondPrintedTotal('172', 172), false);
assert.equal(isBinderCardBeyondPrintedTotal('TG01', 172), false);
assert.equal(isBinderCardBeyondPrintedTotal('173', null), false);
const ownedRows = [
  { id: 'saved-1', owned: true, owned_quantity: 3, image_url: saved.image_url },
  { id: 'saved-2', owned: true, owned_quantity: 2, image_url: null },
];
const savedBefore = JSON.stringify(ownedRows);
const fallback = preserveUnmatchedBinderRows([], ownedRows);
assert.equal(fallback.length, 2, 'an empty catalogue must not hide saved cards');
assert.deepEqual(fallback.map((row) => row.owned_quantity), [3, 2]);
const partial = preserveUnmatchedBinderRows([ownedRows[0]], ownedRows);
assert.equal(partial.length, 2, 'a partial catalogue must not discard unmatched records or duplicate matched ones');
assert.equal(JSON.stringify(ownedRows), savedBefore, 'fallback must not mutate saved records');
console.log('Binder saved-image fallback, quantity preservation, and catalogue totals passed.');
