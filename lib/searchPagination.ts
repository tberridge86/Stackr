import { getCatalogueVariantIdForKey } from './catalogueVariantPresentation';
export type SearchPageMetadata = {
  nextCursor: string | null;
  continuationAvailable: boolean;
};
export type SearchPageState = SearchPageMetadata & {
  ready: boolean;
  loading: boolean;
  error: 'retry' | 'changed' | null;
};
const initialState = (): SearchPageState => ({
  nextCursor: null, continuationAvailable: false, ready: false, loading: false, error: null,
});

/** A cursor belongs to one query/account generation, including A → B → A. */
export class SearchPagination {
  private generation = 0;
  private controller = new AbortController();
  private usedCursors = new Set<string>();
  state = initialState();
  constructor(private readonly changed: (state: SearchPageState) => void = () => {}) {}
  private publish(patch: Partial<SearchPageState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  reset() {
    this.controller.abort();
    this.controller = new AbortController();
    this.usedCursors.clear();
    this.generation += 1;
    this.state = initialState();
    this.changed(this.state);
    return { generation: this.generation, signal: this.controller.signal };
  }
  current(generation: number) { return generation === this.generation && !this.controller.signal.aborted; }
  acceptInitial(generation: number, metadata?: SearchPageMetadata) {
    if (!this.current(generation) || this.state.ready) return;
    this.publish({ ready: true, nextCursor: metadata?.nextCursor ?? null,
      continuationAvailable: metadata?.continuationAvailable === true, error: null });
  }
  async load<T>(
    fetchPage: (cursor: string, signal: AbortSignal) => Promise<{ rows: T[]; metadata: SearchPageMetadata }>,
    append: (rows: T[]) => void,
  ) {
    const cursor = this.state.nextCursor;
    if (!this.state.ready || !this.state.continuationAvailable || !cursor || this.state.loading || this.state.error === 'changed') return;
    const generation = this.generation;
    this.publish({ loading: true, error: null });
    try {
      const page = await fetchPage(cursor, this.controller.signal);
      if (!this.current(generation)) return;
      if (!page.metadata.continuationAvailable) throw new Error('Search continuation unavailable.');
      const next = page.metadata.nextCursor;
      if (next === cursor || (next !== null && this.usedCursors.has(next))) throw new Error('Search cursor did not advance.');
      append(page.rows);
      this.usedCursors.add(cursor);
      this.publish({ nextCursor: next, continuationAvailable: true });
    } catch (error) {
      if (!this.current(generation)) return;
      const code = (error as { code?: string })?.code;
      this.publish({ error: code === 'search_catalogue_changed' || code === 'invalid_search_cursor' ? 'changed' : 'retry' });
    } finally {
      if (this.current(generation)) this.publish({ loading: false });
    }
  }
}

/** Stable identities retain different languages/finishes; duplicate pages replace only their own rows. */
export function mergeSearchRows<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const rows = new Map(existing.map(row => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()];
}

type SearchIdentityRow = { id: string; set_id?: string | null; raw_data?: Record<string, any> };
export function searchCardLookupIds(cards: SearchIdentityRow[]) {
  return [...new Set(cards.flatMap(card => [card.id, card.raw_data?.stackr?.cardId]).filter((id): id is string => typeof id === 'string' && id.length > 0))];
}
export function searchOwnedQuantities(cards: SearchIdentityRow[], owned: {
  card_id: string; set_id?: string | null; variant?: string | null; quantity: number;
}[]) {
  const quantities = new Map<string, number>();
  for (const card of cards) {
    const printingId = card.raw_data?.stackr?.cardId ?? card.id;
    const variantId = card.raw_data?.stackr?.defaultVariantId;
    const canonical = card.raw_data?.stackr?.canonical === true;
    let quantity = 0;
    for (const row of owned) {
      if (row.card_id !== printingId && row.card_id !== card.id) continue;
      if (card.set_id && row.set_id !== card.set_id) continue;
      if (canonical) {
        const key = row.variant || 'normal';
        const variants = card.raw_data?.stackr?.variants;
        const exact = Array.isArray(variants) ? variants.filter(variant =>
          variant.variantCode === key || variant.variantId === key).map(variant => variant.variantId) : [];
        const alias = getCatalogueVariantIdForKey(card, key);
        const matches = new Set([...exact, ...(alias ? [alias] : [])]);
        if (!variantId || matches.size !== 1 || !matches.has(variantId)) continue;
      }
      quantity += Math.max(1, Number(row.quantity ?? 1) || 1);
    }
    quantities.set(card.id, quantity);
  }
  return quantities;
}
