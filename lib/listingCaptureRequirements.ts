import { getGraderDefinition } from './graderRegistry';
import {
  formatProtectionTier,
  type EvidenceRequirement,
  type EvidenceSlotKey,
  type ListingProtectionTier,
} from './listingFlow';
import { getPhotoPurposeForCaptureType, type ListingPhotoPurpose } from './listingPhotoValidation';

export type CaptureType =
  | 'full_front'
  | 'full_back'
  | 'corner_top_left'
  | 'corner_top_right'
  | 'corner_bottom_left'
  | 'corner_bottom_right'
  | 'edge_top'
  | 'edge_bottom'
  | 'edge_left'
  | 'edge_right'
  | 'surface_front'
  | 'surface_back'
  | 'slab_front'
  | 'slab_back'
  | 'slab_label'
  | 'slab_qr'
  | 'packaging_front'
  | 'packaging_back'
  | 'packaging_top'
  | 'packaging_bottom'
  | 'sealed_detail'
  | 'optional_detail';

export type CaptureRequirementState = 'required' | 'optional' | 'not_applicable';

export type CaptureRequirement = {
  id: string;
  evidenceKey: EvidenceSlotKey;
  label: string;
  instruction: string;
  captureType: CaptureType;
  photoPurpose: ListingPhotoPurpose;
  state: CaptureRequirementState;
  required: boolean;
  optional: boolean;
  completed: boolean;
  reason?: string;
  groupLabel?: string;
  overlayLabel?: string;
  grader?: string | null;
  slabProfile?: string | null;
};

type CaptureTemplate = {
  suffix?: string;
  label: string;
  instruction: string;
  captureType: CaptureType;
  groupLabel?: string;
  overlayLabel?: string;
};

export type CaptureRequirementsInput = {
  requirements: EvidenceRequirement[];
  categoryKey: string;
  productFamily: string;
  tier: ListingProtectionTier;
  grader?: string | null;
  capturedPhotoIds?: string[];
};

const RAW_CAPTURE_TEMPLATES: Partial<Record<EvidenceSlotKey, CaptureTemplate[]>> = {
  front: [{
    label: 'Front',
    instruction: 'Fit the entire front of the card inside the guide.',
    captureType: 'full_front',
    groupLabel: 'Full card',
  }],
  back: [{
    label: 'Back',
    instruction: 'Turn the card over and fit the entire back inside the guide.',
    captureType: 'full_back',
    groupLabel: 'Full card',
  }],
  surface_front: [{
    label: 'Front surface',
    instruction: 'Tilt the front slightly so scratches, print lines and dents can catch the light.',
    captureType: 'surface_front',
    groupLabel: 'Surface',
  }],
  surface_back: [{
    label: 'Back surface',
    instruction: 'Tilt the back slightly so whitening, dents and surface marks can be reviewed.',
    captureType: 'surface_back',
    groupLabel: 'Surface',
  }],
  corners_edges: [
    {
      suffix: 'corner_top_left',
      label: 'Top-left corner',
      instruction: 'Fill the guide with the top-left corner. Keep the corner and both adjoining edges visible.',
      captureType: 'corner_top_left',
      groupLabel: 'Corners',
      overlayLabel: 'Top left',
    },
    {
      suffix: 'corner_top_right',
      label: 'Top-right corner',
      instruction: 'Fill the guide with the top-right corner. Keep the corner and both adjoining edges visible.',
      captureType: 'corner_top_right',
      groupLabel: 'Corners',
      overlayLabel: 'Top right',
    },
    {
      suffix: 'corner_bottom_left',
      label: 'Bottom-left corner',
      instruction: 'Fill the guide with the bottom-left corner. Keep the corner and both adjoining edges visible.',
      captureType: 'corner_bottom_left',
      groupLabel: 'Corners',
      overlayLabel: 'Bottom left',
    },
    {
      suffix: 'corner_bottom_right',
      label: 'Bottom-right corner',
      instruction: 'Fill the guide with the bottom-right corner. Keep the corner and both adjoining edges visible.',
      captureType: 'corner_bottom_right',
      groupLabel: 'Corners',
      overlayLabel: 'Bottom right',
    },
    {
      suffix: 'edge_top',
      label: 'Top edge',
      instruction: 'Fit the complete top edge inside the narrow guide with both top corners visible.',
      captureType: 'edge_top',
      groupLabel: 'Edges',
      overlayLabel: 'Top edge',
    },
    {
      suffix: 'edge_bottom',
      label: 'Bottom edge',
      instruction: 'Fit the complete bottom edge inside the narrow guide with both bottom corners visible.',
      captureType: 'edge_bottom',
      groupLabel: 'Edges',
      overlayLabel: 'Bottom edge',
    },
    {
      suffix: 'edge_left',
      label: 'Left edge',
      instruction: 'Fit the complete left edge inside the narrow guide with both left corners visible.',
      captureType: 'edge_left',
      groupLabel: 'Edges',
      overlayLabel: 'Left edge',
    },
    {
      suffix: 'edge_right',
      label: 'Right edge',
      instruction: 'Fit the complete right edge inside the narrow guide with both right corners visible.',
      captureType: 'edge_right',
      groupLabel: 'Edges',
      overlayLabel: 'Right edge',
    },
  ],
  defect_closeup: [{
    label: 'Defect close-up',
    instruction: 'Photograph any crease, dent, whitening, scratch or other notable defect clearly.',
    captureType: 'optional_detail',
    groupLabel: 'Optional detail',
  }],
};

