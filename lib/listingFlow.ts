export type ListingProtectionTier = 'bronze' | 'silver' | 'gold';

export type ListingFlowStage =
  | 'card'
  | 'condition'
  | 'value'
  | 'protection'
  | 'evidence'
  | 'ai'
  | 'gold'
  | 'details'
  | 'review';

export type ListingPublicationStatus =
  | 'draft'
  | 'identity_pending'
  | 'evidence_required'
  | 'ai_analysis_pending'
  | 'ai_analysis_complete'
  | 'verification_preparation'
  | 'ready_to_send'
  | 'sent_to_ags'
  | 'received_by_ags'
  | 'verification_in_progress'
  | 'verified'
  | 'verification_failed'
  | 'changes_required'
  | 'ready_to_publish'
  | 'published'
  | 'paused'
  | 'cancelled';

export type EvidenceSlotKey =
  | 'front'
  | 'back'
  | 'surface_front'
  | 'surface_back'
  | 'corners_edges'
  | 'defect_closeup'
  | 'slab_front'
  | 'slab_back'
  | 'slab_label'
  | 'slab_cert'
  | 'slab_case_damage'
  | 'packaging_front'
  | 'packaging_back'
  | 'packaging_top'
  | 'packaging_bottom'
  | 'wrap_seam'
  | 'seal_closeup'
  | 'top_crimp'
  | 'bottom_crimp'
  | 'side_seam'
  | 'lot_contents';

export type EvidenceRequirement = {
  key: EvidenceSlotKey;
  label: string;
  instruction: string;
  requiredFor: ListingProtectionTier[];
  optional?: boolean;
};

export type ListingValueInput = {
  marketValue?: number | null;
  listingValue?: number | null;
  tradeValue?: number | null;
};

export type ListingTierDecision = {
  tier: ListingProtectionTier;
  calculationValue: number | null;
  valueSource: 'market' | 'listing' | 'trade' | 'unknown';
  reason: string;
  thresholdNote?: string;
};

export type MissingRequirement = {
  key: string;
  label: string;
};

export type ListingRequirementsInput = {
  categoryKey: string;
  productFamily: string;
  tier: ListingProtectionTier;
  sealedStatus?: string | null;
  grader?: string | null;
  integrations?: {
    ximilar?: boolean;
    certificationLookup?: boolean;
    agsLabel?: boolean;
    humanReview?: boolean;
  };
};

export type VerificationRequirements = {
  requiredPhotos: EvidenceRequirement[];
  requiresXimilar: boolean;
  requiresCertLookup: boolean;
  requiresSealReview: boolean;
  requiresHumanReview: boolean;
  requiresAGSLabel: boolean;
  publishState: 'live' | 'pending_verification';
};

const BRONZE_LIMIT = 20;
const GOLD_LIMIT = 200;
const SAFETY_BUFFER = 0.05;

export const EVIDENCE_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'front',
    label: 'Front photograph',
    instruction: 'Photograph the full front of the exact card the buyer or trader will receive.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'back',
    label: 'Back photograph',
    instruction: 'Photograph the full back in the same orientation, with the card flat and well lit.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'surface_front',
    label: 'Front surface view',
    instruction: 'Angle the front slightly so surface scratches, print lines or glare are visible.',
    requiredFor: ['silver', 'gold'],
  },
  {
    key: 'surface_back',
    label: 'Back surface view',
    instruction: 'Angle the back slightly so whitening, dents or surface marks can be reviewed.',
    requiredFor: ['silver', 'gold'],
  },
  {
    key: 'corners_edges',
    label: 'Corners and edges',
    instruction: 'Capture the corners and edges clearly for enhanced verification.',
    requiredFor: ['gold'],
  },
  {
    key: 'defect_closeup',
    label: 'Known defect close-up',
    instruction: 'Add a close-up of any crease, dent, whitening or other notable defect.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
];

const RAW_SILVER_PLUS_REQUIREMENTS = EVIDENCE_REQUIREMENTS.filter((slot) => ['surface_front', 'surface_back', 'corners_edges', 'defect_closeup'].includes(slot.key));

