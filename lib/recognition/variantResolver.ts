import type { CaptureRect } from '../captureGeometry';
import {
  DEFAULT_CARD_ROI_MANIFEST,
  roiToPixelRect,
  type CardRectificationImageOutput,
  type CardRectificationRoiId,
} from '../cardRectification';
import type { OcrEvidence } from './types';

export const EXACT_VARIANT_RESOLVER_VERSION = 'stackr-exact-variant-resolver-v1.0.0';

const familyRegister = require('../../assets/catalogue/card-variant-families.json') as VariantFamilyRegister;

export type VariantResolutionOutcome =
  | 'resolved_variant'
  | 'unresolved_variant'
  | 'not_variant_family';

export type VariantDiscriminator =
  | 'edition_stamp'
  | 'promo_stamp'
  | 'regulation_mark'
  | 'rarity_symbol'
  | 'set_symbol'
  | 'collector_number_formatting'
  | 'reverse_holo_pattern'
  | 'pokeball_pattern'
  | 'masterball_pattern'
  | 'texture'
  | 'foil_area'
  | 'copyright_line';

export type VariantId =
  | 'standard'
  | 'reverse_holo'
  | 'pokeball_holo'
  | 'masterball_holo'
  | 'unstamped'
  | 'stamped'
  | 'unlimited'
  | 'first_edition'
  | 'set_release'
  | 'promo'
  | 'non_texture'
  | 'texture'
  | 'unknown';

export type VariantDefinition = {
  variantId: VariantId;
  label: string;
  valuableSpecialVariant: boolean;
};

export type VariantFamilyDefinition = {
  familyId: string;
  status: 'ready' | 'template' | 'blocked';
  description: string;
  variants: VariantDefinition[];
  discriminators: VariantDiscriminator[];
  regions: CardRectificationRoiId[];
  requiresTiltCaptureWhenUnresolved: boolean;
  artworkId?: string | null;
  collectorNumber?: string | null;
  setId?: string | null;
  layoutId?: string | null;
  language?: string | null;
};

export type VariantFamilyRegister = {
  schemaVersion: 'stackr-card-variant-families-v1.0.0';
  version: string;
  status: 'ready' | 'blocked_needs_curated_catalogue';
  generatedAt: string;
  familyKeyFields: string[];
  notes: string[];
  families: VariantFamilyDefinition[];
  blockedAccuracy: Record<string, unknown>;
};

export type VariantCandidateIdentity = {
  canonicalCardId: string;
  baseCardId?: string | null;
  artworkId?: string | null;
  collectorNumber?: string | null;
  setId?: string | null;
  layoutId?: string | null;
  language?: string | null;
  variantId?: VariantId | string | null;
  cardName?: string | null;
  rarity?: string | null;
};

export type VariantRegionObservation = {
  discriminator: VariantDiscriminator;
  region: CardRectificationRoiId;
  value: string | boolean | number;
  confidence: number;
  source: 'template' | 'ocr' | 'feature' | 'classifier' | 'tilt';
};

export type VariantRegionExtractionPlan = {
  version: string;
  sourceImageUri: string;
  sourceWidth: number;
  sourceHeight: number;
  regions: Array<{
    id: CardRectificationRoiId;
    rect: CaptureRect;
    discriminatorHints: VariantDiscriminator[];
  }>;
};

export type VariantClassifierManifest = {
  status: 'ready' | 'blocked';
  version: string;
  supportedFamilies: string[];
  blockers: string[];
};

export type VariantResolutionInput = {
  baseCandidate: VariantCandidateIdentity;
  candidateFamily?: VariantFamilyDefinition | null;
  familyCandidates?: VariantCandidateIdentity[];
  ocrEvidence?: OcrEvidence | null;
  observations?: VariantRegionObservation[];
  classifierManifest?: VariantClassifierManifest | null;
  tiltObservations?: VariantRegionObservation[];
};

