import fs from 'node:fs';

const marker = '// STACKR_IDENTITIES_FIRST_V2';
if (fs.readFileSync('lib/stackrApiV1.ts', 'utf8').includes(marker)) {
  console.log('Identities-first source patch already present; running validation only.');
  process.exit(0);
}
function replaceOnce(path, oldText, newText) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one exact source match, found ${count}`);
  fs.writeFileSync(path, source.replace(oldText, newText));
}
function prepend(path, text) { fs.writeFileSync(path, text + fs.readFileSync(path, 'utf8')); }
function append(path, text) { fs.appendFileSync(path, '\n' + text + '\n'); }

replaceOnce('lib/stackrApiV1.ts',
  '  setCards(\n    setId: string,\n    query: { language?: StackrApiLanguageCode; cursor?: string | null; limit?: number } = {},',
  '  // STACKR_IDENTITIES_FIRST_V2\n  get catalogueCacheNamespace() { return this.baseUrl; }\n\n  setCards(\n    setId: string,\n    query: { language?: StackrApiLanguageCode; cursor?: string | null; limit?: number; includeAssets?: boolean } = {},');

prepend('lib/stackrCatalogueCache.ts', "import type { SetFactsKey, SetFactsSnapshot, SetFactsStore } from './stackrSetRetrieval';\n");
append('lib/stackrCatalogueCache.ts', String.raw`
// Per-set public snapshots share the existing catalogue database, but never load
// the scanner's whole-database JSON snapshot or advance its delta cursor.
let setFactsStorePromise: Promise<SetFactsStore | null> | null = null;
export function getPersistentStackrSetFactsStore(): Promise<SetFactsStore | null> {
  if (!setFactsStorePromise) setFactsStorePromise = (async () => {
    const sqlite = getOptionalExpoSqlite();
    if (!sqlite?.openDatabaseAsync) return null;
    const db = await sqlite.openDatabaseAsync('stackr_catalogue_cache.db');
    await db.execAsync('CREATE TABLE IF NOT EXISTS stackr_set_facts_v1 (namespace TEXT NOT NULL, set_id TEXT NOT NULL, language TEXT NOT NULL, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(namespace, set_id, language))');
    return {
      async read(key: SetFactsKey) {
        const row = await db.getFirstAsync('SELECT payload FROM stackr_set_facts_v1 WHERE namespace = ? AND set_id = ? AND language = ?', [key.namespace, key.setId, key.language]);
        if (!row || row.payload.length * 2 > 2 * 1024 * 1024) return null;
        try { return JSON.parse(row.payload); } catch { return null; }
      },
      async write(snapshot: SetFactsSnapshot) {
        const payload = JSON.stringify(snapshot);
        if (payload.length * 2 > 2 * 1024 * 1024) return;
        // The mobile SDK's exclusive transaction keeps unrelated scanner writes outside this transaction.
        await db.withExclusiveTransactionAsync(async (tx: any) => {
          await tx.runAsync('INSERT OR REPLACE INTO stackr_set_facts_v1(namespace, set_id, language, fetched_at, payload) VALUES (?, ?, ?, ?, ?)', [snapshot.namespace, snapshot.setId, snapshot.language, snapshot.fetchedAt, payload]);
          await tx.runAsync('DELETE FROM stackr_set_facts_v1 WHERE rowid IN (SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (ORDER BY fetched_at DESC, rowid DESC) AS position, SUM(LENGTH(CAST(payload AS BLOB))) OVER (ORDER BY fetched_at DESC, rowid DESC ROWS UNBOUNDED PRECEDING) AS total_bytes FROM stackr_set_facts_v1) WHERE position > 24 OR total_bytes > 8388608)');
        });
      },
      async clear(namespace: string) { await db.runAsync('DELETE FROM stackr_set_facts_v1 WHERE namespace = ?', [namespace]); },
    } satisfies SetFactsStore;
  })().catch(() => null);
  return setFactsStorePromise;
}
`);

prepend('lib/stackrDomainAdapter.ts', "import { createSetFactsReader, loadCompleteSetPages } from './stackrSetRetrieval';\nimport { getPersistentStackrSetFactsStore } from './stackrCatalogueCache';\n");
replaceOnce('lib/stackrDomainAdapter.ts',
  'const PREFERRED_CATALOGUE_READ_TIMEOUT_MS = 7000;',
  String.raw`const PREFERRED_CATALOGUE_READ_TIMEOUT_MS = 7000;
