// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const XIMILAR_API_TOKEN = Deno.env.get('XIMILAR_API_TOKEN') ?? '';
const MAX_IMAGE_BYTES = Number(Deno.env.get('STACKR_RECOGNITION_MAX_IMAGE_BYTES') ?? 2_800_000);
const MAX_BATCH_IMAGES = Number(Deno.env.get('STACKR_RECOGNITION_MAX_BATCH_IMAGES') ?? 8);
const MAX_TOTAL_BYTES = Number(Deno.env.get('STACKR_RECOGNITION_MAX_TOTAL_BYTES') ?? 10_000_000);
const MIN_DIMENSION = Number(Deno.env.get('STACKR_RECOGNITION_MIN_DIMENSION') ?? 160);
const MAX_DIMENSION = Number(Deno.env.get('STACKR_RECOGNITION_MAX_DIMENSION') ?? 4096);
const TIMEOUT_MS = Number(Deno.env.get('STACKR_XIMILAR_TIMEOUT_MS') ?? 11_000);
const RATE_LIMIT_MINUTE = Number(Deno.env.get('STACKR_XIMILAR_RATE_LIMIT_MINUTE') ?? 18);
const RATE_LIMIT_HOUR = Number(Deno.env.get('STACKR_XIMILAR_RATE_LIMIT_HOUR') ?? 180);
const CACHE_MIN_CONFIDENCE = Number(Deno.env.get('STACKR_XIMILAR_CACHE_MIN_CONFIDENCE') ?? 0.74);

type RecognitionEndpoint = 'tcg_id' | 'card_ocr_id' | 'slab_id' | 'slab_grade' | 'detect' | 'analyze';

const endpointUrls: Record<RecognitionEndpoint, string> = {
  tcg_id: 'https://api.ximilar.com/collectibles/v2/tcg_id',
  card_ocr_id: 'https://api.ximilar.com/collectibles/v2/card_ocr_id',
  slab_id: 'https://api.ximilar.com/collectibles/v2/slab_id',
  slab_grade: 'https://api.ximilar.com/collectibles/v2/slab_grade',
  detect: 'https://api.ximilar.com/collectibles/v2/detect',
  analyze: 'https://api.ximilar.com/collectibles/v2/analyze',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({
    ok: false,
    provider: 'ximilar',
    unresolved: true,
    code,
    message,
    ...extra,
  }, status);
}

