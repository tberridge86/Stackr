import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findCuratedPokemonSearchRows,
  getCuratedPokemonCardById,
  getCuratedPokemonCardsForSet,
  getCuratedPokemonSearchRows,
  getCuratedPokemonSets,
} from '../lib/curatedPokemonCatalogue';

function assertMetadataOnlyCards() {
  const rows = getCuratedPokemonSearchRows('ja');
  assert.equal(rows.length, 2);

  for (const row of rows) {
    assert.equal(row.language, 'ja');
    assert.equal(row.region, 'JP');
    assert.equal(row.number, 'Unnumbered');
    assert.equal(row.image_small, null);
    assert.equal(row.image_large, null);
    assert.equal(row.raw_data?.images?.small, null);
    assert.equal(row.raw_data?.images?.large, null);
    assert.equal(row.raw_data?.pokedexNumber, 151);
    assert.equal(row.raw_data?.provenance?.image_policy, 'no_unlicensed_card_image');
  }
}

function assertSearchAliases() {
  const corocoroResults = findCuratedPokemonSearchRows('corocoro mew', 'ja');
  assert.deepEqual(
    corocoroResults.map((row) => row.id),
    ['ja:corocoro-mew-1997', 'ja:corocoro-shining-mew-2001'],
  );

  const lilypadResults = findCuratedPokemonSearchRows('lilypad mew', 'ja');
  assert.deepEqual(lilypadResults.map((row) => row.id), ['ja:corocoro-mew-1997']);

  const shiningResults = findCuratedPokemonSearchRows('shining mew corocoro', 'ja');
  assert.deepEqual(shiningResults.map((row) => row.id), ['ja:corocoro-shining-mew-2001']);
}

function assertSetAndDetailFallbacks() {
  const sets = getCuratedPokemonSets('ja');
  assert.deepEqual(
    sets.map((set) => set.id),
    ['ja:corocoro-comic-february-1997-promo', 'ja:corocoro-comic-may-2001-promo'],
  );

  const febCards = getCuratedPokemonCardsForSet('ja:corocoro-comic-february-1997-promo', 'ja');
  assert.equal(febCards.length, 1);
  assert.equal(febCards[0].id, 'ja:corocoro-mew-1997');

  const mayCards = getCuratedPokemonCardsForSet('corocoro-comic-may-2001-promo', 'ja');
  assert.equal(mayCards.length, 1);
  assert.equal(mayCards[0].id, 'ja:corocoro-shining-mew-2001');

  const detail = getCuratedPokemonCardById('ja:corocoro-shining-mew-2001', 'ja');
  assert.equal(detail?.name, 'Shining Mew');
  assert.equal(detail?.set?.id, 'ja:corocoro-comic-may-2001-promo');
}

function assertMigrationSeedsBothTables() {
  const migration = readFileSync('supabase/migrations/20260728110000_curated_corocoro_mew_promos.sql', 'utf8');
  assert.match(migration, /stackr_manual/);
  assert.match(migration, /ja:corocoro-mew-1997/);
  assert.match(migration, /ja:corocoro-shining-mew-2001/);
  assert.match(migration, /insert into public\.tcg_cards/);
  assert.match(migration, /insert into public\.pokemon_cards/);
  assert.match(migration, /image_policy', 'no_unlicensed_card_image'/);
}

assertMetadataOnlyCards();
assertSearchAliases();
assertSetAndDetailFallbacks();
assertMigrationSeedsBothTables();

console.log('Curated CoroCoro catalogue tests passed.');
