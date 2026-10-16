import { corocoroIssueEvidence, type CorocoroIssueRecord } from './corocoroIssueArchive';
import { getCuratedPokemonCardById } from './curatedPokemonCatalogue';
import type { PokemonCard } from './pokemonTcg';
import { supabase } from './supabase';

type CardReference = CorocoroIssueRecord['cards'][number];
export type CorocoroCollectionCard = PokemonCard & { id: string; set: NonNullable<PokemonCard['set']> & { id: string }; language: 'ja' };
const hasCollectionIdentity = (card: PokemonCard | null | undefined): card is CorocoroCollectionCard =>
  Boolean(card?.id && card.set?.id && card.language === 'ja');

/** Accept only the established printing pair. Canonical flags and names cannot establish a new alias. */
export function getCorocoroCollectionCard(reference: CardReference, resolved?: PokemonCard | null): CorocoroCollectionCard | null {
  const expected = reference.mappedStackrCardId
    ? getCuratedPokemonCardById(reference.mappedStackrCardId, 'ja') : null;
  if (!hasCollectionIdentity(expected) || reference.format !== 'standard') return null;
  if (!resolved) return expected;
  if (!hasCollectionIdentity(resolved)
    || resolved.id !== expected.id || resolved.set.id !== expected.set.id) return null;
  if (reference.numbering === 'unnumbered'
    && !['', 'unnumbered'].includes(String(resolved.number ?? '').trim().toLowerCase())) return null;
  return resolved;
}

type OwnedRow = { card_id: string; set_id: string; binder_id?: string | null; quantity?: number | null; owned_quantity?: number | null; language?: string | null };
const MAX_MATCHING_ROWS = 500;

/** Read the existing collection, bounded to exact supported issue printings. No magazine ownership store. */
export async function fetchCorocoroOwnedCardKeys(expectedAccountId: string): Promise<Set<string>> {
  const verifyAccount = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (data.user?.id !== expectedAccountId) throw new Error('Your account changed. Retry ownership.');
  };
  await verifyAccount();
  const references = new Map<string, CardReference>();
  for (const record of corocoroIssueEvidence.issues) {
    if (record.confidence === 'conflicting' || record.distributionType !== 'insert') continue;
    for (const reference of record.cards) {
      if (reference.mappedStackrCardId && getCorocoroCollectionCard(reference)) references.set(reference.mappedStackrCardId, reference);
    }
  }
  const identities = [...references].map(([key, reference]) => {
    const original = getCorocoroCollectionCard(reference);
    if (!original) throw new Error('The issue card identity could not be verified.');
    return { key, pair: `${original.set.id}:${original.id}`, card: original };
  });
  if (!identities.length) return new Set();
  const cardIds = [...new Set(identities.map(item => item.card.id))];
  const setIds = [...new Set(identities.map(item => item.card.set.id))];
  await verifyAccount();
  const [variants, binders] = await Promise.all([
    supabase.from('user_card_variants').select('card_id,set_id,quantity')
      .eq('user_id', expectedAccountId).in('card_id', cardIds).in('set_id', setIds).gt('quantity', 0).limit(MAX_MATCHING_ROWS + 1),
    supabase.from('binder_cards').select('binder_id,card_id,set_id,language,owned_quantity,binders!inner(user_id)')
      .eq('binders.user_id', expectedAccountId).eq('owned', true).in('card_id', cardIds).in('set_id', setIds).limit(MAX_MATCHING_ROWS + 1),
  ]);
  if (variants.error) throw variants.error;
  if (binders.error) throw binders.error;
  if ((variants.data?.length ?? 0) > MAX_MATCHING_ROWS || (binders.data?.length ?? 0) > MAX_MATCHING_ROWS) {
    throw new Error('Ownership results exceed this issue view. Open your collection to check them.');
  }
  await verifyAccount();
  const keys = new Set<string>();
  for (const [rows, binderSource] of [[variants.data ?? [], false], [binders.data ?? [], true]] as const) {
    for (const row of rows as OwnedRow[]) {
      if ((row.language && row.language !== 'ja') || Number(row.quantity ?? row.owned_quantity ?? 1) <= 0) continue;
      const identity = identities.find(item => item.pair === `${row.set_id}:${row.card_id}`);
      if (!identity) continue;
      keys.add(identity.key);
      if (binderSource && row.binder_id) keys.add(`binder:${identity.key}:${row.binder_id}`);
      else if (!binderSource) keys.add(`variant:${identity.key}`);
    }
  }
  return keys;
}

/** Source destinations travel in the existing account-scoped snapshot, never a second cache. */
export function getCorocoroCollectionDestinations(reference: CardReference, owned: ReadonlySet<string> | null) {
  const key = getCorocoroCollectionCard(reference) ? reference.mappedStackrCardId : null;
  const prefix = `binder:${key}:`;
  return {
    binderIds: key && owned ? [...owned].filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length)) : [],
    variants: Boolean(key && owned?.has(`variant:${key}`)),
  };
}

/** Unknown and disputed references stay in the denominator and cannot complete an issue. */
export function getCorocoroIssueOwnership(records: readonly CorocoroIssueRecord[], owned: ReadonlySet<string> | null) {
  let total = 0, collected = 0, pending = 0;
  for (const record of records) {
    if (record.distributionType !== 'insert') continue;
    for (const reference of record.cards) {
      total += 1;
      const key = record.confidence !== 'conflicting' && getCorocoroCollectionCard(reference) ? reference.mappedStackrCardId : null;
      if (!key) pending += 1;
      else if (owned?.has(key)) collected += 1;
    }
  }
  return { total, owned: owned ? collected : null, pending, complete: Boolean(owned && total && collected === total && pending === 0) };
}
