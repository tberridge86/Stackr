export type OwnedPokedexCard = {
  card_id: string;
  set_id: string | null;
  card_variant_ids: string[];
  binder_card_ids: string[];
  pokedex_card_ids: string[];
};

export type OwnedPokedexCardRow = { id: string; card_id: string; set_id: string | null };

/** Physical collection rows are inventory, not a Pokédex marker to clear. */
export const canRemovePokedexOwnershipMarker = (physicalVariantRows: ReadonlyArray<{ id: string }> | null | undefined) =>
  !(physicalVariantRows?.length);

/** Merges canonical ownership with the two legacy presentation sources. */
export function buildOwnedPokedexCards(
  variants: OwnedPokedexCardRow[] = [],
  binders: OwnedPokedexCardRow[] = [],
  pokedexCards: OwnedPokedexCardRow[] = [],
): Map<string, OwnedPokedexCard> {
  const map = new Map<string, OwnedPokedexCard>();

  const addRows = (rows: OwnedPokedexCardRow[], source: keyof Pick<OwnedPokedexCard, 'card_variant_ids' | 'binder_card_ids' | 'pokedex_card_ids'>) => {
    for (const row of rows) {
      if (!row?.id || !row.card_id) continue;
      const key = `${row.set_id ?? ''}:${row.card_id}`;
      const entry = map.get(key) ?? {
        card_id: row.card_id,
        set_id: row.set_id ?? null,
        card_variant_ids: [],
        binder_card_ids: [],
        pokedex_card_ids: [],
      };
      entry[source].push(row.id);
      map.set(key, entry);
    }
  };

  addRows(variants, 'card_variant_ids');
  addRows(binders, 'binder_card_ids');
  addRows(pokedexCards, 'pokedex_card_ids');
  return map;
}
