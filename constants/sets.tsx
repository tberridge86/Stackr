export type CardItem = {
  id: string;
  number: string;
  name: string;
  rarity: string;
  image: string;
};

export type SetItem = {
  id: string;
  name: string;
  subtitle: string;
  totalCards: number;
  trackedByDefault?: boolean;
  cards: CardItem[];
};

export const SETS: SetItem[] = [
  {
    id: 'sv151',
    name: 'Scarlet & Violet 151',
    subtitle: 'Modern special set',
    totalCards: 207,
    trackedByDefault: true,
    cards: [
      {
        id: 'sv3pt5-1',
        number: '001',
        name: 'Bulbasaur',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/sv3pt5/1.png',
      },
      {
        id: 'sv3pt5-4',
        number: '004',
        name: 'Charmander',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/sv3pt5/4.png',
      },
      {
        id: 'sv3pt5-7',
        number: '007',
        name: 'Squirtle',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/sv3pt5/7.png',
      },
      {
        id: 'sv3pt5-25',
        number: '025',
        name: 'Pikachu',
        rarity: 'Rare',
        image: 'https://images.pokemontcg.io/sv3pt5/25.png',
      },
      {
        id: 'sv3pt5-150',
        number: '150',
        name: 'Mewtwo ex',
        rarity: 'Ultra Rare',
        image: 'https://images.pokemontcg.io/sv3pt5/150.png',
      },
    ],
  },
  {
    id: 'base',
    name: 'Base Set',
    subtitle: 'Classic original set',
    totalCards: 102,
    trackedByDefault: true,
    cards: [
      {
        id: 'base1-1',
        number: '001',
        name: 'Alakazam',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base1/1.png',
      },
      {
        id: 'base1-4',
        number: '004',
        name: 'Charizard',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base1/4.png',
      },
      {
        id: 'base1-7',
        number: '007',
        name: 'Hitmonchan',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base1/7.png',
      },
      {
        id: 'base1-58',
        number: '058',
        name: 'Pikachu',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/base1/58.png',
      },
      {
        id: 'base1-70',
        number: '070',
        name: 'Clefairy Doll',
        rarity: 'Rare Trainer',
        image: 'https://images.pokemontcg.io/base1/70.png',
      },
    ],
  },
  {
    id: 'jungle',
    name: 'Jungle',
    subtitle: 'Early expansion',
    totalCards: 64,
    cards: [
      {
        id: 'base2-1',
        number: '001',
        name: 'Clefable',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base2/1.png',
      },
      {
        id: 'base2-3',
        number: '003',
        name: 'Flareon',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base2/3.png',
      },
      {
        id: 'base2-7',
        number: '007',
        name: 'Nidoqueen',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base2/7.png',
      },
      {
        id: 'base2-60',
        number: '060',
        name: 'Pikachu',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/base2/60.png',
      },
    ],
  },
  {
    id: 'fossil',
    name: 'Fossil',
    subtitle: 'Vintage expansion',
    totalCards: 62,
    cards: [
      {
        id: 'base3-1',
        number: '001',
        name: 'Aerodactyl',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base3/1.png',
      },
      {
        id: 'base3-5',
        number: '005',
        name: 'Gengar',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base3/5.png',
      },
      {
        id: 'base3-10',
        number: '010',
        name: 'Lapras',
        rarity: 'Rare',
        image: 'https://images.pokemontcg.io/base3/10.png',
      },
      {
        id: 'base3-53',
        number: '053',
        name: 'Psyduck',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/base3/53.png',
      },
    ],
  },
  {
    id: 'rocket',
    name: 'Team Rocket',
    subtitle: 'Dark Pokémon era',
    totalCards: 83,
    cards: [
      {
        id: 'base5-1',
        number: '001',
        name: 'Dark Alakazam',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base5/1.png',
      },
      {
        id: 'base5-4',
        number: '004',
        name: 'Dark Charizard',
        rarity: 'Holo Rare',
        image: 'https://images.pokemontcg.io/base5/4.png',
      },
      {
        id: 'base5-9',
        number: '009',
        name: 'Dark Vaporeon',
        rarity: 'Rare',
        image: 'https://images.pokemontcg.io/base5/9.png',
      },
      {
        id: 'base5-50',
        number: '050',
        name: 'Charmander',
        rarity: 'Common',
        image: 'https://images.pokemontcg.io/base5/50.png',
      },
    ],
  },
];