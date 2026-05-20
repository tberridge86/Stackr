const XIMILAR_BASE = 'https://api.ximilar.com';
const XIMILAR_TOKEN = process.env.EXPO_PUBLIC_XIMILAR_TOKEN || '';

type XimilarRecord = {
  _url?: string;
  _base64?: string;
};

type XimilarGradeResponse = {
  records: Array<{
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
    tags?: any;
  }>;
};

export async function gradeCardWithXimilar(imageBase64: string): Promise<any> {
  if (!XIMILAR_TOKEN) {
    throw new Error('Ximilar token not configured');
  }

  const records: XimilarRecord[] = [
    { _base64: imageBase64 },
  ];

  const res = await fetch(`${XIMILAR_BASE}/card-grader/v2/grade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${XIMILAR_TOKEN}`,
    },
    body: JSON.stringify({ records }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ximilar grading failed: ${res.status} ${text}`);
  }

  return res.json();
}
