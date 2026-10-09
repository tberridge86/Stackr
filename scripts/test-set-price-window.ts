import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
      if (request.endsWith('cataloguePriceBaseline')) return { provisionalCataloguePriceDisplay: () => ({ displayPrice: 0.25 }) };
      if (request.endsWith('cataloguePrices')) return {
        cataloguePriceScope: (account: string, options: { language: string }) => `${account}:${options.language}`,
        cataloguePriceCache: {
          subscribe: () => () => undefined,
          peek: (scope: string, references: string[]) => new Map(references.flatMap(reference => {
            const row = cache.get(scope)?.get(reference);
            return row ? [[reference, row]] : [];
          })),
        },
        cataloguePriceDisplay: (row: { value: number }) => ({ displayPrice: row.value }),
        fetchCataloguePrices: async (references: string[], options: { language: string }) => {
          assert.ok(owner);
          requests.push({ owner, references: [...references] });
          const scope = `${owner}:${options.language}`;
          const rows = cache.get(scope) ?? new Map();
          references.forEach(reference => rows.set(reference, { value: owner === 'owner-a' ? 1.05 : 10.25 }));
          cache.set(scope, rows);
        },
      };
      throw new Error(`Unexpected dependency: ${request}`);
    },
  });
  return {
    window: module.exports.cataloguePriceReadWindow as <T>(cards: T[], visibleCount: number, nearbyCount: number) => T[],
    render(cards: { id: string; language: string }[], requestCards: { id: string; language: string }[]) {
      cursor = 0;
      const result = (module.exports.useCataloguePriceOverlay as Function)(cards, { requestCards });
      pending.splice(0).forEach(effect => effect());
      return result as { runtimeCataloguePricing: { displayPrice: number } }[];
    },
    owner(next: string | null) { owner = next; },
    retainedRows: () => slots[0].value.rows.size,
    requests,
  };
}

async function main() {
  const overlay = loadOverlay();
  const cataloguePriceReadWindow = overlay.window;
  const cards = Array.from({ length: 80 }, (_, index) => ({ id: `card-${index}`, language: 'en' }));

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
  assert.ok(immediate.every(card => card.runtimeCataloguePricing.displayPrice === 0.25), 'Local fallbacks render before any quote request finishes.');
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
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 0.25, 'Account changes cannot display the previous account quote.');
  await settle();
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 10.25);
  const readCount = overlay.requests.length;
  overlay.owner(null);
  assert.equal(overlay.render(newSet, newSet)[0].runtimeCataloguePricing.displayPrice, 0.25);
  await settle();
  assert.equal(overlay.requests.length, readCount, 'Signed-out browsing must not request private stored quotes.');
  console.log('Set pricing passed: windowed requests, immediate fallbacks, quote retention, bounded memory and account isolation.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
