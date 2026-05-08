type FetchEbayPriceInput =
  | string
  | {
      name: string;
      setName?: string;
      number?: string;
      rarity?: string;
      cardId?: string;
    };

export async function fetchEbayPrice(input: FetchEbayPriceInput) {
  const baseUrl =
    process.env.PRICE_API_URL ||
    process.env.EXPO_PUBLIC_PRICE_API_URL;

  if (!baseUrl) {
    throw new Error('Missing PRICE_API_URL');
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  if (typeof input === 'string') {
    const res = await fetch(
      `${cleanBaseUrl}/price?q=${encodeURIComponent(input)}`
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch eBay price: ${res.status} ${text}`);
    }

    return res.json();
  }

  const params = new URLSearchParams();
  params.set('name', input.name);
  if (input.setName) params.set('setName', input.setName);
  if (input.number) params.set('number', input.number);
  if (input.rarity) params.set('rarity', input.rarity);
  if (input.cardId) params.set('cardId', input.cardId);

  const res = await fetch(
    `${cleanBaseUrl}/api/price/ebay?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch eBay price: ${res.status} ${text}`);
  }

  return res.json();
}
