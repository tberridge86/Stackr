import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { groupCorocoroIssues, getCorocoroIssuesForCard, getCorocoroIssuesForSet } from '../lib/corocoroIssueArchive';
import { getCorocoroIssueCoverPresentation } from '../lib/corocoroCoverReferences';
import { COROCORO_SUPPLIED_COVER_COUNT, getCorocoroSuppliedCover } from '../lib/corocoroSuppliedCovers';

// Metro resolves packaged images to native asset IDs. In Node, retain the
// resolved file path so this test can check real offline files and identities.
const assetRequire = createRequire(import.meta.url);
assetRequire.extensions['.png'] = (module, filename) => {
  module.exports = { uri: filename };
};

const native = { development: false, platform: 'ios', hostname: '' };
const issues = groupCorocoroIssues();
let covered = 0;
for (const issue of issues) {
  const image = getCorocoroSuppliedCover(issue.id, native) as { uri: string } | null;
  if (!image) continue;
  covered++;
  assert.equal(issue.publicationId, 'monthly');
  assert.equal(image.uri, resolve(`assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/${issue.issueMonth}-CoroCoro-Comic.png`));
  const bytes = readFileSync(image.uri);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
}
assert.equal(covered, 26, 'The supplied cover pack must be available in the production iOS bundle.');
assert.equal(COROCORO_SUPPLIED_COVER_COUNT, covered);
assert.ok(getCorocoroSuppliedCover('monthly:2001-05', native));
assert.equal(getCorocoroSuppliedCover('bessatsu:2001-05', native), null);
assert.equal(getCorocoroSuppliedCover('monthly:2001-05', { ...native, sourceEnabled: false }), null);
assert.deepEqual(getCorocoroIssuesForCard('ja:corocoro-shining-mew-2001').map(issue => issue.id), ['monthly:2001-05']);
assert.deepEqual(getCorocoroIssuesForCard('SM3p-041'), [], 'A later Shining Mew must not inherit the 2001 magazine.');
assert.deepEqual(getCorocoroIssuesForSet('ja:corocoro-comic-may-2001-promo').map(issue => issue.id), ['monthly:2001-05']);
assert.deepEqual(getCorocoroIssuesForSet('SM3p'), [], 'Unrelated sets cannot borrow a CoroCoro edition.');
const resolver = readFileSync('lib/corocoroSuppliedCovers.ts', 'utf8');
assert.doesNotMatch(resolver, /https?:\/\/|127\.0\.0\.1/);
const explore = readFileSync('app/(tabs)/explore.tsx', 'utf8');
assert.match(explore, /router\.push\('\/corocoro'\)/, 'The library must be reachable from Discover.');

// Execute the complete cover component with real resolvers. Native elements
// are fixture boundaries; this checks source selection, not iPhone rendering.
const StackrImage = () => null;
const dependencies: Record<string, unknown> = {
  react: React,
  'expo-router': { Link: 'Link' },
  'react-native': { Platform: { OS: 'ios' }, Pressable: 'Pressable', View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
  '../lib/corocoroCoverReferences': { getCorocoroIssueCoverPresentation },
  './StackrImage': { StackrImage },
  './Text': { Text: 'Text' },
  '../lib/corocoroSuppliedCovers': { getCorocoroSuppliedCover },
};
const componentModule: { CorocoroIssueCover?: (props: unknown) => unknown } = {};
runInNewContext(ts.transpileModule(readFileSync('components/CorocoroIssueCover.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, {
  exports: componentModule, process, __DEV__: false,
  require: (name: string) => { assert.ok(name in dependencies, `unexpected cover dependency: ${name}`); return dependencies[name]; },
});
function imageElements(value: unknown): any[] {
  if (Array.isArray(value)) return value.flatMap(imageElements);
  if (!value || typeof value !== 'object') return [];
  const element = value as { type?: unknown; props?: { children?: unknown } };
  return [...(element.type === StackrImage ? [element] : []), ...imageElements(element.props?.children)];
}
const policyKeys = [
  'EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS', 'STACKR_DISABLE_MAGAZINE_SET_COVERS',
  'EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST', 'STACKR_MAGAZINE_SET_COVER_DENYLIST',
] as const;
const savedPolicy = new Map(policyKeys.map(key => [key, process.env[key]]));
try {
  for (const key of policyKeys) delete process.env[key];
  const may2001 = issues.find(issue => issue.id === 'monthly:2001-05')!;
  const images = () => imageElements(componentModule.CorocoroIssueCover!({ issueGroup: may2001 }));
  assert.equal(images().length, 1, 'Allowed supplied cover remains visible in the actual component');
  const cases = [
    ['EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS', 'true'],
    ['STACKR_DISABLE_MAGAZINE_SET_COVERS', 'true'],
    ['EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST', ' COROCORO-COMIC-2001-05 '],
    ['STACKR_MAGAZINE_SET_COVER_DENYLIST', 'corocoro-comic-2001-05'],
    ['EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST', 'x'.repeat(16_385)],
  ] as const;
  for (const [key, value] of cases) {
    for (const policyKey of policyKeys) delete process.env[policyKey];
    process.env[key] = value;
    assert.equal(getCorocoroSuppliedCover(may2001.id, native), null, `${key} must block bundled artwork`);
    assert.equal(images().length, 0, `${key} must select the component's existing placeholder`);
  }
  for (const key of policyKeys) delete process.env[key];
  process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST = 'corocoro-comic-1997-02';
  assert.equal(images().length, 1, 'Denying a different exact issue preserves this cover');
  const previewContext = { development: true, platform: 'web', hostname: 'localhost' };
  assert.equal(getCorocoroIssueCoverPresentation('monthly:1997-02', previewContext).image, null, 'Local reference preview must respect the same exact-issue denylist');
  delete process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST;
  assert.ok(getCorocoroIssueCoverPresentation('monthly:1997-02', previewContext).image, 'Allowed local reference preview remains available');
  process.env.EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS = 'true';
  assert.equal(getCorocoroIssueCoverPresentation('monthly:1997-02', previewContext).image, null, 'Local preview must respect source-wide disablement');
} finally {
  for (const key of policyKeys) {
    const value = savedPolicy.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
console.log('CoroCoro mobile delivery: 26 offline covers, exact issue links and Discover navigation passed.');
