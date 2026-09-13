import assert from 'node:assert/strict';
import { binderCardRarity, binderRarityChoices } from '../lib/binderRarityFilter';

const cards = ['Common', 'c', 'Uncommon', 'AR', 'Rare Illustration', 'SAR', null].map((rarity) => ({ card: { rarity } }));
const choices = binderRarityChoices(cards);
assert.equal(choices[0].count, 7);
assert.equal(choices.find((choice) => choice.key === 'common')?.count, 2);
assert.equal(choices.find((choice) => choice.key === 'illustration')?.count, 2);
assert.equal(cards.filter((card) => binderCardRarity(card).key === 'special').length, 1);
assert.equal(choices.some((choice) => choice.key === 'hyper'), false, 'hide rarities absent from this binder');
assert.equal(binderCardRarity({ card: { raw_data: { rarity: 'Rare Holo' } } }).key, 'holo');
assert.equal(cards.length, 7, 'filtering leaves the ownership/progress source intact');
console.log('Binder rarity filter checks passed.');
