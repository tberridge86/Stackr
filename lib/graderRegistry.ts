export type GraderKey = 'PSA' | 'CGC' | 'BGS' | 'TAG' | 'AGS' | 'ACE' | 'GETGRADED';

export type GraderPriceCoverage = 'full' | 'partial' | 'none';

export type GraderDefinition = {
  key: GraderKey;
  displayName: string;
  shortName: string;
  aliases: string[];
  supportedGrades: string[];
  supportsSubgrades: boolean;
  supportsCertificationLookup: boolean;
  certificationMethod: 'api' | 'qr' | 'barcode' | 'manual';
  labelTemplateKey: string;
  priceCoverage: GraderPriceCoverage;
  gradeLabels: Record<string, string>;
};

export const GRADER_REGISTRY: Record<GraderKey, GraderDefinition> = {
  PSA: {
    key: 'PSA',
    displayName: 'PSA',
    shortName: 'PSA',
    aliases: ['psa', 'professional sports authenticator'],
    supportedGrades: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'psa',
    priceCoverage: 'partial',
    gradeLabels: {
      '10': 'GEM MINT',
      '9': 'MINT',
      '8': 'NM-MT',
      '7': 'NEAR MINT',
    },
  },
  CGC: {
    key: 'CGC',
    displayName: 'CGC',
    shortName: 'CGC',
    aliases: ['cgc', 'cgc cards', 'cgs'],
    supportedGrades: ['10', '9.5', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'cgc',
    priceCoverage: 'partial',
    gradeLabels: {
      '10': 'GEM MINT',
      '10_PRISTINE': 'PRISTINE',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
      '8': 'NM-MT',
      '7': 'NEAR MINT',
    },
  },
  BGS: {
    key: 'BGS',
    displayName: 'Beckett',
    shortName: 'BGS',
    aliases: ['bgs', 'beckett', 'beckett grading services', 'beckett black label'],
    supportedGrades: ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: true,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'beckett',
    priceCoverage: 'partial',
    gradeLabels: {
      '10': 'PRISTINE',
      '10_BLACK_LABEL': 'BLACK LABEL',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
      '8.5': 'NM-MT+',
      '8_5': 'NM-MT+',
      '8': 'NM-MT',
    },
  },
  TAG: {
    key: 'TAG',
    displayName: 'TAG',
    shortName: 'TAG',
    aliases: ['tag', 'tag grading'],
    supportedGrades: ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'tag',
    priceCoverage: 'partial',
    gradeLabels: {
      '10': 'GEM MINT',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
    },
  },
  AGS: {
    key: 'AGS',
    displayName: 'AGS',
    shortName: 'AGS',
    aliases: ['ags', 'automated grading systems'],
    supportedGrades: ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'ags',
    priceCoverage: 'none',
    gradeLabels: {
      '10': 'GEM MINT',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
    },
  },
  ACE: {
    key: 'ACE',
    displayName: 'ACE',
    shortName: 'ACE',
    aliases: ['ace', 'ace grading'],
    supportedGrades: ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'ace',
    priceCoverage: 'partial',
    gradeLabels: {
      '10': 'GEM MINT',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
    },
  },
  GETGRADED: {
    key: 'GETGRADED',
    displayName: 'GetGraded',
    shortName: 'GetGraded',
    aliases: ['getgraded', 'get graded', 'getgraded uk'],
    supportedGrades: ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'],
    supportsSubgrades: false,
    supportsCertificationLookup: false,
    certificationMethod: 'manual',
    labelTemplateKey: 'generic',
    priceCoverage: 'none',
    gradeLabels: {
      '10': 'GEM MINT',
      '9.5': 'GEM MINT',
      '9_5': 'GEM MINT',
      '9': 'MINT',
    },
  },
};

const normalise = (value?: string | number | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '_')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export function normalizeGraderKey(value?: string | null): GraderKey | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const key = normalise(raw);
  for (const grader of Object.values(GRADER_REGISTRY)) {
    if (normalise(grader.key) === key || grader.aliases.some((alias) => normalise(alias) === key)) {
      return grader.key;
    }
  }
  return null;
}

export function getGraderDefinition(value?: string | null): GraderDefinition | null {
  const key = normalizeGraderKey(value);
  return key ? GRADER_REGISTRY[key] : null;
}

export function formatGraderDisplayName(value?: string | null): string {
  const raw = String(value ?? '').trim();
  return getGraderDefinition(raw)?.displayName ?? raw;
}

export function formatGraderShortName(value?: string | null): string {
  const raw = String(value ?? '').trim();
  return getGraderDefinition(raw)?.shortName ?? raw;
}

export function normalizeGradeKey(value?: string | number | null) {
  return normalise(value);
}

export function getGraderGradeLabel(
  grader?: string | null,
  grade?: string | number | null,
  explicitLabel?: string | null
) {
  if (explicitLabel?.trim()) return explicitLabel.trim().toUpperCase();
  const definition = getGraderDefinition(grader);
  const gradeKey = normalizeGradeKey(grade);
  return definition?.gradeLabels[gradeKey] ?? definition?.gradeLabels[String(grade ?? '').trim()] ?? 'GRADED';
}

export function getSupportedSlabGraderLabels() {
  return ['PSA', 'CGC', 'BGS', 'ACE', 'TAG'] as const;
}
