import fs from 'node:fs';

function replaceOnce(path, oldText, newText) {
  const source = fs.readFileSync(path, 'utf8');
  const parts = source.split(oldText);
  if (parts.length !== 2) {
    throw new Error(`${path}: expected exactly one source match, found ${parts.length - 1}`);
  }
  fs.writeFileSync(path, `${parts[0]}${newText}${parts[1]}`);
}

replaceOnce(
  'lib/stackrApiV1.ts',
  '    query: { language?: StackrApiLanguageCode; cursor?: string | null; limit?: number } = {},',
  '    query: { language?: StackrApiLanguageCode; cursor?: string | null; limit?: number; includeAssets?: boolean } = {},',
);

replaceOnce(
  'lib/stackrDomainAdapter.ts',
  String.raw`      {
        language: toStackrApiLanguage(language) ?? undefined,
        cursor,
        limit: 250,
      },`,
  String.raw`      {
        language: toStackrApiLanguage(language) ?? undefined,
        cursor,
        limit: 500,
        includeAssets: false,
      },`,
);

replaceOnce(
  'lib/stackrDomainAdapter.ts',
  String.raw`export function fetchPreferredStackrCardsForReferences(
  references: string[],
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {`,
  String.raw`export function fetchPreferredStackrCardsForReferences(
  references: string[],
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
  options: { includeAssets?: boolean } = {},
) {`,
);

replaceOnce(
  'lib/stackrDomainAdapter.ts',
  String.raw`  ).then((rows) => {
    // The preferred deadline governs the card facts only.`,
  String.raw`  ).then((rows) => {
    if (options.includeAssets === false) return rows;
    // The preferred deadline governs the card facts only.`,
);

replaceOnce(
  'lib/pokemonTcg.ts',
  String.raw`type FetchCardsForSetOptions = {
  language?: PokemonCardLanguage | string | null;
  preferCanonicalApi?: boolean;
  /** A caller with a known set total must not retain a partial card response. */
  minimumCardCount?: number | null;
};`,
  String.raw`type FetchCardsForSetOptions = {
  language?: PokemonCardLanguage | string | null;
  preferCanonicalApi?: boolean;
  includeAssets?: boolean;
  /** A caller with a known set total must not retain a partial card response. */
  minimumCardCount?: number | null;
};`,
);

replaceOnce(
  'lib/pokemonTcg.ts',
  "  const cacheKey = `${readLane}:${language}:${setIdCandidates.join('|')}`;",
  "  const cacheKey = `${readLane}:${language}:${setIdCandidates.join('|')}:${options.includeAssets === false ? 'facts' : 'assets'}`;",
);

replaceOnce(
  'lib/pokemonTcg.ts',
  '      sourceCards = await fetchPreferredStackrCardsForReferences(setIdCandidates, language);',
  '      sourceCards = await fetchPreferredStackrCardsForReferences(setIdCandidates, language, undefined, { includeAssets: options.includeAssets !== false });',
);

replaceOnce(
  'lib/pokemonTcg.ts',
  String.raw`    const cards = await attachLiveTcgdexCardReferences(
      sourceCards.map(fromStackrCard),
      1,
    );`,
  String.raw`    const mappedCards = sourceCards.map(fromStackrCard);
    const cards = options.includeAssets === false
      ? mappedCards
      : await attachLiveTcgdexCardReferences(mappedCards, 1);`,
);

replaceOnce(
  'lib/binders.ts',
  String.raw`export async function fetchBinderCards(
  binderId: string,
  options: { includePrices?: boolean } = {},
): Promise<BinderCardRecord[]> {`,
  String.raw`export async function fetchBinderCards(
  binderId: string,
  options: { includePrices?: boolean; includeAssets?: boolean } = {},
): Promise<BinderCardRecord[]> {`,
);

replaceOnce(
  'lib/binders.ts',
  "    `binder:${binderId}:${options.includePrices === false ? 'unpriced-cards' : 'cards'}`,",
  "    `binder:${binderId}:${options.includePrices === false ? 'unpriced-cards' : 'cards'}:${options.includeAssets === false ? 'facts' : 'assets'}`,",
);