function getBearer(req: Request) {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

async function getUser(req: Request) {
  const token = getBearer(req);
  if (!token || !SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function rest(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase service environment is not configured.');
  const headers = new Headers(init.headers ?? {});
  headers.set('apikey', SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${SERVICE_ROLE_KEY}`);
  if (!headers.has('Content-Type') && init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Prefer') && init.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('Prefer', 'return=representation');
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }
  if (response.status === 204 || init.method === 'HEAD') return response;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function restCount(path: string) {
  try {
    const response = await rest(path, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    const contentRange = response.headers.get('content-range') ?? '';
    const count = Number(contentRange.split('/')[1]);
    return Number.isFinite(count) ? count : 0;
  } catch (error) {
    console.warn('[stackr-card-recognition] rate count unavailable', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

function stripBase64ImagePrefix(value: string) {
  return String(value ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function getDataUriMime(value: string, fallback?: string | null) {
  const match = String(value ?? '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return (match?.[1] ?? fallback ?? 'image/jpeg').toLowerCase().replace('image/jpg', 'image/jpeg');
}

function base64ToBytes(base64: string) {
  const binary = atob(stripBase64ImagePrefix(base64));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => bytes[index] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function readDimensions(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return readJpegDimensions(bytes);
  if (mimeType === 'image/png') return readPngDimensions(bytes);
  return null;
}

async function sha256Hex(values: Uint8Array[]) {
  const totalLength = values.reduce((sum, value) => sum + value.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const value of values) {
    merged.set(value, offset);
    offset += value.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', merged);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function collectImages(body: Record<string, unknown>) {
  const records = Array.isArray(body.images)
    ? body.images
    : Array.isArray(body.base64Images)
      ? body.base64Images.map((base64Image) => ({ base64Image }))
      : body.base64Image
        ? [{ base64Image: body.base64Image, mimeType: body.mimeType }]
        : [];

  return records
    .map((record, index) => {
      const objectRecord = typeof record === 'string' ? { base64Image: record } : record as Record<string, unknown>;
      const base64Image = String(objectRecord.base64Image ?? objectRecord.base64 ?? '');
      return {
        index,
        base64Image,
        cleanBase64: stripBase64ImagePrefix(base64Image),
        mimeType: getDataUriMime(base64Image, objectRecord.mimeType as string | null),
        side: objectRecord.side,
      };
    })
    .filter((record) => record.cleanBase64.length > 0);
}

function chooseEndpoint(body: Record<string, unknown>, imageCount: number): RecognitionEndpoint {
  const requested = String(body.endpoint ?? body.requestedEndpoint ?? '').trim() as RecognitionEndpoint;
  if (requested && endpointUrls[requested]) return requested;

  const signals = typeof body.signals === 'object' && body.signals ? body.signals as Record<string, unknown> : {};
  const itemType = String(body.itemType ?? signals.itemType ?? '').toLowerCase();
  const recognitionReason = String(body.recognitionReason ?? '').toLowerCase();
  const isSlab = Boolean(body.isSlab || signals.isSlab || itemType.includes('slab') || itemType.includes('graded'));
  const gradeOnly = Boolean(body.gradeOnly || signals.gradeOnly || recognitionReason.includes('grade-only'));
  const conditionAnalysis = Boolean(body.remoteConditionAnalysis || recognitionReason.includes('condition'));
  const detectMultiple = Boolean(body.detectMultiple || signals.detectMultiple || recognitionReason.includes('multi-card-localisation'));
  const ocrStrongest = Boolean(body.ocrStrongest || signals.ocrStrongest || recognitionReason.includes('ocr'));

  if (conditionAnalysis) return 'analyze';
  if (isSlab) return gradeOnly ? 'slab_grade' : 'slab_id';
  if (detectMultiple && imageCount === 1) return 'detect';
  if (ocrStrongest) return 'card_ocr_id';
  return 'tcg_id';
}

function buildXimilarRecord(image: { cleanBase64: string; side?: unknown }, endpoint: RecognitionEndpoint, body: Record<string, unknown>) {
  const signals = typeof body.signals === 'object' && body.signals ? body.signals as Record<string, unknown> : {};
  const language = String(body.language ?? signals.language ?? '').trim().toLowerCase();
  const alphabet = language === 'ja' ? 'japanese' : 'latin';

  const base = {
    _base64: image.cleanBase64,
    Side: image.side === 'back' || image.side === 'Back' ? 'back' : 'front',
    Rotation: 'rotation_ok',
  };

  if (endpoint === 'tcg_id' || endpoint === 'card_ocr_id') {
    return {
      ...base,
      'Top Category': 'Card',
      Category: 'Card/Trading Card Game',
      Alphabet: alphabet,
      Subcategory: 'Pokemon',
      ...(signals.ocrText ? { Text: signals.ocrText } : {}),
      ...(signals.printedNumber ? { printedNumber: signals.printedNumber } : {}),
    };
  }

  if (endpoint === 'slab_id' || endpoint === 'slab_grade') {
    return {
      ...base,
      'Top Category': 'Card',
      Category: 'Card/Graded Card',
      Subcategory: 'Pokemon',
      ...(signals.grader ? { grader: signals.grader } : {}),
      ...(signals.grade ? { grade: signals.grade } : {}),
    };
  }

  return base;
}

function scoreFromUnknown(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return score > 1 ? score / 100 : score;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function collectImageEntries(value: unknown, depth = 0): string[] {
  if (!value || depth > 4) return [];
  if (typeof value === 'string') return value.startsWith('http') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectImageEntries(item, depth + 1));
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    record.small,
    record.medium,
    record.large,
    record.url,
    record.image,
    record.image_url,
    record.imageUrl,
    record.front,
    ...collectImageEntries(record.images, depth + 1),
    ...collectImageEntries(record.links, depth + 1),
  ].filter((item): item is string => typeof item === 'string' && item.startsWith('http'));
}

function pickImage(value: unknown, size: 'small' | 'large') {
  const entries = collectImageEntries(value);
  if (!entries.length) return null;
  return entries.find((entry) => entry.toLowerCase().includes(`/${size}`)) ?? entries[0];
}

function normalizeCandidate(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const details = (
    item._ximilar_best_match
    ?? (item._identification as Record<string, unknown> | undefined)?.best_match
    ?? item.best_match
    ?? item.info
    ?? item.card
    ?? item.data
    ?? item.details
    ?? item
  ) as Record<string, unknown>;
  const rawNumber = firstString(
    details.card_number,
    details.number,
    details.collector_number,
    details.collectorNumber,
    details.card_no,
    item.card_number,
    item.number,
  );
  const [number, totalFromNumber] = String(rawNumber ?? '').trim().split('/');
  const confidence = scoreFromUnknown(
    item.prob
    ?? item._score
    ?? item.score
    ?? item.confidence
    ?? details.prob
    ?? details.score
    ?? details.confidence
  );
  const name = firstString(details.name, details.full_name, details.card_name, details.title, item.name, item.full_name);
  if (!name) return null;

  return {
    provider: 'ximilar',
    id: firstString(details.id, details.card_id, item.id, item.card_id),
    name,
    number: number ? number.replace(/^#/, '').replace(/^0+(?=\d)/, '') : null,
    set_id: firstString(details.set_id, details.setId, details.set_code, details.setCode, item.set_id, item.setCode),
    set_name: firstString(details.set_name, details.setName, details.set, item.set_name, item.setName, item.set),
    setName: firstString(details.set_name, details.setName, details.set, item.set_name, item.setName, item.set),
    printedTotal: totalFromNumber
      ? Number(String(totalFromNumber).replace(/\D/g, '')) || null
      : Number(String(details.printed_total ?? details.printedTotal ?? details.total ?? item.printed_total ?? '').replace(/\D/g, '')) || null,
    rarity: firstString(details.rarity, item.rarity),
    grader: firstString(details.grader, item.grader, details.company, item.company),
    grade: firstString(details.grade, item.grade, details.final_grade, item.final_grade),
    confidence,
    image_small: pickImage(details, 'small') ?? pickImage(item, 'small'),
    image_large: pickImage(details, 'large') ?? pickImage(item, 'large'),
    raw: item,
  };
}

function flattenCandidates(value: unknown, depth = 0): unknown[] {
  if (!value || depth > 7) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenCandidates(item, depth + 1));
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (
    record._identification
    || record.best_match
    || record.name
    || record.full_name
    || record.card_name
    || record.card
    || record.info
  ) {
    candidates.push(record);
  }
  for (const key of [
    'records',
    '_objects',
    'objects',
    '_matches',
    'matches',
    'cards',
    'results',
    '_identification',
    'identification',
    'best_match',
    'bestMatch',
    'alternatives',
    'card',
    'data',
    'info',
  ]) {
    candidates.push(...flattenCandidates(record[key], depth + 1));
  }
  return candidates;
}

function normalizeXimilarResponse(data: unknown, endpoint: RecognitionEndpoint, latencyMs: number) {
  const seen = new Set<string>();
  const candidates = flattenCandidates(data)
    .map(normalizeCandidate)
    .filter(Boolean)
    .filter((candidate) => {
      const key = [candidate.name, candidate.number, candidate.set_id, candidate.set_name, candidate.grade, candidate.grader]
        .filter(Boolean)
        .join('|')
        .toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  return {
    ok: candidates.length > 0,
    provider: 'ximilar',
    endpoint,
    requiresConfirmation: candidates.length !== 1,
    match: candidates[0] ?? null,
    candidates,
    candidateCount: candidates.length,
    latencyMs,
    rawDebug: summarizeXimilarPayload(data),
  };
}

function summarizeXimilarPayload(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const records = Array.isArray(record.records) ? record.records : [];
  const first = records[0] as Record<string, unknown> | undefined;
  const objects = Array.isArray(first?._objects) ? first?._objects : [];
  const firstObject = objects[0] as Record<string, unknown> | undefined;
  const identification = firstObject?._identification as Record<string, unknown> | undefined;
  const best = identification?.best_match as Record<string, unknown> | undefined;
  return {
    topLevelKeys: Object.keys(record).slice(0, 18),
    recordCount: records.length,
    objectCount: objects.length,
    firstStatus: first?._status ?? firstObject?._status ?? null,
    bestMatch: best ? {
      name: best.name ?? best.full_name ?? best.card_name ?? null,
      number: best.card_number ?? best.number ?? null,
      set: best.set ?? best.set_name ?? best.setName ?? null,
      score: best.prob ?? best.score ?? null,
    } : null,
    candidateCount: flattenCandidates(data).length,
  };
}

async function checkRateLimit(userId: string) {
  const minuteIso = new Date(Date.now() - 60_000).toISOString();
  const hourIso = new Date(Date.now() - 60 * 60_000).toISOString();
  const [minuteCount, hourCount] = await Promise.all([
    restCount(`scan_recognition_requests?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(minuteIso)}&select=id`),
    restCount(`scan_recognition_requests?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(hourIso)}&select=id`),
  ]);
  if (minuteCount >= RATE_LIMIT_MINUTE) return { ok: false, window: 'minute', count: minuteCount };
  if (hourCount >= RATE_LIMIT_HOUR) return { ok: false, window: 'hour', count: hourCount };
  return { ok: true, minuteCount, hourCount };
}

async function readCache(imageHash: string, endpoint: RecognitionEndpoint) {
  try {
    const rows = await rest(`scan_recognition_cache?image_hash=eq.${imageHash}&endpoint=eq.${endpoint}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=response,confidence,candidate_count&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.response ? row : null;
  } catch (error) {
    console.warn('[stackr-card-recognition] cache read unavailable', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function writeCache(imageHash: string, endpoint: RecognitionEndpoint, response: Record<string, unknown>) {
  const confidence = Number(response.match?.confidence ?? response.candidates?.[0]?.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < CACHE_MIN_CONFIDENCE) return;
  try {
    await rest('scan_recognition_cache?on_conflict=image_hash,endpoint', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        image_hash: imageHash,
        endpoint,
        response,
        confidence,
        candidate_count: response.candidateCount ?? response.candidates?.length ?? 0,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn('[stackr-card-recognition] cache write unavailable', error instanceof Error ? error.message : String(error));
  }
}

async function logRequest(input: Record<string, unknown>) {
  try {
    await rest('scan_recognition_requests', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.warn('[stackr-card-recognition] request log unavailable', error instanceof Error ? error.message : String(error));
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callXimilar(endpoint: RecognitionEndpoint, records: unknown[]) {
  const url = endpointUrls[endpoint];
  const body = JSON.stringify({
    records,
    rotate: true,
    lang: true,
    pricing: false,
    price_stats: false,
  });
  const init = {
    method: 'POST',
    headers: {
      Authorization: `Token ${XIMILAR_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  };

  const response = await fetchWithTimeout(url, init, TIMEOUT_MS);
  if ([502, 503, 504].includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return fetchWithTimeout(url, init, TIMEOUT_MS);
  }
  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST for card recognition.');

  const startedAt = Date.now();
  const user = await getUser(req);
  if (!user?.id) return fail(401, 'AUTH_REQUIRED', 'Sign in to use remote card recognition.');
  if (!XIMILAR_API_TOKEN) return fail(500, 'XIMILAR_NOT_CONFIGURED', 'Remote recognition is not configured.');

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.');
  }

  const images = collectImages(body);
  if (!images.length) return fail(400, 'MISSING_IMAGE', 'Missing image for recognition.');
  if (images.length > MAX_BATCH_IMAGES) return fail(400, 'TOO_MANY_IMAGES', `Send ${MAX_BATCH_IMAGES} images or fewer.`);

  const validated = [];
  let totalBytes = 0;
  try {
    for (const image of images) {
      if (!['image/jpeg', 'image/png'].includes(image.mimeType)) {
        return fail(415, 'UNSUPPORTED_MIME', 'Use JPEG or PNG images for recognition.', { mimeType: image.mimeType });
      }
      const bytes = base64ToBytes(image.cleanBase64);
      totalBytes += bytes.length;
      if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'IMAGE_TOO_LARGE', 'Recognition image is too large.');
      const dimensions = readDimensions(bytes, image.mimeType);
      if (!dimensions) return fail(400, 'INVALID_IMAGE_DIMENSIONS', 'Could not read image dimensions.');
      if (
        Math.min(dimensions.width, dimensions.height) < MIN_DIMENSION
        || Math.max(dimensions.width, dimensions.height) > MAX_DIMENSION
      ) {
        return fail(400, 'IMAGE_DIMENSIONS_OUT_OF_RANGE', 'Recognition image dimensions are outside the supported range.', { dimensions });
      }
      validated.push({ ...image, bytes, dimensions });
    }
  } catch (error) {
    return fail(400, 'INVALID_IMAGE', error instanceof Error ? error.message : 'Image could not be decoded.');
  }

  if (totalBytes > MAX_TOTAL_BYTES) return fail(413, 'BATCH_TOO_LARGE', 'Recognition batch is too large.');

  const endpoint = chooseEndpoint(body, validated.length);
  const imageHash = await sha256Hex([
    new TextEncoder().encode(endpoint),
    ...validated.map((image) => image.bytes),
  ]);
  const scanSessionId = typeof body.scanSessionId === 'string' ? body.scanSessionId : null;
  const recognitionReason = typeof body.recognitionReason === 'string' ? body.recognitionReason : null;

  const rate = await checkRateLimit(user.id);
  if (!rate.ok) {
    await logRequest({
      user_id: user.id,
      scan_session_id: scanSessionId,
      image_hash: imageHash,
      endpoint,
      recognition_reason: recognitionReason,
      outcome: 'rate_limited',
      http_status: 429,
      latency_ms: Date.now() - startedAt,
      request_bytes: totalBytes,
      error_code: `rate_limit_${rate.window}`,
    });
    return fail(429, 'RATE_LIMITED', 'Remote recognition is cooling down. Try again shortly.', { window: rate.window });
  }

  const cached = await readCache(imageHash, endpoint);
  if (cached?.response) {
    await logRequest({
      user_id: user.id,
      scan_session_id: scanSessionId,
      image_hash: imageHash,
      endpoint,
      recognition_reason: recognitionReason,
      outcome: 'cache_hit',
      http_status: 200,
      latency_ms: Date.now() - startedAt,
      request_bytes: totalBytes,
      candidate_count: cached.candidate_count ?? cached.response?.candidateCount ?? 0,
    });
    return json({
      ...cached.response,
      cacheHit: true,
      imageHash,
      endpoint,
    });
  }

  const records = validated.map((image) => buildXimilarRecord(image, endpoint, body));
  try {
    const ximilarStartedAt = Date.now();
    const response = await callXimilar(endpoint, records);
    const latencyMs = Date.now() - ximilarStartedAt;
    const data = await response.json().catch(() => null);
    const normalised = response.ok
      ? normalizeXimilarResponse(data, endpoint, latencyMs)
      : {
          ok: false,
          provider: 'ximilar',
          endpoint,
          unresolved: true,
          code: response.status === 401 || response.status === 403
            ? 'XIMILAR_UNAUTHORISED'
            : response.status === 429
              ? 'XIMILAR_RATE_LIMITED'
              : 'XIMILAR_REQUEST_FAILED',
          message: 'Ximilar request failed.',
          httpStatus: response.status,
          rawDebug: summarizeXimilarPayload(data),
        };

    const httpStatus = response.ok && normalised.ok ? 200 : response.ok ? 422 : response.status;
    await logRequest({
      user_id: user.id,
      scan_session_id: scanSessionId,
      image_hash: imageHash,
      endpoint,
      recognition_reason: recognitionReason,
      outcome: normalised.ok ? 'matched' : 'unresolved',
      http_status: httpStatus,
      latency_ms: Date.now() - startedAt,
      request_bytes: totalBytes,
      candidate_count: normalised.candidateCount ?? normalised.candidates?.length ?? 0,
      error_code: normalised.ok ? null : normalised.code ?? 'no_match',
    });

    if (normalised.ok) await writeCache(imageHash, endpoint, normalised);
    return json({
      ...normalised,
      imageHash,
      cacheHit: false,
      scanSessionId,
    }, httpStatus);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Remote recognition timed out.'
      : error instanceof Error
        ? error.message
        : 'Remote recognition failed.';
    await logRequest({
      user_id: user.id,
      scan_session_id: scanSessionId,
      image_hash: imageHash,
      endpoint,
      recognition_reason: recognitionReason,
      outcome: 'failed',
      http_status: 503,
      latency_ms: Date.now() - startedAt,
      request_bytes: totalBytes,
      candidate_count: 0,
      error_code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed',
    });
    return fail(503, 'REMOTE_RECOGNITION_UNAVAILABLE', message, {
      endpoint,
      imageHash,
      retryable: true,
    });
  }
});
