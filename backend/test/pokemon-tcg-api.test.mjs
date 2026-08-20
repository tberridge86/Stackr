import assert from 'node:assert/strict';
import test from 'node:test';
import { createPokemonTcgApiClient } from '../lib/pokemonTcgApi.js';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('Pokemon TCG API client sends the server-side key and clamps pageSize to 250', async () => {
  const calls = [];
  const client = createPokemonTcgApiClient({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return json({ data: [{ id: 'base1' }], page: 1, pageSize: 250, count: 1, totalCount: 1 });
    },
  });

  const result = await client.fetchPage('sets', { pageSize: 999 });
  assert.equal(result.data[0].id, 'base1');
  assert.equal(calls[0].url.searchParams.get('pageSize'), '250');
  assert.equal(calls[0].options.headers['X-Api-Key'], 'test-key');
});

test('Pokemon TCG API set mirroring paginates to totalCount without gaps', async () => {
  const requestedPages = [];
  const client = createPokemonTcgApiClient({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));
      requestedPages.push(page);
      const data = page === 1
        ? [{ id: 'set-1' }, { id: 'set-2' }]
        : [{ id: 'set-3' }];
      return json({ data, page, pageSize: 2, count: data.length, totalCount: 3 });
    },
  });

  const sets = await client.fetchAll('sets', { pageSize: 2 });
  assert.deepEqual(sets.map((set) => set.id), ['set-1', 'set-2', 'set-3']);
  assert.deepEqual(requestedPages, [1, 2]);
});

test('Pokemon TCG API mirroring rejects duplicate ids across pages', async () => {
  const client = createPokemonTcgApiClient({
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      const data = page === 1
        ? [{ id: 'duplicate' }, { id: 'set-2' }]
        : [{ id: 'duplicate' }];
      return json({ data, page, pageSize: 2, count: data.length, totalCount: 3 });
    },
  });

  await assert.rejects(
    client.fetchAll('sets', { pageSize: 2 }),
    (error) => error.code === 'pokemon_tcg_duplicate_record',
  );
});

test('Pokemon TCG API set filter uses the v2 q parameter', async () => {
  let requestUrl;
  const client = createPokemonTcgApiClient({
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return json({ data: [], page: 1, pageSize: 250, count: 0, totalCount: 0 });
    },
  });

  const rows = await client.fetchCardsBySet('sv3pt5');
  assert.deepEqual(rows, []);
  assert.equal(requestUrl.searchParams.get('q'), 'set.id:sv3pt5');
});

test('inconsistent provider pagination fails closed', async () => {
  const client = createPokemonTcgApiClient({
    fetchImpl: async () => json({
      data: [{ id: 'set-1' }],
      page: 1,
      pageSize: 250,
      count: 2,
      totalCount: 1,
    }),
  });

  await assert.rejects(
    client.fetchPage('sets'),
    (error) => error.code === 'pokemon_tcg_pagination_inconsistent',
  );
});