replaceOnce(
  'lib/binders.ts',
  String.raw`async function fetchBinderCardsUncached(
  binderId: string,
  options: { includePrices?: boolean; onCatalogueUnavailable?: () => void } = {},
): Promise<BinderCardRecord[]> {`,
  String.raw`async function fetchBinderCardsUncached(
  binderId: string,
  options: { includePrices?: boolean; includeAssets?: boolean; onCatalogueUnavailable?: () => void } = {},
): Promise<BinderCardRecord[]> {`,
);

replaceOnce(
  'lib/binders.ts',
  String.raw`  const setCards = await fetchCardsForSet(binder.catalogue_set_id ?? binder.source_set_id, {
    language: binderLanguage,
    preferCanonicalApi: true,`,
  String.raw`  const setCards = await fetchCardsForSet(binder.catalogue_set_id ?? binder.source_set_id, {
    language: binderLanguage,
    preferCanonicalApi: true,
    includeAssets: options.includeAssets,`,
);

replaceOnce(
  'features/binder/BinderDetailScreen.tsx',
  '() => fetchBinderCards(binderId, { includePrices: false }),',
  '() => fetchBinderCards(binderId, { includePrices: false, includeAssets: false }),',
);

replaceOnce(
  'features/binder/BinderDetailScreen.tsx',
  String.raw`      setCards(binderCards);
      setLoading(false);

      // Pricing is supplemental to the immediately usable catalogue/ownership`,
  String.raw`      setCards(binderCards);
      setLoading(false);

      // Artwork is supplemental to first paint. Fetch the enriched set once in
      // the background and merge only image presentation so ownership, grading,
      // quantities and other user state can never be overwritten by enrichment.
      void fetchBinderCards(binderId, { includePrices: false, includeAssets: true })
        .then((enrichedCards) => {
          if (!isCurrentRequest()) return;
          const artworkByCardAndSet = new Map(
            enrichedCards.map((card) => [`${card.set_id}\u0000${card.card_id}`, card])
          );
          setCards((currentCards) => currentCards.map((card) => {
            const enriched = artworkByCardAndSet.get(`${card.set_id}\u0000${card.card_id}`);
            if (!enriched) return card;
            const small = enriched.card?.images?.small ?? enriched.image_url ?? null;
            const large = enriched.card?.images?.large ?? null;
            if (!small && !large) return card;
            return {
              ...card,
              image_url: small ?? card.image_url,
              card: {
                ...(enriched.card ?? {}),
                ...(card.card ?? {}),
                images: {
                  ...(card.card?.images ?? {}),
                  small: small ?? card.card?.images?.small ?? card.image_url ?? null,
                  large: large ?? card.card?.images?.large ?? null,
                },
              },
            };
          }));
        })
        .catch((error) => {
          console.log('Binder artwork enrichment failed:', error);
        });

      // Pricing is supplemental to the immediately usable catalogue/ownership`,
);

fs.writeFileSync('scripts/test-binder-first-paint.ts', String.raw`import fs from 'node:fs';

function expect(source: string, needle: string, message: string) {
  if (!source.includes(needle)) throw new Error(message);
}

const api = fs.readFileSync('lib/stackrApiV1.ts', 'utf8');
const domain = fs.readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const pokemon = fs.readFileSync('lib/pokemonTcg.ts', 'utf8');
const binders = fs.readFileSync('lib/binders.ts', 'utf8');
const screen = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');

expect(api, 'includeAssets?: boolean', 'setCards client must accept includeAssets');
expect(domain, 'limit: 500,\n        includeAssets: false,', 'canonical set facts must use one facts-only page');
expect(domain, 'if (options.includeAssets === false) return rows;', 'preferred canonical facts must be able to skip artwork enrichment');
expect(pokemon, "options.includeAssets === false ? 'facts' : 'assets'", 'set-card caches must isolate facts from artwork');
expect(pokemon, 'options.includeAssets === false\n      ? mappedCards', 'facts-only reads must not wait for live provider artwork');
expect(binders, "options.includeAssets === false ? 'facts' : 'assets'", 'binder cache must isolate first paint from enriched rows');
expect(binders, 'includeAssets: options.includeAssets,', 'binder must pass artwork intent into catalogue read');
expect(screen, 'includePrices: false, includeAssets: false', 'binder first paint must request facts only');
expect(screen, 'includePrices: false, includeAssets: true', 'binder must enrich artwork after first paint');
expect(screen, '...card,\n              image_url:', 'artwork merge must preserve the current ownership/state row');

console.log('Binder first-paint invariants passed.');
`);

console.log('Applied guarded binder first-paint patch.');
