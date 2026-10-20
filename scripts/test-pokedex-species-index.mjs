import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { readPublishedPokedexIndex } from '../backend/lib/pokedexIndex.js';

const snapshot = JSON.parse(fs.readFileSync('backend/data/pokedex-index.json', 'utf8'));
assert.equal(snapshot.schemaVersion, 2);
assert.equal(snapshot.sourceCount, 1025);
assert.equal(snapshot.speciesResponseSha256, 'cdfd6524c4b51d14b83088113553fdbc7ec9b2ca4673788ca47f9ae76bada479');
assert.equal(snapshot.routeReference?.retrievedAt, '2026-10-09T08:37:03.454Z',
  'The route reference is the existing frozen snapshot, not a claimed fresh provider import.');
assert.equal(snapshot.mapping?.exceptions?.deoxys.includes('deoxys-normal'), true);

function extract(name, scope = {}) {
  const file = 'app/(tabs)/pokedex.tsx';
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer?.getText(tree) ?? '';
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(expression, `Expected the mounted Pokédex to retain ${name}.`);
  const output = ts.transpileModule(`const tested = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), `${output}; return tested;`)(...Object.values(scope));
}

const index = readPublishedPokedexIndex({ offset: 0, limit: 2000 });
assert.equal(index.count, 1025, 'The published denominator is the reviewed species count, not provider form count.');
assert.equal(index.results.length, 1025);
assert.match(index.indexVersion, /^pokeapi-species-/);

const bySpecies = new Map(index.results.map((entry) => [entry.speciesId, entry]));
assert.deepEqual(bySpecies.get(26), {
  name: 'raichu',
  url: 'https://pokeapi.co/api/v2/pokemon/26/',
  speciesId: 26,
  speciesName: 'raichu',
  routeId: 26,
  routeName: 'raichu',
}, 'Raichu progress remains species 26 and does not count Alolan Raichu as a second species.');
assert.deepEqual(bySpecies.get(386), {
  name: 'deoxys-normal',
  url: 'https://pokeapi.co/api/v2/pokemon/386/',
  speciesId: 386,
  speciesName: 'deoxys',
  routeId: 386,
  routeName: 'deoxys-normal',
}, 'Deoxys keeps its reviewed default provider route while displaying one species identity.');
assert.equal(bySpecies.get(29)?.routeName, 'nidoran-f');
assert.equal(bySpecies.get(32)?.routeName, 'nidoran-m');
assert.ok(!index.results.some((entry) => entry.routeName === 'raichu-alola'), 'Alternate forms do not inflate the species list.');

const getPokemonIdFromUrl = (url) => Number(String(url).split('/').filter(Boolean).at(-1));
const mapPokemonResults = extract('mapPokemonResults', { getPokemonIdFromUrl });
const mergePokemonResults = extract('mergePokemonResults');
const isPokemonEntryArray = extract('isPokemonEntryArray', { getPokemonIdFromUrl });
const screenEntries = mapPokemonResults([bySpecies.get(26), bySpecies.get(386), bySpecies.get(29), bySpecies.get(32)]);
assert.deepEqual(screenEntries.map((entry) => entry.speciesId), [26, 29, 32, 386], 'The mounted screen orders and keys entries by National Dex species identity.');
assert.equal(mergePokemonResults(screenEntries, [{ ...screenEntries[1], routeName: 'nidoran-m', routeId: 32 }]).length, 4,
  'Continuation merging cannot count another provider route as a new species.');
assert.equal(isPokemonEntryArray(screenEntries), true, 'The new species-aware snapshot can populate the app cache.');
assert.equal(isPokemonEntryArray(index.results.map(({ name, url }) => ({ name, url }))), false,
  'The legacy provider-only cache shape is rejected before it can inflate progress.');

const screen = fs.readFileSync('app/(tabs)/pokedex.tsx', 'utf8');
assert.match(screen, /isPokemonOwned\(item\.speciesName\)/,
  'Species progress must use its species identity rather than a default form route label.');
assert.match(screen, /params: \{[\s\S]*?id: String\(item\.routeId\),[\s\S]*?name: item\.routeName,[\s\S]*?speciesId: String\(item\.speciesId\),[\s\S]*?speciesName: item\.speciesName,[\s\S]*?\}/,
  'List navigation must carry species identity separately from the exact metadata route.');
const detail = fs.readFileSync('app/pokemon/[id].tsx', 'utf8');
assert.match(detail, /const cardSpeciesName = speciesName \?\? routeName \?\? nextPokemon\.name;/,
  'The detail screen must query canonical cards by the selected species, not its default form route.');
const detailTree = ts.createSourceFile('pokemon.tsx', detail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cardReads = [];
const findCardReads = (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(detailTree) === 'fetchCardsForPokemon') cardReads.push(node);
  ts.forEachChild(node, findCardReads);
};
findCardReads(detailTree);
assert.equal(cardReads.length, 1);
assert.equal(cardReads[0].arguments[0].getText(detailTree), 'cardSpeciesName',
  'Async card retrieval must retain the selected species identity after metadata arrives.');
const cardOptions = cardReads[0].arguments[1];
assert.ok(ts.isObjectLiteralExpression(cardOptions));
const progressOption = cardOptions.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(detailTree) === 'onProgress');
assert.equal(progressOption?.initializer.getText(detailTree), 'applyCards', 'Independent diagnostics must preserve factual streaming.');
assert.match(detail, /const displayName = formatPokedexName\(speciesName \?\? pokemon\.name\);/,
  'The detail header must keep the species display label while route metadata loads.');
console.log('Pokédex species index passed: one species denominator, explicit provider routes, legacy-cache rejection and form-safe list consumers.');
