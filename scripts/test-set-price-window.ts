import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as baseline from '../lib/cataloguePriceBaseline';

function loadOverlay() {
  let owner: string | null = 'owner-a';
  let cursor = 0;
  const slots: any[] = [];
  const pending: (() => void)[] = [];
  const requests: { owner: string; references: string[] }[] = [];
  const cache = new Map<string, Map<string, any>>();
  const changed = (left: unknown[] | undefined, right: unknown[]) => !left || right.some((value, index) => !Object.is(value, left[index]));
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (update: any) => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update; }];
    },
    useMemo(compute: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: compute(), deps };
      return slots[index].value;
    },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) pending.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { cleanup: effect(), deps };
      });
    },
  };
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync('lib/useCataloguePriceOverlay.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Map, Set, process: { env: { EXPO_PUBLIC_STACKR_API_ENABLED: 'true' } },
    require(request: string) {
      if (request === 'react') return react;
      if (request.endsWith('auth-context')) return { useAuth: () => ({ user: owner ? { id: owner } : null }) };
      if (request.endsWith('stackrApiV1')) return { stackrApiClient: { getPricingCacheScope: () => Promise.resolve(owner) } };
      if (request.endsWith('stackrDomainAdapter')) return { toStackrApiLanguage: (language: string) => language };
      if (request.endsWith('cataloguePriceBaseline')) return baseline;
      if (request.endsWith('cataloguePrices')) return {
        cataloguePriceScope: (account: string, options: { language: string }) => `${account}:${options.language}`,
        cataloguePriceCache: {
          subscribe: () => () => undefined,
          peek: (scope: string, references: string[]) => new Map(references.flatMap(reference => {
            const row = cache.get(scope)?.get(reference);
            return row ? [[reference, row]] : [];
          })),
        },
        cataloguePriceDisplay: (row: { value: number; provisional?: boolean }) => ({ displayPrice: row.value, provisional: row.provisional ?? false }),
        fetchCataloguePrices: async (references: string[], options: { language: string }) => {
          assert.ok(owner);
          requests.push({ owner, references: [...references] });
          const scope = `${owner}:${options.language}`;
          const rows = cache.get(scope) ?? new Map();
          references.forEach(reference => { if (!rows.has(reference)) rows.set(reference, { value: owner === 'owner-a' ? 1.05 : 10.25 }); });
          cache.set(scope, rows);
        },
      };
      throw new Error(`Unexpected dependency: ${request}`);
    },
  });
  return {
    window: module.exports.cataloguePriceReadWindow as <T>(cards: T[], visibleCount: number, nearbyCount: number) => T[],
    render(cards: any[], requestCards: any[]) {
      cursor = 0;
      const result = (module.exports.useCataloguePriceOverlay as Function)(cards, { requestCards });
      pending.splice(0).forEach(effect => effect());
      return result as any[];
    },
    owner(next: string | null) { owner = next; },
    retainedRows: () => slots[0].value.rows.size,
    requests,
    seed(reference: string, row: { value: number; provisional?: boolean; [key: string]: any }) {
      const rows = cache.get('owner-a:en') ?? new Map(); rows.set(reference, row); cache.set('owner-a:en', rows);
    },
  };
}

