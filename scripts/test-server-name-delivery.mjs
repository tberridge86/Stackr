import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { toCardSummary } from '../backend/lib/stackrApiV1.js';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS as records } from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';
import { buildForeignCardPresentation } from '../lib/foreignCardPresentation.ts';

// Execute the actual API→legacy adapter; image and transport dependencies are
// irrelevant here and intentionally stay off this name-delivery fixture.
const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const start = source.indexOf('export function stackrCardToLegacyCard(');
const end = source.indexOf('\nasync function allPages', start);
assert.ok(start >= 0 && end > start);
const exports = {};
vm.runInNewContext(ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Set, WeakMap,
  embeddedCardImageAssets: () => [], primaryCardImageAsset: () => null,
  resolveCardArtwork: () => ({ small: undefined, large: undefined }),
  clean: (value) => value ?? null, toLegacyLanguage: (value) => value,
  canonicalArtworkFacts: new WeakMap(), buildForeignCardPresentation,
});
const approved = records.find(([language, native]) => language === 'ja' && native === 'あとだしハンマー');
const row = { printing_id: approved[3][0], variant_id: '33333333-3333-4333-8333-333333333333',
  game_code: 'pokemon', language_code: approved[0], card_native_name: approved[1],
  card_english_display_name: 'Translation pending', set_id: '11111111-1111-4111-8111-111111111111',
  set_native_name: 'ネイティブセット', set_english_display_name: 'Reviewed set', collector_number: '025',
  variant_code: 'normal', finish_code: 'normal' };
const delivered = toCardSummary([row]);
const adapted = exports.stackrCardToLegacyCard(delivered);
assert.equal(adapted.englishDisplayName, approved[2]);
assert.equal(adapted.localName, approved[1]);
assert.equal(adapted.translationStatus, 'partial', 'Reviewed aliases must not be elevated to official names.');
assert.deepEqual(adapted.raw_data.english_display_supplement, delivered.names.englishSupplement);
const canonical = { source: 'official_card_database', status: 'verified_official',
  verifiedOfficial: true, sourceEvidenceSha256: 'a'.repeat(64) };
const newer = exports.stackrCardToLegacyCard(toCardSummary([{ ...row,
  card_english_display_name: 'Newer reviewed full title', card_english_display_provenance: canonical }]));
assert.equal(newer.englishDisplayName, 'Newer reviewed full title');
assert.deepEqual(newer.raw_data.english_display_provenance, canonical);
const unresolved = exports.stackrCardToLegacyCard(toCardSummary([{ ...row,
  printing_id: '22222222-2222-4222-8222-222222222222', card_native_name: 'ピカチュウ未知の装飾',
  card_english_display_name: null }]));
assert.equal(unresolved.englishDisplayName, null, 'A server null cannot become a guessed species name on mobile.');
assert.equal(unresolved.translationStatus, 'pending');
assert.equal(unresolved.localName, 'ピカチュウ未知の装飾');
console.log('Server-to-mobile English names preserve native identity, reviewed provenance, newer canonical corrections and explicit unresolved names.');
