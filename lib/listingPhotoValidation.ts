import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import type { CaptureType } from './listingCaptureRequirements';
import type { ListingProtectionTier } from './listingFlow';

export type ListingPhotoPurpose =
  | 'raw_card_front'
  | 'raw_card_back'
  | 'corner'
  | 'edge'
  | 'surface'
  | 'graded_slab_front'
  | 'graded_slab_back'
  | 'label'
  | 'booster_seal'
  | 'product_front'
  | 'collection_overview'
  | 'optional_display_image';

export type ListingPhotoSource = 'guided_camera' | 'system_camera' | 'library';
export type ListingPhotoIssueSeverity = 'info' | 'warning' | 'retake' | 'block';

export type ListingPhotoIssueCode =
  | 'unreadable_image'
  | 'no_expected_item'
  | 'severe_blur'
  | 'camera_shake'
  | 'excessive_glare'
  | 'underexposed'
  | 'overexposed'
  | 'subject_too_small'
  | 'cropped_required_area'
  | 'finger_obstruction'
  | 'multiple_items'
  | 'wrong_side'
  | 'screenshot_uploaded'
  | 'duplicate_photo'
  | 'minor_quality_warning';

export type ListingPhotoQualityIssue = {
  code: ListingPhotoIssueCode;
  severity: ListingPhotoIssueSeverity;
  message: string;
  guidance: string;
  priority: number;
  canOverride: boolean;
  evidence?: Record<string, number | string | boolean | null>;
};

export type ListingPhotoValidationMetrics = {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  darkRatio: number;
  brightRatio: number;
  glareRatio: number;
  skinRatio: number;
  edgeDensity: number;
  focusScore: number;
  aspectRatio: number;
};

export type ListingPhotoValidationResult = {
  purpose: ListingPhotoPurpose;
  purposeLabel: string;
  fullCardVisible: boolean;
  steady: boolean;
  lighting: boolean;
  singleCard: boolean;
  glareOk: boolean;
  warning: string | null;
  issues: ListingPhotoQualityIssue[];
  highestPriorityIssue: ListingPhotoQualityIssue | null;
  severity: ListingPhotoIssueSeverity;
  requiresRetake: boolean;
  canOverride: boolean;
  imageFingerprint: string | null;
  overrideAccepted?: boolean;
  overrideReason?: string | null;
  metrics?: ListingPhotoValidationMetrics | null;
};

export type ListingPhotoValidationInput = {
  base64?: string | null;
  captureType: CaptureType;
  purpose?: ListingPhotoPurpose | null;
  tier?: ListingProtectionTier;
  required?: boolean;
  source?: ListingPhotoSource;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  ocrText?: string | null;
};

const PURPOSE_LABELS: Record<ListingPhotoPurpose, string> = {
  raw_card_front: 'Raw-card front',
  raw_card_back: 'Raw-card back',
  corner: 'Corner',
  edge: 'Edge',
  surface: 'Surface',
  graded_slab_front: 'Graded-slab front',
  graded_slab_back: 'Graded-slab back',
  label: 'Label',
  booster_seal: 'Booster seal',
  product_front: 'Product front',
  collection_overview: 'Collection overview',
  optional_display_image: 'Optional display image',
};

const SEVERITY_RANK: Record<ListingPhotoIssueSeverity, number> = {
  info: 0,
  warning: 1,
  retake: 2,
  block: 3,
};

function cleanBase64(value?: string | null) {
  return String(value ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function round(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lumaAt(data: Uint8Array, width: number, height: number, x: number, y: number) {
  const clampedX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const offset = (clampedY * width + clampedX) * 4;
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

function isLikelySkin(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 95
    && g > 40
    && b > 20
    && max - min > 15
    && Math.abs(r - g) > 15
    && r > g
    && r > b;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)))];
}

function getImageFingerprint(lumas: number[]) {
  if (!lumas.length) return null;
  const average = lumas.reduce((sum, value) => sum + value, 0) / lumas.length;
  let fingerprint = '';
  for (let index = 0; index < lumas.length; index += 4) {
    const nibble = [0, 1, 2, 3].reduce((value, bit) => (
      value | ((lumas[index + bit] ?? average) >= average ? 1 << bit : 0)
    ), 0);
    fingerprint += nibble.toString(16);
  }
  return fingerprint;
}