const SLAB_CAPTURE_TEMPLATES: Partial<Record<EvidenceSlotKey, CaptureTemplate[]>> = {
  slab_front: [{
    label: 'Slab front',
    instruction: 'Fit the complete front of the slab inside the guide.',
    captureType: 'slab_front',
    groupLabel: 'Slab',
  }],
  slab_back: [{
    label: 'Slab back',
    instruction: 'Turn the slab over and fit the complete back inside the guide.',
    captureType: 'slab_back',
    groupLabel: 'Slab',
  }],
  slab_label: [{
    label: 'Certification label',
    instruction: 'Fill the label guide while keeping the grader, grade, certification number and code readable.',
    captureType: 'slab_label',
    groupLabel: 'Certification',
  }],
  slab_cert: [{
    label: 'QR or barcode',
    instruction: 'Line up the QR code or barcode. You can manually confirm the certification number after capture.',
    captureType: 'slab_qr',
    groupLabel: 'Certification',
  }],
  slab_case_damage: [{
    label: 'Case damage',
    instruction: 'Photograph any scratches, chips, cracks, label damage or possible tampering.',
    captureType: 'optional_detail',
    groupLabel: 'Optional detail',
  }],
};

const PACKAGING_CAPTURE_TEMPLATES: Partial<Record<EvidenceSlotKey, CaptureTemplate[]>> = {
  packaging_front: [{
    label: 'Product front',
    instruction: 'Fit the exact product front inside the guide.',
    captureType: 'packaging_front',
    groupLabel: 'Product',
  }],
  packaging_back: [{
    label: 'Product back',
    instruction: 'Turn the product over and keep the barcode or product details visible where present.',
    captureType: 'packaging_back',
    groupLabel: 'Product',
  }],
  packaging_top: [{
    label: 'Top panel',
    instruction: 'Photograph the top panel or top seal area clearly.',
    captureType: 'packaging_top',
    groupLabel: 'Optional detail',
  }],
  packaging_bottom: [{
    label: 'Bottom panel',
    instruction: 'Photograph the bottom panel or bottom seal area clearly.',
    captureType: 'packaging_bottom',
    groupLabel: 'Optional detail',
  }],
  wrap_seam: [{
    label: 'Wrap seam',
    instruction: 'Photograph the plastic wrap join so the seal can be checked.',
    captureType: 'sealed_detail',
    groupLabel: 'Optional detail',
  }],
  seal_closeup: [{
    label: 'Seal area',
    instruction: 'Capture the factory seal, tape or closure area clearly.',
    captureType: 'sealed_detail',
    groupLabel: 'Optional detail',
  }],
  top_crimp: [{
    label: 'Top crimp',
    instruction: 'Fill the guide with the unopened top crimp.',
    captureType: 'sealed_detail',
    groupLabel: 'Optional detail',
  }],
  bottom_crimp: [{
    label: 'Bottom crimp',
    instruction: 'Fill the guide with the unopened bottom crimp.',
    captureType: 'sealed_detail',
    groupLabel: 'Optional detail',
  }],
  side_seam: [{
    label: 'Side seams',
    instruction: 'Capture the side seams, pinholes, tears or crimp concerns clearly.',
    captureType: 'sealed_detail',
    groupLabel: 'Optional detail',
  }],
  defect_closeup: [{
    label: 'Damage close-up',
    instruction: 'Show any dents, tears, punctures, crushed corners or seal damage.',
    captureType: 'optional_detail',
    groupLabel: 'Optional detail',
  }],
  lot_contents: [{
    label: 'Included contents',
    instruction: 'Fit all included contents in the guide so buyers can see what is included.',
    captureType: 'packaging_front',
    groupLabel: 'Contents',
  }],
  front: [{
    label: 'Main photo',
    instruction: 'Fit the complete item or lot inside the guide.',
    captureType: 'packaging_front',
    groupLabel: 'Product',
  }],
};

