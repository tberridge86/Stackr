import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('lib/pokemonTcg.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleBox: any = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleBox,
  exports: moduleBox.exports,
  require: (name: string) => name === './publishedSetLogoFallbacks'
    ? { getPublishedSetLogoFallback: () => undefined }
    : {},
});

const { filterKnownDuplicateSetRecords } = moduleBox.exports as {
  filterKnownDuplicateSetRecords: (sets: any[]) => any[];
};

const canonicalPitchBlack = {
  id: 'd6d58c17-5923-496e-94ef-5819f34ae10c', language: 'en', name: 'Pitch Black',
  englishDisplayName: 'Pitch Black', externalIds: { setCode: 'me05' },
};
const duplicatePitchBlack = {
  id: '2f77da8e-8199-4634-b30d-385565560731', language: 'en', name: 'Pitch Black',
  englishDisplayName: 'Pitch Black', externalIds: { setCode: 'PBL' },
};
const unrelatedPbl = {
  id: 'other-pbl', language: 'en', name: 'Different set', externalIds: { setCode: 'PBL' },
};
const japanesePbl = {
  id: 'ja-pbl', language: 'ja', name: 'Pitch Black', externalIds: { setCode: 'PBL' },
};

assert.deepEqual(
  filterKnownDuplicateSetRecords([canonicalPitchBlack, duplicatePitchBlack, unrelatedPbl, japanesePbl]).map((set) => set.id),
  [canonicalPitchBlack.id, unrelatedPbl.id, japanesePbl.id],
  'only the documented English PBL Pitch Black duplicate is hidden when ME05 is present',
);
assert.deepEqual(
  filterKnownDuplicateSetRecords([duplicatePitchBlack, unrelatedPbl]).map((set) => set.id),
  [duplicatePitchBlack.id, unrelatedPbl.id],
  'PBL remains available when the canonical Pitch Black record is unavailable',
);
assert.deepEqual(
  filterKnownDuplicateSetRecords([canonicalPitchBlack, { ...duplicatePitchBlack, englishDisplayName: 'Not Pitch Black', name: 'Not Pitch Black' }]).map((set) => set.id),
  [canonicalPitchBlack.id, duplicatePitchBlack.id],
  'a similarly coded but non-matching display identity is retained',
);
console.log('Set-list identity filtering hides only the documented English Pitch Black PBL duplicate.');
