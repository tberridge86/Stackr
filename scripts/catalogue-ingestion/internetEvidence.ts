import { createHash } from 'node:crypto';

import {
  cleanText,
  normaliseLanguageCode,
  normaliseName,
  normaliseVariantCode,
} from './sourceAdapter';

export const INTERNET_EVIDENCE_SCHEMA_VERSION = 'stackr-internet-recognition-evidence-v1.0.0';
export const INTERNET_FINGERPRINT_SCHEMA_VERSION = 'stackr-recognition-metadata-fingerprint-v1.0.0';

export type RecognitionMetadataFingerprintInput = {
  variantId: string;
  printingId?: string | null;
  languageCode: string;
  setCode: string;
  collectorNumber: string;
  nativeName: string;
  englishDisplayName?: string | null;
  aliases?: string[];
  setNames?: string[];
  variantCode?: string | null;
  finishCode?: string | null;
  rarityCode?: string | null;
  regulationMark?: string | null;
  artist?: string | null;
  referenceImageSha256?: string | null;
  referenceImagePerceptualHash?: string | null;
};

export type RecognitionMetadataFingerprint = {
  schemaVersion: typeof INTERNET_FINGERPRINT_SCHEMA_VERSION;
  variantId: string;
  printingId: string | null;
  languageCode: string;
  setCode: string;
  collectorNumber: string;
  nativeName: string;
  englishDisplayName: string | null;
  names: string[];
  setNames: string[];
  variantCode: string;
  finishCode: string | null;
  rarityCode: string | null;
  regulationMark: string | null;
  artist: string | null;
  referenceImageSha256: string | null;
  referenceImagePerceptualHash: string | null;
  fingerprintSha256: string;
};

export type InternetListingSummary = {
  sourceItemId: string;
  sourceUrl?: string | null;
  title: string;
  condition?: string | null;
  imageUrls?: string[];
  aspects?: Array<{ name?: string | null; value?: string | null }>;
  itemCreationDate?: string | null;
  query?: string | null;
};

export type ListingEvidenceAssessment = {
  schemaVersion: typeof INTERNET_EVIDENCE_SCHEMA_VERSION;
  identityStatus: 'confirmed' | 'probable' | 'candidate_only' | 'rejected';
  variantStatus: 'confirmed' | 'unresolved' | 'conflict' | 'not_applicable';
  confidenceBand: 'high' | 'medium' | 'low' | 'rejected';
  collectorNumbers: string[];
  collectorNumberMatch: boolean;
  setCodeMatch: boolean;
  nameMatch: boolean;
  matchedName: string | null;
  explicitLanguage: string | null;
  languageMatch: boolean | null;
  finishSignals: string[];
  translatedSignals: string[];
  imageUrls: string[];
  reasons: string[];
  conflicts: string[];
  independentImageValidation: 'pending_download_and_hash' | 'missing_image';
  eligibleForIndependentBenchmark: boolean;
  automaticCatalogueMutationAllowed: false;
  provenanceSha256: string;
};

