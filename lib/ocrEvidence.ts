import type { Frame, TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import {
  DEFAULT_CARD_ROI_MANIFEST,
  roiToPixelRect,
  type CardRectificationImageOutput,
  type CardRectificationResult,
  type CardRectificationRoi,
  type CardRectificationRoiId,
} from './cardRectification';
import {
  extractLocalOcrSignals,
  normaliseOcrText,
  parseLocalOcrPrintedNumber,
  type LocalOcrRegionRole,
  type LocalOcrRegionText,
} from './localOcrCardMatcher';
import type {
  OcrBoundingBox,
  OcrEvidence,
  OcrEvidenceItem,
  OcrScript,
  OcrSourceRegion,
} from './recognition/types';

export const OCR_EVIDENCE_SERVICE_VERSION = 'stackr-ocr-evidence-v1.0.0';
export const MLKIT_TEXT_RECOGNITION_VERSION = '@react-native-ml-kit/text-recognition@2.0.0';

export type OcrLanguageHint =
  | 'en'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'unknown';

export type MlKitScriptPackageImpact = {
  script: Exclude<OcrScript, 'unknown'>;
  nativeScript: 'Latin' | 'Chinese' | 'Japanese' | 'Korean';
  androidDependency: string;
  iosDependency: string;
  includedByInstalledPackage: boolean;
  measuredAppSizeKb: number | null;
  measuredColdStartMs: number | null;
  notes: string;
};

export const MLKIT_SCRIPT_PACKAGE_IMPACT: readonly MlKitScriptPackageImpact[] = Object.freeze([
  {
    script: 'latin',
    nativeScript: 'Latin',
    androidDependency: 'com.google.mlkit:text-recognition:16.0.1',
    iosDependency: 'GoogleMLKit/TextRecognition 8.0.0',
    includedByInstalledPackage: true,
    measuredAppSizeKb: null,
    measuredColdStartMs: null,
    notes: 'Already declared by the installed React Native ML Kit package.',
  },
  {
    script: 'chinese_simplified',
    nativeScript: 'Chinese',
    androidDependency: 'com.google.mlkit:text-recognition-chinese:16.0.1',
    iosDependency: 'GoogleMLKit/TextRecognitionChinese 8.0.0',
    includedByInstalledPackage: true,
    measuredAppSizeKb: null,
    measuredColdStartMs: null,
    notes: 'ML Kit exposes one Chinese recognizer; Stackr records Simplified versus Traditional as evidence hints.',
  },
  {
    script: 'chinese_traditional',
    nativeScript: 'Chinese',
    androidDependency: 'com.google.mlkit:text-recognition-chinese:16.0.1',
    iosDependency: 'GoogleMLKit/TextRecognitionChinese 8.0.0',
    includedByInstalledPackage: true,
    measuredAppSizeKb: null,
    measuredColdStartMs: null,
    notes: 'Uses the same native Chinese package as Simplified Chinese.',
  },
  {
    script: 'japanese',
    nativeScript: 'Japanese',
    androidDependency: 'com.google.mlkit:text-recognition-japanese:16.0.1',
    iosDependency: 'GoogleMLKit/TextRecognitionJapanese 8.0.0',
    includedByInstalledPackage: true,
    measuredAppSizeKb: null,
    measuredColdStartMs: null,
    notes: 'Loaded only when language hints, visual candidates, or OCR text suggest Japanese.',
  },
  {
    script: 'korean',
    nativeScript: 'Korean',
    androidDependency: 'com.google.mlkit:text-recognition-korean:16.0.1',
    iosDependency: 'GoogleMLKit/TextRecognitionKorean 8.0.0',
    includedByInstalledPackage: true,
    measuredAppSizeKb: null,
    measuredColdStartMs: null,
    notes: 'Loaded only when language hints, visual candidates, or OCR text suggest Korean.',
  },
]);

export type OcrRegionImage = {
  sourceRegion: OcrSourceRegion;
  uri: string;
  width?: number | null;
  height?: number | null;
};

export type OcrVisualCandidateHint = {
  id?: string | null;
  name?: string | null;
  language?: string | null;
  setId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
};

export type OcrRegionRecognitionRequest = {
  uri: string;
  sourceRegion: OcrSourceRegion;
  recognizerScript: OcrScript;
};

export type OcrRegionRecognizer = (
  request: OcrRegionRecognitionRequest
) => Promise<TextRecognitionResult>;

export type CollectOcrEvidenceRequest = {
  scanId: string;
  rectification?: CardRectificationResult | null;
  probableLanguage?: OcrLanguageHint | null;
  userPreferredLanguages?: OcrLanguageHint[];
  visualCandidates?: OcrVisualCandidateHint[];
  regions?: Partial<Record<OcrSourceRegion, OcrRegionImage>>;
  readNameWhen?: 'needed' | 'always' | 'never';
  recognizer?: OcrRegionRecognizer;
};

export type CollectorNumberEvidence = {
  raw: string;
  normalisedText: string;
  number: string;
  numberValue: number;
  denominator: string | null;
  denominatorValue: number | null;
  setCode: string | null;
  sourceRegion?: OcrSourceRegion;
  confidence: number;
  warnings: string[];
};

type RegionToRead = Extract<
  OcrSourceRegion,
  'collectorNumber' | 'setRarity' | 'regulationCopyright' | 'cardTitle'
>;

const FIRST_PASS_REGIONS: readonly RegionToRead[] = Object.freeze([
  'collectorNumber',
  'setRarity',
  'regulationCopyright',
]);

const SCRIPT_TO_NATIVE_SCRIPT: Record<Exclude<OcrScript, 'unknown'>, 'Latin' | 'Chinese' | 'Japanese' | 'Korean'> = {
  latin: 'Latin',
  chinese_simplified: 'Chinese',
  chinese_traditional: 'Chinese',
  japanese: 'Japanese',
  korean: 'Korean',
};

const RECOGNIZER_IMPORT_CACHE = new Map<string, Promise<typeof import('@react-native-ml-kit/text-recognition')>>();

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function normaliseSlashAndHyphenGlyphs(value: string) {
  return value
    .replace(/[\u2044\u2215\uFF0F]/g, '/')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
}

function normaliseNumberGlyphs(value: string) {
  return normaliseSlashAndHyphenGlyphs(value.normalize('NFKC'))
    .replace(/\u30FC/g, '-')
    .replace(/[OoΟοОо]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss](?=\d)/g, '5');
}

