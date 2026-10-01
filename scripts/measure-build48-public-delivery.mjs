import fs from 'node:fs';
import path from 'node:path';

// Read-only public delivery sample. No credentials, database writes, provider
// acquisition, cache busting or image persistence. This is not a phone trace.
const base = 'https://api.stackrtcg.com/v1';
const count = 10;
const startedAt = new Date().toISOString();
const results = [];
const request = async (url, binary = false) => {
  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const elapsedMs = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { elapsedMs, bytes: bytes.length, data: binary ? null : JSON.parse(new TextDecoder().decode(bytes)) };
};
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;
async function measure(name, url, { binary = false, inspect = () => ({}) } = {}) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    try { const result = await request(url, binary); samples.push({ ...result, data: undefined, observed: inspect(result.data) }); }
    catch (error) { samples.push({ error: error.message }); }
  }
  const times = samples.flatMap(sample => sample.elapsedMs == null ? [] : [sample.elapsedMs]);
  const repeats = samples.slice(1).flatMap(sample => sample.elapsedMs == null ? [] : [sample.elapsedMs]);
  const result = { name, url, attempted: count, successful: times.length, firstRequestMs: samples[0].elapsedMs ?? null,
    p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), repeatP50Ms: percentile(repeats, .5), repeatP95Ms: percentile(repeats, .95), samples };
  results.push(result); console.log(JSON.stringify({ ...result, samples: undefined }));
}
await measure('Mew card search', `${base}/search?q=Mew&limit=100`, { inspect: j => ({ cards: j.data.results.filter(r => r.type === 'card').length, sets: j.data.results.filter(r => r.type === 'set').length }) });
await measure('Simplified Chinese discovery first page', `${base}/sets?language=zh-cn&limit=250`, { inspect: j => ({ rows: j.data.sets.length, nextCursor: j.meta.pagination.nextCursor }) });
for (const code of ['SV7a', 'SV4a', 'SV8a']) {
  const lookup = await request(`${base}/search?q=${code}&language=ja&limit=5`);
  const set = lookup.data.data.results.find(r => r.type === 'set' && r.setCode.toLowerCase() === code.toLowerCase());
  if (!set) { results.push({ name: code, error: 'Exact Japanese set not resolved' }); continue; }
  await measure(`${code} first card page`, `${base}/sets/${set.setId}/cards?limit=100`, { inspect: j => ({ rows: j.data.cards.length, missingEnglishNames: j.data.cards.filter(c => !c.names?.englishDisplay).length, hasNextPage: Boolean(j.meta.pagination.nextCursor) }) });
}
const cardId = '72126e8e-63e5-4d73-99d9-e88fc119a164';
await measure('Froakie Chaos Rising card detail', `${base}/cards/${cardId}`, { inspect: j => ({ cardId: j.data.card.cardId, variants: j.data.card.variants?.length }) });
const card = (await request(`${base}/cards/${cardId}`)).data.data.card;
const descriptor = card.variants?.find(v => v.image)?.image;
const image = descriptor?.derivatives?.find(d => d.role === 'card-grid')?.deliveryUrl ?? descriptor?.deliveryUrl;
if (image) await measure('Froakie delivered grid image bytes', image, { binary: true });
else results.push({ name: 'Froakie delivered grid image bytes', error: 'No embedded grid image found' });
const output = { startedAt, completedAt: new Date().toISOString(), environment: 'Windows desktop public HTTPS; sequential requests; no authenticated phone session',
  limitations: ['First request is first in this process, not guaranteed server cold cache.', 'Public endpoint samples do not measure app startup, decoding/rendering, owner pricing, Home/binder totals or device latency.', 'Repeated samples can hit normal server/CDN caches; no universal sub-500ms claim.'], results };
const target = path.resolve('docs/releases/evidence/build48-public-delivery-20261001.json');
fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n');
console.log(`Saved ${target}`);
