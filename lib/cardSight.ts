import { PRICE_API_URL, SCAN_LOCAL_OCR_STRONG_CONFIDENCE, SCAN_XIMILAR_FALLBACK_ENABLED } from './config';
import {
  invokeXimilarRecognition,
  type XimilarRecognitionEndpoint,
} from './ximilarRecognition';
import type { RecognitionShadowModeSnapshot } from './recognition/types';

export type IdentifiedCard = {
  id?: string | null;
  name?: string | null;
  number?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  rarity?: string | null;
  marketValue?: number | null;
  isDuplicate?: boolean;
  confidence?: number | null;
  raw?: unknown;
  provider?: string | null;
};

export type ScanCandidateDiagnostic = {
  provider?: string | null;
  id?: string | null;
  name?: string | null;
  number?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  confidence?: number | null;
  visualSimilarity?: number | null;
  finalScore?: number | null;
  accepted?: boolean;
  rejectionReason?: string | null;
  reasons?: string[];
};

export type ScanIdentifyProviderDiagnostic = {
  provider: string;
  stage: string;
  ok: boolean;
  status?: number | null;
  durationMs: number;
  decision: string;
  candidateCount: number;
  accepted?: boolean;
  error?: string | null;
  topCandidate?: ScanCandidateDiagnostic | null;
  candidates?: ScanCandidateDiagnostic[];
  signals?: Record<string, unknown> | null;
};

export type ScanIdentifyDiagnostics = {
  totalMs: number;
  imageCount: number;
  candidateCount: number;
  providers: ScanIdentifyProviderDiagnostic[];
  notes?: string[];
  shadowMode?: RecognitionShadowModeSnapshot | null;
};

export type IdentifyCardsDetailedResult = {
  cards: IdentifiedCard[];
  diagnostics: ScanIdentifyDiagnostics;
};

export type ScanIdentifyHints = {
  ocrText?: string | null;
  nameHint?: string | null;
  printedNumber?: { number: number; total: number } | null;
  setId?: string | null;
  language?: string | null;
  localConfidence?: number | null;
  localStatus?: string | null;
  ambiguousVariants?: boolean | null;
  scanSessionId?: string | null;
  itemType?: string | null;
  isSlab?: boolean | null;
  gradeOnly?: boolean | null;
  detectMultiple?: boolean | null;
  remoteConditionAnalysis?: boolean | null;
  requestedXimilarEndpoint?: XimilarRecognitionEndpoint | null;
  rectifiedImageUri?: string | null;
  rectifiedImageUris?: string[] | null;
  privateImageKey?: string | null;
};

const MAX_VISUAL_CANDIDATES = 3;
const MIN_VISUAL_SIMILARITY = 0.72;
const MIN_VISUAL_FINAL_SCORE = 0.76;
const MIN_FALLBACK_CONFIDENCE = 0.62;

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function buildBase64ImageDataUri(base64: string) {
  const stripped = stripBase64ImagePrefix(base64);
  return stripped ? `data:image/jpeg;base64,${stripped}` : '';
}

function getNested(value: any, paths: string[][]) {
  for (const path of paths) {
    let current = value;
    for (const segment of path) current = current?.[segment];
    if (current != null && String(current).trim()) return current;
  }
  return null;
}

