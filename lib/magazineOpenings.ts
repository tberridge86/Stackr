import type { CorocoroIssueRecord } from './corocoroIssueArchive';

export type MagazineOpening = {
  id: string;
  issueId: string | null;
  publication: string;
  edition: string;
  kind: 'peel' | 'sheet' | 'packet';
  cards: readonly string[];
  copies: number;
  accessories: readonly string[];
  sources: readonly string[];
  interpretation: string;
};

// Opening styles are researched separately from catalogue identities. A name
// here must never become a card ID, an artwork URL or a collection entitlement.
export const MAGAZINE_OPENINGS: readonly MagazineOpening[] = [
  {
    id: 'corocoro-1996-11', issueId: 'corocoro-1996-11-insert',
    publication: 'Monthly CoroCoro Comic', edition: 'November 1996', kind: 'peel',
    cards: ['Pikachu', 'Jigglypuff'], copies: 1, accessories: [],
    sources: ['https://bulbapedia.bulbagarden.net/wiki/Pikachu_(Asobikata_promo)'],
    interpretation: 'Inspired by the original glossy peel-off insert. The illustrated sheet and movement are a Stackr recreation.',
  },
  {
    id: 'corocoro-1997-09', issueId: 'corocoro-1997-09-insert',
    publication: 'Monthly CoroCoro Comic', edition: 'September 1997', kind: 'peel',
    cards: ['Surfing Pikachu', 'Imakuni?'], copies: 1, accessories: [],
    sources: ['https://pokeboon.com/corocoro_surfingpikachu-glossy_promo/',
      'https://pokeboon.com/ranking-of-corocoro-promos-summarized-about-the-pokemon-card-values/'],
    interpretation: 'Inspired by the original glossy peel-off insert. The illustrated sheet and movement are a Stackr recreation.',
  },
  {
    id: 'corocoro-1998-04', issueId: 'corocoro-1998-04-insert',
    publication: 'Monthly CoroCoro Comic', edition: 'April 1998', kind: 'sheet',
    cards: ["Farfetch'd", 'Jynx', 'Cubone'], copies: 1,
    accessories: ['Leek counter', 'Curse marker', 'Bone counter'],
    sources: ['https://bulbapedia.bulbagarden.net/wiki/Cubone_(CoroCoro_promo)',
      'https://pokeboon.com/corocoro_cubone_promo/'],
    interpretation: 'Inspired by the three-card insert and its game counters. The illustrated layout and peel direction are a Stackr recreation.',
  },
  {
    id: 'corocoro-1998-12', issueId: 'corocoro-1998-12-insert',
    publication: 'Monthly CoroCoro Comic', edition: 'December 1998', kind: 'sheet',
    cards: ["Brock's Mankey", "Erika's Bulbasaur", "Misty's Tentacool", "Lt. Surge's Jolteon"],
    copies: 1, accessories: [],
    sources: ['https://pokeboon.com/corocoro_brock-mankey_promo/',
      'https://pokeboon.com/ranking-of-corocoro-promos-summarized-about-the-pokemon-card-values/'],
    interpretation: 'Inspired by the four-card glossy insert. The illustrated layout and movement are a Stackr recreation.',
  },
  {
    id: 'corocoro-2001-05', issueId: 'corocoro-2001-05-insert',
    publication: 'Monthly CoroCoro Comic', edition: 'May 2001', kind: 'packet',
    cards: ['Shining Mew'], copies: 1, accessories: [],
    sources: ['https://bulbapedia.bulbagarden.net/wiki/Shining_Mew_(CoroCoro_promo)',
      'https://loosepacks.com/products/japanese-sealed-corocoro-shining-mew-promo'],
    interpretation: 'Inspired by the original paper sleeve. The downward tear strip and opening flap are a Stackr interpretation; their historical direction is unverified.',
  },
  {
    id: 'fan-club-volume-5', issueId: null,
    publication: 'Pokémon Card Fan Club', edition: 'Volume 5 · June 1998', kind: 'packet',
    cards: ['Touch Change!'], copies: 4, accessories: [],
    sources: ['https://pokumon.com/pokemon-card-fan-club-magazine/'],
    interpretation: 'Inspired by the packet of four Touch Change! cards. The illustrated packet and opening movement are a Stackr recreation.',
  },
];

/** Only the exact documented insert can receive an opening. Offers stay offers. */
export function getMagazineOpening(record: Pick<CorocoroIssueRecord, 'id' | 'distributionType' | 'confidence' | 'publication' | 'issueMonth'>
  & { cards: readonly { name: string }[] }): MagazineOpening | null {
  if (record.distributionType !== 'insert' || record.confidence === 'conflicting') return null;
  return MAGAZINE_OPENINGS.find((opening) => opening.issueId === record.id
    && opening.id === `corocoro-${record.issueMonth}`
    && opening.publication === record.publication
    && opening.cards.length === record.cards.length
    && opening.cards.every((name, index) => record.cards[index]?.name === name)) ?? null;
}

export type MagazineOpeningPhase = 'sealed' | 'opening' | 'revealed';

export function magazineOpeningAction(kind: MagazineOpening['kind']): string {
  return kind === 'packet' ? 'Open paper packet' : 'Peel this card';
}