async function main() {
  const overlay = loadOverlay();
  const cataloguePriceReadWindow = overlay.window;
  const cards = Array.from({ length: 80 }, (_, index) => ({ id: `card-${index}`, language: 'en', rarity: 'Common', set: { releaseDate: '2024-01-01' } }));

  const initial = cataloguePriceReadWindow(cards, 16, 12);
  assert.equal(initial.length, 28, 'initial grid reads visible cards plus one nearby page only');
  assert.deepEqual(initial.map((card) => card.id), cards.slice(0, 28).map((card) => card.id));
  assert.equal(cataloguePriceReadWindow(cards, 28, 12).length, 40, 'next grid page expands the read window');
  assert.equal(cataloguePriceReadWindow(cards, 500, 12).length, cards.length, 'the window never exceeds loaded cards');
  assert.equal(cataloguePriceReadWindow(cards, -1, -4).length, 0, 'invalid counts cannot trigger a read');
  assert.equal(cataloguePriceReadWindow(cards, Infinity, NaN).length, 0, 'non-finite counts cannot request a whole catalogue');
  assert.equal(cards.length, 80, 'windowing does not mutate the loaded set');

  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const immediate = overlay.render(cards, initial);
  assert.equal(immediate.length, 80, 'All display cards remain present while quote reads are windowed.');
  assert.ok(immediate.every(card => card.runtimeCataloguePricing.displayPrice === 0.09), 'Eligible local fallbacks render before any quote request finishes.');
  await settle();
  assert.equal(overlay.requests[0].references.length, 28, 'Opening an 80-card set must not request the entire set.');
  let priced = overlay.render(cards, initial);
  assert.equal(priced[0].runtimeCataloguePricing.displayPrice, 1.05);

  const laterWindow = cards.slice(28, 40);
  overlay.render(cards, laterWindow);
  await settle();
  priced = overlay.render(cards, laterWindow);
  assert.equal(overlay.requests[1].references.length, 12);
  assert.equal(priced[0].runtimeCataloguePricing.displayPrice, 1.05, 'Moving the read window must preserve already-read quotes.');
  assert.equal(priced[39].runtimeCataloguePricing.displayPrice, 1.05);

  const newSet = cards.slice(79);
  overlay.render(newSet, newSet);
  await settle();
  overlay.render(newSet, newSet);
  assert.equal(overlay.retainedRows(), 1, 'Navigating sets must discard prices outside the current card list.');
  overlay.owner('owner-b');
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 0.09, 'Account changes cannot display the previous account quote.');
  await settle();
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 10.25);
  const readCount = overlay.requests.length;
  overlay.owner(null);
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 0.09);
  await settle();
  assert.equal(overlay.requests.length, readCount, 'Signed-out browsing must not request private stored quotes.');
  const quality = loadOverlay();
  const cases = [
    { id: 'vintage', language: 'en', rarity: 'Rare Holo', set: { releaseDate: '1999-01-09' } },
    { id: 'unknown', language: 'en' },
    { id: 'nested', language: 'en', raw: { raw_data: { rarity: 'Common', set: { release_date: '2024-01-01' } } } },
    { id: 'reverse', language: 'en', rarity: 'Common', set: { release_date: '2024-01-01' },
      raw_data: { stackr: { defaultVariantId: 'reverse-variant', variants: [{ variantId: 'reverse-variant', variantCode: 'reverse_holo', finishCode: 'reverse_holo' }] } } },
    { id: 'embedded', language: 'en', rarity: 'Rare', set: { releaseDate: '1999' }, pricing: { displayPrice: 99 } },
    { id: 'real-cheap', language: 'en', rarity: 'Rare', set: { releaseDate: '1999' } },
  ];
  quality.seed('vintage', { value: 0.25, provisional: true });
  quality.seed('embedded', { value: 0.25, provisional: true });
  quality.seed('real-cheap', { value: 0.25 });
  const first = quality.render(cases, cases);
  assert.equal(first[0].runtimeCataloguePricing, undefined, 'Vintage rares never receive a generic cheap estimate.');
  assert.equal(first[1].runtimeCataloguePricing, undefined, 'Missing metadata never becomes £0.25.');
  assert.equal(first[2].runtimeCataloguePricing.displayPrice, 0.09, 'Nested snake-case release metadata permits only eligible modern bulk estimates.');
  assert.equal(first[3].runtimeCataloguePricing, undefined, 'Canonical selected special finishes cannot receive ordinary common prices.');
  await settle();
  const resolved = quality.render(cases, cases);
  assert.equal(resolved[0].runtimeCataloguePricing, undefined, 'Stored provisional quotes must also pass current card eligibility.');
  assert.equal(resolved[4].runtimeCataloguePricing, undefined, 'A provisional quote must not overwrite an embedded card price.');
  assert.equal(resolved[4].pricing.displayPrice, 99);
  assert.equal(resolved[5].runtimeCataloguePricing.displayPrice, 0.25, 'Real exact low-price quotes remain visible without arbitrary floors.');
  const published = loadOverlay();
  // stackrCardToLegacyCard -> Pokédex mapCardRow retains canonical variants and
  // set names, but facts-only cards do not contain the server's release date.
  const pokemonCard = { id: 'pokemon-printing', language: 'en', rarity: 'Common', raw_data: {
    set: { id: 'pokemon-set', name: 'Modern Set' }, stackr: { defaultVariantId: 'pokemon-normal',
      variants: [{ variantId: 'pokemon-normal', variantCode: 'normal', finishCode: 'non_holo' }] },
  } };
  const publishedRow = { value: 0.09, provisional: true, reference: 'pokemon-normal', cardId: 'pokemon-printing',
    variantId: 'pokemon-normal', language: 'en', price: { variantId: 'pokemon-normal', productType: 'raw_card', currency: 'GBP',
      estimateVersion: baseline.PROVISIONAL_CATALOGUE_PRICE_MODEL,
      fallbackEstimate: { reason: 'provisional_catalogue_baseline', exact: false, identityKey: 'pokemon-normal',
        baseVariantId: 'pokemon-normal', printingId: 'pokemon-printing', language: 'en' },
      sourceBreakdown: [{ provider: 'stackr_catalogue_baseline', modelVersion: baseline.PROVISIONAL_CATALOGUE_PRICE_MODEL,
        metadataStatus: 'published_card_and_set', rarity: 'common', usableForExactVariant: false, usableForHoldingsValuation: false }],
    } };
  published.seed('pokemon-normal', publishedRow);
  assert.equal(published.render([pokemonCard], [pokemonCard])[0].runtimeCataloguePricing, undefined, 'No offline estimate is invented without the release date.');
  await settle();
  assert.equal(published.render([pokemonCard], [pokemonCard])[0].runtimeCataloguePricing.displayPrice, 0.09,
    'Published metadata-verified server estimates survive the actual facts-only Pokédex shape.');
  const alreadyPricedPokemon = { ...pokemonCard, estimated_value: 1.25, price_source: 'stackr-api' };
  assert.equal(published.render([alreadyPricedPokemon], [alreadyPricedPokemon])[0].runtimeCataloguePricing, undefined,
    'A real Pokédex price already retrieved by the exact API is preserved over a provisional category estimate.');
  for (const bad of [{ language: 'ja' }, { cardId: 'wrong-printing' },
    { price: { ...publishedRow.price, estimateVersion: 'catalogue-rarity-era-baseline-v1' } },
    { price: { ...publishedRow.price, sourceBreakdown: [] } }]) {
    const rejected = loadOverlay(); rejected.seed('pokemon-normal', { ...publishedRow, ...bad });
    rejected.render([pokemonCard], [pokemonCard]); await settle();
    assert.equal(rejected.render([pokemonCard], [pokemonCard])[0].runtimeCataloguePricing, undefined,
      'A date-less client can only trust current published server estimates for the matching language and printing.');
  }
  console.log('Set pricing passed: windowed requests, immediate fallbacks, quote retention, bounded memory and account isolation.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
