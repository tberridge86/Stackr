import { PRICE_API_URL } from './config';

export type XimilarGradeResponse = {
  records?: Array<{
    _id?: string;
    _clean_url_card?: string;
    _exact_url_card?: string;
    grades?: {
      final?: number;
      corners?: number;
      edges?: number;
      surface?: number;
      centering?: number;
    };
    card?: {
      centering?: {
        left_right?: string;
        top_bottom?: string;
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
      };
    };
    tags?: unknown;
  }>;
};

export async function gradeCardWithXimilar(imageBase64: string | string[]): Promise<XimilarGradeResponse> {
  if (!PRICE_API_URL) {
    throw new Error('Price API URL not configured');
  }

  const imageBase64s = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const res = await fetch(`${PRICE_API_URL}/api/grade/ximilar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Images: imageBase64s }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(`Ximilar grading failed: ${detail}`);
  }

  return data ?? {};
}
