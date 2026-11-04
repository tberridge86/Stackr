import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getOfficialBinderProgress } from '../lib/binderProgress';
import { compareBinderSetsNewestFirst } from '../lib/binderSetOrder';
import { countBinderProgressSlots } from '../lib/masterSetProgress';
import { isBinderCardBeyondPrintedTotal } from '../lib/binderCataloguePresentation';

const setId = '903d5baa-27c7-5690-b1d7-2395c770204a';
const printingId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const canonicalCard = (id: string, number: string) => ({ id, number, raw_data: { stackr: { canonical: true, variants: [
  { variantId: `${id}-normal`, variantCode: 'normal' }, { variantId: `${id}-reverse`, variantCode: 'reverse_holo' },
] } } });
const base = { language: 'ja' as const, setReferences: [setId, 'ja:M6', 'M6'], total: 113, masterSetEnabled: false,
  savedRows: [{ id: 'saved', card_id: 'M6-1', api_card_id: printingId, card_number: '001', set_id: 'ja:M6', language: 'ja', owned: true }],
  ownedRows: [
    { card_id: printingId, set_id: setId, variant: 'normal', quantity: 5 },
    { card_id: printingId, set_id: setId, variant: 'reverseHolofoil', quantity: 2 },
    { card_id: secondId, set_id: setId, variant: 'normal', quantity: 3 },
    { card_id: 'wrong-language', set_id: 'M6', language: 'en', variant: 'normal', quantity: 1 },
    { card_id: 'wrong-set', set_id: 'M5', variant: 'normal', quantity: 1 },
  ] };
assert.deepEqual(getOfficialBinderProgress(base), { owned: 2, total: 113, totalKnown: true },
  'canonical collection ownership joins resolved aliases, deduplicates quantities and excludes another language/set');
assert.deepEqual(getOfficialBinderProgress({ ...base, total: null }), { owned: 2, total: null, totalKnown: false });
assert.deepEqual(getOfficialBinderProgress({ ...base, masterSetEnabled: true }), { owned: 2, total: null, totalKnown: false },
  'missing master facts retain ownership with an unknown denominator');
const cards = [canonicalCard(printingId, '001'), canonicalCard(secondId, '002')];
assert.deepEqual(getOfficialBinderProgress({ ...base, total: 2, masterSetEnabled: true, cards }), { owned: 3, total: 4, totalKnown: true });
const repeated = [canonicalCard(printingId, '106'), canonicalCard(secondId, '106')];
const saved = { id: 'legacy', card_id: 'provider-card', card_number: '106', set_id: 'ja:M6', language: 'ja', owned: true };
const repeatedInput = { ...base, total: 2, masterSetEnabled: true, cards: repeated, ownedRows: [] };
assert.equal(getOfficialBinderProgress({ ...repeatedInput, savedRows: [saved] }).owned, 0,
  'a repeated collector number cannot establish a printing identity');
assert.equal(getOfficialBinderProgress({ ...repeatedInput, savedRows: [{ ...saved, api_card_id: printingId }] }).owned, 1,
  'a canonical API ID resolves the saved printing despite repeated numbers');
assert.equal(getOfficialBinderProgress({ ...repeatedInput, savedRows: [{ ...saved, card_id: printingId, api_card_id: 'stale-provider' }] }).owned, 1,
  'a stale API alias cannot defeat an exact saved canonical printing ID');
const otherPrintingOwned = base.ownedRows.filter((row) => row.card_id === printingId).map((row) => ({ ...row, card_id: secondId }));
assert.equal(getOfficialBinderProgress({ ...base, total: 2, masterSetEnabled: true, cards,
  savedRows: [{ ...saved, card_id: printingId, api_card_id: secondId, owned: false }], ownedRows: otherPrintingOwned }).owned, 2,
  'a contradictory canonical API ID cannot transfer finishes between two verified printings');
const providerOnly = { raw_data: { tcgplayer: { prices: { normal: {}, holofoil: {}, reverseHolofoil: {} } } } };
assert.deepEqual(countBinderProgressSlots([{ card: providerOnly, owned: true, ownedVariants: [] }], true), { owned: 1, total: 1 },
  'provider price keys never expand a master denominator');

// Exercise the screen's actual display selector so AR/SAR remain in both grids.
const source = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
const tree = ts.createSourceFile('binder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let selector = '';
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'displayCards' && node.initializer) {
    selector = node.initializer.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(selector);
for (const [printed, total] of [[76, 113], [81, 118]]) {
  const cataloguePricedCards = Array.from({ length: total }, (_, index) => ({
    card_number: String(index + 1), card: { number: String(index + 1), rarity: index >= printed ? 'Special Illustration Rare' : 'Common' },
  }));
  for (const masterSetEnabled of [false, true]) {
    const displayed = runInNewContext(`(${selector})`, { cataloguePricedCards, masterSetEnabled,
      binder: { type: 'official', language: 'ja', catalogue_set_printed_total: printed }, useMemo: (fn: () => unknown) => fn(),
      normalizePokemonCardLanguage: (language: string) => language, isBinderCardBeyondPrintedTotal,
      isJapaneseSecretBinderCard: () => false });
    assert.equal(displayed.length, total, `Japanese ${printed}/${total} includes every printing with master=${masterSetEnabled}`);
    assert.equal(displayed.at(-1).card.number, String(total));
  }
}
const sets = [
  { id: 'unknown', name: 'Unknown', releaseDate: '' },
  { id: 'older', name: 'Older', releaseDate: '2025/01/17' },
  { id: 'newer', name: 'Newer', releaseDate: '2026-09-25' },
  { id: 'invalid', name: 'Invalid', releaseDate: 'not-a-date' },
];
assert.deepEqual([...sets].sort(compareBinderSetsNewestFirst).map((set) => set.id), ['newer', 'older', 'invalid', 'unknown']);
assert.equal(sets[0].id, 'unknown', 'picker sorting preserves the shared catalogue array');
assert.ok(readFileSync('app/binder/new.tsx', 'utf8').includes('dedupeSetList(sets).sort(compareBinderSetsNewestFirst)'),
  'unfiltered and searched picker rows share newest-first ordering');
console.log('Binder complete checklist, exact ownership/master progress and newest-first set ordering passed.');
