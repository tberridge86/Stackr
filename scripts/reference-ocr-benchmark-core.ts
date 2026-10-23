import { createHash } from 'node:crypto';
import {
  extractLocalOcrSignals,
  rankLocalOcrCandidates,
  type LocalOcrRegionText,
} from '../lib/localOcrCardMatcher';
import type { LocalScanCard } from '../lib/localCardIndex';

export const REFERENCE_OCR_BENCHMARK_SCHEMA_VERSION = 'stackr-reference-ocr-benchmark-v1.0.0';

export type ReferenceCatalogueCard = {
  id: string;
  name: string;
  language?: string | null;
  setId?: string | null;
  setName?: string | null;
  number?: string | null;
  printedTotal?: number | null;
  rarity?: string | null;
  imageSmall?: string | null;
};

export type DecodedImageMetadata = {
  width?: number | null;
  height?: number | null;
  format?: string | null;
};

export type ReferenceImageValidation = {
  valid: boolean;
  sha256: string;
  bytes: number;
  width: number | null;
  height: number | null;
  format: string | null;
  contentType: string;
  errors: string[];
};

export type ReferenceOcrCase = {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  collectorNumber: string;
  printedTotal: number | null;
  viewId: string;
  regions: LocalOcrRegionText[];
  signals: ReturnType<typeof extractLocalOcrSignals>;
  printedNumberAlternatives: {
    raw: string;
    number: number;
    denominator: number | null;
  }[];
  candidatePoolSize: number;
  expectedRank: number | null;
  top1: boolean;
  top3: boolean;
  extractedNameEvidence: boolean;
  extractedCollectorNumber: boolean;
  extractedPrintedTotal: boolean;
  automaticAcceptanceAllowed: false;
  evidenceLevel: 'ocr_candidate_retrieval_only';
  topCandidates: {
    cardId: string;
    name: string;
    setId: string;
    collectorNumber: string;
    score: number;
    reasons: string[];
    ambiguousVariant: boolean;
  }[];
};

const OPTIONAL_PRINTING_TOKENS = new Set([
  'card',
  'cards',
  'ex',
  'gx',
  'v',
  'vmax',
  'vstar',
]);

