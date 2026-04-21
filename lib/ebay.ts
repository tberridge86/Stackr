export async function fetchEbayPrice(query: string) {
  const res = await fetch(
    `https://https://pocketvault-6a5w.onrender.com/price?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    throw new Error('Failed to fetch eBay price');
  }

  return res.json();
}