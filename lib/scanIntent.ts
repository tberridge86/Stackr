export type ScanIntent =
  | 'quick_collection'
  | 'sweep_collection'
  | 'binder_page'
  | 'raw_listing'
  | 'graded_slab'
  | 'condition_check'
  | 'full_pregrade';

export type ScanIntentRequirements = {
  frontImage: boolean;
  backImage: boolean;
  identification: boolean;
  listingEvidence: boolean;
  slabLabel: boolean;
  slabGraderGrade: boolean;
  rawConditionEstimate: boolean;
  fullPregrade: boolean;
  asyncGradingJob: boolean;
  automaticRawGrading: boolean;
};

export type ScanIntentConfig = {
  intent: ScanIntent;
  label: string;
  resultTitle: string;
  resultHelp: string;
  legacyMode: 'market' | 'binder' | 'listing' | 'grade';
  itemType: 'raw_card' | 'graded_slab';
  requirements: ScanIntentRequirements;
};

const BASE_REQUIREMENTS: ScanIntentRequirements = {
  frontImage: true,
  backImage: false,
  identification: true,
  listingEvidence: false,
  slabLabel: false,
  slabGraderGrade: false,
  rawConditionEstimate: false,
  fullPregrade: false,
  asyncGradingJob: false,
  automaticRawGrading: false,
};

export const SCAN_INTENT_CONFIG: Record<ScanIntent, ScanIntentConfig> = {
  quick_collection: {
    intent: 'quick_collection',
    label: 'Quick scan',
    resultTitle: 'Card found',
    resultHelp: 'Review the card match before saving it to your collection.',
    legacyMode: 'market',
    itemType: 'raw_card',
    requirements: BASE_REQUIREMENTS,
  },
  sweep_collection: {
    intent: 'sweep_collection',
    label: 'Sweep scan',
    resultTitle: 'Sweep review',
    resultHelp: 'Keep scanning cards, then review the batch once before adding it to your collection.',
    legacyMode: 'market',
    itemType: 'raw_card',
    requirements: BASE_REQUIREMENTS,
  },
  binder_page: {
    intent: 'binder_page',
    label: 'Binder scan',
    resultTitle: 'Binder match',
    resultHelp: 'Identify the card and add it to this binder. No listing or grading steps are required.',
    legacyMode: 'binder',
    itemType: 'raw_card',
    requirements: BASE_REQUIREMENTS,
  },
  raw_listing: {
    intent: 'raw_listing',
    label: 'Raw listing scan',
    resultTitle: 'Listing match',
    resultHelp: 'Select the exact card, then continue with listing evidence and protection requirements.',
    legacyMode: 'listing',
    itemType: 'raw_card',
    requirements: {
      ...BASE_REQUIREMENTS,
      backImage: true,
      listingEvidence: true,
      rawConditionEstimate: true,
    },
  },
  graded_slab: {
    intent: 'graded_slab',
    label: 'Slab scan',
    resultTitle: 'Slab match',
    resultHelp: 'Identify the enclosed card and continue with grader, grade and certification details.',
    legacyMode: 'listing',
    itemType: 'graded_slab',
    requirements: {
      ...BASE_REQUIREMENTS,
      backImage: true,
      listingEvidence: true,
      slabLabel: true,
      slabGraderGrade: true,
    },
  },
  condition_check: {
    intent: 'condition_check',
    label: 'Condition check',
    resultTitle: 'Condition estimate',
    resultHelp: 'Run a broad condition estimate. This is not a professional grade.',
    legacyMode: 'grade',
    itemType: 'raw_card',
    requirements: {
      ...BASE_REQUIREMENTS,
      backImage: true,
      rawConditionEstimate: true,
    },
  },
  full_pregrade: {
    intent: 'full_pregrade',
    label: 'Full pre-grade',
    resultTitle: 'Pre-grade submitted',
    resultHelp: 'Submit high-resolution front and back photos as a background grading job.',
    legacyMode: 'grade',
    itemType: 'raw_card',
    requirements: {
      ...BASE_REQUIREMENTS,
      backImage: true,
      fullPregrade: true,
      asyncGradingJob: true,
      automaticRawGrading: true,
    },
  },
};

function firstParam(value?: string | string[] | null) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function normalizeIntent(value?: string | string[] | null): ScanIntent | null {
  const text = firstParam(value)?.trim().toLowerCase();
  if (!text) return null;
  return Object.prototype.hasOwnProperty.call(SCAN_INTENT_CONFIG, text)
    ? text as ScanIntent
    : null;
}

export function resolveScanIntent(input: {
  intent?: string | string[] | null;
  mode?: string | string[] | null;
  flow?: string | string[] | null;
  type?: string | string[] | null;
  binderId?: string | string[] | null;
}): ScanIntent {
  const explicit = normalizeIntent(input.intent);
  if (explicit) return explicit;

  const mode = firstParam(input.mode)?.trim().toLowerCase();
  const flow = firstParam(input.flow)?.trim().toLowerCase();
  const type = firstParam(input.type)?.trim().toLowerCase();
  const hasBinder = Boolean(firstParam(input.binderId));

  if (type === 'graded_slab' || mode === 'graded_slab' || flow === 'graded_slab' || mode === 'slab') {
    return 'graded_slab';
  }
  if (mode === 'condition_check' || flow === 'condition_check') return 'condition_check';
  if (mode === 'full_pregrade' || mode === 'pregrade' || flow === 'full_pregrade') return 'full_pregrade';
  if (mode === 'sweep' || flow === 'sweep') return 'sweep_collection';
  if (mode === 'listing' || flow === 'listing') return 'raw_listing';
  if (mode === 'binder' || hasBinder) return 'binder_page';
  return 'quick_collection';
}

export function getScanIntentConfig(intent: ScanIntent) {
  return SCAN_INTENT_CONFIG[intent];
}

export function isListingScanIntent(intent: ScanIntent) {
  return intent === 'raw_listing' || intent === 'graded_slab';
}

export function isBinderScanIntent(intent: ScanIntent) {
  return intent === 'binder_page';
}

export function isCollectionScanIntent(intent: ScanIntent) {
  return intent === 'quick_collection' || intent === 'sweep_collection' || intent === 'binder_page';
}

export function buildScanRouteParamsForIntent(
  intent: ScanIntent,
  extra: Record<string, string | number | boolean | null | undefined> = {}
) {
  const config = getScanIntentConfig(intent);
  return {
    mode: config.legacyMode,
    intent,
    type: config.itemType,
    ...Object.fromEntries(
      Object.entries(extra).filter(([, value]) => value != null && value !== '')
    ),
  };
}
