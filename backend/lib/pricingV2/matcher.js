import {
  getCollectorNumberLeft,
  normalizeCollectorNumber,
  normalizeIdentityPart,
  normalizeLanguage,
} from './identity.js';
import { pricingV2Config } from './config.js';

const HARD_EXCLUDE_TERMS = [
  ['lot', /\b(lot|joblot|job lot|bulk|bundle|collection)\b/i],
  ['mystery', /\b(mystery|random|pick your card|choose your card|choose one)\b/i],
  ['proxy', /\b(proxy|custom|fan made|fanmade|replica|reprint|metal card|digital)\b/i],
  ['not_card', /\b(code card|wrapper only|empty box|empty pack|pack wrapper)\b/i],
  ['altered', /\b(altered|painted|damaged only|creases?|poor condition)\b/i],
  ['oversized', /\b(jumbo|oversized|giant card)\b/i],
];

const GRADER_TERMS = ['psa', 'bgs', 'beckett', 'cgc', 'ace', 'sgc', 'ags'];

function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/pok[eé]mon/g, 'pokemon')
    .replace(/[^a-z0-9/\-\s\u3040-\u30ff\u3400-\u9fff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleContainsTerm(title, term) {
  const normalized = normalizeTitle(term);
  if (!normalized) return false;
  return normalizeTitle(title).includes(normalized);
}

function tokenSet(value) {
  return new Set(normalizeTitle(value).split(/\s+/).filter(Boolean));
}

function titleHasName(title, name) {
  const normalizedName = normalizeTitle(name);
  if (!normalizedName) return false;
  if (normalizeTitle(title).includes(normalizedName)) return true;

  const titleTokens = tokenSet(title);
  const important = normalizedName
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['pokemon', 'card', 'the', 'and'].includes(word));
  return important.length > 0 && important.every((word) => titleTokens.has(word));
}

function titleHasCollectorNumber(title, value) {
  const normalizedTitle = normalizeTitle(title);
  const number = normalizeCollectorNumber(value);
  const left = getCollectorNumberLeft(number);
  if (!number && !left) return false;
  if (number && normalizedTitle.includes(number)) return true;
  if (left && new RegExp(`(^|[^a-z0-9])0*${left}([^a-z0-9]|$)`, 'i').test(normalizedTitle)) return true;
  return false;
}

function languageScore(title, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedTitle = normalizeTitle(title);
  const hasJapanese = /[\u3040-\u30ff]/.test(title);
  const hasCjk = /[\u3400-\u9fff]/.test(title);

  if (normalizedLanguage === 'en') {
    if (/\b(japanese|japan|jpn|korean|chinese|zh|taiwan)\b/i.test(normalizedTitle) || hasJapanese || hasCjk) {
      return { score: 0, reason: 'LANGUAGE_MISMATCH' };
    }
    return { score: 1, reason: null };
  }

  if (normalizedLanguage === 'ja') {
    if (/\benglish\b/i.test(normalizedTitle)) return { score: 0, reason: 'LANGUAGE_MISMATCH' };
    if (/\b(japanese|japan|jpn|jp)\b/i.test(normalizedTitle) || hasJapanese) return { score: 1, reason: null };
    return { score: 0.55, reason: 'LANGUAGE_NOT_EXPLICIT' };
  }

  if (normalizedLanguage === 'zh-TW' || normalizedLanguage === 'zh-CN') {
    if (/\benglish\b/i.test(normalizedTitle)) return { score: 0, reason: 'LANGUAGE_MISMATCH' };
    if (/\b(chinese|taiwan|zh|traditional|simplified)\b/i.test(normalizedTitle) || hasCjk) return { score: 1, reason: null };
    return { score: 0.55, reason: 'LANGUAGE_NOT_EXPLICIT' };
  }

  if (normalizedLanguage === 'ko') {
    if (/\benglish\b/i.test(normalizedTitle)) return { score: 0, reason: 'LANGUAGE_MISMATCH' };
    if (/\b(korean|kor)\b/i.test(normalizedTitle) || /[\uac00-\ud7af]/.test(title)) return { score: 1, reason: null };
    return { score: 0.55, reason: 'LANGUAGE_NOT_EXPLICIT' };
  }

  return { score: 0.5, reason: 'LANGUAGE_UNKNOWN' };
}

function productTypeReasons(title, identity) {
  const normalized = normalizeTitle(title);
  const reasons = [];
  const looksGraded = GRADER_TERMS.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(normalized))
    && /\b(1|1\.5|2|2\.5|3|3\.5|4|4\.5|5|5\.5|6|6\.5|7|7\.5|8|8\.5|9|9\.5|10)\b/.test(normalized);

  if (identity.productType === 'raw_card' && (looksGraded || /\b(slab|slabbed|graded)\b/.test(normalized))) {
    reasons.push('GRADED_LISTING_FOR_RAW_CARD');
  }

  if (identity.productType === 'graded_card') {
    const grader = normalizeIdentityPart(identity.gradingCompany, '');
    const grade = normalizeIdentityPart(identity.grade, '');
    if (!grader || !grade) {
      reasons.push('MISSING_GRADED_IDENTITY');
    } else if (!new RegExp(`\\b${grader}\\b`, 'i').test(normalized) || !new RegExp(`\\b${grade}\\b`, 'i').test(normalized)) {
      reasons.push('GRADE_OR_GRADER_MISMATCH');
    }
    if (/\bpsa ready\b|\bready to grade\b|\bpossible psa\b/i.test(normalized)) {
      reasons.push('RAW_CARD_MARKETED_AS_GRADE_CANDIDATE');
    }
  }

  if (identity.productType === 'sealed_product' && !/\b(sealed|booster|box|pack|bundle|etb|tin|collection)\b/.test(normalized)) {
    reasons.push('SEALED_PRODUCT_NOT_CLEAR');
  }

  return reasons;
}