type SetCardReadOptions = { includeAssets?: boolean; minimumCardCount?: number | null };
const setFactsReaders = new WeakMap<StackrApiClient, ReturnType<typeof createSetFactsReader>>();
// Read-time enrichment handles are weakly held and never serialized into binder records.
const canonicalArtworkFacts = new WeakMap<object, StackrCard>();
function setFactsReader(client: StackrApiClient) {
  let reader = setFactsReaders.get(client);
  if (!reader) {
    reader = createSetFactsReader({ store: () => client.catalogueCacheNamespace
      ? getPersistentStackrSetFactsStore() : Promise.resolve(null) });
    setFactsReaders.set(client, reader);
  }
  return reader;
}`);
replaceOnce('lib/stackrDomainAdapter.ts',
  'export function clearStackrCatalogueCaches(client: StackrApiClient = stackrApiClient) {',
  "export function clearStackrCatalogueCaches(client: StackrApiClient = stackrApiClient) {\n  setFactsReaders.get(client)?.invalidate(client.catalogueCacheNamespace ?? 'ephemeral-client');");

const domainPath = 'lib/stackrDomainAdapter.ts';
{
  const source = fs.readFileSync(domainPath, 'utf8');
  const start = source.indexOf('export function stackrCardToLegacyCard(');
  const end = source.indexOf('\nasync function allPages<', start);
  if (start < 0 || end < 0) throw new Error('Cannot isolate canonical card mapper');
  let mapper = source.slice(start, end);
  if (mapper.split('  return {').length !== 2 || !mapper.endsWith('\n}\n')) throw new Error('Canonical mapper changed; review before patching');
  mapper = mapper.replace('  return {', '  const mapped: StackrLegacyCard = {');
  mapper = mapper.slice(0, -3) + '\n  canonicalArtworkFacts.set(mapped.raw_data, card);\n  return mapped;\n}\n';
  fs.writeFileSync(domainPath, source.slice(0, start) + mapper + source.slice(end));
}

replaceOnce(domainPath, String.raw`async function fetchCanonicalSetCardFacts(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
  signal?: AbortSignal,
) {`, String.raw`async function fetchCanonicalSetCardFacts(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
  signal?: AbortSignal,
  options: SetCardReadOptions = {},
) {`);
replaceOnce(domainPath,
  '  if (!setId) return { setId: null, cards: [] as StackrCard[] };\n  const responseCards = await allPages<StackrCard>',
  String.raw`  if (!setId) return { setId: null, cards: [] as StackrCard[] };
  if (options.includeAssets === false) {
    const prefixLanguage = toStackrApiLanguage(getPokemonSetLanguageFromPrefixedId(reference));
    let apiLanguage = toStackrApiLanguage(language) ?? prefixLanguage;
    if (prefixLanguage && apiLanguage && prefixLanguage !== apiLanguage) throw new Error('Conflicting catalogue language');
    let expectedCount = Number(options.minimumCardCount ?? 0);
    if (!apiLanguage || !Number.isSafeInteger(expectedCount) || expectedCount < 1) {
      const set = (await client.set(setId, { signal })).data.set;
      if (apiLanguage && apiLanguage !== set.languageCode) throw new Error('Conflicting catalogue language');
      apiLanguage = set.languageCode;
      expectedCount = Number(set.total ?? set.printedTotal ?? 0);
    }
    const key = { namespace: client.catalogueCacheNamespace ?? 'ephemeral-client', setId, language: apiLanguage!, expectedCount };
    return setFactsReader(client).read(key, (requestSignal) => loadCompleteSetPages(key, async (cursor, pageSignal) => {
      const response = await client.setCards(setId, { language: apiLanguage!, cursor, limit: 500, includeAssets: false }, { signal: pageSignal });
      return { cards: response.data.cards, nextCursor: response.meta.pagination?.nextCursor ?? null };
    }, normalizeCanonicalSetCards, requestSignal), signal);
  }
  const responseCards = await allPages<StackrCard>`);

replaceOnce(domainPath, String.raw`export function fetchStackrCardsForSet(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {
  return shouldUseStackrApi(client)`, String.raw`export function fetchStackrCardsForSet(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
  options: SetCardReadOptions = {},
) {
  if (options.includeAssets === false) return fetchCanonicalSetCardFacts(reference, language, client, undefined, options)
    .then((facts) => facts.cards.map((card) => stackrCardToLegacyCard(card)));
  return shouldUseStackrApi(client)`);
replaceOnce(domainPath, String.raw`export function fetchPreferredStackrCardsForReferences(
  references: string[],
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {`, String.raw`export function fetchPreferredStackrCardsForReferences(
  references: string[],
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
  options: SetCardReadOptions = {},
) {
  if (options.includeAssets === false) return firstNonEmptyCatalogueRows(references, async (reference) => {
    const facts = await fetchCanonicalSetCardFacts(reference, language, client, undefined, options);
    return facts.cards.map((card) => stackrCardToLegacyCard(card));
  });`);
append(domainPath, String.raw`
/** Reuse facts already returned to the binder; only the existing approved image/set resolution runs here. */
export async function enrichStackrCardArtworkFromFacts(
  cards: Array<{ raw_data?: any }>,
  signal?: AbortSignal,
  client: StackrApiClient = stackrApiClient,
): Promise<StackrLegacyCard[]> {
  const groups = new Map<string, StackrCard[]>();
  for (const card of cards) {
    const fact = card.raw_data && canonicalArtworkFacts.get(card.raw_data);
    if (!fact) continue;
    const key = JSON.stringify([fact.set.setId, fact.languageCode, fact.catalogueVersionId]);
    const rows = groups.get(key) ?? [];
    rows.push(fact); groups.set(key, rows);
  }
  const enriched: StackrLegacyCard[] = [];
  for (const facts of groups.values()) {
    throwIfOptionalCatalogueReadAborted(signal);
    enriched.push(...await enrichCanonicalSetCards({ setId: facts[0].set.setId, cards: facts }, client, signal));
  }
  return enriched;
}
`);

replaceOnce('lib/pokemonTcg.ts',
  'type FetchCardsForSetOptions = {\n  language?: PokemonCardLanguage | string | null;\n  preferCanonicalApi?: boolean;',
  'type FetchCardsForSetOptions = {\n  language?: PokemonCardLanguage | string | null;\n  preferCanonicalApi?: boolean;\n  includeAssets?: boolean;');
replaceOnce('lib/pokemonTcg.ts', '  approvedCardAssets.set(card.id, card.images ?? {});',
  '  if (!card.images?.small && !card.images?.large) return;\n  const existing = approvedCardAssets.get(card.id);\n  approvedCardAssets.set(card.id, { small: card.images?.small ?? existing?.small, large: card.images?.large ?? existing?.large });');
replaceOnce('lib/pokemonTcg.ts', "  const cacheKey = `${readLane}:${language}:${setIdCandidates.join('|')}`;",
  "  const cacheKey = `${readLane}:${language}:${setIdCandidates.join('|')}:${options.includeAssets === false ? 'facts' : 'assets'}`;");
replaceOnce('lib/pokemonTcg.ts', '  const cached = readNonEmptyCatalogueRows(cardsForSetCache, cacheKey);',
  '  const cached = options.includeAssets === false ? null : readNonEmptyCatalogueRows(cardsForSetCache, cacheKey);');
replaceOnce('lib/pokemonTcg.ts', '      sourceCards = await fetchPreferredStackrCardsForReferences(setIdCandidates, language);',
  '      sourceCards = await fetchPreferredStackrCardsForReferences(setIdCandidates, language, undefined, { includeAssets: options.includeAssets, minimumCardCount: options.minimumCardCount });');
replaceOnce('lib/pokemonTcg.ts', '          sourceCards = await fetchStackrCardsForSet(candidate, language);',
  '          sourceCards = await fetchStackrCardsForSet(candidate, language, undefined, { includeAssets: options.includeAssets, minimumCardCount: options.minimumCardCount });');
replaceOnce('lib/pokemonTcg.ts', String.raw`    const cards = await attachLiveTcgdexCardReferences(
      sourceCards.map(fromStackrCard),
      1,
    );`, String.raw`    const mappedCards = sourceCards.map(fromStackrCard);
    const cards = options.includeAssets === false ? mappedCards : await attachLiveTcgdexCardReferences(mappedCards, 1);`);
replaceOnce('lib/pokemonTcg.ts', '    if (hasRequiredCards(cards, requiredMinimum)) {',
  '    if (options.includeAssets !== false && hasRequiredCards(cards, requiredMinimum)) {');

replaceOnce('lib/binders.ts', "import { fetchCardsForSet, normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';",
  "import { attachLiveTcgdexCardReferences, fetchCardsForSet, normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';\nimport { enrichStackrCardArtworkFromFacts } from './stackrDomainAdapter';\nimport { readOptionalCatalogueEnrichment } from './optionalCatalogueEnrichment';");
replaceOnce('lib/binders.ts', String.raw`export async function fetchBinderCards(
  binderId: string,
  options: { includePrices?: boolean } = {},`, String.raw`export async function fetchBinderCards(
  binderId: string,
  options: { includePrices?: boolean; includeAssets?: boolean } = {},`);
replaceOnce('lib/binders.ts', "    `binder:${binderId}:${options.includePrices === false ? 'unpriced-cards' : 'cards'}`,",
  "    `binder:${binderId}:${options.includePrices === false ? 'unpriced-cards' : 'cards'}:${options.includeAssets === false ? 'facts' : 'assets'}`,");
replaceOnce('lib/binders.ts', '  options: { includePrices?: boolean; onCatalogueUnavailable?: () => void } = {},',
  '  options: { includePrices?: boolean; includeAssets?: boolean; onCatalogueUnavailable?: () => void } = {},');
replaceOnce('lib/binders.ts', String.raw`  const setCards = await fetchCardsForSet(binder.catalogue_set_id ?? binder.source_set_id, {
    language: binderLanguage,
    preferCanonicalApi: true,`, String.raw`  const setCards = await fetchCardsForSet(binder.catalogue_set_id ?? binder.source_set_id, {
    language: binderLanguage,
    preferCanonicalApi: true,
    includeAssets: options.includeAssets,`);
append('lib/binders.ts', String.raw`
export async function attachBinderSetArtwork(binder: BinderRecord): Promise<BinderRecord> {
  return (await attachSetBrandingToBinders([binder], true))[0] ?? binder;
}

export async function attachBinderCatalogueArtwork(rows: BinderCardRecord[], signal?: AbortSignal): Promise<BinderCardRecord[]> {
  const eligible = rows.filter((row) => row.catalogue_match_status === 'catalogue' && row.card?.raw_data?.stackr?.canonical);
  if (!eligible.length) return rows;
  const enriched = await enrichStackrCardArtworkFromFacts(eligible.map((row) => row.card), signal);
  // Preserve the already-established foreign-source fallback, but never await it for first paint.
  const references = await readOptionalCatalogueEnrichment(() => attachLiveTcgdexCardReferences(enriched, 1), signal);
  const byId = new Map((references ?? enriched).map((card) => [JSON.stringify([card.id, card.language, card.raw_data?.stackr && (card.raw_data.stackr as any).defaultVariantId]), card]));
  return rows.map((row) => {
    const identity = row.card?.raw_data?.stackr;
    const display = identity && byId.get(JSON.stringify([identity.cardId, row.language, identity.defaultVariantId]));
    if (!display) return row;
    const card = { ...row.card, images: display.images };
    if (hasTcgdexRuntimeImageOverlay(display, 'images')) defineTcgdexRuntimeImageOverlay(card, 'images', display.images, display.images.small);
    return { ...row, card };
  });
}
`);

prepend('features/binder/BinderDetailScreen.tsx', "import { mergeBinderArtwork } from '../../lib/stackrSetRetrieval';\nimport { attachBinderCatalogueArtwork, attachBinderSetArtwork } from '../../lib/binders';\n");
replaceOnce('features/binder/BinderDetailScreen.tsx', '  const loadRequestRef = useRef(0);',
  '  const loadRequestRef = useRef(0);\n  const artworkRequestRef = useRef<AbortController | null>(null);');
replaceOnce('features/binder/BinderDetailScreen.tsx', '    const requestId = ++loadRequestRef.current;',
  '    const requestId = ++loadRequestRef.current;\n    artworkRequestRef.current?.abort();\n    const artworkRequest = new AbortController();\n    artworkRequestRef.current = artworkRequest;');
replaceOnce('features/binder/BinderDetailScreen.tsx', '        () => fetchBinderById(binderId),',
  '        () => fetchBinderById(binderId, { includeAssets: false }),');
replaceOnce('features/binder/BinderDetailScreen.tsx', '          () => fetchBinderCards(binderId, { includePrices: false }),',
  '          () => fetchBinderCards(binderId, { includePrices: false, includeAssets: false }),');
replaceOnce('features/binder/BinderDetailScreen.tsx', String.raw`      setCards(binderCards);
      setLoading(false);

      // Pricing is supplemental to the immediately usable catalogue/ownership`, String.raw`      setCards(binderCards);
      setLoading(false);

      void attachBinderCatalogueArtwork(binderCards, artworkRequest.signal).then((enriched) => {
        if (!isCurrentRequest() || artworkRequest.signal.aborted) return;
        setCards((current) => isCurrentRequest() && !artworkRequest.signal.aborted ? mergeBinderArtwork(current, enriched) : current);
        setSelectedCard((current) => current && isCurrentRequest() && !artworkRequest.signal.aborted ? mergeBinderArtwork([current], enriched)[0] : current);
      }).catch((error) => {
        if (isCurrentRequest() && !artworkRequest.signal.aborted) console.log('Binder artwork unavailable:', error);
      });
      void attachBinderSetArtwork(binderData).then((enriched) => {
        if (!isCurrentRequest() || artworkRequest.signal.aborted) return;
        setBinder((current) => current?.id === enriched.id && isCurrentRequest() ? {
          ...current,
          source_set_logo_url: enriched.source_set_logo_url ?? current.source_set_logo_url,
          source_set_symbol_url: enriched.source_set_symbol_url ?? current.source_set_symbol_url,
          source_set_cover_url: enriched.source_set_cover_url ?? current.source_set_cover_url,
        } : current);
      }).catch(() => undefined);

      // Pricing is supplemental to the immediately usable catalogue/ownership`);
replaceOnce('features/binder/BinderDetailScreen.tsx', String.raw`      return () => {
        loadRequestRef.current += 1;
      };
    }, [load])`, String.raw`      return () => {
        loadRequestRef.current += 1;
        artworkRequestRef.current?.abort();
      };
    }, [load])`);
replaceOnce('features/binder/BinderDetailScreen.tsx', '      accountGenerationRef.current += 1;\n      loadRequestRef.current += 1;',
  '      accountGenerationRef.current += 1;\n      loadRequestRef.current += 1;\n      artworkRequestRef.current?.abort();');
console.log('Applied guarded identities-first, persistent set-facts and image-only enrichment edits.');
