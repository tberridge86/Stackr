import assert from 'node:assert/strict';
import { fetchForeignPokemonCard, invalidateForeignPokemonSetReferenceCache } from '../lib/foreignPokemon';

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string) => {
    const url = String(input); calls.push(url);
    const language = new URL(url).searchParams.get('language') ?? 'en';
    return new Response(JSON.stringify({ source: 'tcgdex', language, card: {
      id: `${language}:base-001`, providerCardId: 'base-001', language, region: language,
      name: 'Card', localId: '001', pricing: { preferredGbp: null, preferredSource: null, preferredVariant: null, cardmarket: [], tcgplayer: [] },
    } }));
  }) as typeof fetch;
  try {
    const [left, right] = await Promise.all([fetchForeignPokemonCard('base-001', { language: 'fr' }), fetchForeignPokemonCard('base-001', { language: 'fr' })]);
    assert.equal(left?.language, 'fr'); assert.equal(right?.language, 'fr'); assert.equal(calls.length, 1);
    assert.equal((await fetchForeignPokemonCard('base-001', { language: 'de' }))?.language, 'de');
    assert.equal(calls.length, 2, 'a different language cannot use another printing cache entry');
    invalidateForeignPokemonSetReferenceCache();
    await fetchForeignPokemonCard('base-001', { language: 'fr' });
    assert.equal(calls.length, 3, 'explicit invalidation permits a fresh read');
    console.log('Foreign detail caching coalesces same-language reads and isolates language identities.');
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
