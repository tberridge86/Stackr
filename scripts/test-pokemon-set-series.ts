import assert from 'node:assert/strict';
import { DEFAULT_EXPANDED_ENGLISH_SERIES, getPokemonSetDisplaySeries, groupPokemonSetsBySeries } from '../lib/pokemonSetSeries';

const fixtures = [
  ['sv08.5', 'Scarlet & Violet'], ['sv8pt5', 'Scarlet & Violet'],
  ['sv03.5', 'Scarlet & Violet'], ['sv10.5b', 'Scarlet & Violet'],
  ['sv06.5', 'Scarlet & Violet'], ['me03', 'Mega Evolution'],
  ['me2pt5', 'Mega Evolution'], ['swsh12.5', 'Sword & Shield'],
  ['swsh12pt5gg', 'Sword & Shield'], ['cel25cc', 'Sword & Shield'],
  ['sm115', 'Sun & Moon'], ['det1', 'Sun & Moon'], ['xy12', 'XY'],
  ['dv1', 'Black & White'], ['col1', 'HeartGold & SoulSilver'],
  ['pl4', 'Platinum'], ['dp7', 'Diamond & Pearl'], ['ex16', 'EX'],
  ['ecard3', 'e-Card'], ['neo4', 'Neo'], ['gym2', 'Gym'], ['base5', 'Base'],
];
for (const [setCode, expected] of fixtures) {
  assert.equal(getPokemonSetDisplaySeries({ language: 'en', setCode }), expected, setCode);
}
assert.equal(getPokemonSetDisplaySeries({ language: 'ja', setCode: 'sv08.5' }), 'Other');
assert.equal(getPokemonSetDisplaySeries({ language: 'en', setCode: 'unknown' }), 'Other');
assert.equal(getPokemonSetDisplaySeries({ language: 'en', setCode: '2024sv' }), 'Other', 'promotional year codes are not expansion-series codes');
assert.equal(getPokemonSetDisplaySeries({ language: 'en', setCode: 'sv08.5', series: 'Reviewed series' }), 'Reviewed series');
assert.equal(getPokemonSetDisplaySeries({ language: 'en', setCode: 'base6' }), 'Other');

const prismatic = { id: 'prismatic', series: getPokemonSetDisplaySeries({ language: 'en', setCode: 'sv08.5' }) };
const groups = groupPokemonSetsBySeries([
  { id: 'unknown', series: 'Other' }, prismatic,
  { id: 'newest', series: 'Mega Evolution' }, { id: 'custom', series: 'Custom series' },
]);
assert.deepEqual(groups.map((group) => group.series), ['Mega Evolution', 'Scarlet & Violet', 'Other', 'Custom series']);
const expanded = new Set<string>(DEFAULT_EXPANDED_ENGLISH_SERIES);
assert.ok(groups.filter((group) => expanded.has(group.series)).flatMap((group) => group.sets).includes(prismatic), 'Prismatic must appear in the initially expanded English groups');
assert.equal(groups.reduce((count, group) => count + group.sets.length, 0), 4, 'unclassified sets remain accessible');
console.log('English set series and initial Explore visibility checks passed.');