export type VariantResolutionResult = {
  outcome: VariantResolutionOutcome;
  baseIdentity: {
    canonicalCardId: string;
    artworkId?: string | null;
    collectorNumber?: string | null;
    setId?: string | null;
    layoutId?: string | null;
    language?: string | null;
  };
  exactVariant: {
    variantId: VariantId | string;
    label: string;
  } | null;
  variantConfidence: number | null;
  familyId: string | null;
  evidence: VariantRegionObservation[];
  unresolvedReasons: string[];
  tiltCaptureRecommended: boolean;
  classifier: {
    used: boolean;
    status: 'ready' | 'blocked' | 'not_required';
    version?: string | null;
    message?: string | null;
  };
};

export const BLOCKED_VARIANT_CLASSIFIER_MANIFEST: VariantClassifierManifest = Object.freeze({
  status: 'blocked',
  version: 'stackr-variant-classifier-v0.0.0-blocked',
  supportedFamilies: [],
  blockers: [
    'no_variant_training_set',
    'no_approved_variant_classifier_weights',
  ],
});

function norm(value?: string | number | boolean | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function familyKey(candidate: VariantCandidateIdentity) {
  return [
    candidate.artworkId,
    candidate.collectorNumber,
    candidate.setId,
    candidate.layoutId,
    candidate.language,
  ].map(norm).join('|');
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function observationMatches(
  observation: VariantRegionObservation,
  values: readonly (string | boolean | number)[]
) {
  const observed = norm(String(observation.value));
  return values.some((value) => observed.includes(norm(value)));
}

function evidenceFromOcr(ocr?: OcrEvidence | null): VariantRegionObservation[] {
  const raw = String(ocr?.rawText ?? '');
  const evidence: VariantRegionObservation[] = [];
  const add = (discriminator: VariantDiscriminator, region: CardRectificationRoiId, value: string, confidence = 0.75) => {
    evidence.push({ discriminator, region, value, confidence, source: 'ocr' });
  };
  if (/1st\s*edition|first\s*edition/i.test(raw)) add('edition_stamp', 'artwork', 'first_edition');
  if (/promo|promotional|black\s*star/i.test(raw)) add('promo_stamp', 'artwork', 'promo');
  if (/master\s*ball|masterball/i.test(raw)) add('masterball_pattern', 'fullFront', 'masterball');
  if (/poke\s*ball|pokeball/i.test(raw)) add('pokeball_pattern', 'fullFront', 'pokeball');
  if (/reverse/i.test(raw)) add('reverse_holo_pattern', 'fullFront', 'reverse');
  if (/texture|textured/i.test(raw)) add('texture', 'artwork', 'texture');
  if (ocr?.setCode || ocr?.setId) add('set_symbol', 'setRarity', ocr.setCode ?? ocr.setId ?? '', 0.65);
  if (ocr?.printedNumber?.raw) add('collector_number_formatting', 'collectorNumber', ocr.printedNumber.raw, 0.7);
  const regulation = raw.match(/\bregulation\s*(?:mark)?\s*([a-z])\b/i);
  if (regulation) add('regulation_mark', 'regulationCopyright', regulation[1], 0.65);
  if (ocr?.releaseYear) add('copyright_line', 'regulationCopyright', String(ocr.releaseYear), 0.65);
  return evidence;
}

function variantEvidenceScore(
  variant: VariantDefinition,
  family: VariantFamilyDefinition,
  evidence: readonly VariantRegionObservation[]
) {
  let score = 0;
  const reasons: string[] = [];
  const addScore = (amount: number, reason: string) => {
    score += amount;
    reasons.push(reason);
  };

  switch (variant.variantId) {
    case 'reverse_holo':
      if (evidence.some((item) => item.discriminator === 'reverse_holo_pattern' && observationMatches(item, ['reverse', true]))) {
        addScore(0.7, 'reverse_holo_pattern');
      }
      if (evidence.some((item) => item.discriminator === 'foil_area' && item.confidence >= 0.7)) addScore(0.2, 'foil_area');
      break;
    case 'pokeball_holo':
      if (evidence.some((item) => item.discriminator === 'pokeball_pattern' && observationMatches(item, ['pokeball', 'poke ball']))) {
        addScore(0.85, 'pokeball_pattern');
      }
      break;
    case 'masterball_holo':
      if (evidence.some((item) => item.discriminator === 'masterball_pattern' && observationMatches(item, ['masterball', 'master ball']))) {
        addScore(0.9, 'masterball_pattern');
      }
      break;
    case 'stamped':
    case 'promo':
      if (evidence.some((item) => item.discriminator === 'promo_stamp' && observationMatches(item, ['promo', 'black star', 'stamp', true]))) {
        addScore(0.85, 'promo_stamp');
      }
      break;
    case 'first_edition':
      if (evidence.some((item) => item.discriminator === 'edition_stamp' && observationMatches(item, ['1st', 'first', 'firstedition', true]))) {
        addScore(0.9, 'edition_stamp');
      }
      break;
    case 'texture':
      if (evidence.some((item) => item.discriminator === 'texture' && observationMatches(item, ['texture', 'textured', true]))) {
        addScore(0.85, 'texture');
      }
      break;
    case 'standard':
    case 'unstamped':
    case 'unlimited':
    case 'set_release':
    case 'non_texture': {
      const specialEvidence = evidence.some((item) => (
        ['reverse_holo_pattern', 'pokeball_pattern', 'masterball_pattern', 'promo_stamp', 'edition_stamp', 'texture']
          .includes(item.discriminator)
        && !observationMatches(item, ['absent', 'none', false])
        && item.confidence >= 0.65
      ));
      const absentEvidence = evidence.some((item) => observationMatches(item, ['absent', 'none', false]) && item.confidence >= 0.8);
      if (!specialEvidence && absentEvidence) addScore(0.75, 'special_mark_absent');
      break;
    }
    default:
      break;
  }

  const relevantDiscriminators = new Set(family.discriminators);
  const corroboration = evidence
    .filter((item) => relevantDiscriminators.has(item.discriminator))
    .reduce((sum, item) => sum + clamp01(item.confidence), 0) * 0.02;

  return {
    score: clamp01(score + Math.min(0.15, corroboration)),
    reasons,
  };
}

function unresolved(
  input: VariantResolutionInput,
  family: VariantFamilyDefinition | null,
  evidence: VariantRegionObservation[],
  reasons: string[]
): VariantResolutionResult {
  return {
    outcome: family ? 'unresolved_variant' : 'not_variant_family',
    baseIdentity: {
      canonicalCardId: input.baseCandidate.canonicalCardId,
      artworkId: input.baseCandidate.artworkId ?? null,
      collectorNumber: input.baseCandidate.collectorNumber ?? null,
      setId: input.baseCandidate.setId ?? null,
      layoutId: input.baseCandidate.layoutId ?? null,
      language: input.baseCandidate.language ?? null,
    },
    exactVariant: null,
    variantConfidence: null,
    familyId: family?.familyId ?? null,
    evidence,
    unresolvedReasons: reasons,
    tiltCaptureRecommended: Boolean(family?.requiresTiltCaptureWhenUnresolved),
    classifier: {
      used: false,
      status: input.classifierManifest?.status ?? 'blocked',
      version: input.classifierManifest?.version ?? BLOCKED_VARIANT_CLASSIFIER_MANIFEST.version,
      message: input.classifierManifest?.status === 'ready'
        ? 'Classifier was not required by rule evidence.'
        : 'Variant classifier is blocked or unavailable.',
    },
  };
}

export function getVariantFamilyRegister(): VariantFamilyRegister {
  return familyRegister;
}

export function identifyCandidateFamilies(
  candidates: readonly VariantCandidateIdentity[]
): Array<{
  familyKey: string;
  candidates: VariantCandidateIdentity[];
  reasons: string[];
}> {
  const grouped = new Map<string, VariantCandidateIdentity[]>();
  for (const candidate of candidates) {
    const key = familyKey(candidate);
    if (key.split('|').some((part) => !part)) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  return Array.from(grouped.entries())
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      familyKey: key,
      candidates: members,
      reasons: ['shared_artwork_collector_set_layout_language'],
    }));
}

