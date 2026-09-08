import { stackrApiClient, type StackrApiLanguageCode, type StackrCard, type StackrCardVariant, type StackrSet } from './stackrApiV1';
import { ownerTeachingCardChoice, ownerTeachingCollectorMatches, ownerTeachingSearchChoices, type OwnerTeachingCardChoice } from './ownerTeachingCore';

const MAX_OWNER_TEACHING_PAGES = 10;


export async function listOwnerTeachingSets(language: StackrApiLanguageCode, query = ''): Promise<StackrSet[]> {
  const sets = new Map<string, StackrSet>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_OWNER_TEACHING_PAGES; page += 1) {
    const response = await stackrApiClient.sets({ language, limit: 100, cursor });
    for (const set of response.data.sets) sets.set(set.setId, set);
    const next = response.meta.pagination?.nextCursor ?? null;
    if (!next || cursors.has(next)) break;
    cursors.add(next); cursor = next;
  }
  const needle = query.trim().toLowerCase();
  const all = [...sets.values()];
  if (!needle) return all;
  return all.filter((set) => [set.setCode, set.nativeName, set.englishDisplayName]
    .some((value) => value?.toLowerCase().includes(needle)));
}

export async function searchOwnerTeachingCards(input: {
  language: StackrApiLanguageCode;
  setId: string;
  collectorNumber: string;
}): Promise<OwnerTeachingCardChoice[]> {
  const number = input.collectorNumber.trim();
  if (!number) return [];
  // The public search endpoint intentionally rejects one-character terms. A
  // one-digit printed number is still a valid exact owner correction, so use
  // the bounded set-card endpoint and retain only the exact number.
  if (number.length < 2) {
    const cards = new Map<string, StackrCard>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_OWNER_TEACHING_PAGES; page += 1) {
      const response = await stackrApiClient.setCards(input.setId, { language: input.language, limit: 100, cursor });
      for (const card of response.data.cards) cards.set(card.cardId, card);
      const next = response.meta.pagination?.nextCursor ?? null;
      if (!next || cursors.has(next)) break;
      cursors.add(next); cursor = next;
    }
    return [...cards.values()]
      .filter((card) => ownerTeachingCollectorMatches(card.collectorNumber.value, number))
      .map(ownerTeachingCardChoice);
  }
  const response = await stackrApiClient.search({ q: number, language: input.language, setId: input.setId, limit: 12 });
  return ownerTeachingSearchChoices(response.data.results)
    .filter((card) => ownerTeachingCollectorMatches(card.collectorNumber, number));
}

export async function loadOwnerTeachingCard(cardId: string): Promise<{ card: StackrCard; variants: StackrCardVariant[]; catalogueVersion: string | null }> {
  const [cardResponse, variantsResponse, manifestResponse] = await Promise.all([
    stackrApiClient.card(cardId),
    stackrApiClient.cardVariants(cardId),
    stackrApiClient.catalogManifest(),
  ]);
  return {
    card: cardResponse.data.card,
    variants: variantsResponse.data.variants,
    catalogueVersion: manifestResponse.data.currentCatalogueVersion ?? null,
  };
}
