/**
 * Current, read-only production catalogue inspection. It requests JSON only;
 * card image descriptors are recorded but never fetched as image binaries.
 *
 * npx tsx scripts/collect-public-catalogue-coverage.ts
 * npx tsx scripts/collect-public-catalogue-coverage.ts --output-dir=D:/Stackr-1/.tmp/four-language-coverage/20260905-public-api-example
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

type Row = Record<string, any>;
const BASE = 'https://api.stackrtcg.com/v1';
const LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw'] as const;
const ROOT = resolve('.tmp/four-language-coverage');
const MAX_CONCURRENCY = 3;
const LIMIT = 250;

function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Row).sort().map((key) => [key, stable((value as Row)[key])])); return value; }
function stableJson(value: unknown) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function dateToken() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }
export function resolveOutputDirectory(value?: string) {
  const target = resolve(value || `${ROOT}/20260905-public-api-${dateToken()}-${randomUUID().slice(0, 8)}`); const contained = relative(ROOT, target);
  if (!contained || contained.startsWith('..') || isAbsolute(contained) || existsSync(target) || !/^20260905-public-api-/.test(contained.split(/[\\/]/)[0])) throw new Error('Output must be a new 20260905-public-api-* directory under D:/Stackr-1/.tmp/four-language-coverage.');
  return target;
}
function sleep(ms: number) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

export async function fetchJson(url: string, attempts = 3, timeoutMs = 20_000): Promise<{ ok: true; body: Row; fetchedAt: string } | { ok: false; status: number | null; error: string; attemptedAt: string }> {
  let last: { ok: false; status: number | null; error: string; attemptedAt: string } = { ok: false, status: null, error: 'not attempted', attemptedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Stackr public catalogue coverage (read-only)' }, signal: AbortSignal.timeout(timeoutMs) });
      const raw = await response.text(); let body: unknown = null; try { body = raw ? JSON.parse(raw) : null; } catch { /* recorded below */ }
      if (response.ok && body && typeof body === 'object' && !Array.isArray(body)) return { ok: true, body: body as Row, fetchedAt: new Date().toISOString() };
      last = { ok: false, status: response.status, error: text((body as Row | null)?.error?.message) ?? `HTTP ${response.status}`, attemptedAt: new Date().toISOString() };
    } catch (error) { last = { ok: false, status: null, error: error instanceof Error ? error.message : String(error), attemptedAt: new Date().toISOString() }; }
    if (attempt + 1 < attempts) await sleep(500 * 2 ** attempt);
  }
  return last;
}
function records(body: Row, kind: 'sets' | 'cards') { const data = body.data; return Array.isArray(data?.[kind]) ? data[kind] as Row[] : null; }
function nextCursor(body: Row) { return text(body.meta?.pagination?.nextCursor); }
function imageDescriptor(card: Row) {
  const variants = Array.isArray(card.variants) ? card.variants : [];
  const images = variants.map((variant) => variant?.image).filter(Boolean);
  return {
    variantsWithArtworkKey: variants.filter((variant) => text(variant?.artworkKey)).length,
    variantsWithDeclaredNativeImageStatus: variants.filter((variant) => text(variant?.nativeImageStatus)).length,
    issuedImageDescriptors: images.length,
    issuedImageUrlDescriptors: images.filter((image) => text(image?.url) ?? text(image?.originalSourceUrl)).length,
    httpLoadVerified: null,
  };
}
export function summariseSet(set: Row, cards: Row[], error: Row | null) {
  const cardsById = new Map<string, Row>(); for (const card of cards) if (text(card.cardId) && !cardsById.has(card.cardId)) cardsById.set(card.cardId, card);
  const unique = [...cardsById.values()];
  return {
    setId: set.setId, language: set.languageCode, setCode: set.setCode ?? null, nativeName: set.nativeName ?? null, englishDisplayName: set.englishDisplayName ?? null,
    releaseDate: set.releaseDate ?? null, reportedTotal: set.total ?? null, reportedPrintedTotal: set.printedTotal ?? null, updatedAt: set.updatedAt ?? null, sourceUpdatedAt: set.sourceUpdatedAt ?? null,
    // /v1/sets does not issue marks in its current response contract. Absence
    // therefore means unknown, rather than a missing logo or symbol.
    setMarks: { logoDescriptor: null, symbolDescriptor: null, httpLoadVerified: null, state: 'unknown_not_returned_by_sets_api' },
    cardsEndpoint: error ? { status: 'unavailable', httpStatus: error.status ?? null, error: error.error ?? null, attemptedAt: error.attemptedAt ?? null } : { status: 'complete' },
    actualDistinctCards: error ? null : unique.length,
    cardGaps: error ? null : {
      missingNativeName: unique.filter((card) => !text(card.names?.native)).length,
      missingEnglishSupplement: unique.filter((card) => card.languageCode !== 'en' && !text(card.names?.englishDisplay)).length,
      missingCollectorNumber: unique.filter((card) => !text(card.collectorNumber?.value)).length,
      missingRarity: unique.filter((card) => !text(card.rarity?.code) && !text(card.rarity?.label)).length,
      variantsWithArtworkKey: unique.reduce((sum, card) => sum + imageDescriptor(card).variantsWithArtworkKey, 0),
      variantsWithDeclaredNativeImageStatus: unique.reduce((sum, card) => sum + imageDescriptor(card).variantsWithDeclaredNativeImageStatus, 0),
      issuedImageDescriptors: unique.reduce((sum, card) => sum + imageDescriptor(card).issuedImageDescriptors, 0),
      issuedImageUrlDescriptors: unique.reduce((sum, card) => sum + imageDescriptor(card).issuedImageUrlDescriptors, 0),
      verifiedNativeImageLoads: null,
    },
  };
}
async function mapBounded<T, R>(items: T[], worker: (item: T) => Promise<R>) {
  const results: R[] = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, async () => { while (next < items.length) { const index = next; next += 1; results[index] = await worker(items[index]); } }));
  return results;
}
async function listSets(language: string) {
  const sets: Row[] = []; let cursor: string | null = null; const cursors = new Set<string>(); const requests: Row[] = [];
  do { const url = new URL(`${BASE}/sets`); url.searchParams.set('language', language); url.searchParams.set('limit', String(LIMIT)); if (cursor) url.searchParams.set('cursor', cursor); const response = await fetchJson(url.toString()); requests.push({ url: url.toString(), ...response }); if (!response.ok) return { sets, requests, error: response }; const rows = records(response.body, 'sets'); if (!rows) return { sets, requests, error: { kind: 'invalid_response', error: '200 response did not contain data.sets' } }; sets.push(...rows); cursor = nextCursor(response.body); if (cursor && cursors.has(cursor)) return { sets, requests, error: { kind: 'repeated_cursor', error: 'Set pagination repeated a cursor.' } }; if (cursor) cursors.add(cursor); } while (cursor);
  return { sets, requests, error: null };
}
async function listCards(set: Row) {
  const cards: Row[] = []; let cursor: string | null = null; const cursors = new Set<string>(); const requests: Row[] = [];
  do { const url = new URL(`${BASE}/sets/${encodeURIComponent(String(set.setId))}/cards`); url.searchParams.set('language', String(set.languageCode)); url.searchParams.set('limit', String(LIMIT)); if (cursor) url.searchParams.set('cursor', cursor); const response = await fetchJson(url.toString()); requests.push({ url: url.toString(), ...response }); if (!response.ok) return { set, cards, error: { status: response.status, error: response.error, attemptedAt: response.attemptedAt }, requests }; const rows = records(response.body, 'cards'); if (!rows) return { set, cards, error: { kind: 'invalid_response', error: '200 response did not contain data.cards' }, requests }; cards.push(...rows); cursor = nextCursor(response.body); if (cursor && cursors.has(cursor)) return { set, cards, error: { kind: 'repeated_cursor', error: 'Card pagination repeated a cursor.' }, requests }; if (cursor) cursors.add(cursor); } while (cursor);
  return { set, cards, error: null, requests };
}
function writeState(directory: string, state: Row) { writeFileSync(resolve(directory, 'state.json'), stableJson(state)); }
async function main() {
  const rawOutput = process.argv.find((arg) => arg.startsWith('--output-dir='))?.slice('--output-dir='.length); const directory = resolveOutputDirectory(rawOutput); mkdirSync(directory, { recursive: true });
  const setResults = await Promise.all(LANGUAGES.map(async (language) => [language, await listSets(language)] as const));
  const allSets = setResults.flatMap(([, result]) => result.sets); const state: Row = { schemaVersion: 'stackr-public-catalogue-coverage-state-v1', startedAt: new Date().toISOString(), baseUrl: BASE, readOnly: true, imageBinariesDownloaded: false, setRequests: setResults.map(([language, result]) => ({ language, requests: result.requests, error: result.error })), completedSetIds: [] };
  writeState(directory, state);
  const cardResults = await mapBounded(allSets, async (set) => { const result = await listCards(set); state.completedSetIds = [...state.completedSetIds, set.setId]; writeState(directory, state); return result; });
  const sets = cardResults.map((result) => summariseSet(result.set, result.cards, result.error));
  const requestEvidence = { schemaVersion: 'stackr-public-catalogue-request-evidence-v1', setRequests: state.setRequests, cardRequests: cardResults.map((result) => result.requests) }; const requestEvidenceBody = stableJson(requestEvidence); const requestEvidenceSha256 = sha(requestEvidenceBody); writeFileSync(resolve(directory, 'request-evidence.json'), requestEvidenceBody, { flag: 'wx' });
  const report = { schemaVersion: 'stackr-public-catalogue-coverage-v1', generatedAt: new Date().toISOString(), baseUrl: BASE, readOnly: true, productionModified: false, imageBinariesDownloaded: false, imageSemantics: 'Image and set-mark URLs/descriptors were not fetched. Their presence is not HTTP or native-image load verification.', providerComparison: 'Historical provider inventories are not used as a current completeness denominator.', requestEvidenceSha256, byLanguage: LANGUAGES.map((language) => { const listing = setResults.find(([code]) => code === language)![1]; const rows = sets.filter((set) => set.language === language); const listingComplete = !listing.error; return { language, setsEndpoint: listingComplete ? { status: 'complete' } : { status: 'unavailable_or_partial', error: listing.error }, setsListed: listingComplete ? listing.sets.length : null, completeCardEndpoints: listingComplete ? rows.filter((set) => set.cardsEndpoint.status === 'complete').length : null, unavailableCardEndpoints: listingComplete ? rows.filter((set) => set.cardsEndpoint.status === 'unavailable').length : null, distinctCards: !listingComplete || rows.some((set) => set.actualDistinctCards === null) ? null : rows.reduce((sum, set) => sum + (set.actualDistinctCards ?? 0), 0) }; }), sets };
  writeFileSync(resolve(directory, 'report.json'), stableJson(report), { flag: 'wx' }); state.completedAt = new Date().toISOString(); state.reportSha256 = sha(stableJson(report)); writeState(directory, state); process.stdout.write(`${JSON.stringify({ ok: true, output: directory, sets: sets.length, unavailableCardEndpoints: sets.filter((set) => set.cardsEndpoint.status === 'unavailable').length })}\n`);
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