function readImageStats(base64?: string | null) {
  const cleaned = cleanBase64(base64);
  if (!cleaned) return null;

  const decoded = decodeJpeg(Buffer.from(cleaned, 'base64'), { useTArray: true });
  const { data, width, height } = decoded;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 118));
  const hashGrid = 8;
  const hashLumas: number[] = [];
  const gradients: number[] = [];
  let count = 0;
  let total = 0;
  let totalSquared = 0;
  let dark = 0;
  let bright = 0;
  let glare = 0;
  let skin = 0;
  let edge = 0;

  for (let gridY = 0; gridY < hashGrid; gridY += 1) {
    for (let gridX = 0; gridX < hashGrid; gridX += 1) {
      hashLumas.push(lumaAt(data, width, height, (gridX + 0.5) * width / hashGrid, (gridY + 0.5) * height / hashGrid));
    }
  }

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const right = lumaAt(data, width, height, x + step, y);
      const down = lumaAt(data, width, height, x, y + step);
      const gradient = Math.abs(luma - right) + Math.abs(luma - down);

      count += 1;
      total += luma;
      totalSquared += luma * luma;
      gradients.push(gradient);
      if (luma < 38) dark += 1;
      if (luma > 232) bright += 1;
      if (luma > 244 && gradient < 48) glare += 1;
      if (gradient > 42) edge += 1;
      if (isLikelySkin(r, g, b)) skin += 1;
    }
  }

  const brightness = count ? total / count : 0;
  const variance = count ? Math.max(0, totalSquared / count - brightness * brightness) : 0;
  const contrast = Math.sqrt(variance);
  const focusGradient = percentile(gradients, 0.9);
  const edgeDensity = count ? edge / count : 0;
  const focusScore = clamp01((focusGradient - 10) / 72 * 0.6 + Math.min(1, edgeDensity / 0.12) * 0.4);

  return {
    metrics: {
      width,
      height,
      brightness: round(brightness, 1),
      contrast: round(contrast, 1),
      darkRatio: round(count ? dark / count : 0),
      brightRatio: round(count ? bright / count : 0),
      glareRatio: round(count ? glare / count : 0),
      skinRatio: round(count ? skin / count : 0),
      edgeDensity: round(edgeDensity),
      focusScore: round(focusScore),
      aspectRatio: round(width / Math.max(1, height)),
    },
    fingerprint: getImageFingerprint(hashLumas),
  };
}

export function getPhotoPurposeForCaptureType(captureType: CaptureType): ListingPhotoPurpose {
  if (captureType === 'full_front') return 'raw_card_front';
  if (captureType === 'full_back') return 'raw_card_back';
  if (captureType.startsWith('corner_')) return 'corner';
  if (captureType.startsWith('edge_')) return 'edge';
  if (captureType.startsWith('surface_')) return 'surface';
  if (captureType === 'slab_front') return 'graded_slab_front';
  if (captureType === 'slab_back') return 'graded_slab_back';
  if (captureType === 'slab_label' || captureType === 'slab_qr') return 'label';
  if (captureType === 'sealed_detail' || captureType === 'packaging_top' || captureType === 'packaging_bottom') return 'booster_seal';
  if (captureType === 'packaging_front' || captureType === 'packaging_back') return 'product_front';
  return 'optional_display_image';
}

function isCardLikePurpose(purpose: ListingPhotoPurpose) {
  return purpose === 'raw_card_front'
    || purpose === 'raw_card_back'
    || purpose === 'corner'
    || purpose === 'edge'
    || purpose === 'surface';
}

function isSingleItemPurpose(purpose: ListingPhotoPurpose) {
  return purpose !== 'collection_overview' && purpose !== 'optional_display_image';
}

function addIssue(
  issues: ListingPhotoQualityIssue[],
  issue: Omit<ListingPhotoQualityIssue, 'priority' | 'canOverride'> & {
    priority?: number;
    canOverride?: boolean;
  }
) {
  issues.push({
    priority: issue.priority ?? issues.length + 1,
    canOverride: issue.canOverride ?? issue.severity === 'warning',
    ...issue,
  });
}

