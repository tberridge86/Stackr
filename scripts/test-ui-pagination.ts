import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { groupCardRows, parseLimit } from '../backend/lib/stackrApiV1.js';
import { readPublishedPokedexIndex } from '../backend/lib/pokedexIndex.js';
import { loadCompleteSetPages } from '../lib/stackrSetRetrieval';
import type { StackrCard } from '../lib/stackrApiV1';

// Exercise the shipped transport builder and index method without bootstrapping
// React Native, Auth storage or making a network request.
const source = readFileSync('lib/stackrApiV1.ts', 'utf8');
const tree = ts.createSourceFile('client.ts', source, ts.ScriptTarget.Latest, true);
const builder = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'buildUrl');
const client = tree.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'StackrApiClient');
const method = client?.members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(tree) === 'pokemonIndex');
assert.ok(builder && method);
const compiled = ts.transpileModule(`${builder.getText(tree)}
class TestClient { constructor(private request: any) {} ${method.getText(tree)} }
export { buildUrl, TestClient };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const runtime: any = {};
new Function('exports', 'STACKR_UI_PAGE_SIZE', compiled)(runtime, 50);

for (const path of ['/sets', '/sets/set/cards', '/pokemon/Pikachu/cards', '/assets/manifest', '/search', '/catalog/delta', '/pokemon', '/market/movers', '/market/opportunities', '/cards/card/price-history']) {
  assert.equal(new URL(runtime.buildUrl('https://api.invalid/v1', path, {})).searchParams.get('limit'), '50');
  assert.equal(new URL(runtime.buildUrl('https://api.invalid/v1', path, { limit: 500, cursor: 'continue' })).searchParams.get('limit'), '50');
  assert.equal(new URL(runtime.buildUrl('https://api.invalid/v1', path, { limit: 7 })).searchParams.get('limit'), '7');
}
assert.equal(new URL(runtime.buildUrl('https://api.invalid/v1', '/sets', { limit: 0 })).searchParams.get('limit'), '0', 'Malformed input must remain invalid.');
assert.equal(parseLimit(undefined, 120, 500, false), 120, 'Legacy origin defaults remain until release activation.');
assert.equal(parseLimit(500, 120, 500, false), 500);
assert.equal(parseLimit(undefined, 120, 500, true), 50);
assert.equal(parseLimit(500, 120, 500, true), 50);
assert.equal(parseLimit(7, 120, 500, true), 7);
for (const value of [0, -1, 1.5, 'bad', Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => parseLimit(value, 120, 500, true), /positive integer/);
}
const originalGate = process.env.STACKR_ENFORCE_UI_PAGE_LIMIT;
try {
  delete process.env.STACKR_ENFORCE_UI_PAGE_LIMIT;
  assert.equal(readPublishedPokedexIndex({ limit: 151 }).results.length, 151);
  process.env.STACKR_ENFORCE_UI_PAGE_LIMIT = 'true';
  assert.equal(readPublishedPokedexIndex({ limit: 1199 }).results.length, 50);
  assert.equal(readPublishedPokedexIndex().results.length, 50, 'Origin defaults obey the activated boundary too.');
} finally {
  if (originalGate == null) delete process.env.STACKR_ENFORCE_UI_PAGE_LIMIT;
  else process.env.STACKR_ENFORCE_UI_PAGE_LIMIT = originalGate;
}

async function main() {
  const calls: { offset: number; limit: number }[] = [];
  const indexClient = new runtime.TestClient(async (_path: string, query: { offset: number; limit: number }) => {
    calls.push(query);
    assert.ok(query.limit <= 50);
    return { data: readPublishedPokedexIndex(query), meta: { apiVersion: '1' } };
  });
  const first = await indexClient.pokemonIndex({ offset: 0, limit: 151 });
  const remaining = await indexClient.pokemonIndex({ offset: 151, limit: 1199 });
  const rows = [...first.data.results, ...remaining.data.results];
  assert.equal(rows.length, first.data.count);
  assert.equal(new Set(rows.map((row) => row.speciesId)).size, rows.length);
  assert.ok(calls.length <= 28, 'The two existing UI windows retain bounded HTTP work.');
  for (const bad of ['empty', 'version', 'duplicate']) {
    let page = 0;
    const broken = new runtime.TestClient(async (_path: string, query: { offset: number; limit: number }) => {
      const data = readPublishedPokedexIndex(query);
      if (page++ > 0) {
        if (bad === 'empty') data.results = [];
        if (bad === 'version') data.indexVersion += '-changed';
        if (bad === 'duplicate') data.results[0] = readPublishedPokedexIndex({ offset: 0, limit: 1 }).results[0];
      }
      return { data, meta: { apiVersion: '1' } };
    });
    await assert.rejects(broken.pokemonIndex({ limit: 151 }), /Incomplete|Inconsistent|duplicate/);
  }

  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const setId = uuid(1), version = uuid(2);
  // The origin pages variant rows, then groups each page into printings. A
  // printing split across pages gets a default from the variants on that page.
  const sourceRows = Array.from({ length: 16000 }, (_, n) => {
    const card = Math.floor(n / 8), variantId = uuid(100000 + n);
    return { printing_id: uuid(100 + card), catalogue_version_id: version, game_code: 'pokemon', language_code: 'en',
      set_id: setId, collector_number: String(card + 1), card_native_name: `Card ${card}`,
      variant_id: variantId, canonical_key: `pokemon:en:${card}:${n % 8}`,
      variant_code: n % 8 === 0 ? 'normal' : `finish-${n % 8}` };
  });
  const requireGroupedCard = (card: ReturnType<typeof groupCardRows>[number] | undefined): StackrCard => {
    assert.ok(card, 'The origin must produce a non-null summary for every grouped printing.');
    const englishDisplaySource = card.names.englishDisplaySource;
    assert.ok(englishDisplaySource === null || englishDisplaySource === 'printing' || englishDisplaySource === 'concept',
      'The origin must emit a supported English-display provenance.');
    const supplement = card.names.englishSupplement;
    return { ...card, names: { ...card.names, englishDisplaySource,
      englishSupplement: supplement ? { ...supplement,
        sourceCardIds: supplement.sourceCardIds ? [...supplement.sourceCardIds] : undefined } : null } };
  };
  let pages = 0;
  const normalize = (cards: StackrCard[]) => {
    const merged = new Map<string, StackrCard>();
    for (const card of cards) {
      const prior = merged.get(card.cardId);
      if (prior) prior.variants.push(...card.variants);
      else merged.set(card.cardId, { ...card, variants: [...card.variants] });
    }
    return [...merged.values()];
  };
  const complete = await loadCompleteSetPages({ namespace: 'fixture', setId, language: 'en', expectedCount: 2000 }, async (cursor) => {
    const offset = Number(cursor ?? 0); pages += 1;
    const cards = groupCardRows(sourceRows.slice(offset, offset + 50)).map(requireGroupedCard);
    assert.ok(cards.every((card: StackrCard) => card.variants.some(variant => variant.variantId === card.defaultVariantId)),
      "Every raw HTTP printing has a default among that page's supplied variants.");
    return { cards, nextCursor: offset + 50 < sourceRows.length ? String(offset + 50) : null };
  }, normalize);
  assert.equal(pages, 320);
  assert.equal(complete.length, 2000);
  assert.equal(complete.reduce((sum, card) => sum + card.variants.length, 0), 16000, 'Smaller pages retain the original complete-snapshot capacity.');
  assert.ok(complete.every(card => card.variants.length === 8), 'Printings split across page boundaries retain every distinct finish.');
  const validCard = requireGroupedCard(groupCardRows(sourceRows.slice(0, 8))[0]);
  await assert.rejects(loadCompleteSetPages({ namespace: 'fixture', setId, language: 'en', expectedCount: 1 },
    async () => ({ cards: [{ ...validCard, defaultVariantId: uuid(999999) }], nextCursor: null }),
    () => [validCard]), /page identity/, 'Normalization cannot repair an invalid raw default and extend the page heartbeat.');
  console.log('UI pagination: bounded transport, staged origin limits, complete National Dex windows and 16,000-row set snapshots pass.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
