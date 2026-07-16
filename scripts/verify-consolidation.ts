import assert from 'node:assert/strict';
import {
  assertCanCommitQuantity,
  calculateAvailableQuantity,
  getDuplicateQuantity,
  getOwnershipKey,
} from '../lib/cardOwnershipCore';
import { expandSearchQuery, normaliseSearchText } from '../lib/searchNormalisation';
import { correctPokemonNameQuery } from '../lib/pokemonNameAutocorrect';

const availability = calculateAvailableQuantity(5, {
  listed: 2,
  reserved: 1,
  pendingTransactions: 1,
});

assert.equal(availability.availableQuantity, 1);
assert.equal(availability.committedQuantity, 4);
assert.equal(availability.overCommittedQuantity, 0);

assert.equal(calculateAvailableQuantity(2, { listed: 3 }).overCommittedQuantity, 1);
assert.equal(getDuplicateQuantity(4), 3);
assert.equal(getDuplicateQuantity(1), 0);

assert.doesNotThrow(() => assertCanCommitQuantity({ ownedQuantity: 3, activeListedQuantity: 1 }, 2));
assert.throws(() => assertCanCommitQuantity({ ownedQuantity: 3, activeListedQuantity: 2 }, 2), /Only 1 available/);

assert.equal(
  getOwnershipKey({
    cardId: 'base1-4',
    setId: 'base1',
    variant: 'holofoil',
    state: 'graded',
    gradingCompany: 'PSA',
    grade: 'GEM MINT 10',
    condition: 'Near Mint',
  }),
  'base1:base1-4:holofoil:en:graded:PSA:GEM MINT 10:Near Mint'
);

assert.equal(normaliseSearchText("Misty’s Pikachu #025"), "misty's pikachu #025");
assert.ok(expandSearchQuery('bgs charizard').includes('beckett charizard'));
assert.ok(expandSearchQuery('swsh pikachu').includes('sword shield pikachu'));

(async () => {
const charizardCorrection = await correctPokemonNameQuery('charzard base', { allowIndex: false });
assert.equal(charizardCorrection.correctedQuery, 'Charizard base');

const pikachuCorrection = await correctPokemonNameQuery('pikchu', { allowIndex: false });
assert.equal(pikachuCorrection.correctedQuery, 'Pikachu');

const mewtwoCorrection = await correctPokemonNameQuery('mew two', { allowIndex: false });
assert.equal(mewtwoCorrection.correctedQuery, 'Mewtwo');

const setWordCorrection = await correctPokemonNameQuery('base set', { allowIndex: false });
assert.equal(setWordCorrection.correctedQuery, 'base set');

console.log('Consolidation logic checks passed');
})();