export type HashedInternetImage = {
  sourceItemId: string;
  imageUrl: string;
  contentSha256: string;
  perceptualHash?: string | null;
};

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function uniqueText(values: unknown[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = normaliseName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function compact(value: unknown): string {
  return normaliseName(value)
    .replace(/pokémon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, '');
}

export function evidenceSetCodeMatches(text: unknown, setCode: unknown): boolean {
  const haystack = String(text ?? '').normalize('NFKC').toLowerCase();
  const expected = String(setCode ?? '').normalize('NFKC').trim().toLowerCase();
  if (!haystack || !expected) return false;
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'iu').test(haystack);
}

export function normaliseEvidenceCollectorNumber(value: unknown): string {
  const raw = String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/^#/, '');
  return raw
    .replace(/\s+/g, '')
    .split('/')
    .map((part) => {
      const cleaned = part.replace(/[^a-z0-9-]/g, '');
      return /^\d+$/.test(cleaned) ? (cleaned.replace(/^0+/, '') || '0') : cleaned;
    })
    .join('/');
}

function collectorMatches(left: unknown, right: unknown): boolean {
  const candidate = normaliseEvidenceCollectorNumber(left);
  const expected = normaliseEvidenceCollectorNumber(right);
  if (!candidate || !expected) return false;
  if (candidate === expected) return true;
  if (!candidate.includes('/') || !expected.includes('/')) {
    return candidate.split('/')[0] === expected.split('/')[0];
  }
  return false;
}

function validSha256(value: unknown): string | null {
  const text = cleanText(value)?.toLowerCase() ?? null;
  return text && /^[0-9a-f]{64}$/.test(text) ? text : null;
}

export function buildRecognitionMetadataFingerprint(
  input: RecognitionMetadataFingerprintInput,
): RecognitionMetadataFingerprint {
  const variantId = cleanText(input.variantId);
  const setCode = cleanText(input.setCode);
  const collectorNumber = cleanText(input.collectorNumber);
  const nativeName = cleanText(input.nativeName);
  if (!variantId || !setCode || !collectorNumber || !nativeName) {
    throw new Error('Recognition metadata fingerprints require variantId, setCode, collectorNumber, and nativeName.');
  }
  const languageCode = normaliseLanguageCode(input.languageCode);
  if (!['en', 'ja', 'zh-cn', 'zh-tw'].includes(languageCode)) {
    throw new Error(`Recognition internet evidence is launch-language only; received ${languageCode}.`);
  }
  const names = uniqueText([nativeName, input.englishDisplayName, ...(input.aliases ?? [])]);
  const setNames = uniqueText([setCode, ...(input.setNames ?? [])]);
  const identity = {
    schemaVersion: INTERNET_FINGERPRINT_SCHEMA_VERSION as typeof INTERNET_FINGERPRINT_SCHEMA_VERSION,
    variantId,
    printingId: cleanText(input.printingId),
    languageCode,
    setCode,
    collectorNumber,
    nativeName,
    englishDisplayName: cleanText(input.englishDisplayName),
    names,
    setNames,
    variantCode: normaliseVariantCode(input.variantCode ?? 'normal'),
    finishCode: cleanText(input.finishCode) ? normaliseVariantCode(input.finishCode) : null,
    rarityCode: cleanText(input.rarityCode),
    regulationMark: cleanText(input.regulationMark),
    artist: cleanText(input.artist),
    referenceImageSha256: validSha256(input.referenceImageSha256),
    referenceImagePerceptualHash: cleanText(input.referenceImagePerceptualHash)?.toLowerCase() ?? null,
  };
  return {
    ...identity,
    fingerprintSha256: sha256(identity),
  };
}

const LANGUAGE_PATTERNS: Array<{ language: string; patterns: RegExp[] }> = [
  { language: 'ja', patterns: [/\bjapanese\b/i, /\bjapan(?:ese)?\b/i, /\bjpn\b/i, /\bjp\b/i, /日本語/u, /日本版/u] },
  { language: 'zh-cn', patterns: [/simplified\s+chinese/i, /chinese\s+simplified/i, /\bzh[\s_-]?cn\b/i, /简体中文/u, /簡體中文/u, /大陆版/u] },
  { language: 'zh-tw', patterns: [/traditional\s+chinese/i, /chinese\s+traditional/i, /taiwan(?:ese)?\s+chinese/i, /\bzh[\s_-]?tw\b/i, /繁體中文/u, /繁体中文/u, /台灣版/u] },
  { language: 'en', patterns: [/\benglish\b/i, /\beng\b/i] },
];

const CONTROLLED_TERMS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: 'master_ball', patterns: [/master\s*ball/i, /masterball/i, /マスターボール/u, /大师球/u, /大師球/u] },
  { code: 'poke_ball', patterns: [/pok[eé]\s*ball/i, /pokeball/i, /モンスターボール/u, /精灵球/u, /精靈球/u] },
  { code: 'reverse_holo', patterns: [/reverse\s*(?:holo|foil)?/i, /リバース/u, /ミラー/u, /反向(?:闪|閃)?/u, /逆向(?:闪|閃)?/u] },
  { code: 'non_holo', patterns: [/non[\s-]?holo/i, /非闪/u, /非閃/u] },
  { code: 'holo', patterns: [/\bholo(?:foil)?\b/i, /ホロ/u, /キラ/u, /闪卡/u, /閃卡/u] },
  { code: 'textured', patterns: [/\b(?:sar|sir|sr|ur|hr)\b/i, /textured/i, /スペシャルアート/u, /特殊艺术/u, /特殊藝術/u] },
  { code: 'first_edition', patterns: [/\b1st\b/i, /first\s+edition/i, /初版/u] },
  { code: 'promo', patterns: [/\bpromo(?:tional)?\b/i, /プロモ/u, /宣传/u, /宣傳/u] },
  { code: 'graded', patterns: [/\b(?:psa|bgs|cgc)\s*(?:10|9\.5|9|8\.5|8)\b/i] },
];

function listingHaystack(listing: InternetListingSummary): string {
  const aspects = (listing.aspects ?? []).flatMap((aspect) => [aspect.name, aspect.value]);
  return uniqueText([listing.title, listing.condition, ...aspects]).join(' ').normalize('NFKC');
}