function stripLeadingZeroes(value: string) {
  return value.replace(/^0+(?=\d)/, '') || value;
}

function normaliseSetCode(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toUpperCase();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toRegionBoundingBox(frame?: Frame | null): OcrBoundingBox | null {
  if (!frame) return null;
  return {
    x: Math.max(0, Math.round(Number(frame.left) || 0)),
    y: Math.max(0, Math.round(Number(frame.top) || 0)),
    width: Math.max(0, Math.round(Number(frame.width) || 0)),
    height: Math.max(0, Math.round(Number(frame.height) || 0)),
    coordinateSpace: 'region_pixels',
  };
}

function toLocalRegionRole(region: OcrSourceRegion): LocalOcrRegionRole {
  switch (region) {
    case 'cardTitle':
      return 'name';
    case 'collectorNumber':
      return 'collector-number';
    case 'setRarity':
      return 'set-code';
    case 'regulationCopyright':
      return 'copyright';
    case 'fullFront':
    case 'ocrSource':
      return 'full-card';
    default:
      return 'unknown';
  }
}

export function normaliseOcrEvidenceText(value?: string | null) {
  const text = normaliseSlashAndHyphenGlyphs(String(value ?? '').normalize('NFKC'))
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[，、]/g, ',')
    .replace(/[．]/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return stripDiacritics(text);
}

export function normaliseCollectorNumberText(value?: string | null) {
  return normaliseNumberGlyphs(String(value ?? ''))
    .replace(/[：:]/g, ' ')
    .replace(/\bOF\b/gi, '/')
    .replace(/[^\p{L}\p{N}#/\- ]+/gu, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectScriptFromText(text: string, fallback?: OcrScript | null): OcrScript {
  if (/[\uac00-\ud7af]/.test(text)) return 'korean';
  if (/[\u3040-\u30ff]/.test(text)) return 'japanese';
  if (/[\u4e00-\u9fff]/.test(text)) {
    if (/[龍鳳臺萬與買賣體學國]/.test(text)) return 'chinese_traditional';
    if (/[龙凤台万与买卖体学国]/.test(text)) return 'chinese_simplified';
    return fallback && fallback.startsWith('chinese') ? fallback : 'chinese_simplified';
  }
  if (/[a-zA-Z0-9]/.test(text)) return 'latin';
  return fallback ?? 'unknown';
}

function scriptFromLanguage(value?: string | null): OcrScript | null {
  const language = String(value ?? '').toLowerCase();
  if (!language || language === 'unknown') return null;
  if (language.startsWith('ja')) return 'japanese';
  if (language.startsWith('ko')) return 'korean';
  if (language === 'zh-hant' || language.includes('hant')) return 'chinese_traditional';
  if (language.startsWith('zh')) return 'chinese_simplified';
  if (language.startsWith('en') || language === 'latin') return 'latin';
  return null;
}

function languageFromScript(script: OcrScript): OcrEvidence['language'] {
  switch (script) {
    case 'japanese':
      return 'ja';
    case 'korean':
      return 'ko';
    case 'chinese_simplified':
      return 'zh-Hans';
    case 'chinese_traditional':
      return 'zh-Hant';
    case 'latin':
      return 'en';
    default:
      return 'unknown';
  }
}

function getChinesePreference(hints: readonly OcrScript[]) {
  return hints.includes('chinese_traditional') ? 'chinese_traditional' : 'chinese_simplified';
}

export function selectOcrScriptsForCard(input: {
  probableLanguage?: OcrLanguageHint | null;
  userPreferredLanguages?: OcrLanguageHint[];
  visualCandidates?: OcrVisualCandidateHint[];
  firstPassText?: string | null;
}): Exclude<OcrScript, 'unknown'>[] {
  const scripts: Exclude<OcrScript, 'unknown'>[] = ['latin'];
  const hints = [
    scriptFromLanguage(input.probableLanguage),
    ...(input.userPreferredLanguages ?? []).map(scriptFromLanguage),
    ...(input.visualCandidates ?? []).map((candidate) => scriptFromLanguage(candidate.language)),
    detectScriptFromText(input.firstPassText ?? '', null),
  ].filter((script): script is Exclude<OcrScript, 'unknown'> => Boolean(script && script !== 'unknown'));

  if (hints.includes('japanese')) scripts.push('japanese');
  if (hints.includes('korean')) scripts.push('korean');
  if (hints.some((script) => script === 'chinese_simplified' || script === 'chinese_traditional')) {
    scripts.push(getChinesePreference(hints));
  }

  return unique(scripts);
}

export function parseCollectorNumberEvidence(
  value?: string | null,
  sourceRegion?: OcrSourceRegion
): CollectorNumberEvidence | null {
  const normalisedText = normaliseCollectorNumberText(value);
  if (!normalisedText) return null;

  const legacy = parseLocalOcrPrintedNumber(normalisedText, toLocalRegionRole(sourceRegion ?? 'unknown'));
  if (legacy) {
    return {
      raw: legacy.raw,
      normalisedText,
      number: legacy.normalisedNumber,
      numberValue: legacy.number,
      denominator: legacy.normalisedDenominator,
      denominatorValue: legacy.denominator,
      setCode: legacy.setCode ? normaliseSetCode(legacy.setCode) : null,
      sourceRegion,
      confidence: legacy.denominator != null ? 0.86 : 0.68,
      warnings: legacy.denominator == null ? ['collector_number_without_printed_total'] : [],
    };
  }

  const isolated = normalisedText.match(/\b#?\s*0*(\d{1,4})\b/);
  if (!isolated) return null;
  const numberValue = Number(isolated[1]);
  if (!Number.isFinite(numberValue)) return null;

  return {
    raw: isolated[0],
    normalisedText,
    number: stripLeadingZeroes(isolated[1]),
    numberValue,
    denominator: null,
    denominatorValue: null,
    setCode: null,
    sourceRegion,
    confidence: 0.35,
    warnings: ['isolated_collector_number', 'not_exact_identity'],
  };
}

export function getBestCollectorNumberEvidence(items: readonly OcrEvidenceItem[]) {
  const candidates = items
    .map((item) => parseCollectorNumberEvidence(item.normalisedText, item.sourceRegion))
    .filter((candidate): candidate is CollectorNumberEvidence => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

function extractLikelySetCode(items: readonly OcrEvidenceItem[], collector?: CollectorNumberEvidence | null) {
  if (collector?.setCode) return collector.setCode;
  for (const item of items) {
    if (item.sourceRegion !== 'setRarity' && item.sourceRegion !== 'regulationCopyright') continue;
    const matches = [...normaliseOcrEvidenceText(item.rawText).matchAll(/\b([A-Z]{1,5}\d{0,3}[A-Z]?)\b/gi)];
    const setCode = matches
      .map((match) => normaliseSetCode(match[1]))
      .find((candidate) => candidate.length >= 2 && !/^(HP|NO|ILL|TM|GX|EX|V)$/i.test(candidate));
    if (setCode) return setCode;
  }
  return null;
}

function evidenceItemsToLocalRegions(items: readonly OcrEvidenceItem[]): LocalOcrRegionText[] {
  return items.map((item) => ({
    role: toLocalRegionRole(item.sourceRegion),
    text: item.normalisedText,
  }));
}

function distinctCandidateNames(candidates: readonly OcrVisualCandidateHint[]) {
  return unique(
    candidates
      .map((candidate) => normaliseOcrText(candidate.name ?? '').toLowerCase())
      .filter(Boolean)
  );
}

export function shouldReadCardNameRegion(input: {
  readNameWhen?: 'needed' | 'always' | 'never';
  firstPassItems?: readonly OcrEvidenceItem[];
  visualCandidates?: readonly OcrVisualCandidateHint[];
  scriptsToAttempt?: readonly OcrScript[];
}) {
  if (input.readNameWhen === 'always') return true;
  if (input.readNameWhen === 'never') return false;

  const collector = getBestCollectorNumberEvidence(input.firstPassItems ?? []);
  const hasCjkScript = Boolean(input.scriptsToAttempt?.some((script) => (
    script === 'japanese' || script === 'korean' || script === 'chinese_simplified' || script === 'chinese_traditional'
  )));
  if (!collector || collector.confidence < 0.7) return true;
  if (hasCjkScript) return true;

  const names = distinctCandidateNames(input.visualCandidates ?? []);
  return names.length > 1 && names.length <= 8;
}

function itemTextAlternatives(text: string, sourceRegion: OcrSourceRegion) {
  if (sourceRegion !== 'collectorNumber' && sourceRegion !== 'setRarity') return [];
  const normalised = normaliseCollectorNumberText(text);
  const alternatives = new Set<string>();
  alternatives.add(normalised);
  alternatives.add(normalised.replace(/[O]/g, '0'));
  alternatives.add(normalised.replace(/[I|l]/g, '1'));
  alternatives.add(normalised.replace(/[S](?=\d)/g, '5'));
  return [...alternatives].filter((candidate) => candidate && candidate !== text).slice(0, 4);
}

function textResultToItems(
  result: TextRecognitionResult,
  sourceRegion: OcrSourceRegion,
  recognizerScript: OcrScript,
  probableScriptHint?: OcrScript | null
): OcrEvidenceItem[] {
  const lineItems = result.blocks.flatMap((block) => block.lines.map((line) => ({
    text: line.text,
    frame: line.frame ?? block.frame ?? null,
  })));
  const rows = lineItems.length ? lineItems : [{ text: result.text, frame: null }];

  return rows
    .map((row): OcrEvidenceItem | null => {
      const rawText = String(row.text ?? '').trim();
      if (!rawText) return null;
      const normalisedText = normaliseOcrEvidenceText(rawText);
      const probableScript = detectScriptFromText(normalisedText, probableScriptHint ?? recognizerScript);
      return {
        rawText,
        normalisedText,
        sourceRegion,
        boundingBox: toRegionBoundingBox(row.frame),
        confidence: null,
        probableScript,
        recognizerScript,
        alternatives: itemTextAlternatives(rawText, sourceRegion),
      };
    })
    .filter((item): item is OcrEvidenceItem => Boolean(item));
}

async function getMlKitTextRecognitionModule() {
  const cacheKey = MLKIT_TEXT_RECOGNITION_VERSION;
  let pending = RECOGNIZER_IMPORT_CACHE.get(cacheKey);
  if (!pending) {
    pending = import('@react-native-ml-kit/text-recognition');
    RECOGNIZER_IMPORT_CACHE.set(cacheKey, pending);
  }
  return pending;
}

function mlKitScriptFor(script: OcrScript) {
  if (script === 'unknown') return SCRIPT_TO_NATIVE_SCRIPT.latin;
  return SCRIPT_TO_NATIVE_SCRIPT[script];
}

export async function recognizeRegionWithMlKit(
  request: OcrRegionRecognitionRequest
): Promise<TextRecognitionResult> {
  const module = await getMlKitTextRecognitionModule();
  const scriptName = mlKitScriptFor(request.recognizerScript);
  const script = module.TextRecognitionScript?.[scriptName.toUpperCase() as keyof typeof module.TextRecognitionScript]
    ?? scriptName;
  return module.default.recognize(request.uri, script);
}

function getRegionRoi(rectification: CardRectificationResult | null | undefined, sourceRegion: RegionToRead) {
  const manifest = rectification?.roiManifest ?? DEFAULT_CARD_ROI_MANIFEST;
  return manifest.regions.find((region) => region.id === sourceRegion) ?? null;
}

function imageForRegionFromRectification(
  rectification: CardRectificationResult | null | undefined,
  sourceRegion: RegionToRead
): CardRectificationImageOutput | null {
  return rectification?.roiCrops?.[sourceRegion as CardRectificationRoiId] ?? null;
}

function imageForFullOcrSource(rectification: CardRectificationResult | null | undefined) {
  return rectification?.ocrSourceCrop ?? rectification?.rectifiedFull ?? null;
}

async function cropRegionFromRectifiedSource(
  rectification: CardRectificationResult,
  sourceRegion: RegionToRead,
  roi: CardRectificationRoi
): Promise<OcrRegionImage | null> {
  const source = imageForFullOcrSource(rectification);
  if (!source?.uri || !source.width || !source.height) return null;
  const pixelRect = roiToPixelRect(roi, { width: source.width, height: source.height });
  const manipulator = await import('expo-image-manipulator');
  const result = await manipulator.manipulateAsync(
    source.uri,
    [{
      crop: {
        originX: pixelRect.x,
        originY: pixelRect.y,
        width: Math.max(1, pixelRect.width),
        height: Math.max(1, pixelRect.height),
      },
    }],
    { compress: 1, format: manipulator.SaveFormat.PNG }
  );
  return {
    sourceRegion,
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

async function resolveRegionImage(
  request: CollectOcrEvidenceRequest,
  sourceRegion: RegionToRead
): Promise<OcrRegionImage | null> {
  const provided = request.regions?.[sourceRegion];
  if (provided?.uri) return provided;

  const nativeCrop = imageForRegionFromRectification(request.rectification, sourceRegion);
  if (nativeCrop?.uri) {
    return {
      sourceRegion,
      uri: nativeCrop.uri,
      width: nativeCrop.width,
      height: nativeCrop.height,
    };
  }

  const rectification = request.rectification;
  if (!rectification || rectification.status !== 'success') return null;
  const roi = getRegionRoi(rectification, sourceRegion);
  if (!roi) return null;
  return cropRegionFromRectifiedSource(rectification, sourceRegion, roi);
}

async function readRegion(
  request: CollectOcrEvidenceRequest,
  sourceRegion: RegionToRead,
  script: Exclude<OcrScript, 'unknown'>
) {
  const image = await resolveRegionImage(request, sourceRegion);
  if (!image) {
    return {
      items: [] as OcrEvidenceItem[],
      warning: `missing_roi:${sourceRegion}`,
    };
  }

  const recognizer = request.recognizer ?? recognizeRegionWithMlKit;
  const result = await recognizer({
    uri: image.uri,
    sourceRegion,
    recognizerScript: script,
  });
  return {
    items: textResultToItems(result, sourceRegion, script, script),
    warning: null,
  };
}

function summarizeEvidence(
  items: readonly OcrEvidenceItem[],
  scriptsAttempted: readonly OcrScript[],
  warnings: readonly string[],
  regionVersion?: string | null
): OcrEvidence {
  const localSignals = extractLocalOcrSignals(evidenceItemsToLocalRegions(items));
  const collector = getBestCollectorNumberEvidence(items);
  const setCode = extractLikelySetCode(items, collector) ?? localSignals.setCode;
  const combinedText = items.map((item) => item.normalisedText).join('\n');
  const probableScript = detectScriptFromText(combinedText, scriptsAttempted[0] ?? 'unknown');

  return {
    language: languageFromScript(probableScript),
    nameHint: localSignals.nameText || null,
    printedNumber: collector
      ? {
          number: collector.numberValue,
          total: collector.denominatorValue,
          raw: collector.raw,
        }
      : localSignals.printedNumber
        ? {
            number: localSignals.printedNumber.number,
            total: localSignals.printedNumber.denominator,
            raw: localSignals.printedNumber.raw,
          }
        : null,
    setId: null,
    setCode: setCode ? normaliseSetCode(setCode) : null,
    hp: localSignals.hp,
    releaseYear: localSignals.releaseYear,
    rawText: combinedText || null,
    items: [...items],
    probableScript,
    scriptsAttempted: unique(scriptsAttempted),
    strategyVersion: OCR_EVIDENCE_SERVICE_VERSION,
    regionVersion: regionVersion ?? null,
    soleExactMatchAllowed: false,
    warnings: unique([
      ...warnings,
      ...(collector?.warnings ?? []),
    ]),
  };
}

export async function collectOcrEvidence(
  request: CollectOcrEvidenceRequest
): Promise<OcrEvidence> {
  const firstPassItems: OcrEvidenceItem[] = [];
  const warnings: string[] = [];
  const scriptsAttempted: OcrScript[] = [];

  for (const region of FIRST_PASS_REGIONS) {
    try {
      const result = await readRegion(request, region, 'latin');
      if (result.warning) warnings.push(result.warning);
      firstPassItems.push(...result.items);
      scriptsAttempted.push('latin');
    } catch (error) {
      warnings.push(`ocr_region_error:${region}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const firstPassText = firstPassItems.map((item) => item.normalisedText).join('\n');
  const scriptsToAttempt = selectOcrScriptsForCard({
    probableLanguage: request.probableLanguage,
    userPreferredLanguages: request.userPreferredLanguages,
    visualCandidates: request.visualCandidates,
    firstPassText,
  });
  const shouldReadName = shouldReadCardNameRegion({
    readNameWhen: request.readNameWhen,
    firstPassItems,
    visualCandidates: request.visualCandidates,
    scriptsToAttempt,
  });
  const allItems = [...firstPassItems];

  if (shouldReadName) {
    for (const script of scriptsToAttempt) {
      try {
        const result = await readRegion(request, 'cardTitle', script);
        if (result.warning) warnings.push(result.warning);
        allItems.push(...result.items);
        scriptsAttempted.push(script);
      } catch (error) {
        warnings.push(`ocr_region_error:cardTitle:${script}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const regionVersion = request.rectification?.roiManifest?.version
    ?? DEFAULT_CARD_ROI_MANIFEST.version;
  return summarizeEvidence(allItems, scriptsAttempted, warnings, regionVersion);
}

export function canOcrEvidenceDriveAutomaticExactMatch(
  evidence: Pick<OcrEvidence, 'printedNumber' | 'setCode' | 'nameHint' | 'items' | 'soleExactMatchAllowed'> | null | undefined,
  hasIndependentVisualEvidence: boolean
) {
  if (!hasIndependentVisualEvidence) return false;
  if (evidence?.soleExactMatchAllowed === false) return false;
  const hasNumber = Boolean(evidence?.printedNumber?.number);
  const hasSet = Boolean(evidence?.setCode || evidence?.printedNumber?.total);
  const hasName = Boolean(evidence?.nameHint?.trim());
  return hasNumber && hasSet && hasName;
}

export function buildCandidateOnlyOcrEvidence(input: Partial<OcrEvidence>): OcrEvidence {
  return {
    language: input.language ?? null,
    nameHint: input.nameHint ?? null,
    printedNumber: input.printedNumber ?? null,
    setId: input.setId ?? null,
    setCode: input.setCode ?? null,
    hp: input.hp ?? null,
    releaseYear: input.releaseYear ?? null,
    rawText: input.rawText ?? null,
    items: input.items ?? [],
    probableScript: input.probableScript ?? null,
    scriptsAttempted: input.scriptsAttempted ?? [],
    strategyVersion: input.strategyVersion ?? OCR_EVIDENCE_SERVICE_VERSION,
    regionVersion: input.regionVersion ?? DEFAULT_CARD_ROI_MANIFEST.version,
    soleExactMatchAllowed: false,
    warnings: input.warnings ?? [],
  };
}

export function collectorEvidenceConfidenceScore(evidence: CollectorNumberEvidence | null | undefined) {
  if (!evidence) return 0;
  const denominatorBoost = evidence.denominatorValue != null ? 0.22 : 0;
  const setCodeBoost = evidence.setCode ? 0.08 : 0;
  const warningPenalty = evidence.warnings.length * 0.08;
  return clamp01(evidence.confidence + denominatorBoost + setCodeBoost - warningPenalty);
}