const SLAB_EVIDENCE_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'slab_front',
    label: 'Slab front',
    instruction: 'Photograph the full front of the slab, including the label and the card.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'slab_back',
    label: 'Slab back',
    instruction: 'Photograph the full back of the slab so the holder and back label are visible.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'slab_label',
    label: 'Certification label',
    instruction: 'Capture the grading label clearly, including the grade and certification number.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'slab_cert',
    label: 'QR or barcode',
    instruction: 'Optional: add this only if the QR or barcode is useful supporting evidence. The certification label photo is the required proof.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
  {
    key: 'slab_case_damage',
    label: 'Case damage',
    instruction: 'Photograph any scratches, chips, cracks, label damage or possible tampering.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
];

const SEALED_BASE_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'packaging_front',
    label: 'Front',
    instruction: 'Photograph the exact product from the front. Catalogue images do not count as seller evidence.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'packaging_back',
    label: 'Back',
    instruction: 'Photograph the back of the exact product, including barcode or product details where visible.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'seal_closeup',
    label: 'Seal area',
    instruction: 'Optional but recommended: capture the factory seal, tape or closure area clearly.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
  {
    key: 'wrap_seam',
    label: 'Wrap seam',
    instruction: 'Optional but recommended: photograph the plastic wrap seam or join where applicable.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
  {
    key: 'defect_closeup',
    label: 'Damage close-up',
    instruction: 'Add a close-up of any dents, tears, punctures, crushed corners or seal damage.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
];

const SEALED_BOX_EXTRA_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'packaging_top',
    label: 'Top',
    instruction: 'Optional but recommended: photograph the top panel or top seal area.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
  {
    key: 'packaging_bottom',
    label: 'Bottom',
    instruction: 'Optional but recommended: photograph the bottom panel or bottom seal area.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
];

const BOOSTER_PACK_EXTRA_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'top_crimp',
    label: 'Top crimp',
    instruction: 'Optional but recommended: photograph the unopened top crimp clearly.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
  {
    key: 'bottom_crimp',
    label: 'Bottom crimp',
    instruction: 'Optional but recommended: photograph the unopened bottom crimp clearly.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
  {
    key: 'side_seam',
    label: 'Side seams',
    instruction: 'Optional but recommended: capture any side seams, pinholes, tears or crimp concerns.',
    requiredFor: ['silver', 'gold'],
    optional: true,
  },
];

const LOT_REQUIREMENTS: EvidenceRequirement[] = [
  {
    key: 'front',
    label: 'Main photo',
    instruction: 'Photograph the complete lot or the main item being sold.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'lot_contents',
    label: 'Included contents',
    instruction: 'Photograph the included items clearly enough for buyers to understand the lot.',
    requiredFor: ['bronze', 'silver', 'gold'],
  },
  {
    key: 'defect_closeup',
    label: 'Damage close-up',
    instruction: 'Show any damage, missing contents or notable defects.',
    requiredFor: ['bronze', 'silver', 'gold'],
    optional: true,
  },
];

function uniqueEvidence(slots: EvidenceRequirement[]) {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.key)) return false;
    seen.add(slot.key);
    return true;
  });
}

export function getCategoryEvidenceRequirements(categoryKey: string, tier: ListingProtectionTier): EvidenceRequirement[] {
  if (categoryKey === 'graded_slab') {
    return SLAB_EVIDENCE_REQUIREMENTS.filter((slot) => slot.optional || slot.requiredFor.includes(tier));
  }

  if (categoryKey === 'raw_card') {
    return EVIDENCE_REQUIREMENTS.filter((slot) => slot.optional || slot.requiredFor.includes(tier));
  }

  if (categoryKey === 'booster_pack' || categoryKey === 'sleeved_booster_pack') {
    return uniqueEvidence([...SEALED_BASE_REQUIREMENTS, ...BOOSTER_PACK_EXTRA_REQUIREMENTS])
      .filter((slot) => slot.optional || slot.requiredFor.includes(tier));
  }

  if (categoryKey === 'booster_box' || categoryKey === 'elite_trainer_box' || categoryKey === 'booster_bundle') {
    return uniqueEvidence([...SEALED_BASE_REQUIREMENTS, ...SEALED_BOX_EXTRA_REQUIREMENTS])
      .filter((slot) => slot.optional || slot.requiredFor.includes(tier));
  }

  if (categoryKey === 'other' || categoryKey === 'accessories') {
    return LOT_REQUIREMENTS.filter((slot) => slot.optional || slot.requiredFor.includes(tier));
  }

  return SEALED_BASE_REQUIREMENTS.filter((slot) => slot.optional || slot.requiredFor.includes(tier));
}

