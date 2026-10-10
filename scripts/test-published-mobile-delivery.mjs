import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiredTranslationSamples, verifyPublishedMobileDelivery } from './deploy/verify-published-mobile-delivery.mjs';
import { ACTIVITY_BASE_COLUMNS, ACTIVITY_SNAPSHOT_COLUMNS, ACTIVITY_SNAPSHOT_FIELDS } from '../lib/activitySchema.ts';

const index = JSON.parse(readFileSync('backend/data/pokedex-index.json', 'utf8'));
const sha = 'a'.repeat(40);
const supabaseUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const supabasePublishableKey = 'sb_publishable_fixture_delivery';
const fixture = (broken = null) => async (url, init) => {
  assert.ok(init.signal);
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  if (pathname === '/rest/v1/activity_feed') {
    assert.equal(parsed.origin, supabaseUrl, 'The publishable header is confined to the exact Supabase origin.');
    assert.deepEqual(init.headers, { apikey: supabasePublishableKey });
    assert.equal(init.headers.Authorization, undefined, 'This gate never authenticates a collector session.');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error', 'Redirects cannot forward the publishable header elsewhere.');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(parsed.searchParams.get('limit'), '0');
    assert.deepEqual([...parsed.searchParams.keys()].sort(), ['limit', 'select']);
    const columns = parsed.searchParams.get('select');
    assert.ok([ACTIVITY_BASE_COLUMNS, ACTIVITY_SNAPSHOT_COLUMNS].includes(columns));
    const base = columns === ACTIVITY_BASE_COLUMNS;
    if (broken === 'history-network' || (!base && broken === 'snapshot-network')) throw new Error(`provider echoed ${supabasePublishableKey}`);
    if (base && broken === 'history-timeout') return new Promise(() => {});
    if (base && broken === 'history-malformed') return new Response('{invalid-json', { status: 200 });
    if (base && broken === 'history-base') return Response.json({ code: '42703', message: 'column activity_feed.title does not exist' }, { status: 400 });
    if (base && broken === 'history-permission') return Response.json({ code: '42501', message: 'permission denied for activity_feed' }, { status: 403 });
    if (base && broken === 'history-redirect') return Response.json({}, { status: 302 });
    if ((base && broken === 'history-rows') || (!base && broken === 'snapshot-rows')) return Response.json([{ id: 'collector-row' }]);
    if (base && broken === 'history-shape') return Response.json({ data: [] });
    if (!base && broken?.startsWith('legacy:')) {
      const [, field, code] = broken.split(':');
      return Response.json({ code, message: `Could not find the '${field}' column of 'activity_feed' in the schema cache` }, { status: 400 });
    }
    if (!base && broken === 'snapshot-permission') return Response.json({ code: '42501', message: 'permission denied for card_name_snapshot' }, { status: 403 });
    if (!base && broken === 'snapshot-denial') return Response.json({ code: '42703', message: 'column card_name_snapshot does not exist' }, { status: 401 });
    if (!base && broken === 'snapshot-base') return Response.json({ code: '42703', message: 'column title does not exist' }, { status: 400 });
    return Response.json([]);
  }
  assert.equal(init.headers, undefined, 'The existing eight public API reads stay anonymous without Supabase headers.');
  assert.ok(['https://pocketvault-production.up.railway.app', 'https://api.stackrtcg.com'].includes(parsed.origin));
  let body;
  if (pathname === '/health') body = { ok: true, runtime: { railwayEnvironment: 'production',
    supabaseProjectRef: 'oakdbbzdqwurpjnoqhmu', gitCommitSource: 'bundled_workflow_sha', gitCommit: sha.slice(0, 12) } };
  else if (pathname === '/v1/catalog/manifest') body = { meta: { apiVersion: '1' }, data: {
    currentCatalogueVersion: 'published-v1', availableLanguageShards: ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'].map((languageCode) => ({ languageCode })),
  } };
  else if (pathname === '/v1/pokemon') {
    const offset = Number(new URL(url).searchParams.get('offset'));
    const limit = Number(new URL(url).searchParams.get('limit'));
    body = { data: { count: index.entries.length, indexVersion: index.indexVersion,
      results: index.entries.slice(offset, offset + limit).map(({ id, name }) => ({ name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` })) } };
  }
  else {
    const sample = requiredTranslationSamples.find((row) => pathname.endsWith(row.cardId));
    assert.ok(sample, `Unexpected read ${pathname}`);
    body = { data: { card: { cardId: sample.cardId, languageCode: sample.language, names: { native: sample.native,
      englishDisplay: sample.english, englishSupplement: { value: sample.english, authoritative: false } } } } };
  }
  if (broken === 'backend' && pathname === '/health') body.runtime.gitCommit = 'b'.repeat(12);
  if (broken === 'index' && pathname === '/v1/pokemon') body.data.indexVersion = 'old-index';
  if (broken === 'translation' && pathname.includes('/cards/')) body.data.card.names.englishDisplay = 'Incorrect old name';
  if (broken === 'authority' && pathname.includes('/cards/')) body.data.card.names.englishSupplement.authoritative = true;
  const missing = broken === 'missing-route' && pathname === '/v1/pokemon';
  const blockedContinuation = broken === 'continuation' && new URL(url).searchParams.get('offset') === '151';
  return Response.json(body, { status: missing ? 404 : blockedContinuation ? 400 : 200 });
};
const verify = (broken = null, overrides = {}) => verifyPublishedMobileDelivery({
  expectedBackendSha: sha, supabaseUrl, supabasePublishableKey, fetchImpl: fixture(broken), ...overrides,
});
const receipt = await verify();
assert.equal(receipt.backendSource, sha);
assert.equal(receipt.reads.length, 8, 'One runtime, one manifest, both index pages and four exact translations.');
for (const broken of ['backend', 'index', 'translation', 'authority', 'missing-route', 'continuation']) {
  await assert.rejects(verify(broken));
}
assert.equal(receipt.verifiedTranslationSamples, 4);
assert.equal(receipt.activityHistory.baseColumns, ACTIVITY_BASE_COLUMNS);
assert.equal(receipt.activityHistory.baseSchema, 'verified');
assert.equal(receipt.activityHistory.snapshotSchema, 'available');
assert.equal(receipt.activityHistory.rowLimit, 0);
assert.equal(receipt.activityHistory.access, 'anonymous_publishable_key');
assert.equal(receipt.activityHistory.reads.length, 2);
assert.ok(receipt.activityHistory.reads.every((read) => read.limit === 0 && read.path === '/rest/v1/activity_feed'));
assert.equal(JSON.stringify(receipt).includes(supabasePublishableKey), false, 'A delivery receipt never contains the request key.');
for (const field of ACTIVITY_SNAPSHOT_FIELDS) {
  for (const code of ['42703', 'PGRST204']) {
    const legacy = await verify(`legacy:${field}:${code}`);
    assert.equal(legacy.activityHistory.snapshotSchema, 'legacy_compatible');
    assert.equal(legacy.activityHistory.baseSchema, 'verified');
  }
}
for (const broken of ['history-base', 'history-permission', 'history-network', 'history-malformed', 'history-rows',
  'history-shape', 'history-redirect', 'snapshot-network', 'snapshot-rows', 'snapshot-permission', 'snapshot-denial', 'snapshot-base']) {
  await assert.rejects(verify(broken), (error) => {
    assert.equal(String(error).includes(supabasePublishableKey), false, 'Failure messages must not echo request keys.');
    return true;
  });
}
for (const unsafeUrl of ['https://oakdbbzdqwurpjnoqhmu.supabase.co.evil.invalid', 'https://example.invalid',
  `${supabaseUrl}/rest/v1`, `${supabaseUrl}?redirect=elsewhere`, 'https://user:password@oakdbbzdqwurpjnoqhmu.supabase.co',
  supabaseUrl.replace('https:', 'http:')]) {
  await assert.rejects(verify(null, { supabaseUrl: unsafeUrl }));
}
await assert.rejects(verify(null, { supabasePublishableKey: 'sb_secret_fixture_not_allowed' }));
const started = performance.now();
await assert.rejects(verify('history-timeout', { historyTimeoutMs: 20 }), /history schema proof could not complete/);
assert.ok(performance.now() - started < 1000, 'A stalled fetch cannot leave the prebuild gate hanging.');
let lateReject;
const lateRequest = new Promise((_, reject) => { lateReject = reject; });
const unhandled = [];
const onUnhandled = (error) => { unhandled.push(error); };
process.on('unhandledRejection', onUnhandled);
try {
  await assert.rejects(verifyPublishedMobileDelivery({ expectedBackendSha: sha, supabaseUrl, supabasePublishableKey,
    historyTimeoutMs: 20, fetchImpl: (url, init) => new URL(url).pathname === '/rest/v1/activity_feed'
      ? lateRequest : fixture()(url, init) }), /history schema proof could not complete/);
  lateReject(new Error('late transport failure'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(unhandled, [], 'Late fetch rejection stays consumed after the timeout result.');
} finally {
  process.off('unhandledRejection', onUnhandled);
}
const iosGate = readFileSync('scripts/verify-ios-release-delivery.mjs', 'utf8');
assert.match(iosGate, /supabaseUrl: env\.STACKR_MOBILE_SUPABASE_URL/);
assert.match(iosGate, /supabasePublishableKey: env\.STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY/);
console.log('Published mobile delivery gate passed: anonymous public routes plus zero-row history schema proof, exact-origin publishable headers, compatible snapshots and bounded failures.');