function normalisePhrase(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok[eé]mon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseTokens(value?: string | null) {
  return normalisePhrase(value).split(' ').filter(Boolean);
}

function printingNameTokens(value?: string | null) {
  return phraseTokens(value).filter((token) => !OPTIONAL_PRINTING_TOKENS.has(token));
}

function includesAllTokens(haystack: string[], needles: string[]) {
  const values = new Set(haystack);
  return needles.length > 0 && needles.every((token) => values.has(token));
}

export function parseReferenceCardQuery(query: string) {
  const value = normalisePhrase(query);
  const match = value.match(/^(.+?)\s+(?:from|in)\s+(.+)$/);
  return {
    raw: query.trim(),
    cardPhrase: match?.[1]?.trim() || value,
    setPhrase: match?.[2]?.trim() || null,
  };
}

export function resolveReferenceCardQuery(cards: ReferenceCatalogueCard[], query: string) {
  const exactId = cards.find((card) => normalisePhrase(card.id) === normalisePhrase(query));
  if (exactId) return [{ card: exactId, score: 200, reasons: ['exact-card-id'] }];

  const parsed = parseReferenceCardQuery(query);
  const requestedName = normalisePhrase(parsed.cardPhrase);
  const requestedNameTokens = printingNameTokens(parsed.cardPhrase);
  const requestedSet = normalisePhrase(parsed.setPhrase);
  const requestedSetTokens = phraseTokens(parsed.setPhrase);

  return cards
    .flatMap((card) => {
      const cardName = normalisePhrase(card.name);
      const cardNameTokens = printingNameTokens(card.name);
      const setName = normalisePhrase(card.setName || card.setId);
      const setTokens = phraseTokens(`${card.setName ?? ''} ${card.setId ?? ''}`);
      let score = 0;
      const reasons: string[] = [];

      if (cardName === requestedName) {
        score += 100;
        reasons.push('exact-card-name');
      } else if (
        requestedNameTokens.length > 0
        && includesAllTokens(cardNameTokens, requestedNameTokens)
      ) {
        score += 80;
        reasons.push('card-name-tokens');
      } else {
        return [];
      }

      if (requestedSet) {
        if (setName === requestedSet || normalisePhrase(card.setId) === requestedSet) {
          score += 60;
          reasons.push('exact-set');
        } else if (includesAllTokens(setTokens, requestedSetTokens)) {
          score += 45;
          reasons.push('set-tokens');
        } else {
          return [];
        }
      }

      return [{ card, score, reasons }];
    })
    .sort((left, right) => (
      right.score - left.score
      || String(left.card.setName ?? '').localeCompare(String(right.card.setName ?? ''))
      || String(left.card.number ?? '').localeCompare(String(right.card.number ?? ''), undefined, { numeric: true })
      || left.card.id.localeCompare(right.card.id)
    ));
}

export function toHiresReferenceUrl(imageUrl?: string | null) {
  const value = String(imageUrl ?? '').trim();
  if (!value) return null;
  if (/images\.pokemontcg\.io\/.+\.png(?:\?.*)?$/i.test(value)) {
    return value.replace(/\.png(\?.*)?$/i, '_hires.png$1');
  }
  if (!/\.(?:png|jpe?g|webp)(?:\?.*)?$/i.test(value)) {
    return `${value.replace(/\/$/, '')}/high.webp`;
  }
  return value;
}

export function toLocalScanCard(card: ReferenceCatalogueCard): LocalScanCard {
  return {
    id: card.id,
    name: card.name,
    language: card.language || 'en',
    number: String(card.number ?? ''),
    number_denominator: card.printedTotal ?? null,
    set_id: String(card.setId ?? ''),
    set_name: String(card.setName ?? card.setId ?? ''),
    set_code: String(card.setId ?? ''),
    set_printed_total: card.printedTotal ?? null,
    release_year: null,
    release_date: null,
    image_small: String(card.imageSmall ?? ''),
    image_hash: null,
    rarity: String(card.rarity ?? ''),
    variant: String(card.rarity ?? ''),
  };
}

export function validateReferenceImage(input: {
  responseStatus: number;
  contentType?: string | null;
  body: Buffer;
  metadata: DecodedImageMetadata;
  minBytes?: number;
  maxBytes?: number;
  minWidth?: number;
  minHeight?: number;
}) : ReferenceImageValidation {
  const contentType = String(input.contentType ?? '').split(';')[0].trim().toLowerCase();
  const width = input.metadata.width != null && Number.isFinite(Number(input.metadata.width))
    ? Number(input.metadata.width)
    : null;
  const height = input.metadata.height != null && Number.isFinite(Number(input.metadata.height))
    ? Number(input.metadata.height)
    : null;
  const format = String(input.metadata.format ?? '').toLowerCase() || null;
  const errors: string[] = [];
  const minBytes = input.minBytes ?? 10_000;
  const maxBytes = input.maxBytes ?? 20 * 1024 * 1024;
  const minWidth = input.minWidth ?? 300;
  const minHeight = input.minHeight ?? 400;

  if (input.responseStatus < 200 || input.responseStatus >= 300) errors.push(`http-status:${input.responseStatus}`);
  if (!contentType.startsWith('image/')) errors.push(`content-type:${contentType || 'missing'}`);
  const expectedFormat = contentType === 'image/jpeg' || contentType === 'image/jpg'
    ? 'jpeg'
    : contentType.startsWith('image/')
      ? contentType.slice('image/'.length)
      : null;
  const normalisedFormat = format === 'jpg' ? 'jpeg' : format;
  if (expectedFormat && normalisedFormat && expectedFormat !== normalisedFormat) {
    errors.push(`content-type-format-mismatch:${expectedFormat}:${normalisedFormat}`);
  }
  if (input.body.length < minBytes) errors.push(`image-too-small:${input.body.length}`);
  if (input.body.length > maxBytes) errors.push(`image-too-large:${input.body.length}`);
  if (!width || !height) errors.push('image-decode-missing-dimensions');
  if (width && width < minWidth) errors.push(`image-width:${width}`);
  if (height && height < minHeight) errors.push(`image-height:${height}`);
  if (width && height) {
    const aspectRatio = width / height;
    if (aspectRatio < 0.58 || aspectRatio > 0.82) errors.push(`unexpected-card-aspect-ratio:${aspectRatio.toFixed(4)}`);
  }

  return {
    valid: errors.length === 0,
    sha256: createHash('sha256').update(input.body).digest('hex'),
    bytes: input.body.length,
    width,
    height,
    format,
    contentType,
    errors,
  };
}

export function findDuplicateReferenceImages(images: { cardId: string; validation: ReferenceImageValidation }[]) {
  const byHash = new Map<string, string[]>();
  for (const image of images) {
    if (!image.validation.valid) continue;
    const cardIds = byHash.get(image.validation.sha256) ?? [];
    cardIds.push(image.cardId);
    byHash.set(image.validation.sha256, cardIds);
  }
  return [...byHash.entries()]
    .filter(([, cardIds]) => cardIds.length > 1)
    .map(([sha256, cardIds]) => ({ sha256, cardIds: cardIds.slice().sort() }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

export function evaluateReferenceOcrCase(input: {
  expectedCard: ReferenceCatalogueCard;
  catalogue: ReferenceCatalogueCard[];
  viewId: string;
  regions: LocalOcrRegionText[];
}): ReferenceOcrCase {
  const collectorRegions = input.regions.filter((region) => (
    region.text.trim()
    && (region.role === 'collector-number' || region.role === 'copyright' || region.role === 'set-code')
  ));
  const signalVariants = (collectorRegions.length ? collectorRegions : [{ role: 'collector-number' as const, text: '' }])
    .map((primaryRegion) => extractLocalOcrSignals([
      { role: 'collector-number', text: primaryRegion.text },
      ...input.regions.filter((region) => region !== primaryRegion),
    ]))
    .filter((signals, index, all) => all.findIndex((candidate) => (
      candidate.printedNumber?.raw === signals.printedNumber?.raw
      && candidate.nameText === signals.nameText
    )) === index);
  const candidateIds = new Set<string>();
  type RankedCandidate = ReturnType<typeof rankLocalOcrCandidates>[number];
  const merged = new Map<string, RankedCandidate>();
  let signals = signalVariants[0] ?? extractLocalOcrSignals(input.regions);
  let strongestTopScore = Number.NEGATIVE_INFINITY;

  for (const signalVariant of signalVariants) {
    const printed = signalVariant.printedNumber;
    const signalNameTokens = printingNameTokens(signalVariant.nameText);
    const candidatePool = input.catalogue.filter((card) => {
      const cardNumber = Number.parseInt(String(card.number ?? '').replace(/[^\d]/g, ''), 10);
      const numberMatches = Boolean(
        printed
        && Number.isFinite(cardNumber)
        && cardNumber === printed.number
        && (printed.denominator == null || card.printedTotal === printed.denominator)
      );
      const cardNameTokens = printingNameTokens(card.name);
      const nameMatches = includesAllTokens(signalNameTokens, cardNameTokens);
      return numberMatches || nameMatches;
    }).slice(0, 500);
    candidatePool.forEach((card) => candidateIds.add(card.id));
    const variantRanked = rankLocalOcrCandidates(candidatePool.map(toLocalScanCard), signalVariant);
    if ((variantRanked[0]?.score ?? Number.NEGATIVE_INFINITY) > strongestTopScore) {
      strongestTopScore = variantRanked[0]?.score ?? Number.NEGATIVE_INFINITY;
      signals = signalVariant;
    }
    for (const candidate of variantRanked) {
      const previous = merged.get(candidate.card.id);
      if (!previous || candidate.score > previous.score) merged.set(candidate.card.id, candidate);
    }
  }

  const ranked = [...merged.values()].sort((left, right) => (
    right.score - left.score || left.card.id.localeCompare(right.card.id)
  ));
  const expectedIndex = ranked.findIndex((candidate) => candidate.card.id === input.expectedCard.id);
  const expectedCandidate = expectedIndex >= 0 ? ranked[expectedIndex] : null;
  const expectedNumber = Number.parseInt(String(input.expectedCard.number ?? '').replace(/[^\d]/g, ''), 10);
  const printedAlternatives = signalVariants
    .map((variant) => variant.printedNumber)
    .filter((printed): printed is NonNullable<typeof printed> => Boolean(printed))
    .filter((printed, index, all) => all.findIndex((candidate) => (
      candidate.number === printed.number && candidate.denominator === printed.denominator
    )) === index);

  return {
    cardId: input.expectedCard.id,
    cardName: input.expectedCard.name,
    setId: String(input.expectedCard.setId ?? ''),
    setName: String(input.expectedCard.setName ?? input.expectedCard.setId ?? ''),
    collectorNumber: String(input.expectedCard.number ?? ''),
    printedTotal: input.expectedCard.printedTotal ?? null,
    viewId: input.viewId,
    regions: input.regions,
    signals,
    printedNumberAlternatives: printedAlternatives.map((printed) => ({
      raw: printed.raw,
      number: printed.number,
      denominator: printed.denominator,
    })),
    candidatePoolSize: candidateIds.size,
    expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
    top1: expectedIndex === 0,
    top3: expectedIndex >= 0 && expectedIndex < 3,
    extractedNameEvidence: Boolean(expectedCandidate?.reasons.some((reason) => reason.startsWith('name'))),
    extractedCollectorNumber: printedAlternatives.some((printed) => (
      Number.isFinite(expectedNumber) && printed.number === expectedNumber
    )),
    extractedPrintedTotal: Boolean(
      input.expectedCard.printedTotal != null
      && printedAlternatives.some((printed) => printed.denominator === input.expectedCard.printedTotal)
    ),
    automaticAcceptanceAllowed: false,
    evidenceLevel: 'ocr_candidate_retrieval_only',
    topCandidates: ranked.slice(0, 5).map((candidate) => ({
      cardId: candidate.card.id,
      name: candidate.card.name,
      setId: candidate.card.set_id,
      collectorNumber: candidate.card.number,
      score: candidate.score,
      reasons: candidate.reasons,
      ambiguousVariant: candidate.ambiguousVariant,
    })),
  };
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(3)) : 0;
}

function summaryMetrics(cases: ReferenceOcrCase[]) {
  const top1Count = cases.filter((item) => item.top1).length;
  const top3Count = cases.filter((item) => item.top3).length;
  const nameEvidenceCount = cases.filter((item) => item.extractedNameEvidence).length;
  const collectorNumberCount = cases.filter((item) => item.extractedCollectorNumber).length;
  const printedTotalCount = cases.filter((item) => item.extractedPrintedTotal).length;
  return {
    caseCount: cases.length,
    top1Count,
    top1Pct: percentage(top1Count, cases.length),
    top3Count,
    top3Pct: percentage(top3Count, cases.length),
    nameEvidenceCount,
    nameEvidencePct: percentage(nameEvidenceCount, cases.length),
    collectorNumberCount,
    collectorNumberPct: percentage(collectorNumberCount, cases.length),
    printedTotalCount,
    printedTotalPct: percentage(printedTotalCount, cases.length),
    automaticAcceptanceCount: 0,
  };
}

export function summariseReferenceOcrCases(cases: ReferenceOcrCase[]) {
  const views = [...new Set(cases.map((item) => item.viewId))].sort();
  return {
    ...summaryMetrics(cases),
    byView: views.map((viewId) => ({
      viewId,
      ...summaryMetrics(cases.filter((item) => item.viewId === viewId)),
    })),
    limitations: [
      'Desktop Tesseract is a crop-and-normalisation proxy; it is not the Android/iOS ML Kit runtime.',
      'Downloaded reference art and synthetic views are not evidence of real-camera accuracy.',
      'OCR retrieves and reranks candidates only; visual evidence is still required before automatic acceptance.',
    ],
  };
}
