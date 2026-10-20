import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as graders from '../lib/graderRegistry';

async function main() {
  let owner: string | null = 'owner-a';
  const calls: Record<string, unknown>[] = [];
  let deferHistory = false;
  let releaseHistory: (() => void) | undefined;
  const soldAt = new Date(Date.now() - 86400000).toISOString();
  const base = { observationId: 'sale', variantId: 'variant', productType: 'raw_card', currency: 'GBP',
    observationType: 'sold_observation', provenLastSold: true, conditionCode: 'raw_near_mint',
    observedPrice: 10, shippingPrice: null, soldAt, providerCode: 'provider', sourceItemId: 'one' };
  const observations = [base, { ...base, observationId: 'delivery', sourceItemId: 'two', observedPrice: 20, shippingPrice: 7 },
    { ...base, observationId: 'duplicate' }, { ...base, sourceItemId: 'active', observationType: 'active_listing' },
    { ...base, sourceItemId: 'unproven', provenLastSold: false }, { ...base, sourceItemId: 'damaged', conditionCode: 'raw_damaged' },
    { ...base, sourceItemId: 'usd', currency: 'USD' }, { ...base, sourceItemId: 'other', variantId: 'another' },
    { ...base, sourceItemId: 'bad-date', soldAt: 'bad' }, { ...base, sourceItemId: 'zero', observedPrice: 0 }];
  const mocks: Record<string, unknown> = {
    './config': {}, './graderRegistry': graders, './stackrDomainAdapter': {},
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null } }) } } },
    './stackrApiV1': { stackrApiClient: { cardPriceHistory: async (_id: string, query: Record<string, unknown>) => {
      calls.push(query);
      if (deferHistory) await new Promise<void>(resolve => { releaseHistory = resolve; });
      if (query.productType === 'graded_card') throw Object.assign(new Error('Unavailable exact grade'), { code: 'unsupported_graded_history_identity' });
      return { data: { observations } };
    } } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync('lib/pricing.ts', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, Date, Error,
    require: (id: string) => { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
  const pricing = module.exports as typeof import('../lib/pricing');
  const result = await pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '1y');
  assert.deepEqual(Array.from(result, row => row.value), [10, 20], 'only proven, matching sales survive; delivery is excluded consistently');
  assert.equal(calls[0].limit, 200);
  assert.equal(calls[0].condition, 'raw_near_mint');
  assert.equal(calls[0].observationType, 'sold_observation');
  assert.equal(calls[0].currency, 'GBP');
  assert.equal(calls[0].provenOnly, true, 'proof must be filtered by the server before the page cap');
  assert.ok(Number.isFinite(Date.parse(String(calls[0].soldSince))), 'the selected sale window also precedes server pagination');
  await pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '1y');
  await pricing.fetchPokeTracePriceHistory('variant', 'raw_near_mint', '1y');
  assert.equal(calls.length, 1, 'repeat requests reuse the exact scoped cache');
  await pricing.fetchPokeTracePriceHistory('variant', 'DAMAGED', '1y');
  assert.equal(calls[1].condition, 'raw_damaged');
  assert.equal((await pricing.fetchPokeTracePriceHistory('variant', 'AGGREGATED')).length, 0, 'unknown tiers never become unfiltered sales');
  const graded = await pricing.fetchPokeTracePriceHistory('variant', 'PSA_9', '30d', { productType: 'graded_card', grader: 'PSA', grade: '9' });
  assert.equal(graded.length, 0, 'unsupported grade history keeps the price panel usable without mixing grades');
  assert.equal(calls.at(-1)?.grade, '9');
  owner = 'owner-b';
  await pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '1y');
  assert.equal(calls.length, 4, 'another account cannot consume an authenticated history cache');
  deferHistory = true;
  const pending = pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '7d');
  await new Promise(resolve => setImmediate(resolve));
  owner = 'owner-c';
  assert.ok(releaseHistory); releaseHistory();
  assert.equal((await pending).length, 0, 'an old authenticated response must not reach a new account');
  deferHistory = false;
  owner = null;
  assert.equal((await pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '1y')).length, 0);
  // Exercise the real JSX chart, rather than testing a duplicate source map.
  const chartModule = { exports: {} };
  const chartMocks: Record<string, unknown> = {
    react: { createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
      useMemo: (factory: () => unknown) => factory(), Fragment: 'Fragment' },
    'react-native': { View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
    'react-native-svg': { default: 'Svg', __esModule: true, Circle: 'Circle', Path: 'Path', Line: 'Line', Defs: 'Defs', LinearGradient: 'LinearGradient', Stop: 'Stop' },
    './StackrLoadingIndicator': {}, './Text': { Text: 'Text' }, './theme-context': {}, './SlabStickerLabel': {}, '../lib/pricing': {},
    '../assets/rev2/03-ui-illustrations/mascot/Stackrrev2_mascot-cutout.png': 'mascot',
  };
  const chartCode = ts.transpileModule(readFileSync('components/PokeTraceMarketInsights.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(`${chartCode}\nmodule.exports.testChart = MiniMarketChart;`, { module: chartModule, exports: chartModule.exports, Date,
    require: (id: string) => { assert.ok(id in chartMocks, `Unexpected chart dependency ${id}`); return chartMocks[id]; } });
  const chart = (chartModule.exports as { testChart: (input: unknown) => unknown }).testChart;
  const circles = (node: unknown): { props: { cx: number } }[] => {
    if (Array.isArray(node)) return node.flatMap(circles);
    if (!node || typeof node !== 'object') return [];
    const item = node as { type: string; props: { cx: number }; children: unknown[] };
    return [...(item.type === 'Circle' ? [item] : []), ...circles(item.children)];
  };
  const point = (source: string, date: string, value: number) => ({ source, date, value, avg: value, low: value, high: value, saleCount: 1 });
  assert.equal(circles(chart({ history: [point('poketrace_sold', '2026-10-08T00:00:00Z', 10), point('poketrace_sold', '2026-10-09T00:00:00Z', 12)], width: 300, height: 170 })).length, 1,
    'verified PokeTrace observations must create a plotted series');
  const mixed = circles(chart({ history: [point('poketrace_sold', '2026-10-08T00:00:00Z', 10), point('new_verified_provider', '2026-10-09T00:00:00Z', 12)], width: 300, height: 170 }));
  assert.equal(mixed.length, 2, 'single-sale sources and unfamiliar verified providers remain visible');
  assert.ok(mixed[0].props.cx < mixed[1].props.cx, 'different providers share the real chronological axis');
  const priceQueries: Record<string, unknown>[] = [];
  Object.assign(mocks['./stackrDomainAdapter'] as object, { fetchStackrPrice: async (_reference: string, query: Record<string, unknown>) => {
    priceQueries.push(query);
    return { price: { productType: query.productType, currency: 'GBP', status: 'market_estimate', estimates: { central: 12, low: 10, high: 14 },
      sample: { sold: 0, total: 1 }, sourceBreakdown: [] }, resolved: { variantId: 'variant', card: {
      names: { native: 'Pikachu', englishDisplay: 'Pikachu' }, set: { nativeName: 'Base Set', setCode: 'base1' }, collectorNumber: { value: '58' },
    } } };
  } });
  const effects: (() => unknown)[] = [];
  Object.assign(chartMocks.react as object, { useState: (initial: unknown) => [initial, () => {}], useEffect: (effect: () => unknown) => effects.push(effect) });
  Object.assign(chartMocks['react-native'] as object, { useWindowDimensions: () => ({ width: 400 }) });
  chartMocks['./theme-context'] = { useTheme: () => ({ theme: { colors: { semantic: {} } } }) };
  chartMocks['./SlabStickerLabel'] = { formatSlabCompanyLabel: (company?: string | null) => company?.trim() || 'PSA' };
  chartMocks['../lib/pricing'] = pricing;
  const panelModule = { exports: {} };
  vm.runInNewContext(chartCode, { module: panelModule, exports: panelModule.exports, Date,
    require: (id: string) => { assert.ok(id in chartMocks, `Unexpected panel dependency ${id}`); return chartMocks[id]; } });
  const panel = (panelModule.exports as { default: (props: unknown) => unknown }).default;
  owner = 'panel-owner';
  const renderPanel = async (scope: Record<string, unknown>) => {
    panel({ cardName: '11111111-1111-4111-8111-111111111111', rawCondition: 'raw_near_mint', summaryOnly: true, ...scope });
    const effect = effects.pop(); assert.ok(effect); effect();
    await new Promise(resolve => setImmediate(resolve));
  };
  await renderPanel({});
  assert.equal(priceQueries[0].productType, 'raw_card', 'the actual raw panel must reach a raw API query');
  assert.equal(priceQueries[0].grader, null, 'a visual PSA fallback cannot become a pricing identity');
  assert.equal(priceQueries[0].condition, 'raw_near_mint');
  await renderPanel({ gradingCompany: 'PSA', grade: '9' });
  assert.equal(priceQueries[1].productType, 'graded_card');
  assert.equal(priceQueries[1].grader, 'PSA'); assert.equal(priceQueries[1].grade, '9');
  await renderPanel({ grade: '9' });
  assert.equal(priceQueries[2].productType, 'graded_card', 'an incomplete slab request preserves intent for the server rejection');
  assert.equal(priceQueries[2].grader, null, 'missing actual grader must stay missing');
  const beforePartialHistory = calls.length;
  await renderPanel({ grade: '9', summaryOnly: false });
  await renderPanel({ gradingCompany: 'PSA', summaryOnly: false });
  assert.equal(calls.length, beforePartialHistory, 'partial slab props never fall through to a raw sales-history query');
  assert.equal((await pricing.fetchPokeTracePriceHistory('variant', 'NEAR_MINT', '30d', { productType: 'raw_card', grader: 'PSA' })).length, 0);
  console.log('Market history client: exact identity, proven sales, currency, delivery, limits and account cache passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
