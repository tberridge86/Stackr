import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STORAGE_KEY = 'stackr:local-card-index:v1';
const BUILT_AT_KEY = 'stackr:local-card-index-built-at:v1';
const CHUNK_COUNT_KEY = 'stackr:local-card-index-chunks:v1';
const CHUNK_KEY_PREFIX = 'stackr:local-card-index-chunk:v1:';
const PAGE_SIZE = 1000;
const STORAGE_CHUNK_SIZE = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type LocalScanCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total: number | null;
  image_small: string;
  rarity: string;
};

export type LocalPrintedNumberSignal = {
  number: number;
  total: number;
  region?: string;
  ocrText?: string;
};

export type LocalFusionResolveResult = {
  match: LocalScanCard | null;
  candidates: LocalScanCard[];
  confidence: number;
  resolvedBy: string | null;
  reason?: string;
};

type LocalIndexPayload = {
  cards: LocalScanCard[];
  byNumberTotal: Record<string, number[]>;
};

let memoryIndex: LocalIndexPayload | null = null;
let loadingPromise: Promise<LocalIndexPayload | null> | null = null;

function getPrintedTotal(rawData: any) {
  const total = Number(rawData?.set?.printedTotal ?? rawData?.set?.total ?? NaN);
  return Number.isFinite(total) ? total : null;
}

function toScanCard(row: any): LocalScanCard {
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? '',
    set_id: row.set_id,
    set_name: row.raw_data?.set?.name ?? row.set_id,
    set_printed_total: getPrintedTotal(row.raw_data),
    image_small: row.image_small ?? '',
    rarity: row.rarity ?? '',
  };
}

function keyFor(number: number | string, total: number | string) {
  return `${Number(number)}/${Number(total)}`;
}

