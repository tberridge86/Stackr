import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogueV1Service, encodeCursor } from '../lib/stackrApiV1.js';

const setId = 'd6a23ad9-7d3d-482c-a477-304584a335e3';
const versionId = 'd560cd01-de2a-4713-9518-b967fb4c5ac9';
const variantId = '11111111-1111-4111-8111-111111111111';

function fixture(setResult = { data: { catalogue_version_id: versionId }, error: null }) {
  const completed = [];
  const client = {
    schema(schema) {
      assert.equal(schema, 'api');
      return {
        from(table) {
          assert.ok(['catalogue_cards', 'catalogue_sets'].includes(table));
          const calls = [];
          return {
            select(...args) { calls.push(['select', ...args]); return this; },
            eq(...args) { calls.push(['eq', ...args]); return this; },
            gt(...args) { calls.push(['gt', ...args]); return this; },
            order(...args) { calls.push(['order', ...args]); return this; },
            limit(...args) { calls.push(['limit', ...args]); return this; },
            maybeSingle() { calls.push(['maybeSingle']); return this; },
            then(resolve, reject) {
              completed.push({ table, calls });
              return Promise.resolve(table === 'catalogue_sets' ? setResult : { data: [], error: null }).then(resolve, reject);
            },
          };
        },
      };
    },
  };
  return { completed, service: createCatalogueV1Service({ supabase: client }) };
}

test('set cards are constrained to the current published version, language and cursor', async () => {
  for (const language of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const { completed, service } = fixture();
    const response = await service.setCards(setId, {
      language, limit: 5, cursor: encodeCursor({ variant_id: variantId }),
    });
    assert.deepEqual(response, { cards: [], pagination: { limit: 5, nextCursor: null } });
    assert.deepEqual(completed.map((item) => item.table), ['catalogue_sets', 'catalogue_cards']);
    assert.ok(completed[0].calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'set_id', setId])));
    for (const expected of [
      ['eq', 'set_id', setId], ['eq', 'catalogue_version_id', versionId],
      ['eq', 'language_code', language], ['gt', 'variant_id', variantId], ['limit', 6],
    ]) assert.ok(completed[1].calls.some((call) => JSON.stringify(call) === JSON.stringify(expected)));
  }
});

test('a missing published set keeps the empty-page contract without scanning cards', async () => {
  const { completed, service } = fixture({ data: null, error: null });
  assert.deepEqual(await service.setCards(setId, { limit: 5 }), { cards: [], pagination: { limit: 5, nextCursor: null } });
  assert.deepEqual(completed.map((item) => item.table), ['catalogue_sets']);
});

test('lookup failures and malformed versions do not become an unbounded card read', async () => {
  const lookupError = new Error('published set unavailable');
  const failing = fixture({ data: null, error: lookupError });
  await assert.rejects(failing.service.setCards(setId), lookupError);
  for (const catalogueVersion of [undefined, null, '', 'not-a-uuid']) {
    const { completed, service } = fixture({ data: { catalogue_version_id: catalogueVersion }, error: null });
    await assert.rejects(service.setCards(setId), (error) => error.code === 'catalogue_version_unavailable');
    assert.deepEqual(completed.map((item) => item.table), ['catalogue_sets']);
  }
});
