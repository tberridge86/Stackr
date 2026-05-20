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
    _pocketvault_preprocessed_base64?: string | null;
    _pocketvault_preprocess?: unknown;
    _pocketvault_edge_whitening?: unknown;
    tags?: unknown;
  }>;
};

export type XimilarGradeImage = {
  base64: string;
  side?: 'Front' | 'Back';
};

function formatApiErrorDetail(detail: unknown): string {
  if (!detail) return 'Unknown error';
  if (typeof detail === 'string') return detail;
  if (detail instanceof Error) return detail.message;

  if (typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    const directMessage =
      record.message ??
      record.error ??
      record.detail ??
      record.description;

    if (typeof directMessage === 'string') return directMessage;
    if (Array.isArray(directMessage)) return directMessage.join(', ');

    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  return String(detail);
}

export async function gradeCardWithXimilar(
  imageBase64: string | string[] | XimilarGradeImage[]
): Promise<XimilarGradeResponse> {
  if (!PRICE_API_URL) {
    throw new Error('Price API URL not configured');
  }

  const records = Array.isArray(imageBase64)
    ? imageBase64.map((entry) => typeof entry === 'string' ? { base64: entry } : entry)
    : [{ base64: imageBase64 }];
  const base64Images = records.map((record) => record.base64);
  const res = await fetch(`${PRICE_API_URL}/api/grade/ximilar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      images: records,
      base64Images,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.message ?? data?.detail ?? data?.error ?? `HTTP ${res.status}`;
    throw new Error(`Ximilar grading failed: ${formatApiErrorDetail(detail)}`);
  }

  return data ?? {};
}

export async function gradeCardWithCardMatrix(
  imageBase64: string | string[] | XimilarGradeImage[]
): Promise<XimilarGradeResponse> {
  if (!PRICE_API_URL) {
    throw new Error('Price API URL not configured');
  }

  const records = Array.isArray(imageBase64)
    ? imageBase64.map((entry) => typeof entry === 'string' ? { base64: entry } : entry)
    : [{ base64: imageBase64 }];
  const base64Images = records.map((record) => record.base64);
  const res = await fetch(`${PRICE_API_URL}/api/grade/cardmatrix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      images: records,
      base64Images,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.message ?? data?.detail ?? data?.error ?? `HTTP ${res.status}`;
    throw new Error(`CardMatrix grading failed: ${formatApiErrorDetail(detail)}`);
  }

  return data ?? {};
}
