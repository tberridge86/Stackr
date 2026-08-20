import assert from 'node:assert/strict';
import {
  PokemonTcgApiSourceAdapter,
  pokemonTcgApiAdapterInternals,
} from './catalogue-ingestion/pokemonTcgApiAdapter';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function main() {
  assert.throws(
    () => new PokemonTcgApiSourceAdapter({ language: 'ja' }),
    /English reconciliation source/,
  );
  assert.equal(pokemonTcgApiAdapterInternals.escapedQueryValue('set:one'), 'set\\:one');

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; headers: HeadersInit | undefined }> = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, headers: init?.headers });
      return json({
        data: [{
          id: 'sv3pt5-6',
          name: 'Charizard ex',
          number: '006',
          rarity: 'Double Rare',
          set: { id: 'sv3pt5', name: '151', printedTotal: 165, total: 207 },
          images: {
            small: 'https://images.pokemontcg.io/sv3pt5/6.png',
            large: 'https://images.pokemontcg.io/sv3pt5/6_hires.png',
          },
          tcgplayer: { prices: { holofoil: { market: 8.5 }, reverseHolofoil: { market: 7.5 } } },
        }],
        page: 1,
        pageSize: 250,
        count: 1,
        totalCount: 1,
      });
    }) as typeof fetch;

    const adapter = new PokemonTcgApiSourceAdapter({
      language: 'en',
      apiKey: 'server-only-test-key',
      licenceStatus: 'under_review',
      assetLicenceStatus: 'under_review',
    });
    const cards = await adapter.fetchCards({ setId: 'sv3pt5' });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].provider, 'pokemon-tcg-api');
    assert.equal(cards[0].languageCode, 'en');
    assert.equal(calls[0].url.searchParams.get('q'), 'set.id:sv3pt5');
    assert.equal((calls[0].headers as Record<string, string>)['X-Api-Key'], 'server-only-test-key');

    const normalised = adapter.normaliseRecord(cards[0]);
    assert.equal(normalised.setCode, 'sv3pt5');
    assert.equal(normalised.collectorNumber, '006');
    assert.equal(normalised.collectorNumberSort, 6);
    assert.equal(normalised.languageCode, 'en');
    assert.equal(normalised.imageUrl, 'https://images.pokemontcg.io/sv3pt5/6_hires.png');
    assert.equal(normalised.licenceStatus, 'under_review');

    const variants = await adapter.fetchVariants({ setId: 'sv3pt5' });
    assert.equal(variants.length, 1);
    assert.equal(variants[0].payload.variant, 'reverse_holo');

    const assets = await adapter.fetchAssets({ setId: 'sv3pt5' });
    assert.equal(assets.length, 1);
    assert.equal(assets[0].recordType, 'asset');
    assert.equal(assets[0].licenceStatus, 'under_review');
    assert.equal(assets[0].payload.image_language_code, 'en');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Pokemon TCG API catalogue adapter tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
