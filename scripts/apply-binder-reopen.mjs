import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const expected = {
  'features/binder/BinderDetailScreen.tsx': '6e1e99d93c49088dd59d67e9d58949a1c2e76c05',
  'lib/performance.ts': '2955c4cd98a4a09263122c72b9eae734d031dcb6',
  'scripts/test-retrieval-parallel.mjs': '3dfc7de642c3b64ccb25d179013fcf07c2e9e5a8',
};
for (const [path, sha] of Object.entries(expected)) assert.equal(execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim(), sha, `${path}: stop on unexpected source drift`);
function replaceOnce(path, before, after) {
  const text = fs.readFileSync(path, 'utf8');
  assert.equal(text.split(before).length, 2, `${path}: require exactly one known match`);
  fs.writeFileSync(path, text.replace(before, after));
}
// Remove one accidentally duplicated context line from the submitted patch;
// runtime output below is attested against the locally tested complete blobs.
replaceOnce('scripts/binder-reopen-integration.patch',
  '         setCards([]);\n         setShowcaseRows([]);\n@@ -1059',
  '         setCards([]);\n@@ -1059');
execFileSync('git', ['apply', '--check', 'scripts/binder-reopen-integration.patch'], { stdio: 'inherit' });
execFileSync('git', ['apply', 'scripts/binder-reopen-integration.patch'], { stdio: 'inherit' });
for (const [path, sha] of Object.entries({
  'features/binder/BinderDetailScreen.tsx': 'fce741d26cb45b9095507a514e5440e6b052de61',
  'lib/performance.ts': 'c3e588020b02f5b8c62e0d16b4e1f006a4772b36',
})) assert.equal(execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim(), sha, `${path}: generated output differs from locally tested source`);

replaceOnce('lib/binderReopenSnapshot.ts',
  '  for (const name of keys) if (Object.prototype.propertyIsEnumerable.call(value, name)) result[name] = (value as any)[name];',
  `  for (const name of keys) {
    if (!Object.prototype.propertyIsEnumerable.call(value, name)) continue;
    const field = (value as any)[name];
    if (field == null || ['string', 'number', 'boolean'].includes(typeof field)) result[name] = field;
    else if (Array.isArray(field) && field.every((item) => typeof item === 'string')) result[name] = [...field];
  }`);
replaceOnce('scripts/test-retrieval-parallel.mjs',
  "  const context = { exports: {}, console, AbortController, binderId: 'binder',",
  `  const context = { exports: {}, console, AbortController, binderId: 'binder',
    retrievalTraceRef: { current: null },
    beginBinderRetrieval: () => ({ cancel() {}, model() {} }),
    binderReopenCache: { lease: () => 0, save: () => false, invalidate: () => {} },
    binderReopenScope: (accountId) => ({ namespace: 'fixture', accountId }),
    readBinderReopenPreview: async () => null,
    retainBinderPreviewDuringRefresh: (work) => work(),
    isCompleteBinderSnapshot: () => false,
    isBinderAccessDenied: () => false,
    setReopenStatus: () => {}, setSelectedCard: () => {},`);
console.log('Applied cached-reopening integration; existing loader assertions are unchanged.');