export function getRequiredCategoryEvidence(categoryKey: string, tier: ListingProtectionTier) {
  return getCategoryEvidenceRequirements(categoryKey, tier).filter((slot) => !slot.optional && slot.requiredFor.includes(tier));
}

export const PROTECTION_COPY: Record<ListingProtectionTier, {
  label: string;
  revealTitle: string;
  message: string;
  accent: string;
  buyerCopy: string;
  sellerRequirements: string[];
}> = {
  bronze: {
    label: 'Bronze Protection',
    revealTitle: 'Bronze Protection',
    message: 'Essential listing evidence for lower-value cards.',
    accent: '#B7791F',
    buyerCopy: 'Buyers see front and back photographs, your condition estimate and the standard listing review.',
    sellerRequirements: [
      'Mandatory front photograph',
      'Mandatory back photograph',
      'Seller condition estimate',
      'Standard listing review',
    ],
  },
  silver: {
    label: 'Silver Protection',
    revealTitle: 'Silver Protection',
    message: 'AI-assisted condition evidence for higher-confidence trading.',
    accent: '#64748B',
    buyerCopy: 'Buyers see your declared condition, photographic evidence and Stackr AI condition estimate.',
    sellerRequirements: [
      'Bronze requirements included',
      'Guided additional condition images',
      'Ximilar condition estimate',
      'Seller confirmation or correction',
    ],
  },
  gold: {
    label: 'Gold Verified',
    revealTitle: 'Gold Verified',
    message: "Enhanced verification for Stackr's highest-value transactions.",
    accent: '#D97706',
    buyerCopy: 'Buyers see Gold verification status only after AGS confirmation is complete.',
    sellerRequirements: [
      'Bronze and Silver evidence included',
      'Detailed condition photography',
      'Ximilar condition estimate',
      'Verification record and label preparation',
      'AGS verification handoff before verified status is applied',
    ],
  },
};

function normaliseValue(value?: number | null) {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return Number(value);
}

export function calculateListingProtectionTier(input: ListingValueInput): ListingTierDecision {
  const values = [
    { source: 'market' as const, value: normaliseValue(input.marketValue) },
    { source: 'listing' as const, value: normaliseValue(input.listingValue) },
    { source: 'trade' as const, value: normaliseValue(input.tradeValue) },
  ].filter((entry): entry is { source: 'market' | 'listing' | 'trade'; value: number } => entry.value != null);

  if (!values.length) {
    return {
      tier: 'bronze',
      calculationValue: null,
      valueSource: 'unknown',
      reason: 'No market value is available yet. Stackr will use the entered transaction value when you add one.',
    };
  }

  const highest = values.reduce((best, entry) => entry.value > best.value ? entry : best, values[0]);
  const nearSilver = highest.value >= BRONZE_LIMIT * (1 - SAFETY_BUFFER);
  const nearGold = highest.value >= GOLD_LIMIT * (1 - SAFETY_BUFFER);

  if (highest.value > GOLD_LIMIT || nearGold) {
    return {
      tier: 'gold',
      calculationValue: highest.value,
      valueSource: highest.source,
      reason: 'The highest card or transaction value places this listing in Stackr Gold requirements.',
      thresholdNote: highest.value <= GOLD_LIMIT
        ? 'This value is close to the Gold threshold, so Stackr uses the safer higher tier.'
        : undefined,
    };
  }

  if (highest.value >= BRONZE_LIMIT || nearSilver) {
    return {
      tier: 'silver',
      calculationValue: highest.value,
      valueSource: highest.source,
      reason: 'The highest card or transaction value places this listing in Stackr Silver requirements.',
      thresholdNote: highest.value < BRONZE_LIMIT
        ? 'This value is close to the Silver threshold, so Stackr uses the safer higher tier.'
        : undefined,
    };
  }

  return {
    tier: 'bronze',
    calculationValue: highest.value,
    valueSource: highest.source,
    reason: 'The highest card or transaction value is below the Bronze threshold boundary.',
  };
}

export function getEvidenceRequirementsForTier(tier: ListingProtectionTier) {
  return EVIDENCE_REQUIREMENTS.filter((slot) => slot.optional || slot.requiredFor.includes(tier));
}

export function getRequiredEvidenceForTier(tier: ListingProtectionTier) {
  return EVIDENCE_REQUIREMENTS.filter((slot) => !slot.optional && slot.requiredFor.includes(tier));
}

