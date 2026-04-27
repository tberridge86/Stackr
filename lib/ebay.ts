export async function fetchEbayPrice(query: string) {
  const baseUrl =
    process.env.PRICE_API_URL ||
    process.env.EXPO_PUBLIC_PRICE_API_URL;

  if (!baseUrl) {
    throw new Error('Missing PRICE_API_URL');
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  const res = await fetch(
    `${cleanBaseUrl}/price?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch eBay price: ${res.status} ${text}`);
  }

  return res.json();
}