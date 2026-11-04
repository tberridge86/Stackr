import { binderCardIdentityInternals, createSavedBinderCardMatcher, normalizeBinderCollectorNumber, type SavedBinderCardIdentityRow } from './binderCardIdentity';
import { countBinderProgressSlots } from './masterSetProgress';
import type { PokemonCardLanguage } from './pokemonTcg';

type SavedProgressRow = SavedBinderCardIdentityRow & { id: string; owned?: boolean | null; api_card_id?: string | null };
type OwnedProgressRow = { card_id: string; set_id: string; language?: string | null; variant: string; quantity: number };
type ProgressCard = { id: string; number?: string | null; raw_data?: Record<string, any> | null };

/** All aliases must come from one resolved set and language; display names never join ownership. */
export function getOfficialBinderProgress(input: {
  language: PokemonCardLanguage;
  setReferences: readonly string[];
  savedRows: readonly SavedProgressRow[];
  ownedRows: readonly OwnedProgressRow[];
  total: number | null;
  masterSetEnabled: boolean;
  /** A complete, validated canonical facts read, or null when unavailable. */
  cards?: readonly ProgressCard[] | null;
}) {
  const { normalizedSetReference, normalizedExactCardId, rowLanguage } = binderCardIdentityInternals;
  const references = new Set(input.setReferences.map(normalizedSetReference).filter(Boolean));
  const eligible = (row: SavedBinderCardIdentityRow) => references.has(normalizedSetReference(row.set_id))
    && rowLanguage(row, input.language) === input.language;
  const savedRows = input.savedRows.filter(eligible);
  const ownedRows = input.ownedRows.filter((row) => eligible(row) && row.quantity > 0);
  const cardId = (value: unknown) => normalizedExactCardId(value);
  const catalogueIds = new Set(input.cards?.map((card) => cardId(card.id)) ?? []);
  const savedIdentity = (row: SavedProgressRow) => {
    const savedId = cardId(row.card_id), apiId = cardId(row.api_card_id);
    if (catalogueIds.has(savedId)) return savedId;
    if (catalogueIds.has(apiId)) return apiId;
    const canonical = /^[0-9a-f-]{36}$/i;
    return canonical.test(savedId) ? savedId : canonical.test(apiId) ? apiId : savedId;
  };
  const savedAliases = (row: SavedProgressRow) => {
    const identity = savedIdentity(row);
    return [...new Set([cardId(row.card_id), cardId(row.api_card_id)])].filter((alias) => alias
      && (alias === identity || !/^[0-9a-f-]{36}$/i.test(alias)));
  };
  const savedByCard = new Map<string, string>();
  const ambiguousAliases = new Set<string>();
  const addSavedAlias = (alias: string, identity: string) => {
    if (!alias || ambiguousAliases.has(alias)) return;
    if (savedByCard.has(alias) && savedByCard.get(alias) !== identity) {
      savedByCard.delete(alias); ambiguousAliases.add(alias);
    } else savedByCard.set(alias, identity);
  };
  for (const row of savedRows) {
    for (const alias of savedAliases(row)) addSavedAlias(alias, savedIdentity(row));
  }
  const ownedCardIds = new Set(savedRows.filter((row) => row.owned).map(savedIdentity));
  for (const row of ownedRows) ownedCardIds.add(savedByCard.get(cardId(row.card_id)) ?? cardId(row.card_id));
  ownedCardIds.delete('');
  const regular = { owned: ownedCardIds.size, total: input.total,
    totalKnown: typeof input.total === 'number' && Number.isFinite(input.total) && input.total > 0 };
  if (!input.masterSetEnabled) return regular;
  const cards = input.cards;
  if (!cards?.length || cards.some((card) => card.raw_data?.stackr?.canonical !== true)
    || input.total != null && cards.length < input.total) {
    return { owned: regular.owned, total: null, totalKnown: false };
  }
  const collectorCounts = new Map<string, number>();
  for (const card of cards) {
    const collector = normalizeBinderCollectorNumber(card.number);
    if (collector) collectorCounts.set(collector, (collectorCounts.get(collector) ?? 0) + 1);
  }
  // A saved canonical API ID can resolve an exact printing even when a set
  // legitimately repeats a collector number.
  const matchingRows = savedRows.map((row) => ({ ...row, card_id: savedIdentity(row) }));
  const savedRowsById = new Map(savedRows.map((row) => [row.id, row]));
  const ownedRowsByCard = new Map<string, OwnedProgressRow[]>();
  for (const row of ownedRows) {
    const key = cardId(row.card_id);
    const bucket = ownedRowsByCard.get(key) ?? [];
    bucket.push(row); ownedRowsByCard.set(key, bucket);
  }
  const matcher = createSavedBinderCardMatcher({ savedRows: matchingRows, language: input.language, setReferences: input.setReferences });
  const entries = cards.map((card) => {
    const collector = normalizeBinderCollectorNumber(card.number);
    const matched = matcher.takeMatch({ cardId: card.id, collectorNumber: card.number,
      allowCollectorMatch: Boolean(collector && collectorCounts.get(collector) === 1) });
    const saved = matched ? savedRowsById.get(matched.id) : null;
    const identities = new Set([cardId(card.id), ...(saved ? savedAliases(saved) : [])]);
    const variants = [...new Set([...identities].flatMap((id) => ownedRowsByCard.get(id) ?? []))];
    return { card, owned: saved?.owned === true || variants.length > 0,
      ownedVariants: [...new Set(variants.map((row) => row.variant))], variantManaged: variants.length > 0 };
  });
  return { ...countBinderProgressSlots(entries, true), totalKnown: true };
}
