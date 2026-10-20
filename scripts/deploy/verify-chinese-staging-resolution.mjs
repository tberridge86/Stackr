import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const aliases = JSON.parse(readFileSync(new URL('../../backend/data/chinese-language-correction-aliases.json', import.meta.url)));
const expectedSha = process.argv[2];
const phase = process.argv[3] ?? 'resolver';
assert.match(expectedSha ?? '', /^[a-f0-9]{40}$/);
assert.ok(['resolver','committed'].includes(phase));
const gateway = 'https://stackr-api-gateway-staging.berridge14.workers.dev';
const backend = 'https://stackr-backend-staging-staging.up.railway.app';
const reads = [];
async function read(base, path) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  reads.push({ host: new URL(base).host, path, milliseconds: Math.round(performance.now() - started), cache: response.headers.get('X-Stackr-Cache') });
  return body;
}
try {
  const health = await read(backend, '/health');
  assert.equal(health.runtime.gitCommit, expectedSha.slice(0, 12));
  assert.equal(health.runtime.railwayEnvironment, 'staging');
  assert.equal(health.runtime.gitCommitSource, 'bundled_workflow_sha');
  assert.equal(health.runtime.supabaseProjectRef, 'lmwfhvexfcoyeuoyrlco');
  for (const [source, target] of Object.entries(aliases.sets)) {
    const resolved = (await read(gateway, `/v1/sets/${source}`)).data.set;
    assert.equal(resolved.setId, target);
    assert.equal(resolved.languageCode, 'zh-tw');
    const cards = (await read(gateway, `/v1/sets/${source}/cards?language=zh-cn&limit=5`)).data.cards;
    assert.ok(cards.length > 0);
    assert.ok(cards.every(card => card.languageCode === 'zh-tw' && card.set.setId === target));
    const facts = (await read(gateway, `/v1/sets/${source}/cards?language=zh-cn&limit=5&includeAssets=false`)).data.cards;
    assert.ok(facts.length > 0);
    assert.ok(facts.every(card => card.languageCode === 'zh-tw' && card.set.setId === target));
    // Verify real bytes from one already-approved target image per set. Some
    // finishes intentionally have unavailable deduplication placeholders.
    let images = cards.flatMap(card => card.variants).map(v => v.image).filter(a => a?.permissionStatus === 'approved' && a?.deliveryUrl);
    if (!images.length) {
      const more = (await read(gateway, `/v1/sets/${target}/cards?language=zh-tw&limit=100`)).data.cards;
      assert.ok(more.every(card => card.languageCode === 'zh-tw' && card.set.setId === target));
      images = more.flatMap(card => card.variants).map(v => v.image).filter(a => a?.permissionStatus === 'approved' && a?.deliveryUrl);
    }
    assert.ok(images.length > 0, `No approved delivered artwork found for ${target}`);
    const image = images[0];
    const url = new URL(image.deliveryUrl);
    assert.equal(url.origin, 'https://lmwfhvexfcoyeuoyrlco.supabase.co');
    assert.ok(url.pathname.startsWith('/storage/v1/object/public/stackr-catalogue-public/'));
    const started = performance.now();
    const imageResponse = await fetch(url, {signal: AbortSignal.timeout(20000)});
    assert.equal(imageResponse.status, 200);
    assert.match(imageResponse.headers.get('content-type') ?? '', /^image\//);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.ok(bytes.length > 0 && bytes.length < 8 * 1024 * 1024);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.contentSha256);
    reads.push({host: url.host, path: url.pathname, bytes: bytes.length, sha256: image.contentSha256, milliseconds: Math.round(performance.now()-started)});
    if (phase === 'committed') {
      const browse = (await read(gateway, `/v1/sets?language=zh-cn&setCode=${encodeURIComponent(resolved.setCode)}&limit=500`)).data.sets;
      assert.ok(!browse.some(set => set.setId === source), 'false Simplified Chinese set remains in browse');
      const retained = (await read(gateway, `/v1/sets/${target}`)).data.set;
      assert.equal(retained.languageCode, 'zh-tw');
    }
  }
  for (const kind of ['printings', 'variants']) {
    for (const [source, target] of Object.entries(aliases[kind]).slice(0, 5)) {
      const card = (await read(gateway, `/v1/cards/${source}`)).data.card;
      assert.equal(card.languageCode, 'zh-tw');
      if (kind === 'printings') assert.equal(card.cardId, target);
      else assert.ok(card.variants.some(variant => variant.variantId === target));
    }
    const [source, target] = Object.entries(aliases[kind])[0];
    const results = (await read(gateway, `/v1/search?q=${source}&language=zh-cn`)).data.results;
    assert.ok(results.length > 0);
    assert.ok(results.every(row => row.languageCode === 'zh-tw'));
    assert.ok(results.some(row => kind === 'printings' ? row.card.cardId === target : row.card.variants.some(variant => variant.variantId === target)));
  }
  let deltaProof = null;
  if (phase === 'committed') {
    const db = { correction: { first_sequence: Number(process.argv[4]), last_sequence: Number(process.argv[5]) } };
    assert.ok(Number.isSafeInteger(db.correction.first_sequence) && db.correction.first_sequence > 0);
    assert.ok(Number.isSafeInteger(db.correction.last_sequence) && db.correction.last_sequence >= db.correction.first_sequence);
    const since = db.correction.first_sequence - 1;
    assert.ok(Number.isSafeInteger(since) && since >= 0);
    let cursor = null;
    const changes = [];
    let pages = 0;
    do {
      const page = await read(gateway, `/v1/catalog/delta?since=${since}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      changes.push(...page.data.changes);
      const next = page.meta.pagination?.nextCursor ?? null;
      assert.notEqual(next, cursor || 'initial', 'repeated delta cursor');
      cursor = next;
      pages += 1;
      assert.ok(pages <= 10, 'unbounded correction delta pagination');
    } while (cursor);
    const correctionChanges = changes.filter(change => change.entityKey?.startsWith('chinese-identity-correction-20261010:'));
    assert.equal(correctionChanges.length, 1360);
    const types = {};
    for (const change of correctionChanges) {
      assert.equal(change.operation, 'deprecation');
      types[change.entityType] = (types[change.entityType] ?? 0) + 1;
    }
    assert.deepEqual(types, { sets: 5, 'card-printings': 605, 'card-variants': 750 });
    const manifest = (await read(gateway, '/v1/catalog/manifest')).data;
    assert.ok(manifest.latestChangeSequence >= db.correction.last_sequence);
    deltaProof = { pages, count: correctionChanges.length, types, firstSequence: db.correction.first_sequence, lastSequence: db.correction.last_sequence, manifestLatestSequence: manifest.latestChangeSequence };
  }
  const receipt = { checkedAt: new Date().toISOString(), phase, expectedBackendSha: expectedSha, deploymentId: health.runtime.deploymentId, result: 'PASS', reads, deltaProof,
    scope: { oldSets: 5, oldPrintingLinks: 5, oldVariantLinks: 5, staleLanguageArtworkSetPages: 5, staleLanguageFactsSetPages: 5, staleLanguageUuidSearches: 2 }, deviceVerified: false };
  if (process.env.STACKR_STAGING_RECEIPT_PATH) writeFileSync(process.env.STACKR_STAGING_RECEIPT_PATH, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
