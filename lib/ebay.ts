type FetchEbayPriceInput =
  | string
  | {
      name: string;
      setName?: string;
      number?: string;
      setTotal?: string | number | null;
      rarity?: string;
      cardId?: string;
      pricingMode?: 'raw' | 'graded';
      condition?: string | null;
      gradingCompany?: string | null;
      grade?: string | number | null;
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
  if (input.setTotal != null) params.set('setTotal', String(input.setTotal));
  if (input.rarity) params.set('rarity', input.rarity);
  if (input.cardId) params.set('cardId', input.cardId);
  if (input.pricingMode) params.set('pricingMode', input.pricingMode);
  if (input.condition) params.set('condition', input.condition);
  if (input.gradingCompany) params.set('gradingCompany', input.gradingCompany);
  if (input.grade != null) params.set('grade', String(input.grade));

  const res = await fetch(
    `${cleanBaseUrl}/api/price/ebay?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch eBay price: ${res.status} ${text}`);
  }

  return res.json();
}
