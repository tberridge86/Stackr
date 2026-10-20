import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fetchFastSetCards } from '../lib/fastSetCards.js';

const aliases = JSON.parse(readFileSync(new URL('../data/chinese-language-correction-aliases.json', import.meta.url)));
const version = '11111111-1111-4111-8111-111111111111';
const printing = '22222222-2222-4222-8222-222222222222';
const variant = '33333333-3333-4333-8333-333333333333';

function fixture(setId, language = 'zh-tw', overrides = {}) {
  const calls = [];
  const row = { set_id: setId, catalogue_version_id: version, language_code: language,
    printing_id: printing, variant_id: variant, collector_number: '001',
    card_native_name: '測試卡', variant_code: 'normal', finish_code: 'normal', ...overrides.row };
  const client = { schema(schema) {
    assert.equal(schema, 'api');
    return {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: [{ card_row: row, image_row: null }], error: null };
      },
      from(table) {
        const filters = [];
        const query = {
          select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
          order() { return this; }, limit() { return this; }, gt() { return this; },
          async maybeSingle() {
            calls.push({ table, filters });
            return { data: overrides.absent ? null : { catalogue_version_id: version, language_code: overrides.targetLanguage ?? language }, error: null };
          },
          then(resolve, reject) {
            calls.push({ table, filters });
            return Promise.resolve({ data: [row], error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };
  } };
  return { client, calls };
}

test('production fast set route corrects all five old sets for facts and artwork reads', async () => {
  for (const [source, target] of Object.entries(aliases.sets)) {
    for (const includeAssets of [false, true]) {
      const { client, calls } = fixture(target);
      const result = await fetchFastSetCards(client, source.toUpperCase(), { language: 'zh-cn', includeAssets, limit: 5 }, { catalogueVersionId: 'stale-version' });
      assert.equal(result.cards.length, 1);
      assert.equal(result.cards[0].languageCode, 'zh-tw');
      assert.equal(result.cards[0].set.setId, target);
      assert.ok(calls.some(call => call.table === 'catalogue_sets' && call.filters.some(([key, value]) => key === 'set_id' && value === target)));
      if (includeAssets) {
        const rpc = calls.find(call => call.name === 'catalogue_set_card_rows');
        assert.equal(rpc.args.p_set_id, target);
        assert.equal(rpc.args.p_language_code, 'zh-tw');
      } else {
        const facts = calls.find(call => call.table === 'catalogue_cards');
        assert.ok(facts.filters.some(([key, value]) => key === 'set_id' && value === target));
        assert.ok(facts.filters.some(([key, value]) => key === 'language_code' && value === 'zh-tw'));
        assert.ok(facts.filters.some(([key, value]) => key === 'catalogue_version_id' && value === version));
      }
    }
  }
});

test('fast correction rejects missing or wrong-language targets and wrong card rows', async () => {
  const [source, target] = Object.entries(aliases.sets)[0];
  for (const includeAssets of [false, true]) {
    for (const overrides of [{ absent: true }, { targetLanguage: 'zh-cn' }, { row: { language_code: 'zh-cn' } }, { row: { set_id: source } }]) {
      const { client } = fixture(target, 'zh-tw', overrides);
      await assert.rejects(() => fetchFastSetCards(client, source, { includeAssets }), error => error.code === 'invalid_language_correction');
    }
  }
});

test('unrelated valid language reads keep their identity and avoid correction metadata lookup', async () => {
  const setId = '44444444-4444-4444-8444-444444444444';
  const { client, calls } = fixture(setId, 'ja');
  const result = await fetchFastSetCards(client, setId, { language: 'ja' });
  assert.equal(result.cards[0].languageCode, 'ja');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_set_id, setId);
  assert.equal(calls[0].args.p_language_code, 'ja');
  await assert.rejects(() => fetchFastSetCards(client, setId, { language: 'bad' }), error => error.code === 'invalid_language');
});