export function buildVariantRegionExtractionPlan({
  rectifiedImage,
  family,
}: {
  rectifiedImage: CardRectificationImageOutput;
  family: VariantFamilyDefinition;
}): VariantRegionExtractionPlan {
  const regions = family.regions.map((regionId) => {
    const roi = DEFAULT_CARD_ROI_MANIFEST.regions.find((candidate) => candidate.id === regionId)
      ?? DEFAULT_CARD_ROI_MANIFEST.regions[0];
    return {
      id: regionId,
      rect: roiToPixelRect(roi, { width: rectifiedImage.width, height: rectifiedImage.height }),
      discriminatorHints: family.discriminators,
    };
  });

  return {
    version: `${EXACT_VARIANT_RESOLVER_VERSION}:region-plan-v1`,
    sourceImageUri: rectifiedImage.uri,
    sourceWidth: rectifiedImage.width,
    sourceHeight: rectifiedImage.height,
    regions,
  };
}

export function resolveExactVariant(input: VariantResolutionInput): VariantResolutionResult {
  const family = input.candidateFamily ?? null;
  const evidence = [
    ...evidenceFromOcr(input.ocrEvidence),
    ...(input.observations ?? []),
    ...(input.tiltObservations ?? []),
  ];

  if (!family || family.variants.length <= 1) {
    return unresolved(input, family, evidence, ['candidate_is_not_a_variant_family']);
  }

  const scored = family.variants
    .map((variant) => ({
      variant,
      ...variantEvidenceScore(variant, family, evidence),
    }))
    .sort((left, right) => right.score - left.score || left.variant.variantId.localeCompare(right.variant.variantId));
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.72) {
    return unresolved(input, family, evidence, ['insufficient_discriminating_variant_evidence']);
  }
  if (second && best.score - second.score < 0.12) {
    return unresolved(input, family, evidence, ['variant_margin_too_small']);
  }
  if (best.variant.valuableSpecialVariant && best.reasons.length === 0) {
    return unresolved(input, family, evidence, ['valuable_special_variant_requires_explicit_evidence']);
  }

  return {
    outcome: 'resolved_variant',
    baseIdentity: {
      canonicalCardId: input.baseCandidate.canonicalCardId,
      artworkId: input.baseCandidate.artworkId ?? null,
      collectorNumber: input.baseCandidate.collectorNumber ?? null,
      setId: input.baseCandidate.setId ?? null,
      layoutId: input.baseCandidate.layoutId ?? null,
      language: input.baseCandidate.language ?? null,
    },
    exactVariant: {
      variantId: best.variant.variantId,
      label: best.variant.label,
    },
    variantConfidence: best.score,
    familyId: family.familyId,
    evidence,
    unresolvedReasons: [],
    tiltCaptureRecommended: false,
    classifier: {
      used: false,
      status: 'not_required',
      version: input.classifierManifest?.version ?? null,
      message: 'Rule/template evidence resolved the variant.',
    },
  };
}

export function variantResolutionSummary(result: VariantResolutionResult) {
  return {
    resolverVersion: EXACT_VARIANT_RESOLVER_VERSION,
    baseIdentity: result.baseIdentity,
    exactVariant: result.exactVariant,
    variantConfidence: result.variantConfidence,
    outcome: result.outcome,
    unresolvedReasons: result.unresolvedReasons,
    tiltCaptureRecommended: result.tiltCaptureRecommended,
  };
}
