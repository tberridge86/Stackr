type FetchEbayPriceInput =
  | string
  | {
      name: string;
      setName?: string;
      number?: string;
      setTotal?: string | number | null;
      rarity?: string;
      cardId?: string;
      language?: 'en' | 'ja' | 'jp' | 'japanese' | string | null;
      pricingMode?: 'raw' | 'graded';
      condition?: string | null;
      gradingCompany?: string | null;
      grade?: string | number | null;
    };

const EBAY_PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

const ebayPriceCache = new Map<string, { expiresAt: number; value: unknown }>();
const ebayPriceInflight = new Map<string, Promise<unknown>>();

async function fetchCachedEbayJson(url: string) {
  const now = Date.now();
  const cached = ebayPriceCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = ebayPriceInflight.get(url);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch eBay price: ${res.status} ${text}`);
    }

    const value = await res.json();
    ebayPriceCache.set(url, {
      expiresAt: Date.now() + EBAY_PRICE_CACHE_TTL_MS,
      value,
    });
    return value;
  })();

  ebayPriceInflight.set(url, request);
  try {
    return await request;
  } finally {
    ebayPriceInflight.delete(url);
  }
}

export async function fetchEbayPrice(input: FetchEbayPriceInput) {
  const baseUrl =
    process.env.PRICE_API_URL ||
    process.env.EXPO_PUBLIC_PRICE_API_URL;

  if (!baseUrl) {
    throw new Error('Missing PRICE_API_URL');
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  if (typeof input === 'string') {
    return fetchCachedEbayJson(`${cleanBaseUrl}/price?q=${encodeURIComponent(input.trim())}`);
  }

  const params = new URLSearchParams();
  params.set('name', input.name);
  if (input.setName) params.set('setName', input.setName);
  if (input.number) params.set('number', input.number);
  if (input.setTotal != null) params.set('setTotal', String(input.setTotal));
  if (input.rarity) params.set('rarity', input.rarity);
  if (input.cardId) params.set('cardId', input.cardId);
  if (input.language) params.set('language', input.language);
  if (input.pricingMode) params.set('pricingMode', input.pricingMode);
  if (input.condition) params.set('condition', input.condition);
  if (input.gradingCompany) params.set('gradingCompany', input.gradingCompany);
  if (input.grade != null) params.set('grade', String(input.grade));

  return fetchCachedEbayJson(`${cleanBaseUrl}/api/price/ebay?${params.toString()}`);
}