function asString(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeScore(value: unknown) {
  const score = asNumber(value);
  if (score == null) return null;
  return score > 1 ? score / 100 : score;
}

function normalizeSearchText(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'#+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrintedNumberFromText(text?: string | null) {
  const match = String(text ?? '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/);
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  return Number.isFinite(number) && Number.isFinite(total) ? { number, total } : null;
}

function inferNameHintFromOcr(text?: string | null) {
  const ignored = /^(basic|stage|hp|energy|trainer|item|supporter|stadium|ability|weakness|resistance|retreat|illus|copyright|pokemon|pokémon|evolves|put |flip |during |your |opponent |this attack|no\.|[0-9/# ]+)$/i;
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\bHP\s*\d+\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter((line) => /[A-Za-z]/.test(line) && line.length >= 3 && line.length <= 48);

  return lines.find((line) => !ignored.test(line)) ?? null;
}

function buildScanHintPayload(hints?: ScanIdentifyHints | null) {
  const ocrText = hints?.ocrText?.trim() || null;
  const printedNumber = hints?.printedNumber ?? parsePrintedNumberFromText(ocrText);
  const nameHint = hints?.nameHint?.trim() || inferNameHintFromOcr(ocrText);
  const setId = hints?.setId?.trim() || null;
  const language = hints?.language?.trim() || null;
  return {
    ...(ocrText ? { ocrText } : {}),
    ...(nameHint ? { nameHint } : {}),
    ...(printedNumber ? { printedNumber } : {}),
    ...(setId ? { setId } : {}),
    ...(language ? { language } : {}),
  };
}

function normalizeIdentifiedCard(parsed: any, provider: string): IdentifiedCard | null {
  if (!parsed || parsed.error) return null;

  const firstCandidate =
    parsed.match ??
    parsed.topMatch ??
    parsed.candidates?.[0] ??
    parsed.cards?.[0] ??
    parsed.matches?.[0] ??
    parsed.raw?.detections?.[0]?.card ??
    parsed.raw?.cards?.[0] ??
    null;

  const source = firstCandidate ? { ...parsed, ...firstCandidate } : parsed;
  const rawCard = parsed.card ?? firstCandidate?.card ?? parsed.raw?.detections?.[0]?.card ?? null;

  const name = asString(getNested(source, [
    ['name'],
    ['cardName'],
    ['card', 'name'],
    ['resolvedCard', 'name'],
  ]) ?? rawCard?.name);

  if (!name) return null;

  return {
    id: asString(getNested(source, [
      ['id'],
      ['card_id'],
      ['cardId'],
      ['resolvedCard', 'id'],
      ['card', 'id'],
    ]) ?? rawCard?.id),
    name,
    number: asString(getNested(source, [
      ['number'],
      ['card_number'],
      ['cardNumber'],
      ['collectorNumber'],
      ['resolvedCard', 'number'],
      ['card', 'number'],
    ]) ?? rawCard?.number ?? rawCard?.cardNumber ?? rawCard?.collectorNumber),
    set_id: asString(getNested(source, [
      ['set_id'],
      ['setId'],
      ['setCode'],
      ['set', 'id'],
      ['resolvedCard', 'set_id'],
      ['card', 'set_id'],
      ['card', 'set', 'id'],
    ]) ?? rawCard?.set_id ?? rawCard?.set?.id),
    set_name: asString(getNested(source, [
      ['set_name'],
      ['releaseName'],
      ['set'],
      ['set', 'name'],
      ['setName'],
      ['resolvedCard', 'set_name'],
      ['card', 'set_name'],
      ['card', 'releaseName'],
      ['card', 'setName'],
      ['card', 'set', 'name'],
    ]) ?? rawCard?.releaseName ?? rawCard?.setName ?? rawCard?.set?.name),
    image_small: asString(getNested(source, [
      ['image_small'],
      ['imageSmall'],
      ['images', 'small'],
      ['resolvedCard', 'image_small'],
      ['resolvedCard', 'imageSmall'],
    ])),
    image_large: asString(getNested(source, [
      ['image_large'],
      ['imageLarge'],
      ['images', 'large'],
      ['resolvedCard', 'image_large'],
      ['resolvedCard', 'imageLarge'],
    ])),
    rarity: asString(getNested(source, [
      ['rarity'],
      ['resolvedCard', 'rarity'],
      ['card', 'rarity'],
    ]) ?? rawCard?.rarity),
    confidence: asNumber(parsed.confidence ?? firstCandidate?.confidence ?? firstCandidate?.similarity),
    raw: parsed,
    provider,
  };
}

async function postJson(endpoint: string, body: Record<string, unknown>, timeoutMs = 12000) {
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PRICE_API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: 'Invalid JSON response', details: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, parsed, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

function getXimilarFallbackReason(hints?: ScanIdentifyHints | null) {
  const localConfidence = normalizeScore(hints?.localConfidence);
  const localStatus = String(hints?.localStatus ?? '').toLowerCase();
  const language = String(hints?.language ?? '').trim().toLowerCase();
  const printedNumber = hints?.printedNumber ?? parsePrintedNumberFromText(hints?.ocrText);

  if (hints?.remoteConditionAnalysis) return 'remote-condition-analysis';
  if (hints?.isSlab || /slab|graded/i.test(String(hints?.itemType ?? ''))) return 'slab-recognition';
  if (hints?.detectMultiple) return 'multi-card-localisation';
  if (language && !['en', 'ja', 'zh', 'zh-hans', 'zh-hant'].includes(language)) return 'unsupported-language';
  if (!printedNumber) return 'ocr-number-missing';
  if (hints?.ambiguousVariants || localStatus === 'ambiguous') return 'ambiguous-local-variants';
  if (localConfidence == null) return 'no-local-confidence';
  if (localConfidence < SCAN_LOCAL_OCR_STRONG_CONFIDENCE) return 'local-confidence-low';
  return null;
}

function shouldUseXimilarFallback(hints?: ScanIdentifyHints | null) {
  return SCAN_XIMILAR_FALLBACK_ENABLED && Boolean(getXimilarFallbackReason(hints));
}

function selectXimilarEndpoint(hints?: ScanIdentifyHints | null): XimilarRecognitionEndpoint {
  if (hints?.requestedXimilarEndpoint) return hints.requestedXimilarEndpoint;
  const reason = getXimilarFallbackReason(hints);
  if (reason === 'remote-condition-analysis') return 'analyze';
  if (reason === 'slab-recognition') return hints?.gradeOnly ? 'slab_grade' : 'slab_id';
  if (reason === 'multi-card-localisation') return 'detect';
  if (reason === 'ocr-number-missing' && hints?.ocrText?.trim()) return 'card_ocr_id';
  return 'tcg_id';
}

function buildXimilarSignals(hints?: ScanIdentifyHints | null, reason?: string | null) {
  const printedNumber = hints?.printedNumber ?? parsePrintedNumberFromText(hints?.ocrText);
  return {
    ocrText: hints?.ocrText ?? null,
    nameHint: hints?.nameHint ?? null,
    printedNumber,
    setId: hints?.setId ?? null,
    language: hints?.language ?? null,
    localConfidence: hints?.localConfidence ?? null,
    localStatus: hints?.localStatus ?? null,
    ambiguousVariants: hints?.ambiguousVariants ?? null,
    isSlab: hints?.isSlab ?? null,
    gradeOnly: hints?.gradeOnly ?? null,
    detectMultiple: hints?.detectMultiple ?? null,
    ocrStrongest: reason === 'ocr-number-missing',
  };
}

function uniqueCards(cards: IdentifiedCard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = [
      card.id,
      card.name?.toLowerCase(),
      card.set_id?.toLowerCase(),
      card.set_name?.toLowerCase(),
      card.number?.toLowerCase(),
    ].filter(Boolean).join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeProviderCandidates(parsed: any, provider: string, limit = MAX_VISUAL_CANDIDATES) {
  const candidates = [
    parsed?.match,
    parsed?.topMatch,
    ...(Array.isArray(parsed?.candidates) ? parsed.candidates : []),
    ...(Array.isArray(parsed?.cards) ? parsed.cards : []),
    ...(Array.isArray(parsed?.matches) ? parsed.matches : []),
  ].filter(Boolean);

  return uniqueCards(
    candidates
      .map((candidate) => normalizeIdentifiedCard(candidate, provider))
      .filter((card): card is IdentifiedCard => Boolean(card))
  ).slice(0, limit);
}

function getVisualSimilarity(card: IdentifiedCard) {
  const raw = card.raw as any;
  const similarity = asNumber(
    raw?.similarity
    ?? raw?.visualSimilarity
    ?? raw?.signals?.visualSimilarity
    ?? raw?.score?.visualEmbedding
    ?? raw?.score?.artworkSimilarity
    ?? card.confidence
  );

  if (similarity == null) return null;
  return similarity > 1 ? similarity / 100 : similarity;
}

function getVisualFinalScore(card: IdentifiedCard) {
  const raw = card.raw as any;
  const score = asNumber(
    raw?.finalScore
    ?? raw?.signals?.finalScore
    ?? raw?.score?.finalScore
  );

  if (score == null) return null;
  return score > 1 ? score / 100 : score;
}

function printedNumberSupportsCandidate(card: IdentifiedCard, hints?: ScanIdentifyHints | null) {
  const printedNumber = hints?.printedNumber ?? parsePrintedNumberFromText(hints?.ocrText);
  if (!printedNumber?.number) return false;
  const cardNumber = Number.parseInt(String(card.number ?? '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(cardNumber)) return false;
  if (cardNumber === printedNumber.number) return true;
  return cardNumber > printedNumber.total && String(cardNumber).endsWith(String(printedNumber.number));
}

function textSupportsCandidate(card: IdentifiedCard, hints?: ScanIdentifyHints | null) {
  const text = normalizeSearchText(`${hints?.ocrText ?? ''} ${hints?.nameHint ?? ''}`);
  const name = normalizeSearchText(card.name);
  if (!text || !name || name.length < 3) return false;
  return text.includes(name) || name.split(' ').filter((part) => part.length > 2).some((part) => text.includes(part));
}

function isFallbackCandidateReliable(card: IdentifiedCard, hints?: ScanIdentifyHints | null) {
  if (card.provider === 'rare-candy-style') return true;
  const confidence = normalizeScore(card.confidence);
  if (confidence != null && confidence >= MIN_FALLBACK_CONFIDENCE) return true;
  if (textSupportsCandidate(card, hints) || printedNumberSupportsCandidate(card, hints)) return true;

  // If OCR did not provide useful text, keep legacy visual fallback behaviour.
  return !hints?.ocrText?.trim() && confidence == null;
}

function getVisuallySupportedCandidates(cards: IdentifiedCard[]) {
  return cards
    .filter((card) => {
      if (card.provider !== 'rare-candy-style') return true;
      const similarity = getVisualSimilarity(card);
      const finalScore = getVisualFinalScore(card);
      return similarity != null
        && similarity >= MIN_VISUAL_SIMILARITY
        && (finalScore == null || finalScore >= MIN_VISUAL_FINAL_SCORE);
    })
    .slice(0, MAX_VISUAL_CANDIDATES);
}

function getProviderError(parsed: any) {
  return asString(parsed?.error ?? parsed?.message ?? parsed?.details ?? parsed?.detail);
}

function getCandidateKey(card: IdentifiedCard) {
  return [
    card.id,
    card.name?.toLowerCase(),
    card.set_id?.toLowerCase(),
    card.set_name?.toLowerCase(),
    card.number?.toLowerCase(),
  ].filter(Boolean).join('|');
}

function summarizeCandidate(
  card: IdentifiedCard,
  acceptedKeys?: Set<string>
): ScanCandidateDiagnostic {
  const raw = card.raw as any;
  const key = getCandidateKey(card);
  const visualSimilarity = getVisualSimilarity(card);
  const finalScore = getVisualFinalScore(card);
  const rejectedByVisualThreshold = card.provider === 'rare-candy-style'
    && visualSimilarity != null
    && visualSimilarity < MIN_VISUAL_SIMILARITY;
  const rejectedByFinalThreshold = card.provider === 'rare-candy-style'
    && finalScore != null
    && finalScore < MIN_VISUAL_FINAL_SCORE;

  return {
    provider: card.provider ?? null,
    id: card.id ?? null,
    name: card.name ?? null,
    number: card.number ?? null,
    set_id: card.set_id ?? null,
    set_name: card.set_name ?? null,
    confidence: card.confidence ?? null,
    visualSimilarity,
    finalScore,
    accepted: acceptedKeys ? acceptedKeys.has(key) : undefined,
    rejectionReason:
      raw?.rejectionReason
      ?? raw?.rejected
      ?? (rejectedByVisualThreshold ? 'visual-below-minimum' : null)
      ?? (rejectedByFinalThreshold ? 'final-score-below-minimum' : null),
    reasons: Array.isArray(raw?.reasons)
      ? raw.reasons.slice(0, 6).map((reason: unknown) => String(reason))
      : undefined,
  };
}

function buildProviderDiagnostic(
  provider: string,
  stage: string,
  response: { ok: boolean; status?: number | null; parsed?: any; durationMs: number },
  candidates: IdentifiedCard[],
  acceptedCandidates: IdentifiedCard[],
  decision: string,
  signals?: Record<string, unknown> | null
): ScanIdentifyProviderDiagnostic {
  const acceptedKeys = new Set(acceptedCandidates.map(getCandidateKey).filter(Boolean));
  const candidateDiagnostics = candidates.slice(0, 8).map((card) => summarizeCandidate(card, acceptedKeys));

  return {
    provider,
    stage,
    ok: response.ok,
    status: response.status ?? null,
    durationMs: response.durationMs,
    decision,
    candidateCount: candidates.length,
    accepted: acceptedCandidates.length > 0,
    error: getProviderError(response.parsed),
    topCandidate: candidateDiagnostics[0] ?? null,
    candidates: candidateDiagnostics,
    signals: signals ?? null,
  };
}

function buildFailedProviderDiagnostic(
  provider: string,
  stage: string,
  startedAt: number,
  error: unknown
): ScanIdentifyProviderDiagnostic {
  return {
    provider,
    stage,
    ok: false,
    status: null,
    durationMs: Date.now() - startedAt,
    decision: 'request_failed',
    candidateCount: 0,
    accepted: false,
    error: error instanceof Error ? error.message : String(error),
    topCandidate: null,
    candidates: [],
    signals: null,
  };
}

function finishImageDiagnostics(
  imageStartedAt: number,
  providers: ScanIdentifyProviderDiagnostic[],
  cards: IdentifiedCard[],
  notes: string[] = []
) {
  return {
    cards: uniqueCards(cards).slice(0, MAX_VISUAL_CANDIDATES),
    diagnostics: {
      totalMs: Date.now() - imageStartedAt,
      providers,
      notes,
    },
  };
}

export async function identifyCardsDetailed(
  images: string[],
  binderId?: string,
  hints?: ScanIdentifyHints
): Promise<IdentifyCardsDetailedResult> {
  const overallStartedAt = Date.now();
  if (!images.length) {
    return {
      cards: [],
      diagnostics: {
        totalMs: 0,
        imageCount: 0,
        candidateCount: 0,
        providers: [],
        notes: ['No images supplied'],
      },
    };
  }
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');

  const useBatchedXimilarFallback = images.length > 1 && shouldUseXimilarFallback(hints);
  const maxResultCards = Math.max(MAX_VISUAL_CANDIDATES, images.length > 1 ? Math.min(images.length, 8) : MAX_VISUAL_CANDIDATES);
  const requests = images.map(async (base64, imageIndex) => {
    const imageStartedAt = Date.now();
    const providerDiagnostics: ScanIdentifyProviderDiagnostic[] = [];
    const notes: string[] = [];
    const rawBase64 = stripBase64ImagePrefix(base64);
    const hintPayload = buildScanHintPayload(hints);
    if (!rawBase64) {
      notes.push(`image-${imageIndex}: empty base64 image`);
      return finishImageDiagnostics(imageStartedAt, providerDiagnostics, [], notes);
    }

    const found: IdentifiedCard[] = [];

    const primaryStartedAt = Date.now();
    try {
      const visualPack = await postJson('/api/rare-candy-scan/identify', {
        base64Image: rawBase64,
        binderId: binderId ?? undefined,
        maxCandidates: MAX_VISUAL_CANDIDATES,
        ...hintPayload,
      }, 9000);
      const allVisualCandidates = normalizeProviderCandidates(visualPack.parsed, 'rare-candy-style', 10);
      const visualCandidates = getVisuallySupportedCandidates(
        allVisualCandidates
      );
      providerDiagnostics.push(
        buildProviderDiagnostic(
          'rare-candy-style',
          'primary_visual_pack',
          visualPack,
          allVisualCandidates,
          visualCandidates,
          visualPack.ok && visualCandidates.length
            ? 'accepted_visual_candidates'
            : 'no_confident_visual_match',
          {
            status: visualPack.parsed?.status ?? null,
            accepted: visualPack.parsed?.accepted ?? null,
            needsConfirmation: visualPack.parsed?.needsConfirmation ?? null,
            topSimilarity: visualPack.parsed?.similarity ?? null,
            margin: visualPack.parsed?.margin ?? null,
            signals: visualPack.parsed?.signals ?? null,
          }
        )
      );
      if (visualPack.ok && visualCandidates.length) {
        found.push(...visualCandidates);
        console.log('[scan-identify] visual pack', {
          status: visualPack.status,
          ok: visualPack.ok,
          candidates: visualCandidates.length,
          first: visualCandidates[0]?.name,
          similarity: getVisualSimilarity(visualCandidates[0]),
          accepted: visualPack.parsed?.accepted,
        });
        return finishImageDiagnostics(imageStartedAt, providerDiagnostics, found, notes);
      }
      console.log('[scan-identify] visual pack no confident match', {
        status: visualPack.status,
        ok: visualPack.ok,
        candidates: Array.isArray(visualPack.parsed?.candidates) ? visualPack.parsed.candidates.length : 0,
        topSimilarity: visualPack.parsed?.similarity,
        error: visualPack.parsed?.error,
      });
    } catch (error) {
      providerDiagnostics.push(
        buildFailedProviderDiagnostic('rare-candy-style', 'primary_visual_pack', primaryStartedAt, error)
      );
      console.log('[scan-identify] visual pack failed', error instanceof Error ? error.message : String(error));
    }

    if ('printedNumber' in hintPayload) {
      const ocrResolverStartedAt = Date.now();
      try {
        const localAi = await postJson('/api/local-ai/identify', {
          base64Image: rawBase64,
          binderId: binderId ?? undefined,
          ...hintPayload,
        }, 9000);
        const providerConfidence = asNumber(localAi.parsed?.confidence);
        const localCandidates = normalizeProviderCandidates(localAi.parsed, 'local-ai', 10)
          .map((card) => ({
            ...card,
            confidence: card.confidence ?? providerConfidence,
          }));
        const reliableLocalCandidates = localAi.ok
          ? localCandidates.filter((card) => isFallbackCandidateReliable(card, hints)).slice(0, MAX_VISUAL_CANDIDATES)
          : [];
        providerDiagnostics.push(
          buildProviderDiagnostic(
            'local-ai',
            'ocr_catalogue_resolver',
            localAi,
            localCandidates,
            reliableLocalCandidates,
            reliableLocalCandidates.length ? 'accepted_ocr_candidates' : 'no_reliable_ocr_match',
            {
              printedNumber: localAi.parsed?.printedNumber ?? null,
              resolvedBy: localAi.parsed?.resolvedBy ?? null,
              needsVisualRerank: localAi.parsed?.needsVisualRerank ?? null,
              uniqueSets: localAi.parsed?.uniqueSets ?? null,
              clipSimilarity: localAi.parsed?.clipSimilarity ?? null,
            }
          )
        );
        if (reliableLocalCandidates.length) {
          found.push(...reliableLocalCandidates);
          console.log('[scan-identify] local OCR resolver', {
            status: localAi.status,
            ok: localAi.ok,
            candidates: reliableLocalCandidates.length,
            first: reliableLocalCandidates[0]?.name,
            resolvedBy: localAi.parsed?.resolvedBy,
          });
          return finishImageDiagnostics(imageStartedAt, providerDiagnostics, found, notes);
        }
      } catch (error) {
        providerDiagnostics.push(
          buildFailedProviderDiagnostic('local-ai', 'ocr_catalogue_resolver', ocrResolverStartedAt, error)
        );
        console.log('[scan-identify] local OCR resolver failed', error instanceof Error ? error.message : String(error));
      }
    }

    const ximilarFallbackReason = getXimilarFallbackReason(hints);
    const visualFallbackTasks = [
      (async () => {
        const startedAt = Date.now();
        try {
          const cardsight = await postJson('/api/cardsight/identify', {
            base64Image: rawBase64,
            binderId: binderId ?? undefined,
          }, 9000);
          const card = normalizeIdentifiedCard(cardsight.parsed, 'cardsight');
          const cards = cardsight.ok && card && isFallbackCandidateReliable(card, hints) ? [card] : [];
          return {
            cards,
            diagnostic: buildProviderDiagnostic(
              'cardsight',
              'visual_fallback',
              cardsight,
              cards,
              cards,
              cards.length ? 'accepted_fallback_candidate' : 'no_match'
            ),
          };
        } catch (error) {
          return {
            cards: [] as IdentifiedCard[],
            diagnostic: buildFailedProviderDiagnostic('cardsight', 'visual_fallback', startedAt, error),
          };
        }
      })(),
    ];

    if (shouldUseXimilarFallback(hints) && !useBatchedXimilarFallback) {
      visualFallbackTasks.push((async () => {
        const startedAt = Date.now();
        try {
          const endpoint = selectXimilarEndpoint(hints);
          const ximilar = await invokeXimilarRecognition({
            base64Image: buildBase64ImageDataUri(rawBase64),
            endpoint,
            binderId: binderId ?? undefined,
            scanSessionId: hints?.scanSessionId ?? undefined,
            itemType: hints?.itemType ?? 'raw_card',
            isSlab: Boolean(hints?.isSlab),
            gradeOnly: Boolean(hints?.gradeOnly),
            detectMultiple: Boolean(hints?.detectMultiple),
            remoteConditionAnalysis: Boolean(hints?.remoteConditionAnalysis),
            recognitionReason: ximilarFallbackReason,
            localConfidence: hints?.localConfidence ?? null,
            signals: buildXimilarSignals(hints, ximilarFallbackReason),
          }, 10000);
          const cards = normalizeProviderCandidates(ximilar.parsed, 'ximilar');
          const reliableCards = cards.filter((card) => isFallbackCandidateReliable(card, hints));
          return {
            cards: ximilar.ok ? reliableCards : [],
            diagnostic: buildProviderDiagnostic(
              'ximilar',
              'visual_fallback',
              ximilar,
              cards,
              ximilar.ok ? reliableCards : [],
              ximilar.ok && reliableCards.length ? 'accepted_fallback_candidates' : 'no_reliable_match',
              {
                requiresConfirmation: ximilar.parsed?.requiresConfirmation ?? null,
                endpoint: ximilar.parsed?.endpoint ?? endpoint,
                cacheHit: ximilar.parsed?.cacheHit ?? null,
                recognitionReason: ximilarFallbackReason,
                imageHash: ximilar.parsed?.imageHash ?? null,
              }
            ),
          };
        } catch (error) {
          return {
            cards: [] as IdentifiedCard[],
            diagnostic: buildFailedProviderDiagnostic('ximilar', 'visual_fallback', startedAt, error),
          };
        }
      })());
    } else {
      providerDiagnostics.push({
        provider: 'ximilar',
        stage: 'visual_fallback',
        ok: true,
        status: null,
        durationMs: 0,
        decision: useBatchedXimilarFallback
          ? 'deferred_batched_fallback'
          : ximilarFallbackReason
            ? 'skipped_feature_disabled'
            : 'skipped_local_confident',
        candidateCount: 0,
        accepted: false,
        error: null,
        topCandidate: null,
        candidates: [],
        signals: {
          enabled: SCAN_XIMILAR_FALLBACK_ENABLED,
          batched: useBatchedXimilarFallback,
          recognitionReason: ximilarFallbackReason,
          localConfidence: hints?.localConfidence ?? null,
          localStatus: hints?.localStatus ?? null,
          language: hints?.language ?? null,
        },
      });
    }

    const visualFallbacks = await Promise.allSettled(visualFallbackTasks);

    for (const result of visualFallbacks) {
      if (result.status === 'fulfilled') {
        providerDiagnostics.push(result.value.diagnostic);
        found.push(...result.value.cards);
      } else {
        providerDiagnostics.push({
          provider: 'visual-fallback',
          stage: 'visual_fallback',
          ok: false,
          status: null,
          durationMs: 0,
          decision: 'request_failed',
          candidateCount: 0,
          accepted: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          topCandidate: null,
          candidates: [],
          signals: null,
        });
      }
    }

    if (found.length > 0) {
      console.log('[scan-identify] visual fallbacks returned candidates', {
        candidates: found.length,
        first: found[0]?.name,
      });
      return finishImageDiagnostics(imageStartedAt, providerDiagnostics, found, notes);
    }

    const textFallbackStartedAt = Date.now();
    try {
      const textFallback = await postJson('/api/scan/identify', {
        base64Image: rawBase64,
        binderId: binderId ?? undefined,
        ...hintPayload,
      }, 12000);
      const card = normalizeIdentifiedCard(textFallback.parsed, 'scan-identify');
      const cards = textFallback.ok && card ? [card] : [];
      found.push(...cards);
      providerDiagnostics.push(
        buildProviderDiagnostic(
          'scan-identify',
          'final_text_fallback',
          textFallback,
          cards,
          cards,
          cards.length ? 'accepted_text_fallback_candidate' : 'no_match'
        )
      );
      console.log('[scan-identify] final text fallback', {
        status: textFallback.status,
        ok: textFallback.ok,
        name: card?.name,
        error: textFallback.parsed?.error,
      });
    } catch (error) {
      providerDiagnostics.push(
        buildFailedProviderDiagnostic('scan-identify', 'final_text_fallback', textFallbackStartedAt, error)
      );
      console.log('[scan-identify] final text fallback failed', error instanceof Error ? error.message : String(error));
    }

    if (found.length === 0) {
      const finalVisualStartedAt = Date.now();
      try {
        const rareCandy = await postJson('/api/rare-candy-scan/identify', {
          base64Image: rawBase64,
          binderId: binderId ?? undefined,
          maxCandidates: MAX_VISUAL_CANDIDATES,
          ...hintPayload,
        }, 12000);
        const allCandidates = normalizeProviderCandidates(rareCandy.parsed, 'rare-candy-style', 10);
        const candidates = getVisuallySupportedCandidates(allCandidates);
        found.push(...candidates);
        providerDiagnostics.push(
          buildProviderDiagnostic(
            'rare-candy-style',
            'final_visual_retry',
            rareCandy,
            allCandidates,
            candidates,
            candidates.length ? 'accepted_final_visual_candidates' : 'no_confident_visual_match',
            {
              status: rareCandy.parsed?.status ?? null,
              accepted: rareCandy.parsed?.accepted ?? null,
              needsConfirmation: rareCandy.parsed?.needsConfirmation ?? null,
              topSimilarity: rareCandy.parsed?.similarity ?? null,
              margin: rareCandy.parsed?.margin ?? null,
              signals: rareCandy.parsed?.signals ?? null,
            }
          )
        );
        console.log('[scan-identify] final visual candidates', {
          status: rareCandy.status,
          ok: rareCandy.ok,
          candidates: candidates.length,
          first: found[0]?.name,
          error: rareCandy.parsed?.error,
        });
      } catch (error) {
        providerDiagnostics.push(
          buildFailedProviderDiagnostic('rare-candy-style', 'final_visual_retry', finalVisualStartedAt, error)
        );
        console.log('[scan-identify] final visual candidates failed', error instanceof Error ? error.message : String(error));
      }
    }

    return finishImageDiagnostics(imageStartedAt, providerDiagnostics, found, notes);
  });

  const settled = await Promise.all(requests);
  const providers = settled.flatMap((result) => result.diagnostics.providers);
  const notes = settled.flatMap((result) => result.diagnostics.notes ?? []);
  let cards = uniqueCards(settled.flatMap((result) => result.cards)).slice(0, maxResultCards);

  if (useBatchedXimilarFallback) {
    const unresolvedImages = images
      .map((base64, index) => ({ base64, index, result: settled[index] }))
      .filter((entry) => !entry.result?.cards?.length && stripBase64ImagePrefix(entry.base64));

    if (unresolvedImages.length) {
      const startedAt = Date.now();
      const endpoint = selectXimilarEndpoint(hints);
      const recognitionReason = getXimilarFallbackReason(hints);
      try {
        const ximilar = await invokeXimilarRecognition({
          base64Images: unresolvedImages.map((entry) => buildBase64ImageDataUri(entry.base64)),
          endpoint,
          binderId: binderId ?? undefined,
          scanSessionId: hints?.scanSessionId ?? undefined,
          itemType: hints?.itemType ?? 'raw_card',
          isSlab: Boolean(hints?.isSlab),
          gradeOnly: Boolean(hints?.gradeOnly),
          detectMultiple: Boolean(hints?.detectMultiple),
          remoteConditionAnalysis: Boolean(hints?.remoteConditionAnalysis),
          recognitionReason,
          localConfidence: hints?.localConfidence ?? null,
          signals: {
            ...buildXimilarSignals(hints, recognitionReason),
            batchImageCount: unresolvedImages.length,
            unresolvedImageIndexes: unresolvedImages.map((entry) => entry.index),
          },
        }, 12000);
        const candidates = normalizeProviderCandidates(ximilar.parsed, 'ximilar', Math.max(10, unresolvedImages.length));
        const reliableCards = candidates.filter((card) => isFallbackCandidateReliable(card, hints));
        providers.push(
          buildProviderDiagnostic(
            'ximilar',
            'batched_visual_fallback',
            ximilar,
            candidates,
            ximilar.ok ? reliableCards : [],
            ximilar.ok && reliableCards.length ? 'accepted_batched_fallback_candidates' : 'no_reliable_match',
            {
              endpoint: ximilar.parsed?.endpoint ?? endpoint,
              cacheHit: ximilar.parsed?.cacheHit ?? null,
              recognitionReason,
              imageHash: ximilar.parsed?.imageHash ?? null,
              batchImageCount: unresolvedImages.length,
              unresolvedImageIndexes: unresolvedImages.map((entry) => entry.index),
            }
          )
        );
        if (ximilar.ok && reliableCards.length) {
          cards = uniqueCards([...cards, ...reliableCards]).slice(0, maxResultCards);
        }
      } catch (error) {
        providers.push(buildFailedProviderDiagnostic('ximilar', 'batched_visual_fallback', startedAt, error));
        notes.push('Batched remote recognition was unavailable; captured images remain available for manual retry.');
      }
    }
  }

  return {
    cards,
    diagnostics: {
      totalMs: Date.now() - overallStartedAt,
      imageCount: images.length,
      candidateCount: cards.length,
      providers,
      notes,
    },
  };
}

export async function identifyCards(images: string[], binderId?: string): Promise<IdentifiedCard[]> {
  const result = await identifyCardsDetailed(images, binderId);
  return result.cards;
}
