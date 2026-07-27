import { SCAN_LOCAL_OCR_MATCHER_ENABLED, SCAN_LOCAL_OCR_STRONG_CONFIDENCE } from './config';
import type { LocalScanCard } from './localCardIndex';

export type LocalOcrRegionRole =
  | 'name'
  | 'hp'
  | 'collector-number'
  | 'set-code'
  | 'copyright'
  | 'full-card'
  | 'unknown';

export type LocalOcrRegionText = {
  role: LocalOcrRegionRole;
  text: string;
};

export type LocalOcrPrintedNumber = {
  raw: string;
  number: number;
  denominator: number | null;
  normalisedNumber: string;
  normalisedDenominator: string | null;
  setCode?: string | null;
  region?: LocalOcrRegionRole;
};

export type LocalOcrSignals = {
  text: string;
  language: 'en' | 'ja' | 'zh' | 'unknown';
  nameText: string;
  printedNumber: LocalOcrPrintedNumber | null;
  setCode: string | null;
  hp: number | null;
  releaseYear: number | null;
  rarityHints: string[];
  variantHints: string[];
};

export type LocalOcrCandidateMatch = {
  card: LocalScanCard;
  score: number;
  confidence: number;
  reasons: string[];
  scoreBreakdown: Record<string, number>;
  ambiguousVariant: boolean;
  visualSimilarity?: number | null;
};

export type LocalOcrMatchResult = {
  status: 'disabled' | 'no-text' | 'no-candidates' | 'weak' | 'ambiguous' | 'strong';
  bestMatch: LocalOcrCandidateMatch | null;
  candidates: LocalOcrCandidateMatch[];
  confidence: number;
  signals: LocalOcrSignals;
  durationMs: number;
  notes: string[];
};

type MatchOptions = {
  maxCandidates?: number;
  allowIndexBuild?: boolean;
  scanImageBase64?: string | null;
  useArtworkRerank?: boolean;
  strongConfidence?: number | null;
  ambiguousMarginScore?: number | null;
  ambiguousSecondMinScore?: number | null;
};

const OPTIONAL_NAME_TOKENS = new Set([
  'card',
  'cards',
  'pokemon',
  'pokémon',
  'tcg',
  'basic',
  'stage',
  'hp',
  'ex',
  'gx',
  'v',
  'vmax',
  'vstar',
]);

