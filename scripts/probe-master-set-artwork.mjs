// Read-only, bounded public API sample. No provider, database or production writes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = 'https://api.stackrtcg.com/v1';
const output = '.tmp/master-set-artwork';
await mkdir(output, { recursive: true });
async function read(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}
async function pages(path, key) {
  const rows = [], receipts = [], seen = new Set();
  let cursor = null;
  do {
    const result = await read(`${path}${path.includes('?') ? '&' : '?'}limit=96${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    rows.push(...result.data[key]); receipts.push({ ...result.meta, rowCount: result.data[key].length });
    cursor = result.meta.pagination?.nextCursor ?? null;
    if (cursor && seen.has(cursor)) throw new Error('Repeated cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { rows, receipts, paginationComplete: true };
}
const requested = { en: ['base1', 'sv03.5', 'sv3pt5', 'swsh7'], ja: ['SV2a', 'M5', 'sv2a'], 'zh-cn': ['151c', 'CS6aC', 'CSM25'], 'zh-tw': ['SV2a', 'sv2a', 'SV1V'] };
const resume = process.argv.includes('--resume');
const result = resume ? JSON.parse(await readFile(`${output}/sample.json`, 'utf8'))
  : { observedAt: new Date().toISOString(), backend: await (await fetch('https://pocketvault-production.up.railway.app/health')).json(), manifest: await read('/catalog/manifest'), sets: [] };
for (const [language, codes] of Object.entries(requested)) {
  const inventory = resume ? JSON.parse(await readFile(`${output}/sets-${language}.json`, 'utf8')) : await pages(`/sets?language=${language}`, 'sets');
  await writeFile(`${output}/sets-${language}.json`, JSON.stringify(inventory, null, 2));
  let selected = inventory.rows.filter(s => codes.some(c => c.toLowerCase() === s.setCode?.toLowerCase()));
  if (!selected.length) selected = inventory.rows.filter(s => s.total > 0 && s.total < 250).slice(0, 2);
  selected = selected.slice(0, 2);
  for (const set of selected) {
    if (result.sets.some(existing => existing.set.setId === set.setId)) continue;
    const cards = await pages(`/sets/${set.setId}/cards?language=${language}&includeAssets=true`, 'cards');
    // The generic set manifest timed out during this audit. Inspect only missing
    // printing IDs through the existing bounded identity endpoint (audit only).
    const byPrinting = new Map();
    for (const card of cards.rows) byPrinting.set(card.cardId, [...(byPrinting.get(card.cardId) ?? []), ...card.variants]);
    const missing = [...byPrinting].filter(([, variants]) => !variants.some(v => v.image)).map(([id]) => id);
    const assets = { rows: [], receipts: [], errors: [], printingIds: missing, paginationComplete: true };
    result.sets.push({ set, ...cards, assets });
    for (let i = 0; i < missing.length; i += 2) {
      const results = await Promise.all(missing.slice(i, i + 2).map(async printingId => {
        try { return { printingId, ...await pages(`/assets/manifest?printingId=${printingId}&assetType=card_image`, 'assets') }; }
        catch (error) { return { printingId, error: String(error), observedAt: new Date().toISOString() }; }
      }));
      for (const result of results) {
        if (result.error) { assets.errors.push(result); assets.paginationComplete = false; }
        else { assets.rows.push(...result.rows); assets.receipts.push({ printingId: result.printingId, pages: result.receipts, rowCount: result.rows.length }); }
      }
      await writeFile(`${output}/sample.json`, JSON.stringify(result, null, 2));
      if (i % 40 === 0) console.log('Missing-face manifest checks', set.setCode, i + results.length, '/', missing.length);
      if (results.every(entry => entry.error)) {
        assets.errors.push(...missing.slice(i + 2).map(printingId => ({ printingId,
          error: 'Not attempted: stopped after a failed batch to avoid repeated requests to an unhealthy endpoint.', observedAt: new Date().toISOString() })));
        break;
      }
    }
    await writeFile(`${output}/sample.json`, JSON.stringify(result, null, 2));
    console.log(language, set.setCode, set.setId, 'rows', cards.rows.length, 'pages', cards.receipts.length);
  }
}
await writeFile(`${output}/sample.json`, JSON.stringify(result, null, 2));
console.log('Saved dated public API sample:', output);
