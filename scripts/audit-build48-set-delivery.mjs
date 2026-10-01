import fs from 'node:fs';
const base = 'https://api.stackrtcg.com/v1';
const evidence = { startedAt: new Date().toISOString(), method: 'Public read-only API, complete cursor traversal; artwork references only, not all image bytes or phone rendering', sets: [] };
async function read(url) {
  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json(); return { json, elapsedMs: Math.round(performance.now() - started) };
}
const selections = [];
for (const [language, query] of [['ja', 'SV7a'], ['ja', 'SV4a'], ['ja', 'SV8a'], ['ja', 'M5'], ['en', 'me04']]) {
  const { json } = await read(`${base}/search?q=${query}&language=${language}&limit=5`);
  const match = json.data.results.find(r => r.type === 'set' && r.setCode.toLowerCase() === query.toLowerCase());
  if (!match) { evidence.sets.push({ language, query, error: 'Exact set not resolved' }); continue; }
  selections.push(match.set);
}
for (const language of ['zh-cn', 'zh-tw']) {
  const { json } = await read(`${base}/sets?language=${language}&limit=250`);
  const sets = json.data.sets;
  const selected = sets.find(s => s.total > 0 && s.printedTotal > 0);
  evidence[`${language}Discovery`] = { returned: sets.length, hasNextPage: Boolean(json.meta.pagination.nextCursor), sampledSet: selected?.setId };
  if (selected) selections.push(selected);
}
for (const set of selections) {
  const cards = new Map(), cursors = new Set(), pages = [];
  const started = performance.now(); let cursor = null, error = null;
  try {
    do {
      const { json, elapsedMs } = await read(`${base}/sets/${set.setId}/cards?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!Array.isArray(json.data.cards)) throw new Error('Expected card page');
      for (const card of json.data.cards) cards.set(card.cardId, card);
      pages.push({ returned: json.data.cards.length, elapsedMs, requestId: json.meta.requestId });
      cursor = json.meta.pagination.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('Repeated cursor; catalogue incomplete');
      if (cursor) cursors.add(cursor);
      if (pages.length > 50) throw new Error('Page safety limit; catalogue incomplete');
    } while (cursor);
  } catch (failure) { error = failure.message; }
  const rows = [...cards.values()];
  const item = { setId: set.setId, code: set.setCode, language: set.languageCode, nativeName: set.nativeName,
    englishSetName: set.englishDisplayName, printedTotal: set.printedTotal, recordedTotal: set.total,
    reachedLastPage: !cursor && !error, error, elapsedMs: Math.round(performance.now() - started), pages,
    distinctPrintings: rows.length, collectorNumbers: [...new Set(rows.map(c => c.collectorNumber.value))],
    apiEnglishNames: rows.filter(c => Boolean(c.names.englishDisplay)).length,
    missingEnglishNameCardIds: rows.filter(c => !c.names.englishDisplay).map(c => c.cardId),
    withImageReferences: rows.filter(c => c.variants.some(v => Boolean(v.image))).length,
    detailsFieldCoverage: Object.fromEntries(['supertype', 'subtypes', 'artist', 'attacks', 'rules'].map(key => [key, rows.filter(c => c.details?.[key] != null && (!Array.isArray(c.details[key]) || c.details[key].length)).length])),
    catalogueVersions: [...new Set(rows.map(c => c.catalogueVersionId))],
  };
  evidence.sets.push(item);
  console.log(JSON.stringify({ ...item, collectorNumbers: undefined, missingEnglishNameCardIds: undefined, pages: pages.length }));
}
evidence.completedAt = new Date().toISOString();
fs.writeFileSync('docs/releases/evidence/build48-set-delivery-20261001.json', JSON.stringify(evidence, null, 2) + '\n');