const RARITY_HINTS: Record<string, string[]> = {
  holo: ['holo'],
  reverse: ['reverse'],
  masterball: ['master ball', 'masterball'],
  pokeball: ['poke ball', 'pokeball'],
  illustration: ['illustration rare', 'special illustration', 'art rare'],
  promo: ['promo', 'promotional'],
  rainbow: ['rainbow'],
  secret: ['secret rare'],
};

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normaliseOcrText(value?: string | null) {
  return stripDiacritics(String(value ?? '').normalize('NFKC'))
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/([a-z])'s\b/gi, '$1s')
    .replace(/[|]/g, 'I')
    .replace(/[^\p{L}\p{N}#/'’.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseForCompare(value?: string | null) {
  return normaliseOcrText(value)
    .toLowerCase()
    .replace(/pok[eé]mon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactCompare(value?: string | null) {
  return normaliseForCompare(value).replace(/\s+/g, '');
}

function normaliseSetCode(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function languageMatches(cardLanguage: string | null | undefined, detectedLanguage: LocalOcrSignals['language']) {
  const language = String(cardLanguage ?? '').toLowerCase();
  if (detectedLanguage === 'unknown') return true;
  if (detectedLanguage === 'zh') return language === 'zh' || language === 'zh-hans' || language === 'zh-hant';
  return language === detectedLanguage;
}

function normaliseNumberGlyphs(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss](?=\d)/g, '5');
}

function stripLeadingZeroes(value?: string | null) {
  const raw = String(value ?? '').trim();
  return raw.replace(/^0+(?=\d)/, '') || raw;
}

export function parseLocalOcrPrintedNumber(
  value?: string | null,
  region?: LocalOcrRegionRole
): LocalOcrPrintedNumber | null {
  const text = normaliseNumberGlyphs(value);
  const slash = text.match(/\b([A-Z]{1,6})?\s*0*(\d{1,4})\s*(?:\/|\uFF0F|\u2044|\u2215|-|\sof\s)\s*0*(\d{1,4})\b/i);
  if (slash) {
    const number = Number(slash[2]);
    const denominator = Number(slash[3]);
    if (Number.isFinite(number) && Number.isFinite(denominator)) {
      return {
        raw: slash[0],
        number,
        denominator,
        normalisedNumber: stripLeadingZeroes(slash[2]),
        normalisedDenominator: stripLeadingZeroes(slash[3]),
        setCode: slash[1] ? normaliseSetCode(slash[1]) : null,
        region,
      };
    }
  }

  const promo = text.match(/\b([A-Z]{2,6})\s*[- ]?\s*0*(\d{1,4})\b/i);
  if (promo && /promo|svp|swsh|sm|xy|dp|bw|hgss|s[vm]p?/i.test(text)) {
    const number = Number(promo[2]);
    if (Number.isFinite(number)) {
      return {
        raw: promo[0],
        number,
        denominator: null,
        normalisedNumber: stripLeadingZeroes(promo[2]),
        normalisedDenominator: null,
        setCode: normaliseSetCode(promo[1]),
        region,
      };
    }
  }

  const hash = text.match(/#\s*0*(\d{1,4})\b/);
  if (hash) {
    const number = Number(hash[1]);
    if (Number.isFinite(number)) {
      return {
        raw: hash[0],
        number,
        denominator: null,
        normalisedNumber: stripLeadingZeroes(hash[1]),
        normalisedDenominator: null,
        setCode: null,
        region,
      };
    }
  }

  return null;
}

function detectLanguage(text: string): LocalOcrSignals['language'] {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u3400-\u9fff]/.test(text)) return 'zh';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'unknown';
}

function extractHp(text: string) {
  const match = normaliseNumberGlyphs(text).match(/\bHP\s*(\d{2,3})\b/i)
    ?? normaliseNumberGlyphs(text).match(/\b(\d{2,3})\s*HP\b/i);
  if (!match) return null;
  const hp = Number(match[1]);
  return Number.isFinite(hp) ? hp : null;
}

function extractReleaseYear(text: string) {
  const years = [...String(text).matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1996 && year <= new Date().getFullYear() + 1);
  return years[0] ?? null;
}

function extractSetCode(text: string, printedNumber?: LocalOcrPrintedNumber | null) {
  if (printedNumber?.setCode) return printedNumber.setCode;
  const candidates = [...String(text).normalize('NFKC').matchAll(/\b([A-Z]{1,4}\d{0,3}[A-Z]?)\b/g)]
    .map((match) => normaliseSetCode(match[1]))
    .filter((candidate) => candidate.length >= 2 && !/^(hp|no|ill|tm|gx|ex|v)$/i.test(candidate));
  return candidates[0] ?? null;
}

function extractHintMatches(text: string, hints: Record<string, string[]>) {
  const lower = normaliseForCompare(text);
  return Object.entries(hints)
    .filter(([, aliases]) => aliases.some((alias) => lower.includes(normaliseForCompare(alias))))
    .map(([key]) => key);
}

function likelyNameLines(regions: LocalOcrRegionText[]) {
  const preferred = regions.filter((region) => region.role === 'name' && region.text.trim());
  const fallback = regions.filter((region) => region.role === 'full-card' || region.role === 'unknown');
  const lines = [...preferred, ...fallback]
    .flatMap((region) => region.text.split(/\r?\n/))
    .map((line) => line.replace(/\bHP\s*\d+\b/gi, '').trim())
    .filter((line) => {
      const normalized = normaliseForCompare(line);
      if (normalized.length < 2 || normalized.length > 48) return false;
      if (/^(basic|stage|trainer|item|supporter|stadium|energy|ability|weakness|resistance|retreat|illus|no|hp|\d+)$/.test(normalized)) return false;
      return /[\p{L}]/u.test(normalized);
    });
  return [...new Set(lines)].slice(0, 4).join(' ');
}

export function extractLocalOcrSignals(regions: LocalOcrRegionText[]): LocalOcrSignals {
  const cleanRegions = regions
    .map((region) => ({ ...region, text: normaliseOcrText(region.text) }))
    .filter((region) => region.text);
  const text = cleanRegions.map((region) => region.text).join('\n');
  const printedRegion = cleanRegions.find((region) => (
    region.role === 'collector-number'
    || region.role === 'copyright'
    || region.role === 'set-code'
  ));
  const printedNumber = parseLocalOcrPrintedNumber(
    printedRegion?.text ?? text,
    printedRegion?.role
  );
  const setCode = extractSetCode(cleanRegions.find((region) => region.role === 'set-code')?.text ?? text, printedNumber);

  return {
    text,
    language: detectLanguage(text),
    nameText: likelyNameLines(cleanRegions),
    printedNumber,
    setCode,
    hp: extractHp(cleanRegions.find((region) => region.role === 'hp')?.text ?? text),
    releaseYear: extractReleaseYear(text),
    rarityHints: extractHintMatches(text, RARITY_HINTS),
    variantHints: extractHintMatches(text, {
      reverse: ['reverse holo', 'reverse'],
      masterball: ['master ball', 'masterball'],
      pokeball: ['poke ball', 'pokeball'],
      firstEdition: ['1st edition', 'first edition'],
    }),
  };
}

function cardNumberAsNumber(card: LocalScanCard) {
  const number = Number.parseInt(String(card.number ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(number) ? number : null;
}

function releaseYearForCard(card: LocalScanCard) {
  const year = Number(card.release_year);
  if (Number.isFinite(year) && year > 0) return year;
  const date = String((card as any).release_date ?? '');
  const match = date.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function getCardVariantText(card: LocalScanCard) {
  return normaliseForCompare([
    card.rarity,
    (card as any).variant,
    (card as any).raw_data?.rarity,
    (card as any).raw_data?.subtypes?.join?.(' '),
  ].filter(Boolean).join(' '));
}

function tokeniseName(value?: string | null) {
  return normaliseForCompare(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !OPTIONAL_NAME_TOKENS.has(token));
}

function nameScore(card: LocalScanCard, nameText: string, fullText: string) {
  const cardName = normaliseForCompare(card.name);
  const compactName = compactCompare(card.name);
  const compactNameText = compactCompare(nameText);
  const compactFullText = compactCompare(fullText);

  if (!cardName) return { score: 0, reason: null as string | null };
  if (compactNameText && compactNameText.includes(compactName)) return { score: 42, reason: 'name-exact-region' };
  if (compactFullText && compactFullText.includes(compactName)) return { score: 34, reason: 'name-exact' };

  const tokens = tokeniseName(card.name);
  if (!tokens.length) return { score: 0, reason: null };
  const textTokens = new Set(tokeniseName(`${nameText} ${fullText}`));
  const matches = tokens.filter((token) => textTokens.has(token));
  if (!matches.length) return { score: 0, reason: null };

  const ratio = matches.length / tokens.length;
  if (ratio >= 1) return { score: 30, reason: 'name-tokens' };
  if (ratio >= 0.67) return { score: 22, reason: 'name-partial' };
  if (ratio >= 0.5 && tokens.length <= 2) return { score: 14, reason: 'name-weak' };
  return { score: 0, reason: null };
}

function addScore(
  breakdown: Record<string, number>,
  reasons: string[],
  key: string,
  value: number,
  reason = key
) {
  if (!value) return;
  breakdown[key] = (breakdown[key] ?? 0) + value;
  reasons.push(reason);
}

export function scoreLocalOcrCandidate(
  card: LocalScanCard,
  signals: LocalOcrSignals,
  visualSimilarity?: number | null
): LocalOcrCandidateMatch {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  const printed = signals.printedNumber;
  const cardNumber = cardNumberAsNumber(card);

  if (signals.language !== 'unknown') {
    if (languageMatches(card.language, signals.language)) {
      addScore(breakdown, reasons, 'language', 8, `language:${signals.language}`);
    } else {
      addScore(breakdown, reasons, 'languageMismatch', -18, 'language-mismatch');
    }
  }

  if (printed && cardNumber != null) {
    const total = Number(card.set_printed_total);
    const exactTotal = printed.denominator != null && total === printed.denominator;
    const exactNumber = cardNumber === printed.number;
    const suffixNumber = !exactNumber
      && printed.denominator != null
      && total === printed.denominator
      && cardNumber > printed.denominator
      && String(cardNumber).endsWith(String(printed.number));

    if (exactNumber && exactTotal) addScore(breakdown, reasons, 'printedNumber', 54, 'number-total');
    else if (suffixNumber) addScore(breakdown, reasons, 'printedNumber', 40, 'secret-number-suffix');
    else if (exactNumber) addScore(breakdown, reasons, 'printedNumber', 24, 'number');
    else if (exactTotal) addScore(breakdown, reasons, 'printedTotal', 13, 'total');
  }

  const candidateSetCode = normaliseSetCode(card.set_code || card.set_id);
  const signalSetCode = normaliseSetCode(signals.setCode);
  if (signalSetCode && candidateSetCode) {
    if (candidateSetCode === signalSetCode) addScore(breakdown, reasons, 'setCode', 25, 'set-code');
    else if (candidateSetCode.includes(signalSetCode) || signalSetCode.includes(candidateSetCode)) {
      addScore(breakdown, reasons, 'setCode', 14, 'set-code-partial');
    }
  }

  const name = nameScore(card, signals.nameText, signals.text);
  addScore(breakdown, reasons, 'name', name.score, name.reason ?? 'name');

  const releaseYear = releaseYearForCard(card);
  if (signals.releaseYear && releaseYear === signals.releaseYear) {
    addScore(breakdown, reasons, 'releaseYear', 8, 'release-year');
  }

  const variantText = getCardVariantText(card);
  for (const hint of [...signals.rarityHints, ...signals.variantHints]) {
    if (hint && variantText.includes(normaliseForCompare(hint))) {
      addScore(breakdown, reasons, 'variant', 6, `variant:${hint}`);
      break;
    }
  }

  if (visualSimilarity != null && Number.isFinite(visualSimilarity)) {
    const visualScore = Math.max(0, Math.min(18, Math.round(visualSimilarity * 18)));
    addScore(breakdown, reasons, 'artwork', visualScore, 'artwork-shortlist');
  }

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    card,
    score,
    confidence: Math.max(0, Math.min(0.99, score / 100)),
    reasons: [...new Set(reasons)],
    scoreBreakdown: breakdown,
    ambiguousVariant: false,
    visualSimilarity,
  };
}

function sameVariantFamily(a: LocalScanCard, b: LocalScanCard) {
  return compactCompare(a.name) === compactCompare(b.name)
    && normaliseSetCode(a.set_id) === normaliseSetCode(b.set_id)
    && stripLeadingZeroes(a.number) === stripLeadingZeroes(b.number)
    && a.id !== b.id;
}

export function hasIndependentLocalOcrConfirmationEvidence(
  candidate: Pick<LocalOcrCandidateMatch, 'reasons' | 'visualSimilarity'> | null | undefined
) {
  return Boolean(
    candidate?.reasons.includes('artwork-shortlist')
    && candidate.visualSimilarity != null
    && candidate.visualSimilarity >= 0.55
  );
}

export function rankLocalOcrCandidates(
  cards: LocalScanCard[],
  signals: LocalOcrSignals,
  visualScores?: Map<string, number>
) {
  const ranked = cards
    .map((card) => scoreLocalOcrCandidate(card, signals, visualScores?.get(card.id) ?? null))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.map((candidate, index) => {
    const competingVariant = ranked.some((other, otherIndex) => (
      otherIndex !== index
      && other.score >= candidate.score - 10
      && sameVariantFamily(candidate.card, other.card)
    ));
    return { ...candidate, ambiguousVariant: competingVariant };
  });
}

async function collectCandidateCards(signals: LocalOcrSignals, options: MatchOptions) {
  const { getLocalCardIndex } = await import('./localCardIndex');
  const index = await getLocalCardIndex();
  const pool = new Map<string, LocalScanCard>();
  const likelyLanguage = signals.language;
  const printed = signals.printedNumber;
  const setCode = normaliseSetCode(signals.setCode);
  const nameTokens = tokeniseName(signals.nameText);

  for (const card of index?.cards ?? []) {
    if (!card?.id) continue;
    if (!languageMatches(card.language, likelyLanguage)) {
      continue;
    }

    const cardNumber = cardNumberAsNumber(card);
    const total = Number(card.set_printed_total);
    const candidateSetCode = normaliseSetCode(card.set_code || card.set_id);
    const exactNumberTotal = Boolean(
      printed
      && printed.denominator != null
      && cardNumber === printed.number
      && total === printed.denominator
    );
    const numberSuffix = Boolean(
      printed
      && printed.denominator != null
      && total === printed.denominator
      && cardNumber
      && cardNumber > printed.denominator
      && String(cardNumber).endsWith(String(printed.number))
    );
    const setMatches = Boolean(setCode && candidateSetCode && (
      candidateSetCode === setCode
      || candidateSetCode.includes(setCode)
      || setCode.includes(candidateSetCode)
    ));
    const nameMatches = nameTokens.length
      ? nameScore(card, signals.nameText, signals.text).score >= 14
      : false;
    const totalOnly = Boolean(printed?.denominator && total === printed.denominator);

    if (exactNumberTotal || numberSuffix || (setMatches && (nameMatches || totalOnly)) || nameMatches) {
      pool.set(card.id, card);
    }
  }

  if (pool.size === 0 && likelyLanguage !== 'unknown') {
    for (const card of index?.cards ?? []) {
      if (!card?.id) continue;
      const cardNumber = cardNumberAsNumber(card);
      const total = Number(card.set_printed_total);
      if (printed?.denominator != null && cardNumber === printed.number && total === printed.denominator) {
        pool.set(card.id, card);
      }
    }
  }

  return [...pool.values()].slice(0, Math.max(options.maxCandidates ?? 24, 80));
}

async function getArtworkScores(
  candidates: LocalOcrCandidateMatch[],
  options: MatchOptions,
  notes: string[]
) {
  if (!options.scanImageBase64 || options.useArtworkRerank === false || candidates.length <= 1) return null;

  try {
    const { isOnDeviceVisualEnabled, rerankWithOnDeviceVisual } = await import('./onDeviceVisualMatcher');
    if (!isOnDeviceVisualEnabled()) return null;
    const shortlist = candidates.slice(0, 12).map((candidate) => candidate.card);
    const visual = await rerankWithOnDeviceVisual(options.scanImageBase64, shortlist);
    if (visual.status !== 'resolved' || !visual.match?.id || visual.similarity == null) {
      notes.push(`artwork-rerank:${visual.status}`);
      return null;
    }
    return new Map([[visual.match.id, visual.similarity]]);
  } catch (error) {
    notes.push(`artwork-rerank-error:${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function matchLocalOcrCandidates(
  regions: LocalOcrRegionText[],
  options: MatchOptions = {}
): Promise<LocalOcrMatchResult> {
  const startedAt = Date.now();
  const signals = extractLocalOcrSignals(regions);
  const notes: string[] = [];
  const maxCandidates = options.maxCandidates ?? 8;

  if (!SCAN_LOCAL_OCR_MATCHER_ENABLED) {
    return {
      status: 'disabled',
      bestMatch: null,
      candidates: [],
      confidence: 0,
      signals,
      durationMs: Date.now() - startedAt,
      notes,
    };
  }

  if (!signals.text.trim()) {
    return {
      status: 'no-text',
      bestMatch: null,
      candidates: [],
      confidence: 0,
      signals,
      durationMs: Date.now() - startedAt,
      notes,
    };
  }

  const cards = await collectCandidateCards(signals, options);
  if (!cards.length) {
    return {
      status: 'no-candidates',
      bestMatch: null,
      candidates: [],
      confidence: 0,
      signals,
      durationMs: Date.now() - startedAt,
      notes,
    };
  }

  let ranked = rankLocalOcrCandidates(cards, signals);
  const visualScores = await getArtworkScores(ranked, options, notes);
  if (visualScores) ranked = rankLocalOcrCandidates(cards, signals, visualScores);

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const margin = best && second ? best.score - second.score : best ? 99 : 0;
  const strongConfidence = Number.isFinite(Number(options.strongConfidence))
    ? Number(options.strongConfidence)
    : SCAN_LOCAL_OCR_STRONG_CONFIDENCE;
  const ambiguousMarginScore = Number.isFinite(Number(options.ambiguousMarginScore))
    ? Number(options.ambiguousMarginScore)
    : 9;
  const ambiguousSecondMinScore = Number.isFinite(Number(options.ambiguousSecondMinScore))
    ? Number(options.ambiguousSecondMinScore)
    : 65;
  const ambiguous = Boolean(best && (
    best.ambiguousVariant
    || (second && margin < ambiguousMarginScore && second.score >= ambiguousSecondMinScore)
  ));
  const hasIndependentConfirmationEvidence = hasIndependentLocalOcrConfirmationEvidence(best);
  if (best && !hasIndependentConfirmationEvidence && (
    best.reasons.includes('number-total')
    || best.reasons.includes('secret-number-suffix')
    || best.reasons.some((reason) => reason.startsWith('name'))
  )) {
    notes.push('ocr-only-not-auto-accepted');
  }
  const strong = Boolean(
    best
    && !ambiguous
    && best.confidence >= strongConfidence
    && hasIndependentConfirmationEvidence
    && (
      best.reasons.includes('number-total')
      || best.reasons.includes('secret-number-suffix')
      || (best.reasons.some((reason) => reason.startsWith('name')) && best.reasons.includes('set-code'))
      || best.reasons.includes('artwork-shortlist')
    )
  );

  return {
    status: !best ? 'no-candidates' : strong ? 'strong' : ambiguous ? 'ambiguous' : 'weak',
    bestMatch: best,
    candidates: ranked.slice(0, maxCandidates),
    confidence: best?.confidence ?? 0,
    signals,
    durationMs: Date.now() - startedAt,
    notes,
  };
}
