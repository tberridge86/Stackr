const TCGCSV_BASE_URL = 'https://tcgcsv.com';

type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation?: string;
  categoryId: number;
};

type TcgcsvExtendedDataEntry = {
  name?: string;
  value?: string;
};

type TcgcsvProduct = {
  productId: number;
  name: string;
  groupId: number;
  extendedData?: TcgcsvExtendedDataEntry[];
};

type TcgcsvPrice = {
  productId: number;
  subTypeName: string;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
};

export type TcgcsvCardVariantPrice = {
  subTypeName: string;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
};

export type TcgcsvUiCardPriceRow = {
  productId: number;
  name: string;
  number: string | null;
  variants: TcgcsvCardVariantPrice[];
};

export type TcgVariantPriceSummary = {
  variant: string;
  market: number | null;
  mid: number | null;
  low: number | null;
};

export type TcgCardPriceAvailability = {
  id: string;
  name: string;
  number?: string;
  setName?: string;
  variants: TcgVariantPriceSummary[];
};

export type LatestMarketSnapshot = {
  ebay_average?: number | null;
  ebay_low?: number | null;
  ebay_high?: number | null;
  tcg_mid?: number | null;
  tcg_low?: number | null;
  cardmarket_trend?: number | null;
};

export const getPreferredMarketPrice = (
  snapshot?: LatestMarketSnapshot | null,
  fallback?: { ebay?: number | null; tcg?: number | null; cardmarket?: number | null }
) => {
  const ebay = snapshot?.ebay_average ?? fallback?.ebay ?? null;
  if (typeof ebay === 'number') return { source: 'ebay' as const, value: ebay };

  const tcg = snapshot?.tcg_mid ?? fallback?.tcg ?? null;
  if (typeof tcg === 'number') return { source: 'tcg' as const, value: tcg };

  const cardmarket = snapshot?.cardmarket_trend ?? fallback?.cardmarket ?? null;
  if (typeof cardmarket === 'number') return { source: 'cardmarket' as const, value: cardmarket };

  return { source: null, value: null };
};

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

export const summarizeCardPriceAvailability = (card: any): TcgCardPriceAvailability => {
  const prices = card?.tcgplayer?.prices ?? {};
  const variants: TcgVariantPriceSummary[] = Object.entries(prices).map(
    ([variant, value]: [string, any]) => ({
      variant,
      market: typeof value?.market === 'number' ? value.market : null,
      mid: typeof value?.mid === 'number' ? value.mid : null,
      low: typeof value?.low === 'number' ? value.low : null,
    })
  );

  return {
    id: card?.id ?? '',
    name: card?.name ?? '',
    number: card?.number ?? undefined,
    setName: card?.set?.name ?? undefined,
    variants,
  };
};

export const fetchCardsBySetNameWithPriceAvailability = async (
  setName: string,
  cardName?: string,
  pageSize = 40
): Promise<TcgCardPriceAvailability[]> => {
  const filters = [`set.name:"${setName}"`];
  if (cardName?.trim()) {
    filters.push(`name:"*${cardName.trim()}*"`);
  }

  const query = filters.join(' ');
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(
    query
  )}&pageSize=${pageSize}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch cards for set "${setName}": ${response.status} ${text}`);
  }

  const json = await response.json();
  const cards = Array.isArray(json?.data) ? json.data : [];
  return cards.map(summarizeCardPriceAvailability);
};

async function fetchTcgcsvJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PocketVault/1.0.0',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TCGCSV request failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getExtendedDataValue(product: TcgcsvProduct, key: string): string | null {
  const entries = Array.isArray(product.extendedData) ? product.extendedData : [];
  const match = entries.find(
    (entry) => String(entry?.name ?? '').toLowerCase() === key.toLowerCase()
  );
  const value = match?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isUiDisplayableSingleCard(product: TcgcsvProduct): boolean {
  const lowerName = product.name.toLowerCase();

  const blockedNameTerms = [
    'code card',
    'booster',
    'elite trainer box',
    'etb',
    'bundle',
    'case',
    'blister',
    'collection',
    'deck',
    'tin',
    'playmat',
    'sleeves',
    'binder',
    'poster',
    'coins',
    'box',
  ];

  if (blockedNameTerms.some((term) => lowerName.includes(term))) {
    return false;
  }

  const number = getExtendedDataValue(product, 'Number');
  const rarity = getExtendedDataValue(product, 'Rarity');

  return Boolean(number || rarity);
}

export async function fetchTcgcsvPokemonGroupByName(
  setName: string
): Promise<TcgcsvGroup | null> {
  const url = `${TCGCSV_BASE_URL}/tcgplayer/3/groups`;
  const json = await fetchTcgcsvJson<{ results?: TcgcsvGroup[] }>(url);
  const groups = Array.isArray(json.results) ? json.results : [];

  const target = normalizeForCompare(setName);
  const exact = groups.find((group) => normalizeForCompare(group.name) === target);
  if (exact) return exact;

  return (
    groups.find((group) => normalizeForCompare(group.name).includes(target)) ?? null
  );
}

export async function fetchTcgcsvUiCardPricesForSet(
  setName: string
): Promise<TcgcsvUiCardPriceRow[]> {
  const group = await fetchTcgcsvPokemonGroupByName(setName);
  if (!group) return [];

  const [productsJson, pricesJson] = await Promise.all([
    fetchTcgcsvJson<{ results?: TcgcsvProduct[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/products`
    ),
    fetchTcgcsvJson<{ results?: TcgcsvPrice[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/prices`
    ),
  ]);

  const products = (productsJson.results ?? []).filter(isUiDisplayableSingleCard);
  const prices = pricesJson.results ?? [];

  const priceByProductId = new Map<number, TcgcsvCardVariantPrice[]>();
  for (const price of prices) {
    if (!priceByProductId.has(price.productId)) {
      priceByProductId.set(price.productId, []);
    }

    priceByProductId.get(price.productId)!.push({
      subTypeName: price.subTypeName,
      marketPrice: typeof price.marketPrice === 'number' ? price.marketPrice : null,
      lowPrice: typeof price.lowPrice === 'number' ? price.lowPrice : null,
      midPrice: typeof price.midPrice === 'number' ? price.midPrice : null,
    });
  }

  const rows: TcgcsvUiCardPriceRow[] = [];
  for (const product of products) {
    const variants = priceByProductId.get(product.productId) ?? [];
    if (!variants.length) continue;

    rows.push({
      productId: product.productId,
      name: product.name,
      number: getExtendedDataValue(product, 'Number'),
      variants,
    });
  }

  return rows;
}