function getTierStrictness(tier: ListingProtectionTier) {
  if (tier === 'gold') return { focus: 0.42, glare: 0.14, low: 45, high: 232 };
  if (tier === 'silver') return { focus: 0.34, glare: 0.18, low: 38, high: 238 };
  return { focus: 0.25, glare: 0.24, low: 30, high: 244 };
}

function looksLikeScreenshot(input: ListingPhotoValidationInput, metrics: ListingPhotoValidationMetrics) {
  if (input.source !== 'library') return false;
  if (/screen\s?shot|screenshot|screen_shot|img_\d{4}\.png/i.test(input.fileName ?? '')) return true;
  const ratio = metrics.width / Math.max(1, metrics.height);
  const portraitPhoneRatio = ratio > 0.52 && ratio < 0.59;
  const landscapePhoneRatio = ratio > 1.72 && ratio < 1.95;
  return (portraitPhoneRatio || landscapePhoneRatio) && metrics.edgeDensity > 0.18 && metrics.brightRatio > 0.18;
}

function getGuidedExpectedAspectRatio(purpose: ListingPhotoPurpose) {
  if (purpose === 'raw_card_front' || purpose === 'raw_card_back') return 0.716;
  if (purpose === 'graded_slab_front' || purpose === 'graded_slab_back') return 0.68;
  return null;
}

function looksCroppedInGuide(input: ListingPhotoValidationInput, purpose: ListingPhotoPurpose, metrics: ListingPhotoValidationMetrics) {
  if (input.source !== 'guided_camera') return false;
  const expectedAspectRatio = getGuidedExpectedAspectRatio(purpose);
  if (!expectedAspectRatio) return false;
  const portraitError = Math.abs(metrics.aspectRatio - expectedAspectRatio) / expectedAspectRatio;
  const landscapeAspectRatio = 1 / expectedAspectRatio;
  const landscapeError = Math.abs(metrics.aspectRatio - landscapeAspectRatio) / landscapeAspectRatio;
  return Math.min(portraitError, landscapeError) > 0.38;
}

function getWrongSideIssue(purpose: ListingPhotoPurpose, ocrText?: string | null) {
  const text = String(ocrText ?? '').toLowerCase();
  if (!text) return null;
  const looksFront = /\b(hp|attack|ability|weakness|resistance|retreat|trainer|supporter|stage|evolves)\b/i.test(text);
  const looksBackStable = /\bpok[e\u00e9]mon\b/.test(text) && !looksFront;
  const looksBack = /\bpok[eé]mon\b/.test(text) && !looksFront;
  if (purpose === 'raw_card_back' && looksFront) {
    return {
      code: 'wrong_side' as const,
      severity: 'retake' as const,
      message: 'Retake needed: this looks like the front of the card, but the back photo is required.',
      guidance: 'Turn the card over and capture the full back.',
      priority: 2,
      canOverride: false,
    };
  }
  if (purpose === 'raw_card_front' && (looksBack || looksBackStable)) {
    return {
      code: 'wrong_side' as const,
      severity: 'retake' as const,
      message: 'Retake needed: this looks like the back of the card, but the front photo is required.',
      guidance: 'Turn the card over and capture the full front.',
      priority: 2,
      canOverride: false,
    };
  }
  return null;
}

