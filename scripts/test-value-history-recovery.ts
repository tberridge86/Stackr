import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as history from '../lib/valueHistoryRead';
import * as cache from '../lib/homeCollectionCache';

const source = process.env.VALUE_HISTORY_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:app/value-history.tsx'], { encoding: 'utf8' })
  : readFileSync('app/value-history.tsx', 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const marketRow = () => ({ variantId: 'exact-ja-variant', sealedProductVariantId: null, productType: 'raw_card' as const,
  currency: 'GBP', currentEstimate: 1234.567, previousEstimate: 1200.123, percentageChange: 2.87,
  confidence: { score: 0.6, label: 'medium' }, calculatedAt: at(1), previousCalculatedAt: at(25), comparisonDays: 1, priceBasis: 'catalogue_market_guide' as const, sourceProvider: 'tcgcsv' as const });
const marketCoverage = () => ({ scope: 'catalogue_daily', state: 'ready', source: 'tcgcsv', publishedVariants: 3, supportedVariants: 2, quotedVariants: 1, comparableVariants: 1, unsupportedVariants: 1, unquotedVariants: 1, staleVariants: 0, insufficientHistoryVariants: 0, latestSourceAt: at(1), asOf: at(0) });
const prepared = (total = 12) => ({ state: 'ready' as const, requestedCollectionRevision: 'holdings-1', refreshRequest: null,
  summary: { total, currency: 'GBP' as const, totalUnits: 3, distinctPriceIdentities: 2, pricedUnits: 2, freshUnits: 1,
    olderPriceUnits: 1, unpricedUnits: 1, pending: 0, retrying: 0, unsupported: 1, unresolved: 0, noProviderQuote: 0,
    oldestSourceAt: at(48), latestSourceAt: at(1), collectionRevision: 'holdings-1', valuationRevision: 'valuation-2',
    calculatedAt: at(1), binders: [], refresh: null,
    trend: { scope: 'exact-holdings-coverage-methodology', evidence: 'e2', eligible: true, pricedUnits: 2, totalUnits: 3,
      points: [{ at: at(24), total: total - 2, evidence: 'e1' }, { at: at(1), total, evidence: 'e2' }] } } });
const nodes = (value: any): any[] => !value || typeof value !== 'object' ? [] : Array.isArray(value)
  ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const text = (tree: any) => nodes(tree).filter((node) => node.type === 'Text')
  .flatMap((node) => node.props.children.flat(Infinity)).join(' ');

// Execute the real screen's hooks and actual Retry callbacks. All I/O is mocked;
// neither prepared-summary queue writes nor provider refreshes are invoked.
function harness(options: {
  market?: () => Promise<any>;
  collection?: () => Promise<any>;
  previews?: () => Promise<any>;
  stored?: () => Promise<string | null>;
} = {}) {
  let auth: any = { user: { id: 'A' }, loading: false, error: null, cachedReadSession: { epoch: 1 } };
  const slots: any[] = []; let cursor = 0; let tree: any; let effects: (() => void)[] = [];
  const calls = { market: 0, collection: 0, binders: 0, prices: 0, previews: 0, marketQueries: [] as any[] };
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((v, index) => v === b[index]);
  const memo = (factory: () => any, deps: any[]) => { const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; };
  const React: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (value: any) => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo: memo, useCallback: (cb: any, deps: any[]) => memo(() => cb, deps),
    useEffect: (cb: any, deps: any[]) => { const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; const slot = slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slot.cleanup?.(); slot.cleanup = cb(); }); } },
  };
  const theme = { colors: new Proxy({}, { get: () => '#123456' }) };
  const refreshAuth = async () => {};
  const api = {
    marketMovers: async (query: any) => { calls.market++; calls.marketQueries.push(query); return { data: { coverage: marketCoverage(), movers: await (options.market?.() ?? Promise.resolve([marketRow()])) } }; },
    collectionValuation: async () => { calls.collection++; return { data: await (options.collection?.() ?? Promise.resolve(prepared())) }; },
    requestMarketPriceRefresh: () => { throw new Error('Forbidden provider refresh in stored history read.'); },
    requestCollectionValuationRefresh: () => { throw new Error('Forbidden explicit valuation refresh.'); },
  };
  const dependencies: Record<string, any> = {
    react: React, '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { Stack: { Screen: 'Screen' }, router: { back() {}, push() {} } },
    'react-native': { ...Object.fromEntries(['Image', 'RefreshControl', 'ScrollView', 'TouchableOpacity', 'View'].map((name) => [name, name])),
      StyleSheet: { create: (value: any) => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '../components/StackrFunctionalIcon': { StackrFunctionalIcon: 'Image' },
    '@react-native-async-storage/async-storage': { getItem: () => options.stored?.() ?? Promise.resolve(null) },
    'react-native-svg': { default: 'Svg', Defs: 'Defs', LinearGradient: 'Gradient', Path: 'Path', Stop: 'Stop' },
    '../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Spinner' }, '../components/Text': { Text: 'Text' },
    '../components/theme-context': { useTheme: () => ({ theme }) },
    '../components/auth-context': { useAuth: () => ({ ...auth, refreshAuth }),
      isKnownAuthDenial: (error: any) => error?.status === 401 || error?.status === 403 },
    '../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../components/StackrBackButton': { StackrBackButton: 'Back' },
    '../components/StackrScreen': { StackrPageTitle: 'PageTitle' },
    '../lib/stackrIcons': { stackrIcons: { marketMovers: 'icon' } }, '../lib/stackrSizing': { stackrTabContentPadding: { standard: 80 } },
    '../lib/typography': { tabularNumberStyle: {}, typeScale: {} },
    '../lib/stackrApiV1': { stackrApiClient: api },
    '../lib/pokemonTcg': { attachLiveTcgdexCardReferences: (rows: any) => rows, getPokemonSetLogoUrl: () => undefined },
    '../lib/pokemonDisplayNames': { getPreferredSetDisplayName: () => 'Exact Japanese fixture' },
    '../lib/scanCardReferenceHydration': { hydrateCardReferenceRowMapWithLiveTcgdexReferences: async (rows: any) => rows },
    '../lib/stackrDomainAdapter': { fetchStackrCardRows: async () => { calls.previews++; return options.previews?.() ?? new Map(); } },
    '../lib/valueHistoryRead': { ...history, VALUE_HISTORY_READ_TIMEOUT_MS: 25, VALUE_HISTORY_PREVIEW_TIMEOUT_MS: 25 },
    '../lib/homeCollectionCache': cache,
    // Baseline-only dependencies. They must never be reached by the repair.
    '../lib/binders': { fetchBinders: async () => { calls.binders++; return []; }, fetchBinderCards: async () => [] },
    '../lib/ownership': { fetchOwnedCardRows: async () => [] },
    '../lib/collectionPricingApi': { loadCollectionPrices: async () => { calls.prices++; return []; } },
    '../lib/collectionPricingState': { summariseCollectionPricing: () => ({ total: null }), getCollectionPriceCoverageLabel: () => 'Unavailable' },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, console: { log() {} }, Set, Map, Date,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  const render = () => { cursor = 0; tree = exports.default(); return tree; };
  const flush = async () => { const pending = effects; effects = []; pending.forEach((run) => run());
    await tick(); await tick(); render(); };
  const section = (title: string) => nodes(tree).find((node) => node.props?.title === title);
  const retry = (label: string) => nodes(tree).find((node) => node.props?.accessibilityLabel === label);
  return { render, flush, calls, section, retry, nodes: () => nodes(tree), text: () => text(tree),
    renderChild: (node: any) => {
      const parentSlots = slots.slice(); const parentCursor = cursor;
      slots.length = 0; cursor = 0;
      try { return node.type(node.props); }
      finally { slots.length = 0; slots.push(...parentSlots); cursor = parentCursor; }
    },
    switchAuth: (id: string | null, epoch: number) => { auth = { ...auth, user: id ? { id } : null, cachedReadSession: { epoch } }; render(); },
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}

async function run() {
  const pictures = deferred<Map<string, any>>(); const first = harness({ previews: () => pictures.promise });
  first.render(); await first.flush();
  assert.equal(nodes(first.section('Daily movers')).filter((node) => node.type === 'Spinner').length, 0,
    'Stored market facts settle before optional card previews.');
  assert.equal(first.calls.market, 1, 'A market load makes one bounded paired-estimate request.');
  assert.equal(first.calls.previews, 1, 'The pending optional preview path was exercised.');
  assert.equal(first.calls.binders, 0, 'Collection history cannot fan out across every binder.');
  assert.equal(first.calls.prices, 0, 'Collection history cannot trigger per-card price retrieval.');
  const chart = first.nodes().find((node) => node.type?.name === 'ValueHistoryChart');
  assert.deepEqual(Array.from(chart.props.points, (point: any) => point.value), [10, 12], 'The actual screen displays genuine scoped stored history.');
  assert.doesNotMatch(text(first.renderChild(chart)), /invalid date/i, 'The chart tracker renders full observation timestamps as real dates.');
  assert.match(first.text(), /1 unpriced cards excluded/); assert.match(first.text(), /1 cards use older stored estimates/);
  assert.equal(first.calls.marketQueries[0].scope, 'catalogue_daily');
  assert.equal(first.calls.marketQueries[0].sortBy, 'money');
  first.unmount(); pictures.resolve(new Map()); await tick();

  let rankingReads = 0;
  const rankSwitch = harness({ market: () => ++rankingReads === 1 ? Promise.resolve([marketRow()]) : Promise.reject(new Error('ranking unavailable')) });
  rankSwitch.render(); await rankSwitch.flush();
  assert.ok(rankSwitch.nodes().some(node => node.type?.name === 'MoverColumn'));
  rankSwitch.nodes().find(node => node.type?.name === 'MoverDisplayToggle').props.onChange('percent');
  rankSwitch.render();
  assert.equal(rankSwitch.nodes().some(node => node.type?.name === 'MoverColumn'), false, 'Old cash top-100 is masked immediately after percentage selection.');
  await rankSwitch.flush();
  assert.equal(rankSwitch.calls.marketQueries.at(-1).sortBy, 'percent');
  assert.equal(rankSwitch.nodes().some(node => node.type?.name === 'MoverColumn'), false, 'A failed percentage read cannot mislabel a cash-ranked subset.');
  assert.match(rankSwitch.text(), /Daily catalogue prices are not available/);
  rankSwitch.unmount();

  const hanging = deferred<any>(); let reads = 0;
  const recover = harness({ collection: () => ++reads === 1 ? hanging.promise : Promise.resolve(prepared(22)) });
  recover.render(); await recover.flush(); await new Promise((resolve) => setTimeout(resolve, 40)); recover.render();
  assert.equal(nodes(recover.section('Collection history')).some((node) => node.type === 'Spinner'), false, 'An essential read has a bounded loading state.');
  const retry = recover.retry('Retry collection value history'); assert.ok(retry, 'A timed-out private lane exposes actual Retry.');
  retry.props.onPress(); await recover.flush();
  assert.match(recover.text(), /£22\.00/); assert.doesNotMatch(recover.text(), /temporarily unavailable/);
  hanging.resolve(prepared(999)); await tick(); recover.render(); assert.doesNotMatch(recover.text(), /999/);
  recover.unmount();

  const marketHang = deferred<any>();
  const independent = harness({ market: () => marketHang.promise }); independent.render(); await independent.flush();
  assert.match(independent.text(), /£12\.00/, 'A hung market read cannot hold the private collection result.');
  await new Promise((resolve) => setTimeout(resolve, 40)); independent.render();
  assert.equal(nodes(independent.section('Daily movers')).some((node) => node.type === 'Spinner'), false);
  assert.ok(independent.retry('Retry stored market value history')); independent.unmount();
  marketHang.resolve([]); await tick();

  let mode = 0; const oldRefresh = deferred<any>();
  const retained = harness({ collection: () => mode === 0 ? Promise.resolve(prepared(31))
    : mode === 1 ? Promise.reject(new Error('private fixture transport detail')) : oldRefresh.promise });
  retained.render(); await retained.flush(); mode = 1;
  retained.retry('Retry collection value history').props.onPress(); await retained.flush();
  assert.match(retained.text(), /£31\.00/, 'A failed read retains useful same-account valuation and chart.');
  assert.match(retained.text(), /temporarily unavailable/); assert.doesNotMatch(retained.text(), /private fixture/);
  mode = 2; retained.retry('Retry collection value history').props.onPress(); await retained.flush();
  retained.switchAuth('B', 2); assert.doesNotMatch(retained.text(), /£31\.00/, 'Private values are hidden in the account-transition render, before effects run.');
  await retained.flush(); retained.switchAuth('A', 3); await retained.flush();
  oldRefresh.resolve(prepared(777)); await tick(); retained.render();
  // Both newly scoped requests deliberately share the fixture promise; the old
  // request still cannot win a newer successful request in the race below.
  retained.switchAuth(null, 4); assert.doesNotMatch(retained.text(), /£777\.00/); await retained.flush(); retained.unmount();

  const old = deferred<any>(); let n = 0;
  const race = harness({ collection: () => ++n === 1 ? old.promise : Promise.resolve(prepared(44)) });
  race.render(); await race.flush(); race.switchAuth('B', 2); await race.flush(); race.switchAuth('A', 3); await race.flush();
  old.resolve(prepared(999)); await tick(); race.render(); assert.match(race.text(), /£44\.00/); assert.doesNotMatch(race.text(), /999/); race.unmount();

  let refreshes = 0; const earlier = deferred<any>();
  const overlap = harness({ collection: () => ++refreshes === 1 ? Promise.resolve(prepared(18))
    : refreshes === 2 ? earlier.promise : Promise.resolve(prepared(45)) });
  overlap.render(); await overlap.flush(); overlap.retry('Retry collection value history').props.onPress(); await overlap.flush();
  overlap.retry('Retry collection value history').props.onPress(); await overlap.flush();
  earlier.resolve(prepared(999)); await tick(); overlap.render();
  assert.match(overlap.text(), /£45\.00/); assert.doesNotMatch(overlap.text(), /999/, 'A superseded same-account refresh cannot overwrite newer evidence.'); overlap.unmount();

  let denied = false;
  const access = harness({ collection: () => denied ? Promise.reject(Object.assign(new Error('fixture denied'), { status: 403 })) : Promise.resolve(prepared(67)) });
  access.render(); await access.flush(); denied = true; access.retry('Retry collection value history').props.onPress(); await access.flush();
  assert.doesNotMatch(access.text(), /£67\.00/, 'An access denial clears prior private values rather than retaining them as a transient failure.');
  assert.match(access.text(), /access could not be verified/); access.unmount();

  const savedSnapshot = { pricingContractVersion: 4, cachedAt: Date.now(), collectionTotal: 52,
    collectionPricingSummary: { total: 52, totalUnits: 3, pricedUnits: 2, unpricedUnits: 1,
      exactPricedUnits: 2, generalEstimateUnits: 0, staleUnits: 1 },
    collectionValueReads: [{ total: 49, totalUnits: 3, pricedUnits: 2, identitySignature: 'owned-scope', capturedAt: at(24) },
      { total: 52, totalUnits: 3, pricedUnits: 2, identitySignature: 'owned-scope', capturedAt: at(1) }] };
  const storedRaw = cache.serializeHomeCollectionCache('A', savedSnapshot);
  const unavailable = harness({ collection: () => Promise.reject(Object.assign(new Error('fixture feature off'), { status: 404 })), stored: async () => storedRaw });
  unavailable.render(); await unavailable.flush(); assert.match(unavailable.text(), /£52\.00/); assert.match(unavailable.text(), /Last saved/);
  assert.match(unavailable.text(), /holdings and price freshness have not been rechecked/);
  assert.equal(unavailable.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  unavailable.switchAuth('B', 2); await unavailable.flush(); assert.doesNotMatch(unavailable.text(), /£52\.00/, 'The saved cache envelope must match the active owner.'); unavailable.unmount();
  const pendingResponse = { state: 'pending' as const, requestedCollectionRevision: 'holdings-1', summary: null, refreshRequest: null };
  const preparation = deferred<any>();
  const savedFirst = harness({ collection: () => preparation.promise, stored: async () => storedRaw });
  savedFirst.render(); await savedFirst.flush();
  assert.equal(savedFirst.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  preparation.resolve(pendingResponse); await savedFirst.flush();
  assert.match(savedFirst.text(), /£52\.00/, 'Pending preparation cannot erase validated same-owner saved history.');
  assert.match(savedFirst.text(), /Last saved/); assert.match(savedFirst.text(), /holdings and price freshness have not been rechecked/);
  assert.match(savedFirst.text(), /valuation is being prepared/);
  assert.equal(savedFirst.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  savedFirst.switchAuth('B', 2); await savedFirst.flush();
  assert.doesNotMatch(savedFirst.text(), /£52\.00/, 'Pending preparation cannot carry another owner\'s saved history.'); savedFirst.unmount();

  const pendingDisk = deferred<string | null>(); let preparationFinished = false;
  const pendingFirst = harness({ collection: async () => preparationFinished ? prepared(23) : pendingResponse, stored: () => pendingDisk.promise });
  pendingFirst.render(); await pendingFirst.flush(); assert.match(pendingFirst.text(), /valuation is being prepared/);
  pendingDisk.resolve(storedRaw); await pendingFirst.flush();
  assert.match(pendingFirst.text(), /£52\.00/, 'A pending response must not suppress a later owner-verified saved cache.');
  assert.match(pendingFirst.text(), /Last saved/); assert.match(pendingFirst.text(), /valuation is being prepared/);
  assert.equal(pendingFirst.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  preparationFinished = true; pendingFirst.retry('Retry collection value history').props.onPress(); await pendingFirst.flush();
  assert.match(pendingFirst.text(), /£23\.00/); assert.doesNotMatch(pendingFirst.text(), /Last saved|valuation is being prepared/,
    'A genuine current prepared valuation supersedes the saved fallback.'); pendingFirst.unmount();

  let savedDiskReads = 0; const retryDiskHang = deferred<string | null>();
  const savedRetry = harness({ collection: async () => pendingResponse, stored: () => ++savedDiskReads === 1
    ? Promise.resolve(storedRaw) : savedDiskReads === 2 ? retryDiskHang.promise : Promise.resolve(null) });
  savedRetry.render(); await savedRetry.flush(); assert.match(savedRetry.text(), /£52\.00/);
  savedRetry.retry('Retry collection value history').props.onPress(); await savedRetry.flush();
  assert.match(savedRetry.text(), /£52\.00/, 'Saved origin persists across same-scope Retry even when its next disk read hangs.');
  assert.match(savedRetry.text(), /Last saved/); assert.match(savedRetry.text(), /valuation is being prepared/);
  assert.equal(savedRetry.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  savedRetry.retry('Retry collection value history').props.onPress(); await savedRetry.flush();
  assert.match(savedRetry.text(), /£52\.00/, 'A null disk read on another same-scope Retry cannot erase validated displayed saved history.');
  assert.match(savedRetry.text(), /holdings and price freshness have not been rechecked/);
  assert.equal(savedRetry.nodes().find((node) => node.type?.name === 'ValueHistoryChart').props.points.length, 2);
  savedRetry.unmount(); retryDiskHang.resolve(storedRaw); await tick();

  let newlyPending = false;
  const preparedThenPending = harness({ collection: async () => newlyPending ? pendingResponse : prepared(24) });
  preparedThenPending.render(); await preparedThenPending.flush(); assert.match(preparedThenPending.text(), /£24\.00/);
  newlyPending = true; preparedThenPending.retry('Retry collection value history').props.onPress(); await preparedThenPending.flush();
  assert.doesNotMatch(preparedThenPending.text(), /£24\.00/, 'Only explicitly saved cache history survives a no-summary pending response.');
  assert.equal(preparedThenPending.nodes().find((node) => node.type?.name === 'ValueHistoryChart'), undefined); preparedThenPending.unmount();

  const emptyResponse = prepared();
  Object.assign(emptyResponse.summary, { total: null, totalUnits: 0, pricedUnits: 0, distinctPriceIdentities: 0,
    freshUnits: 0, olderPriceUnits: 0, unpricedUnits: 0, unsupported: 0 });
  emptyResponse.summary.trend.points = []; emptyResponse.summary.trend.eligible = false;
  const emptyDisk = deferred<string | null>();
  const authoritativeEmpty = harness({ collection: async () => emptyResponse, stored: () => emptyDisk.promise });
  authoritativeEmpty.render(); await authoritativeEmpty.flush(); emptyDisk.resolve(storedRaw); await authoritativeEmpty.flush();
  assert.doesNotMatch(authoritativeEmpty.text(), /£52\.00|Last saved/, 'An authoritative empty current collection cannot revive old saved holdings.');
  assert.equal(authoritativeEmpty.nodes().find((node) => node.type?.name === 'ValueHistoryChart'), undefined); authoritativeEmpty.unmount();
  const mismatchResponse = prepared(999); mismatchResponse.requestedCollectionRevision = 'changed-holdings';
  const mismatchDisk = deferred<string | null>();
  const authoritativeMismatch = harness({ collection: async () => mismatchResponse, stored: () => mismatchDisk.promise });
  authoritativeMismatch.render(); await authoritativeMismatch.flush(); mismatchDisk.resolve(storedRaw); await authoritativeMismatch.flush();
  assert.doesNotMatch(authoritativeMismatch.text(), /£52\.00|£999\.00|Last saved/, 'A revision mismatch stays unavailable and blocks old-cache substitution.');
  assert.equal(authoritativeMismatch.nodes().find((node) => node.type?.name === 'ValueHistoryChart'), undefined); authoritativeMismatch.unmount();
  let denyPending = false;
  const pendingDenial = harness({ collection: () => denyPending
    ? Promise.reject(Object.assign(new Error('denied pending fixture'), { status: 403 })) : Promise.resolve(pendingResponse), stored: async () => storedRaw });
  pendingDenial.render(); await pendingDenial.flush(); assert.match(pendingDenial.text(), /£52\.00/);
  denyPending = true; pendingDenial.retry('Retry collection value history').props.onPress(); await pendingDenial.flush();
  assert.doesNotMatch(pendingDenial.text(), /£52\.00|Last saved/, 'An access denial clears saved history retained during preparation.');
  assert.match(pendingDenial.text(), /access could not be verified/); pendingDenial.unmount();
  let marketDenied = false;
  const pendingMarketDenial = harness({ market: () => marketDenied
    ? Promise.reject(Object.assign(new Error('denied market fixture'), { status: 401 })) : Promise.resolve([marketRow()]),
  collection: async () => pendingResponse, stored: async () => storedRaw });
  pendingMarketDenial.render(); await pendingMarketDenial.flush(); assert.match(pendingMarketDenial.text(), /£52\.00/);
  marketDenied = true; pendingMarketDenial.retry('Retry collection value history').props.onPress(); await pendingMarketDenial.flush();
  assert.doesNotMatch(pendingMarketDenial.text(), /£52\.00|Last saved/, 'A market-lane denial also clears pending saved collection history.');
  assert.match(pendingMarketDenial.text(), /access could not be verified/); pendingMarketDenial.unmount();
  const slowDisk = deferred<string | null>();
  const freshWins = harness({ stored: () => slowDisk.promise }); freshWins.render(); await freshWins.flush();
  slowDisk.resolve(storedRaw); await tick(); freshWins.render(); assert.match(freshWins.text(), /£12\.00/); assert.doesNotMatch(freshWins.text(), /Last saved/); freshWins.unmount();
  const deniedDisk = deferred<string | null>();
  const cachedDenial = harness({ collection: () => Promise.reject(Object.assign(new Error('denied'), { status: 403 })), stored: () => deniedDisk.promise });
  cachedDenial.render(); await cachedDenial.flush(); deniedDisk.resolve(storedRaw); await tick(); cachedDenial.render();
  assert.doesNotMatch(cachedDenial.text(), /£52\.00/, 'A late cache read cannot bypass a verified access denial.'); cachedDenial.unmount();
  assert.equal(history.savedCollectionValueHistory({ ...savedSnapshot, pricingContractVersion: 3 }), null);
  const changedScope = { ...savedSnapshot, collectionValueReads: [{ ...savedSnapshot.collectionValueReads[0], identitySignature: 'former-holdings' }, savedSnapshot.collectionValueReads[1]] };
  assert.equal(history.savedCollectionValueHistory(changedScope)!.pointsByRange['7D'].length, 1, 'Saved reads from different holdings scopes never form a trend.');

  const value = prepared(); value.summary.trend.points = [value.summary.trend.points[1]];
  const single = history.collectionValueHistory(value);
  assert.equal(single.pointsByRange['7D'].length, 1); assert.equal(single.historyAvailable, false);
  value.summary.trend.eligible = false; assert.equal(history.collectionValueHistory(value).pointsByRange['7D'].length, 0);
  const changed = prepared(); changed.requestedCollectionRevision = 'changed-holdings';
  assert.equal(history.collectionValueHistory(changed).total, null, 'Old holdings never become the current collection valuation.');
  const zero = prepared(0); zero.summary.trend.points = []; assert.equal(history.collectionValueHistory(zero).total, 0, 'A real stored zero stays distinct from unavailable.');
  const pair = marketRow(); const result = history.marketValueHistory([pair]);
  assert.equal(result.movers.length, 1, 'Two real same-day estimates can establish movement.');
  assert.equal(result.movers[0].latestPrice, 1234.567, 'Source precision stays intact.');
  assert.equal(result.movers[0].confidence.label, 'medium');
  assert.equal(history.marketValueHistory([pair, { ...pair, currentEstimate: 555 }]).movers.length, 0,
    'Conflicting duplicate variant comparisons cannot imply condition equivalence.');
  assert.equal(history.marketValueHistory([{ ...pair, currency: 'USD' }, { ...pair, productType: 'graded_card' }]).movers.length, 0);
  console.log('Value history actual-screen regressions passed: independent reads/previews/deadlines, Retry, retained values, account A-B-A/signout, genuine scoped history, zero/unavailable and paired identity/provenance.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