function finishScore(title, identity) {
  const normalized = normalizeTitle(title);
  const finish = normalizeIdentityPart(identity.finish, '');
  if (!finish || finish === 'unknown_finish') return { score: 1, reason: null };

  if (finish === 'masterball_reverse') {
    return /\bmaster\s*ball\b|\bmasterball\b/i.test(normalized)
      ? { score: 1, reason: null }
      : { score: 0, reason: 'FINISH_MISMATCH_MASTERBALL' };
  }
  if (finish === 'pokeball_reverse') {
    return /\bpoke\s*ball\b|\bpokeball\b/i.test(normalized)
      ? { score: 1, reason: null }
      : { score: 0.35, reason: 'FINISH_NOT_EXPLICIT' };
  }
  if (finish === 'reverse_holo') {
    return /\breverse\b/i.test(normalized)
      ? { score: 1, reason: null }
      : { score: 0.45, reason: 'FINISH_NOT_EXPLICIT' };
  }
  if (finish === 'holo') {
    return /\bholo|foil\b/i.test(normalized)
      ? { score: 1, reason: null }
      : { score: 0.65, reason: 'FINISH_NOT_EXPLICIT' };
  }
  return { score: 1, reason: null };
}

export function getHardExclusionReasons(rawObservation, identity = {}) {
  const title = rawObservation?.title ?? '';
  const normalized = normalizeTitle(title);
  const reasons = [];
  const allowLot = identity.productType === 'sealed_product' || normalizeIdentityPart(identity.sealedProductType, '').includes('collection');

  for (const [reason, pattern] of HARD_EXCLUDE_TERMS) {
    if (allowLot && reason === 'lot') continue;
    if (pattern.test(normalized)) reasons.push(reason.toUpperCase());
  }

  return reasons;
}

export function scoreObservationMatch(rawObservation, identity, config = {}) {
  const title = rawObservation?.title ?? '';
  const reasons = getHardExclusionReasons(rawObservation, identity);
  reasons.push(...productTypeReasons(title, identity));

  const weightedScores = [];
  const addScore = (weight, score, reason) => {
    weightedScores.push({ weight, score });
    if (reason && score < 1) reasons.push(reason);
  };

  const observationLanguage = rawObservation?.language ? normalizeLanguage(rawObservation.language) : null;
  const language = observationLanguage === normalizeLanguage(identity.language)
    ? { score: 1, reason: null }
    : observationLanguage && observationLanguage !== normalizeLanguage(identity.language)
      ? { score: 0, reason: 'LANGUAGE_MISMATCH' }
      : languageScore(title, identity.language);
  addScore(0.14, language.score, language.reason);

  if (identity.canonicalCardName || identity.localisedCardNames?.[identity.language]) {
    const hasName = titleHasName(title, identity.canonicalCardName)
      || titleHasName(title, identity.localisedCardNames?.[identity.language])
      || titleHasName(title, identity.localisedCardNames?.en);
    addScore(0.18, hasName ? 1 : 0, 'CARD_NAME_MISSING');
  }

  if (identity.cardNumber) {
    addScore(0.24, titleHasCollectorNumber(title, identity.printedCardNumber || identity.cardNumber) ? 1 : 0, 'COLLECTOR_NUMBER_MISSING');
  }

  if (identity.canonicalSetName || identity.localisedSetNames?.[identity.language] || identity.setCode) {
    const hasSet = titleHasName(title, identity.canonicalSetName)
      || titleHasName(title, identity.localisedSetNames?.[identity.language])
      || titleHasName(title, identity.localisedSetNames?.en)
      || (identity.setCode && titleContainsTerm(title, identity.setCode));
    addScore(0.16, hasSet ? 1 : 0.35, hasSet ? null : 'SET_NOT_EXPLICIT');
  }

  const finish = finishScore(title, identity);
  addScore(0.08, finish.score, finish.reason);

  if (identity.edition && !['modern', 'other'].includes(identity.edition)) {
    const editionTerm = identity.edition === 'first_edition' ? /1st|first edition/i : new RegExp(identity.edition.replace(/_/g, '[ -]?'), 'i');
    addScore(0.08, editionTerm.test(title) ? 1 : 0, 'EDITION_MISMATCH');
  }

  addScore(0.12, reasons.length ? 0 : 1, reasons[0] ?? null);

  const availableWeight = weightedScores.reduce((sum, row) => sum + row.weight, 0) || 1;
  const score = weightedScores.reduce((sum, row) => sum + row.weight * row.score, 0) / availableWeight;
  const finalScore = Math.max(0, Math.min(1, Number(score.toFixed(4))));
  const minimum = config.minimumMatchScore ?? pricingV2Config.minimumMatchScore;
  const uniqueReasons = [...new Set(reasons)];
  const accepted = uniqueReasons.length === 0 && finalScore >= minimum;

  return {
    score: finalScore,
    accepted,
    reasons: accepted ? ['ACCEPTED'] : uniqueReasons.length ? uniqueReasons : [`LOW_MATCH_SCORE_${finalScore}`],
    explanation: accepted
      ? `Accepted with ${(finalScore * 100).toFixed(0)}% match: identity terms align.`
      : `Rejected with ${(finalScore * 100).toFixed(0)}% match: ${(uniqueReasons[0] ?? 'low match score').replace(/_/g, ' ').toLowerCase()}.`,
  };
}

export { normalizeTitle };
