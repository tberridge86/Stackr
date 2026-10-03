export const ECB_REFERENCE_FEED = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** ECB rates are units per EUR: GBP-per-USD is therefore GBP / USD. */
export function parseEcbCatalogueFx(xml, now = Date.now()) {
  const dated = [...String(xml).matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)];
  if (dated.length !== 1) throw Error('Invalid ECB reference date.');
  const date = dated[0][1]; const at = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date || at > now + 300_000 || at < now - 604_800_000) throw Error('ECB reference date is not recent.');
  const rates = new Map();
  for (const row of dated[0][2].matchAll(/<Cube\s+currency=['"](USD|GBP)['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g)) {
    const value = /^\d+(?:\.\d+)?$/.test(row[2]) ? Number(row[2]) : NaN;
    if (rates.has(row[1]) || !Number.isFinite(value) || value <= 0 || value > 10) throw Error('Invalid ECB reference rate.');
    rates.set(row[1], value);
  }
  if (!rates.has('USD') || !rates.has('GBP')) throw Error('Missing ECB USD/GBP reference rates.');
  return { rate: rates.get('GBP') / rates.get('USD'), at: new Date(at).toISOString(), source: ECB_REFERENCE_FEED };
}

export async function fetchEcbCatalogueFx({ fetchImpl = fetch, now = Date.now() } = {}) {
  const response = await fetchImpl(ECB_REFERENCE_FEED, { signal: AbortSignal.timeout(10_000), redirect: 'error', headers: { Accept: 'application/xml,text/xml', 'User-Agent': 'StackrCataloguePriceGuide/1.0' } });
  if (!response.ok || !response.body) throw Error(`ECB reference feed failed (${response.status}).`);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 131_072) throw Error('ECB reference feed exceeds its size limit.'); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseEcbCatalogueFx(new TextDecoder('utf-8', { fatal: true }).decode(bytes), now);
}