function getTemplatesForRequirement(
  requirement: EvidenceRequirement,
  categoryKey: string,
  productFamily: string
): CaptureTemplate[] {
  if (categoryKey === 'graded_slab' || productFamily === 'graded_slab') {
    return SLAB_CAPTURE_TEMPLATES[requirement.key] ?? [{
      label: requirement.label,
      instruction: requirement.instruction,
      captureType: 'optional_detail',
      groupLabel: 'Slab',
    }];
  }

  if (categoryKey === 'raw_card' || productFamily === 'raw_card') {
    return RAW_CAPTURE_TEMPLATES[requirement.key] ?? [{
      label: requirement.label,
      instruction: requirement.instruction,
      captureType: 'optional_detail',
      groupLabel: 'Card',
    }];
  }

  return PACKAGING_CAPTURE_TEMPLATES[requirement.key] ?? [{
    label: requirement.label,
    instruction: requirement.instruction,
    captureType: 'optional_detail',
    groupLabel: 'Product',
  }];
}

function buildCaptureId(requirement: EvidenceRequirement, template: CaptureTemplate) {
  return template.suffix ? `${requirement.key}:${template.suffix}` : requirement.key;
}

function getSlabProfile(grader?: string | null) {
  const definition = getGraderDefinition(grader);
  return definition?.labelTemplateKey ?? null;
}

function getRequirementReasonTarget(template: CaptureTemplate) {
  if (template.captureType.startsWith('corner_')) return 'this corner';
  if (template.captureType.startsWith('edge_')) return 'this edge';

  const label = (template.groupLabel ?? 'photo').toLowerCase();
  if (label.endsWith('s')) return `these ${label}`;
  return `this ${label}`;
}

export function getCaptureRequirementsForListing(input: CaptureRequirementsInput): CaptureRequirement[] {
  const captured = new Set(input.capturedPhotoIds ?? []);
  const tierLabel = formatProtectionTier(input.tier);
  const slabProfile = getSlabProfile(input.grader);

  return input.requirements.flatMap((requirement) => {
    const required = !requirement.optional && requirement.requiredFor.includes(input.tier);
    const optional = Boolean(requirement.optional || !required);
    const state: CaptureRequirementState = required ? 'required' : 'optional';
    const templates = getTemplatesForRequirement(requirement, input.categoryKey, input.productFamily);

    return templates.map((template) => {
      const id = buildCaptureId(requirement, template);
      return {
        id,
        evidenceKey: requirement.key,
        label: template.label,
        instruction: template.instruction || requirement.instruction,
        captureType: template.captureType,
        photoPurpose: getPhotoPurposeForCaptureType(template.captureType),
        state,
        required,
        optional,
        completed: captured.has(id),
        reason: required ? `${tierLabel} requires ${getRequirementReasonTarget(template)}.` : undefined,
        groupLabel: template.groupLabel,
        overlayLabel: template.overlayLabel,
        grader: input.grader ?? null,
        slabProfile,
      };
    });
  });
}

export function getCaptureRequirementProgress(requirements: CaptureRequirement[]) {
  const required = requirements.filter((requirement) => requirement.required);
  const optional = requirements.filter((requirement) => !requirement.required);
  return {
    requiredTotal: required.length,
    requiredComplete: required.filter((requirement) => requirement.completed).length,
    optionalTotal: optional.length,
    optionalComplete: optional.filter((requirement) => requirement.completed).length,
    requiredDone: required.every((requirement) => requirement.completed),
  };
}

export function getCompletedEvidenceKeys(requirements: CaptureRequirement[]) {
  const grouped = requirements.reduce((map, requirement) => {
    const existing = map.get(requirement.evidenceKey) ?? [];
    existing.push(requirement);
    map.set(requirement.evidenceKey, existing);
    return map;
  }, new Map<EvidenceSlotKey, CaptureRequirement[]>());

  const completed: EvidenceSlotKey[] = [];
  grouped.forEach((items, evidenceKey) => {
    const requiredItems = items.filter((item) => item.required);
    if (requiredItems.length) {
      if (requiredItems.every((item) => item.completed)) completed.push(evidenceKey);
      return;
    }
    if (items.some((item) => item.completed)) completed.push(evidenceKey);
  });
  return completed;
}

export function getRequirementById(requirements: CaptureRequirement[], id: string) {
  return requirements.find((requirement) => requirement.id === id) ?? null;
}

export function extractCertificationNumberFromText(value?: string | null) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const digitRuns = text.match(/\d[\d\s-]{5,}\d/g) ?? [];
  const cleaned = digitRuns
    .map((run) => run.replace(/\D/g, ''))
    .filter((run) => run.length >= 6)
    .sort((a, b) => b.length - a.length);

  return cleaned[0] ?? null;
}
