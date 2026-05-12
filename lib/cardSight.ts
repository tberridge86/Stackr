import { PRICE_API_URL } from './config';

export type IdentifiedCard = {
  id?: string;
  name?: string;
  number?: string;
  set_id?: string;
  set_name?: string;
  image_small?: string;
  rarity?: string;
  marketValue?: number;
  isDuplicate?: boolean;
  confidence?: number;
  raw?: unknown;
};

function normalizeBase64Image(base64: string) {
  const trimmed = (base64 ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image')) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

export async function identifyCards(images: string[], binderId?: string): Promise<IdentifiedCard[]> {
  if (!images.length) return [];
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');

  const requests = images.map(async (base64) => {
    const res = await fetch(`${PRICE_API_URL}/api/cardsight/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Image: normalizeBase64Image(base64),
        binderId: binderId ?? undefined,
      }),
    });

    const parsed = await res.json();
    if (!res.ok || parsed?.error) return null;

    return {
      name: parsed?.name ?? null,
      number: parsed?.number ?? null,
      confidence: parsed?.confidence ?? null,
      raw: parsed?.raw ?? parsed,
    } as IdentifiedCard;
  });

  const settled = await Promise.all(requests);
  return settled.filter(Boolean) as IdentifiedCard[];
}