export function getVerificationRequirements(input: ListingRequirementsInput): VerificationRequirements {
  const requiredPhotos = getRequiredCategoryEvidence(input.categoryKey, input.tier);
  const rawCard = input.productFamily === 'raw_card';
  const slab = input.productFamily === 'graded_slab';
  const sealed = input.productFamily.startsWith('sealed_');
  const requiresXimilar = rawCard && (input.tier === 'silver' || input.tier === 'gold') && input.integrations?.ximilar !== false;
  const requiresCertLookup = slab && (input.tier === 'silver' || input.tier === 'gold') && input.integrations?.certificationLookup === true;
  const requiresSealReview = false;
  const requiresHumanReview = input.integrations?.humanReview !== false && (
    (input.tier === 'gold' && !rawCard && !sealed)
    || (slab && input.tier === 'gold' && input.integrations?.certificationLookup !== true)
  );
  const requiresAGSLabel = rawCard && input.tier === 'gold' && input.integrations?.agsLabel !== false;

  return {
    requiredPhotos,
    requiresXimilar,
    requiresCertLookup,
    requiresSealReview,
    requiresHumanReview,
    requiresAGSLabel,
    publishState: requiresAGSLabel || requiresHumanReview ? 'pending_verification' : 'live',
  };
}

export function getListingProgressStages(tier: ListingProtectionTier, productFamily = 'raw_card'): ListingFlowStage[] {
  if (productFamily === 'graded_slab') {
    return ['card', 'condition', 'value', 'evidence', 'details', 'review'];
  }
  const stages: ListingFlowStage[] = ['card', 'condition', 'value', 'protection', 'evidence'];
  if (productFamily === 'raw_card' && (tier === 'silver' || tier === 'gold')) stages.push('ai');
  if (tier === 'gold' && !productFamily.startsWith('sealed_')) stages.push('gold');
  stages.push('details', 'review');
  return stages;
}

export function getListingProgressLabels(productFamily: string): Partial<Record<ListingFlowStage, string>> {
  if (productFamily === 'graded_slab') {
    return { card: 'Slab', condition: 'Case', evidence: 'Photos', gold: 'Review' };
  }
  if (productFamily.startsWith('sealed_')) {
    return { card: 'Product', condition: 'Sealed', evidence: 'Photos', gold: 'Review' };
  }
  if (productFamily === 'other' || productFamily === 'multi_item_lot') {
    return { card: 'Item', condition: 'Details', evidence: 'Photos', gold: 'Review' };
  }
  return {};
}

export function formatProtectionTier(tier: ListingProtectionTier) {
  return PROTECTION_COPY[tier].label;
}

export function formatCurrency(value?: number | null, currency = 'GBP') {
  if (value == null || Number.isNaN(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function getMissingListingRequirements(input: {
  identityConfirmed: boolean;
  conditionSelected: boolean;
  valueEntered: boolean;
  tier: ListingProtectionTier;
  capturedEvidenceKeys: string[];
  aiComplete: boolean;
  goldReady: boolean;
  detailsComplete: boolean;
  sellerDeclarationAccepted: boolean;
  requiredEvidence?: EvidenceRequirement[];
}) {
  const missing: MissingRequirement[] = [];

  if (!input.identityConfirmed) missing.push({ key: 'identity', label: 'Confirm the card identity' });
  if (!input.conditionSelected) missing.push({ key: 'condition', label: 'Choose a condition estimate' });
  if (!input.valueEntered) missing.push({ key: 'value', label: 'Add a listing or trade value' });

  const capturedSet = new Set(input.capturedEvidenceKeys);
  for (const requirement of input.requiredEvidence ?? getRequiredEvidenceForTier(input.tier)) {
    if (!capturedSet.has(requirement.key)) {
      missing.push({ key: requirement.key, label: `Add the ${requirement.label.toLowerCase()}` });
    }
  }

  if ((input.tier === 'silver' || input.tier === 'gold') && !input.aiComplete) {
    missing.push({ key: 'ai', label: 'Complete the AI-assisted condition estimate' });
  }

  if (input.tier === 'gold' && !input.goldReady) {
    missing.push({ key: 'gold', label: 'Prepare the Gold verification record' });
  }

  if (!input.detailsComplete) missing.push({ key: 'details', label: 'Complete listing details' });
  if (!input.sellerDeclarationAccepted) missing.push({ key: 'declaration', label: 'Accept the seller declaration' });

  return missing;
}

export function createVerificationId(seed = Date.now()) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `STK-GOLD-${seed.toString(36).toUpperCase()}-${random}`;
}
