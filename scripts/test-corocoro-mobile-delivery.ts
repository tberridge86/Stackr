import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupCorocoroIssues, getCorocoroIssuesForCard, getCorocoroIssuesForSet } from '../lib/corocoroIssueArchive';
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
console.log('CoroCoro mobile delivery: 26 offline covers, exact issue links and Discover navigation passed.');