function normalizeOcrText(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameAppearsInText(name: string, text: string) {
  const normalizedName = normalizeOcrText(name);
  if (normalizedName.length < 3) return false;
  return new RegExp(`(?:^| )${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(text);
}

function inferPrintedTotalsFromText(text?: string | null) {
  if (!text) return [];
  const normalised = String(text)
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  const totals = [...normalised.matchAll(/(?:\/|\uFF0F|\u2044|\u2215)\s*0?(\d{2,3})(?=\D|$)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(totals)];
}

function isBroadNumberRegion(region?: string | null) {
  return region === 'bottom-band'
    || region === 'bottom-left'
    || region === 'number-fast-lower-half'
    || region === 'lower-half'
    || region === 'full-card';
}

function isSuspiciousPrintedNumber(printedNumber?: LocalPrintedNumberSignal | null) {
  if (!printedNumber) return false;
  if (printedNumber.number < 1 || printedNumber.total < 1) return true;
  return printedNumber.number < 100
    && printedNumber.number <= printedNumber.total
    && isBroadNumberRegion(printedNumber.region);
}

function addCandidates(target: Map<string, LocalScanCard>, cards?: LocalScanCard[] | null) {
  for (const card of cards ?? []) {
    target.set(card.id, card);
  }
}

function isHighRarity(card: LocalScanCard) {
  return /rare|secret|illustration|special|hyper|ultra/i.test(card.rarity ?? '');
}

function getDuplicateSecretTieBreak(scored: { card: LocalScanCard; score: number; reasons: string[] }[]) {
  const topScore = scored[0]?.score;
  if (topScore == null) return null;

  const tied = scored.filter((item) => item.score === topScore && item.reasons.includes('name'));
  if (tied.length < 2 || tied.length > 4) return null;

  const names = new Set(tied.map((item) => normalizeOcrText(item.card.name)));
  const sets = new Set(tied.map((item) => item.card.set_id));
  const totals = new Set(tied.map((item) => item.card.set_printed_total));
  if (names.size !== 1 || sets.size !== 1 || totals.size !== 1) return null;

  const secretCandidates = tied.filter((item) => {
    const number = Number.parseInt(item.card.number, 10);
    const total = item.card.set_printed_total;
    return Boolean(total && number > total && isHighRarity(item.card));
  });

  return secretCandidates.length === 1 ? secretCandidates[0] : null;
}

function buildIndex(cards: LocalScanCard[]): LocalIndexPayload {
  const byNumberTotal: Record<string, number[]> = {};

  cards.forEach((card, index) => {
    const total = card.set_printed_total;
    const number = Number.parseInt(card.number, 10);
    if (!Number.isFinite(number) || !total) return;

    const key = keyFor(number, total);
    byNumberTotal[key] = byNumberTotal[key] ?? [];
    byNumberTotal[key].push(index);
  });

  return { cards, byNumberTotal };
}

async function fetchAllScanCards() {
  const cards: LocalScanCard[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, image_small, set_id, raw_data')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    cards.push(...rows.map(toScanCard));
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return cards;
}

async function loadStoredIndex() {
  try {
    const [builtAtRaw, chunkCountRaw] = await Promise.all([
      AsyncStorage.getItem(BUILT_AT_KEY),
      AsyncStorage.getItem(CHUNK_COUNT_KEY),
    ]);

    if (!builtAtRaw || !chunkCountRaw) return null;
    const builtAt = Number(builtAtRaw);
    const chunkCount = Number(chunkCountRaw);
    if (!Number.isFinite(builtAt) || Date.now() - builtAt > MAX_AGE_MS) return null;
    if (!Number.isFinite(chunkCount) || chunkCount <= 0) return null;

    const chunkKeys = Array.from({ length: chunkCount }, (_, index) => `${CHUNK_KEY_PREFIX}${index}`);
    const chunks = await AsyncStorage.multiGet(chunkKeys);
    const cards = chunks.flatMap(([, raw]) => (raw ? JSON.parse(raw) as LocalScanCard[] : []));
    return buildIndex(cards);
  } catch (error) {
    console.log('Local card index load failed:', error);
    return null;
  }
}

async function storeIndex(cards: LocalScanCard[]) {
  const chunks: [string, string][] = [];
  for (let index = 0; index < cards.length; index += STORAGE_CHUNK_SIZE) {
    chunks.push([
      `${CHUNK_KEY_PREFIX}${chunks.length}`,
      JSON.stringify(cards.slice(index, index + STORAGE_CHUNK_SIZE)),
    ]);
  }

  await AsyncStorage.multiRemove([STORAGE_KEY]);
  await AsyncStorage.multiSet([
    [BUILT_AT_KEY, String(Date.now())],
    [CHUNK_COUNT_KEY, String(chunks.length)],
    ...chunks,
  ]);
}

export async function getLocalCardIndex() {
  if (memoryIndex) return memoryIndex;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const stored = await loadStoredIndex();
    if (stored) {
      memoryIndex = stored;
      return stored;
    }

    const cards = await fetchAllScanCards();
    const index = buildIndex(cards);
    memoryIndex = index;
    await storeIndex(cards);
    return index;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export async function lookupLocalCardsByPrintedNumber(
  printedNumber?: { number: number; total: number } | null,
  setId?: string | null,
  options?: { allowBuild?: boolean }
) {
  if (!printedNumber) return null;

  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const ids = index.byNumberTotal[keyFor(printedNumber.number, printedNumber.total)] ?? [];
  const cards = ids
    .map((id) => index.cards[id])
    .filter((card) => card && (!setId || card.set_id === setId));

  return cards;
}

export async function lookupLocalCardsByPrintedTotal(
  total?: number | null,
  setId?: string | null,
  options?: { allowBuild?: boolean; limit?: number }
) {
  if (!total) return null;

  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const limit = options?.limit ?? 160;
  return index.cards
    .filter((card) => card.set_printed_total === total && (!setId || card.set_id === setId))
    .slice(0, limit);
}

export async function lookupLocalCardsBySet(
  setId?: string | null,
  options?: { allowBuild?: boolean; limit?: number }
) {
  if (!setId) return null;

  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const limit = options?.limit ?? 300;
  return index.cards
    .filter((card) => card.set_id === setId)
    .slice(0, limit);
}

export async function lookupLocalCardsByNameText(
  ocrText?: string | null,
  setId?: string | null,
  options?: { allowBuild?: boolean; limit?: number }
) {
  if (!ocrText) return null;

  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const text = normalizeOcrText(ocrText);

  if (!text) return null;

  const limit = options?.limit ?? 80;
  return index.cards
    .filter((card) => {
      if (setId && card.set_id !== setId) return false;
      return nameAppearsInText(card.name, text);
    })
    .slice(0, limit);
}

export function resolveLocalCardsByName(cards: LocalScanCard[], ocrText?: string | null) {
  const text = normalizeOcrText(ocrText);

  if (!text) return null;

  const matches = cards.filter((card) => {
    return nameAppearsInText(card.name, text);
  });

  return matches.length === 1 ? matches[0] : null;
}

export async function lookupLocalCardByNameAndTotal(
  total?: number | null,
  ocrText?: string | null,
  setId?: string | null
) {
  if (!total || !ocrText) return null;

  const index = memoryIndex ?? await loadStoredIndex();
  if (!index) return null;
  memoryIndex = index;

  const text = normalizeOcrText(ocrText);

  if (!text) return null;

  const matches = index.cards.filter((card) => {
    if (card.set_printed_total !== total) return false;
    if (setId && card.set_id !== setId) return false;
    return nameAppearsInText(card.name, text);
  });

  return matches.length === 1 ? matches[0] : null;
}

export async function lookupLocalCardByNameTotalAndNumberHint(
  total?: number | null,
  ocrText?: string | null,
  printedNumber?: { number: number; total: number } | null,
  setId?: string | null
) {
  if (!total || !ocrText) return null;

  const index = memoryIndex ?? await loadStoredIndex();
  if (!index) return null;
  memoryIndex = index;

  const text = normalizeOcrText(ocrText);
  if (!text) return null;

  const matches = index.cards.filter((card) => {
    if (card.set_printed_total !== total) return false;
    if (setId && card.set_id !== setId) return false;
    return nameAppearsInText(card.name, text);
  });

  if (matches.length === 1) return matches[0];

  const numberHint = printedNumber?.number;
  if (!numberHint || matches.length === 0) return null;

  const exactMatches = matches.filter((card) => Number.parseInt(card.number, 10) === numberHint);
  if (exactMatches.length === 1) return exactMatches[0];

  if (numberHint < 100) {
    const suffixMatches = matches.filter((card) => String(Number.parseInt(card.number, 10)).endsWith(String(numberHint)));
    if (suffixMatches.length === 1) return suffixMatches[0];
  }

  return null;
}

export async function resolveLocalCardByFusion(
  signals: {
    printedNumber?: LocalPrintedNumberSignal | null;
    nameText?: string | null;
    totalHintText?: string | null;
    setId?: string | null;
  },
  options?: { allowBuild?: boolean }
): Promise<LocalFusionResolveResult | null> {
  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const printedNumber = signals.printedNumber ?? null;
  const nameText = normalizeOcrText(signals.nameText);
  const combinedText = normalizeOcrText(`${signals.printedNumber?.ocrText ?? ''}\n${signals.nameText ?? ''}\n${signals.totalHintText ?? ''}`);
  const inferredTotals = new Set([
    ...(printedNumber?.total ? [printedNumber.total] : []),
    ...inferPrintedTotalsFromText(signals.totalHintText),
    ...inferPrintedTotalsFromText(signals.nameText),
    ...inferPrintedTotalsFromText(printedNumber?.ocrText),
  ]);
  const setId = signals.setId ?? null;
  const suspiciousNumber = isSuspiciousPrintedNumber(printedNumber);
  const pool = new Map<string, LocalScanCard>();

  if (printedNumber?.number && printedNumber.total) {
    const exactIds = index.byNumberTotal[keyFor(printedNumber.number, printedNumber.total)] ?? [];
    addCandidates(pool, exactIds.map((id) => index.cards[id]));
  }

  if (inferredTotals.size > 0) {
    addCandidates(pool, index.cards.filter((card) => (
      card.set_printed_total != null
      && inferredTotals.has(card.set_printed_total)
      && (!setId || card.set_id === setId)
    )));
  }

  if (nameText) {
    addCandidates(pool, index.cards.filter((card) => (
      (!setId || card.set_id === setId)
      && nameAppearsInText(card.name, nameText)
    )));
  }

  if (setId) {
    addCandidates(pool, index.cards.filter((card) => card.set_id === setId));
  }

  const candidates = [...pool.values()].filter((card) => !setId || card.set_id === setId);
  if (candidates.length === 0) {
    return { match: null, candidates: [], confidence: 0, resolvedBy: null, reason: 'no-candidates' };
  }

  const scored = candidates.map((card) => {
    const cardNumber = Number.parseInt(card.number, 10);
    const totalMatches = card.set_printed_total != null && inferredTotals.has(card.set_printed_total);
    const exactNumber = printedNumber?.number != null && cardNumber === printedNumber.number;
    const suffixNumber = Boolean(
      suspiciousNumber
      && printedNumber?.number
      && String(cardNumber).endsWith(String(printedNumber.number))
    );
    const nameMatches = Boolean(nameText && nameAppearsInText(card.name, nameText));
    const combinedNameMatches = Boolean(combinedText && nameAppearsInText(card.name, combinedText));

    let score = 0;
    const reasons: string[] = [];

    if (setId && card.set_id === setId) {
      score += 35;
      reasons.push('set');
    }

    if (totalMatches) {
      score += 35;
      reasons.push('total');
    }

    if (exactNumber) {
      score += suspiciousNumber ? 12 : 60;
      reasons.push(suspiciousNumber ? 'weak-number' : 'number');
    }

    if (suffixNumber && !exactNumber) {
      score += 50;
      reasons.push('number-suffix');
    }

    if (nameMatches || combinedNameMatches) {
      score += 70;
      reasons.push('name');
    } else if (nameText) {
      score -= suspiciousNumber ? 70 : 25;
      reasons.push('name-missing');
    }

    if (suspiciousNumber && exactNumber && nameText && !nameMatches && !combinedNameMatches) {
      score -= 70;
      reasons.push('suspicious-exact-rejected');
    }

    return { card, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const duplicateSecretTieBreak = getDuplicateSecretTieBreak(scored);
  const selected = duplicateSecretTieBreak ?? best;
  const margin = selected.score - (second?.card.id === selected.card.id ? (scored[2]?.score ?? 0) : (second?.score ?? 0));
  const selectedScore = duplicateSecretTieBreak ? selected.score + 18 : selected.score;
  const confidence = Math.max(0, Math.min(99, selectedScore));
  const exactNumberTotalMatches = printedNumber?.number && printedNumber.total
    ? candidates.filter((card) => (
      Number.parseInt(card.number, 10) === printedNumber.number
      && card.set_printed_total === printedNumber.total
    ))
    : [];
  const selectedIsExactNumberTotal = exactNumberTotalMatches.some((card) => card.id === selected.card.id);
  const selectedIsSecretSuffix = Boolean(
    printedNumber?.number
    && selected.card.set_printed_total
    && Number.parseInt(selected.card.number, 10) > selected.card.set_printed_total
    && String(Number.parseInt(selected.card.number, 10)).endsWith(String(printedNumber.number))
  );
  const hasSecretSuffixEvidence = selectedIsSecretSuffix
    && selected.reasons.includes('name')
    && selected.reasons.includes('total')
    && selected.reasons.includes('number-suffix');
  const hasConflictingExactNumberTotal = exactNumberTotalMatches.length === 1
    && !selectedIsExactNumberTotal
    && !hasSecretSuffixEvidence;
  const hasTieBreakerEvidence = selected.reasons.includes('name') || selected.reasons.includes('set');
  const strongEnough = !hasConflictingExactNumberTotal && (
    Boolean(duplicateSecretTieBreak)
    || (hasSecretSuffixEvidence && selectedScore >= 120 && margin >= 35)
    || (selectedScore >= 90 && (candidates.length === 1 || margin >= 15 || hasTieBreakerEvidence))
    || (selectedScore >= 75 && margin >= 15)
  );

  console.log('Local fusion resolver:', {
    best: `${selected.card.name} (${selected.card.set_name}) #${selected.card.number}`,
    score: selectedScore,
    margin,
    reasons: duplicateSecretTieBreak ? [...selected.reasons, 'duplicate-secret'] : selected.reasons,
    candidates: candidates.length,
    runnerUp: second ? `${second.card.name} (${second.card.set_name}) #${second.card.number}` : null,
    runnerUpScore: second?.score ?? null,
  });

  return {
    match: strongEnough ? selected.card : null,
    candidates: scored.slice(0, 25).map((item) => item.card),
    confidence,
    resolvedBy: strongEnough
      ? `local-fusion:${(duplicateSecretTieBreak ? [...selected.reasons, 'duplicate-secret'] : selected.reasons).join('+')}`
      : null,
    reason: strongEnough ? undefined : 'ambiguous',
  };
}

export function warmLocalCardIndex() {
  getLocalCardIndex().catch((error) => {
    console.log('Local card index warmup failed:', error);
  });
}
