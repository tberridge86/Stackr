export const getPriceFromPokemonCard = (card: any): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = [
    'holofoil',
    'reverseHolofoil',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value;
  }

  return null;
};

export const fetchLivePricesForCardIds = async (cardIds: string[]) => {
  const chunks: string[][] = [];

  for (let i = 0; i < cardIds.length; i += 20) {
    chunks.push(cardIds.slice(i, i + 20));
  }

  const priceMap: Record<string, number> = {};

 for (const chunk of chunks) {
  for (const id of chunk) {
    const [setId, number] = id.split('-');

    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(
  `set.id:${setId} number:${number}`
)}`;
    const response = await fetch(url);
    const json = await response.json();

    const card = json?.data?.[0];

    if (!card) {
      console.log(`❌ Not found in API: ${id}`);
      continue;
    }

    const price = getPriceFromPokemonCard(card);

    if (typeof price === 'number') {
      priceMap[id] = price;
    }
  }
}

  return priceMap;
};