function explicitLanguage(text: string): string | null {
  const matches = LANGUAGE_PATTERNS.filter((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return matches.length === 1 ? matches[0].language : null;
}

function collectorNumbers(text: string): string[] {
  const values = [...text.matchAll(/(?:^|[^a-z0-9])([a-z]?[0-9]{1,4}[a-z]?)[\s]*(?:\/|／)[\s]*([0-9]{1,4}[a-z]?)(?=$|[^a-z0-9])/giu)]
    .map((match) => normaliseEvidenceCollectorNumber(`${match[1]}/${match[2]}`));
  return [...new Set(values.filter(Boolean))];
}

function controlledTerms(text: string): string[] {
  return CONTROLLED_TERMS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.code);
}

function listingFinishSignals(signals: string[]): string[] {
  if (signals.includes('master_ball')) return ['master_ball'];
  if (signals.includes('poke_ball')) return ['poke_ball'];
  if (signals.includes('non_holo')) return ['normal'];
  if (signals.includes('reverse_holo')) return ['reverse_holo'];
  if (signals.includes('textured')) return ['textured'];
  if (signals.includes('holo')) return ['holo'];
  return [];
}

export function buildListingQueries(
  fingerprint: RecognitionMetadataFingerprint,
  limit = 4,
): string[] {
  const languageTerms: Record<string, string[]> = {
    en: ['English'],
    ja: ['Japanese', 'JPN'],
    'zh-cn': ['Simplified Chinese', 'zh-cn'],
    'zh-tw': ['Traditional Chinese', 'zh-tw'],
  };
  const finishTerms: Record<string, string[]> = {
    master_ball: ['Master Ball reverse'],
    poke_ball: ['Poke Ball reverse'],
    reverse_holo: ['reverse holo'],
    holo: ['holo'],
    first_edition: ['1st edition'],
  };
  const queries: string[] = [];
  for (const name of fingerprint.names.slice(0, 3)) {
    queries.push([
      name,
      fingerprint.collectorNumber,
      fingerprint.setCode,
      ...(languageTerms[fingerprint.languageCode] ?? []).slice(0, 1),
      ...(finishTerms[fingerprint.finishCode ?? fingerprint.variantCode] ?? []).slice(0, 1),
      'Pokemon card',
    ].filter(Boolean).join(' '));
  }
  queries.push([
    fingerprint.collectorNumber,
    ...fingerprint.setNames.slice(0, 1),
    ...(languageTerms[fingerprint.languageCode] ?? []).slice(0, 1),
    'Pokemon card',
  ].filter(Boolean).join(' '));
  return uniqueText(queries).slice(0, Math.max(1, limit));
}

export function assessInternetListingEvidence(
  fingerprint: RecognitionMetadataFingerprint,
  listing: InternetListingSummary,
): ListingEvidenceAssessment {
  const text = listingHaystack(listing);
  const compactText = compact(text);
  const numbers = collectorNumbers(text);
  const numberMatch = numbers.some((number) => collectorMatches(number, fingerprint.collectorNumber));
  const collectorConflict = numbers.length > 0 && !numberMatch;
  const setCodeMatch = evidenceSetCodeMatches(text, fingerprint.setCode);
  const matchedName = fingerprint.names.find((name) => compactText.includes(compact(name))) ?? null;
  const nameMatch = Boolean(matchedName);
  const detectedLanguage = explicitLanguage(text);
  const languageMatch = detectedLanguage ? detectedLanguage === fingerprint.languageCode : null;
  const signals = controlledTerms(text);
  const finishSignals = listingFinishSignals(signals);
  const expectedFinish = fingerprint.finishCode ?? fingerprint.variantCode;
  const variantStatus = !expectedFinish || expectedFinish === 'normal' && finishSignals.length === 0
    ? 'unresolved'
    : finishSignals.length === 0
      ? 'unresolved'
      : finishSignals.includes(expectedFinish)
        ? 'confirmed'
        : 'conflict';
  const imageUrls = uniqueText(listing.imageUrls ?? []).filter((value) => /^https:\/\//i.test(value));
  const conflicts: string[] = [];
  if (collectorConflict) conflicts.push('collector_number_conflict');
  if (languageMatch === false) conflicts.push('language_conflict');
  if (variantStatus === 'conflict') conflicts.push('finish_or_variant_conflict');

  let identityStatus: ListingEvidenceAssessment['identityStatus'] = 'candidate_only';
  if (collectorConflict || languageMatch === false) identityStatus = 'rejected';
  else if (numberMatch && (setCodeMatch || nameMatch)) identityStatus = 'confirmed';
  else if (numberMatch || (setCodeMatch && nameMatch)) identityStatus = 'probable';

  const reasons: string[] = [];
  if (numberMatch) reasons.push('collector_number_agreement');
  if (setCodeMatch) reasons.push('set_code_agreement');
  if (nameMatch) reasons.push('catalogue_name_or_alias_agreement');
  if (languageMatch === true) reasons.push('explicit_language_agreement');
  if (variantStatus === 'confirmed') reasons.push('finish_or_variant_agreement');
  if (imageUrls.length > 0) reasons.push('listing_image_available');

  const confidenceBand: ListingEvidenceAssessment['confidenceBand'] = identityStatus === 'rejected'
    ? 'rejected'
    : identityStatus === 'confirmed' && reasons.length >= 4
      ? 'high'
      : identityStatus === 'confirmed' || identityStatus === 'probable'
        ? 'medium'
        : 'low';
  const eligibleForIndependentBenchmark = identityStatus === 'confirmed' && imageUrls.length > 0;
  const provenance = {
    sourceItemId: listing.sourceItemId,
    sourceUrl: cleanText(listing.sourceUrl),
    title: listing.title,
    imageUrls,
    query: cleanText(listing.query),
    fingerprintSha256: fingerprint.fingerprintSha256,
  };
  return {
    schemaVersion: INTERNET_EVIDENCE_SCHEMA_VERSION,
    identityStatus,
    variantStatus: expectedFinish ? variantStatus : 'not_applicable',
    confidenceBand,
    collectorNumbers: numbers,
    collectorNumberMatch: numberMatch,
    setCodeMatch,
    nameMatch,
    matchedName,
    explicitLanguage: detectedLanguage,
    languageMatch,
    finishSignals,
    translatedSignals: signals,
    imageUrls,
    reasons: [...new Set(reasons)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
    independentImageValidation: imageUrls.length > 0 ? 'pending_download_and_hash' : 'missing_image',
    eligibleForIndependentBenchmark,
    automaticCatalogueMutationAllowed: false,
    provenanceSha256: sha256(provenance),
  };
}

function hammingDistanceHex(left: string, right: string): number | null {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || a.length !== b.length || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return null;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const xor = Number.parseInt(a[index], 16) ^ Number.parseInt(b[index], 16);
    distance += xor.toString(2).replace(/0/g, '').length;
  }
  return distance;
}

export function selectIndependentListingImages(
  fingerprint: RecognitionMetadataFingerprint,
  images: HashedInternetImage[],
  options: { maximumPerListing?: number; perceptualHashDistanceFloor?: number } = {},
) {
  const maximumPerListing = Math.max(1, options.maximumPerListing ?? 2);
  const perceptualHashDistanceFloor = Math.max(0, options.perceptualHashDistanceFloor ?? 4);
  const accepted: HashedInternetImage[] = [];
  const excluded: Array<HashedInternetImage & { exclusionReason: string }> = [];
  const acceptedPerListing = new Map<string, number>();
  const seenContentHashes = new Set<string>();

  for (const image of images) {
    const contentSha256 = validSha256(image.contentSha256);
    if (!contentSha256) {
      excluded.push({ ...image, exclusionReason: 'invalid_content_sha256' });
      continue;
    }
    if (contentSha256 === fingerprint.referenceImageSha256) {
      excluded.push({ ...image, exclusionReason: 'same_bytes_as_reference_image' });
      continue;
    }
    if (seenContentHashes.has(contentSha256)) {
      excluded.push({ ...image, exclusionReason: 'duplicate_listing_image_bytes' });
      continue;
    }
    const distance = image.perceptualHash && fingerprint.referenceImagePerceptualHash
      ? hammingDistanceHex(image.perceptualHash, fingerprint.referenceImagePerceptualHash)
      : null;
    if (distance != null && distance < perceptualHashDistanceFloor) {
      excluded.push({ ...image, exclusionReason: 'near_duplicate_of_reference_image' });
      continue;
    }
    const currentListingCount = acceptedPerListing.get(image.sourceItemId) ?? 0;
    if (currentListingCount >= maximumPerListing) {
      excluded.push({ ...image, exclusionReason: 'per_listing_image_limit' });
      continue;
    }
    accepted.push({ ...image, contentSha256 });
    seenContentHashes.add(contentSha256);
    acceptedPerListing.set(image.sourceItemId, currentListingCount + 1);
  }
  return { accepted, excluded };
}
