import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function extract(file, name, scope) {
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) {
      expression = (ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer).getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); assert(expression, name);
  const compiled = ts.transpileModule(`const tested = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${compiled}; return tested;`)(...Object.values(scope));
}

// Execute the screen's actual asynchronous recovery path, preserving card identity.
const inspectionRequestRef = { current: 0 }, loadRequestRef = { current: 0 };
const requests = [], inspected = [], alerts = [], pending = [];
const inspect = extract('features/binder/BinderDetailScreen.tsx', 'requestBinderInspection', {
  inspectionRequestRef, loadRequestRef, binder: { language: 'en' },
  getBinderCanonicalVariantId: row => row.card?.variantId ?? null,
  getCatalogueVariantIdForKey: (card, key) => card?.variants?.[key] ?? null,
  normalizePokemonCardLanguage: language => language,
  inspectBinderCard: row => { if (!row.card?.hasArtwork) return false; inspected.push(row); return true; },
  setInspectionLoading: () => {}, Alert: { alert: (...args) => alerts.push(args) },
  readOptionalCatalogueEnrichment: fn => fn(),
  fetchStackrCard: async (reference, options) => {
    requests.push({ reference, options });
    const next = pending.shift(); return typeof next === 'function' ? next() : next;
  },
});
const row = { card_id: 'legacy-ja-card', set_id: 'ja-set', language: 'ja', owned_quantity: 3,
  card: { language: 'ja', variantId: 'normal', variants: { reverseHolofoil: 'reverse' }, hasArtwork: true } };
const before = JSON.stringify(row);
await inspect(row); assert.equal(inspected.length, 1); assert.equal(requests.length, 0);
pending.push({ language: 'ja', externalIds: { stackrVariant: 'reverse' }, hasArtwork: true });
await inspect(row, 'reverseHolofoil');
assert.deepEqual(requests[0], { reference: 'reverse', options: { language: 'ja', setId: 'ja-set' } });
assert.equal(inspected.length, 2, 'one hold on a variant opens inspection without a second press');
assert.equal(JSON.stringify(row), before, 'inspection never changes ownership or saved finish');
pending.push({ language: 'en', externalIds: { stackrVariant: 'reverse' }, hasArtwork: true });
await inspect(row, 'reverseHolofoil'); assert.equal(inspected.length, 2); assert.equal(alerts.length, 1);
await inspect(row, 'unknown'); assert.equal(requests.length, 2); assert.equal(alerts.length, 2);
const missing = { ...row, card: null };
pending.push(null); await inspect(missing);
assert.equal(requests.at(-1).reference, row.card_id, 'saved exact reference is recoverable when live catalogue detail is missing');
assert.equal(alerts.length, 3, 'missing artwork produces an actionable state, not a silent no-op');
const late = deferred(); pending.push(() => late.promise);
const stale = inspect(missing); loadRequestRef.current++;
late.resolve({ language: 'ja', externalIds: {}, hasArtwork: true }); await stale;
assert.equal(inspected.length, 2, 'a response after leaving/reloading the binder cannot open inspection');

// Discover shows completed languages without waiting for another language or ownership.
const languageRequests = new Map(), sets = { en: [], ja: [], 'zh-cn': ['saved-chinese'], 'zh-tw': [] };
let errors = null, pendingLanguages = [], loading = true;
const discoveryGeneration = { current: 0 };
const load = extract('app/(tabs)/explore.tsx', 'load', {
  loadRequestRef: discoveryGeneration,
  setEnglishSets: value => sets.en = value, setJapaneseSets: value => sets.ja = value,
  setSimplifiedChineseSets: value => sets['zh-cn'] = value, setTraditionalChineseSets: value => sets['zh-tw'] = value,
  setRefreshing: () => {}, setLoadError: value => errors = value,
  setPendingLanguages: value => pendingLanguages = typeof value === 'function' ? value(pendingLanguages) : value,
  setHasLoadedCatalogue: () => {}, setLoading: value => loading = value, setExistingBindersBySet: () => {},
  fetchExistingSetBinders: () => new Promise(() => {}),
  fetchAllSets: ({ language, preferCanonicalApi }) => {
    assert.equal(preferCanonicalApi, true); const d = deferred(); languageRequests.set(language, d); return d.promise;
  },
});
const discovering = load();
languageRequests.get('ja').resolve(['SV4a']); await tick();
assert.deepEqual(sets.ja, ['SV4a']); assert.equal(loading, false); assert.equal(pendingLanguages.length, 3);
languageRequests.get('zh-cn').reject(new Error('timed out')); await tick();
assert.deepEqual(sets['zh-cn'], ['saved-chinese']); assert.match(errors, /Simplified Chinese/);
languageRequests.get('en').resolve(['English']); languageRequests.get('zh-tw').resolve(['Traditional']);
await discovering; assert.equal(pendingLanguages.length, 0);
const old = load(); discoveryGeneration.current++;
for (const request of languageRequests.values()) request.resolve(['stale']); await old;
assert.deepEqual(sets.ja, ['SV4a'], 'late discovery responses cannot replace a newer screen');
console.log('Build48 delivery: direct/variant/mixed-language inspection, exact recovery, stale-screen safety and independent language discovery passed.');