export function validateListingPhotoQuality(input: ListingPhotoValidationInput): ListingPhotoValidationResult {
  const tier = input.tier ?? 'bronze';
  const purpose = input.purpose ?? getPhotoPurposeForCaptureType(input.captureType);
  const issues: ListingPhotoQualityIssue[] = [];
  let stats: ReturnType<typeof readImageStats> | null = null;

  try {
    stats = readImageStats(input.base64);
  } catch {
    stats = null;
  }

  if (!stats) {
    addIssue(issues, {
      code: 'unreadable_image',
      severity: 'block',
      message: 'Retake needed: this image could not be read.',
      guidance: 'Take a new photograph with the item inside the guide.',
      priority: 1,
      canOverride: false,
    });
  } else {
    const metrics = stats.metrics;
    const strictness = getTierStrictness(tier);
    const labelLike = purpose === 'label';
    const cardLike = isCardLikePurpose(purpose);
    const expectedItem = isSingleItemPurpose(purpose);
    const severeBlur = metrics.focusScore < 0.12 || metrics.contrast < 7;
    const blurWarning = metrics.focusScore < (labelLike ? Math.max(strictness.focus, 0.45) : strictness.focus);
    const underexposed = metrics.brightness < strictness.low || metrics.darkRatio > (tier === 'bronze' ? 0.64 : 0.5);
    const overexposed = metrics.brightness > strictness.high || metrics.brightRatio > (tier === 'bronze' ? 0.52 : 0.38);
    const glareLimit = labelLike ? Math.min(strictness.glare, 0.1) : strictness.glare;
    const glare = metrics.glareRatio > glareLimit || (labelLike && metrics.brightRatio > 0.22);
    const noExpectedItem = expectedItem && metrics.edgeDensity < 0.006 && metrics.contrast < 10;
    const subjectTooSmall = cardLike && metrics.edgeDensity < 0.012 && metrics.contrast >= 10;
    const likelyMultipleItems = cardLike && metrics.aspectRatio > 1.12 && metrics.edgeDensity > 0.19 && purpose !== 'edge';
    const likelyFinger = metrics.skinRatio > (tier === 'bronze' ? 0.2 : 0.14);
    const screenshot = looksLikeScreenshot(input, metrics);
    const croppedInGuide = looksCroppedInGuide(input, purpose, metrics);

    if (screenshot && input.required) {
      addIssue(issues, {
        code: 'screenshot_uploaded',
        severity: 'block',
        message: 'Retake needed: screenshots cannot be used for required seller evidence.',
        guidance: 'Use a real photograph of the exact item being listed.',
        priority: 1,
        canOverride: false,
      });
    }

    if (noExpectedItem) {
      addIssue(issues, {
        code: 'no_expected_item',
        severity: 'block',
        message: purpose === 'label'
          ? 'We could not detect a readable slab label in this image.'
          : 'We could not detect the expected item in this image.',
        guidance: purpose === 'label'
          ? 'Place the label inside the guide and try again.'
          : 'Place the item inside the guide and try again.',
        priority: 1,
        canOverride: false,
      });
    }

    if (croppedInGuide) {
      addIssue(issues, {
        code: 'cropped_required_area',
        severity: tier === 'bronze' && !input.required ? 'warning' : 'retake',
        message: 'Retake needed: the full item does not appear to fit inside the guide.',
        guidance: 'Show the full card or slab inside the frame.',
        priority: 2,
        canOverride: tier === 'bronze' && !input.required,
        evidence: { aspectRatio: metrics.aspectRatio },
      });
    }

    const wrongSide = getWrongSideIssue(purpose, input.ocrText);
    if (wrongSide) addIssue(issues, wrongSide);

    if (severeBlur) {
      addIssue(issues, {
        code: 'severe_blur',
        severity: 'block',
        message: 'Retake needed: the photo is too blurred to confirm the item or condition.',
        guidance: 'Hold steady, tap to focus, and take the photo again.',
        priority: 3,
        canOverride: false,
        evidence: { focusScore: metrics.focusScore, contrast: metrics.contrast },
      });
    } else if (blurWarning) {
      addIssue(issues, {
        code: 'camera_shake',
        severity: tier === 'gold' && input.required ? 'retake' : 'warning',
        message: labelLike
          ? 'The label is a little soft; the grade or serial number may be hard to confirm.'
          : 'The photo is a little soft, but the item may still be usable.',
        guidance: 'Hold steady and tap to focus.',
        priority: 4,
        canOverride: tier !== 'gold' || !input.required,
        evidence: { focusScore: metrics.focusScore },
      });
    }

    if (underexposed) {
      addIssue(issues, {
        code: 'underexposed',
        severity: metrics.brightness < 18 || tier === 'gold' && input.required ? 'retake' : 'warning',
        message: 'The photo is too dark to review confidently.',
        guidance: 'More light required.',
        priority: 5,
        canOverride: tier !== 'gold' || !input.required,
        evidence: { brightness: metrics.brightness, darkRatio: metrics.darkRatio },
      });
    }

    if (overexposed) {
      addIssue(issues, {
        code: 'overexposed',
        severity: metrics.brightRatio > 0.68 || tier === 'gold' && input.required ? 'retake' : 'warning',
        message: 'The photo is too bright in key areas.',
        guidance: 'Reduce glare or move away from direct light.',
        priority: 5,
        canOverride: tier !== 'gold' || !input.required,
        evidence: { brightness: metrics.brightness, brightRatio: metrics.brightRatio },
      });
    }

    if (glare) {
      addIssue(issues, {
        code: 'excessive_glare',
        severity: labelLike || tier === 'gold' && input.required ? 'retake' : 'warning',
        message: labelLike
          ? 'Retake needed: glare obscures the grade or certification label.'
          : 'Glare may hide condition detail.',
        guidance: 'Reduce glare.',
        priority: labelLike ? 2 : 6,
        canOverride: !labelLike && (tier !== 'gold' || !input.required),
        evidence: { glareRatio: metrics.glareRatio, brightRatio: metrics.brightRatio },
      });
    }

    if (subjectTooSmall) {
      addIssue(issues, {
        code: 'subject_too_small',
        severity: tier === 'bronze' ? 'warning' : 'retake',
        message: 'The card appears too small to review condition clearly.',
        guidance: 'Move closer.',
        priority: 3,
        canOverride: tier === 'bronze',
        evidence: { edgeDensity: metrics.edgeDensity },
      });
    }

    if (likelyFinger) {
      addIssue(issues, {
        code: 'finger_obstruction',
        severity: tier === 'bronze' ? 'warning' : 'retake',
        message: 'A finger or hand may be covering important detail.',
        guidance: 'Keep fingers away from the card, label or seal.',
        priority: 2,
        canOverride: tier === 'bronze',
        evidence: { skinRatio: metrics.skinRatio },
      });
    }

    if (likelyMultipleItems) {
      addIssue(issues, {
        code: 'multiple_items',
        severity: 'warning',
        message: 'This photo may include more than one card.',
        guidance: 'Show one card only for this required angle.',
        priority: 7,
        canOverride: tier !== 'gold',
        evidence: { aspectRatio: metrics.aspectRatio, edgeDensity: metrics.edgeDensity },
      });
    }
  }

  const highestPriorityIssue = [...issues].sort((a, b) => a.priority - b.priority || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0] ?? null;
  const severity = issues.reduce<ListingPhotoIssueSeverity>((current, issue) => (
    SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current] ? issue.severity : current
  ), 'info');
  const requiresRetake = issues.some((issue) => issue.severity === 'block' || issue.severity === 'retake');
  const canOverride = Boolean(issues.length)
    && !issues.some((issue) => issue.severity === 'block' || !issue.canOverride)
    && !(tier === 'gold' && input.required);

  return {
    purpose,
    purposeLabel: PURPOSE_LABELS[purpose],
    fullCardVisible: !issues.some((issue) => issue.code === 'no_expected_item' || issue.code === 'subject_too_small' || issue.code === 'cropped_required_area'),
    steady: !issues.some((issue) => issue.code === 'severe_blur' || issue.code === 'camera_shake'),
    lighting: !issues.some((issue) => issue.code === 'underexposed' || issue.code === 'overexposed'),
    singleCard: !issues.some((issue) => issue.code === 'multiple_items'),
    glareOk: !issues.some((issue) => issue.code === 'excessive_glare'),
    warning: highestPriorityIssue?.message ?? null,
    issues,
    highestPriorityIssue,
    severity,
    requiresRetake,
    canOverride,
    imageFingerprint: stats?.fingerprint ?? null,
    metrics: stats?.metrics ?? null,
  };
}

export function hammingDistance(a?: string | null, b?: string | null) {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = Number.parseInt(a[index], 16);
    const right = Number.parseInt(b[index], 16);
    let diff = left ^ right;
    while (diff) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

export function isLikelyDuplicateListingPhoto(a?: string | null, b?: string | null) {
  return hammingDistance(a, b) <= 3;
}
