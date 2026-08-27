import { getGraderDefinition } from './graderRegistry';
import {
  gate0CopyContainsRestrictedCommerceLanguage,
  sanitizeGate0CommerceCopy,
} from './gate0CommerceCopy';
import {
  getListingCategoryConfig,
  isListingCategoryKey,
  type ListingCategoryKey,
} from './listingCategoryRegistry';

const MARKETPLACE_PRICING_MODES = new Set(['raw', 'graded', 'sealed', 'manual']);

const RAW_CONDITIONS = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
  'Not sure',
  'Sealed',
] as const;

const SEALED_STATUSES = [
  'Factory sealed',
  'Seal appears intact, review required',
  'Opened',
  'Incomplete',
  'Resealed suspected',
  'Unknown',
] as const;

const PACKAGING_CONDITIONS = [
  'Excellent',
  'Light shelf wear',
  'Moderate shelf wear',
  'Significant wear',
  'Damaged packaging',
] as const;

const SLAB_CASE_CONDITIONS = [
  'Clean',
  'Light surface marks',
  'Noticeable scratches',
  'Chipped',
  'Cracked',
  'Label damage',
  'Possible tampering',
] as const;

const MARKETPLACE_MEDIA_LABELS = [
  'Catalogue image',
  'Official card image',
  'Front photograph',
  'Back photograph',
  'Front surface view',
  'Back surface view',
  'Corners and edges',
  'Known defect close-up',
  'Slab front',
  'Slab back',
  'Certification label',
  'QR or barcode',
  'Case damage',
  'Front',
  'Back',
  'Seal area',
  'Wrap seam',
  'Damage close-up',
  'Top',
  'Bottom',
  'Top crimp',
  'Bottom crimp',
  'Side seams',
  'Main photo',
  'Included contents',
] as const;

const MARKETPLACE_MEDIA_ROLES = new Set(['stock', 'seller']);
const MAX_MARKETPLACE_MEDIA_URL_LENGTH = 2048;
const MARKETPLACE_MEDIA_SLOTS = new Set([
  'stock',
  'front',
  'back',
  'surface_front',
  'surface_back',
  'corners_edges',
  'defect_closeup',
  'slab_front',
  'slab_back',
  'slab_label',
  'slab_cert',
  'slab_case_damage',
  'packaging_front',
  'packaging_back',
  'packaging_top',
  'packaging_bottom',
  'wrap_seam',
  'seal_closeup',
  'top_crimp',
  'bottom_crimp',
  'side_seam',
  'lot_contents',
]);

function canonicalKnownValue(
  value: unknown,
  knownValues: readonly string[],
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (!normalized) return null;
  return knownValues.find((candidate) => candidate.toLocaleLowerCase('en-US') === normalized) ?? null;
}

export function sanitizeMarketplaceText(
  value: unknown,
  replacement: string | null = null,
): string | null {
  return sanitizeGate0CommerceCopy(value, replacement);
}

export function sanitizeMarketplaceProductType(value: unknown): ListingCategoryKey | null {
  return isListingCategoryKey(value) ? value : null;
}

export function getMarketplaceProductTypeLabel(
  value: unknown,
  fallback = 'Product',
): string {
  const productType = sanitizeMarketplaceProductType(value);
  return productType ? getListingCategoryConfig(productType).title : fallback;
}

export function sanitizeMarketplacePricingMode(value: unknown): string | null {
  return typeof value === 'string' && MARKETPLACE_PRICING_MODES.has(value)
    ? value
    : null;
}

export function sanitizeMarketplaceSetId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const setId = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(setId)
    && !gate0CopyContainsRestrictedCommerceLanguage(setId)
    ? setId
    : null;
}

function sanitizeMarketplaceMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.length > MAX_MARKETPLACE_MEDIA_URL_LENGTH || /[\s\u007F]/u.test(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function sanitizeMarketplaceGradeCompany(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return getGraderDefinition(value.trim())?.shortName ?? null;
}

export function sanitizeMarketplaceGrade(
  value: unknown,
  gradeCompany?: unknown,
): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const rawGrade = String(value).trim();
  if (!/^(?:10(?:\.0)?|[1-9](?:\.[05])?)$/.test(rawGrade)) return null;

  const numericGrade = Number(rawGrade);
  if (!Number.isFinite(numericGrade) || numericGrade < 1 || numericGrade > 10) return null;
  const grade = Number.isInteger(numericGrade) ? String(numericGrade) : numericGrade.toFixed(1);

  const rawCompany = typeof gradeCompany === 'string' ? gradeCompany.trim() : '';
  if (!rawCompany) return grade;
  const grader = getGraderDefinition(rawCompany);
  return grader?.supportedGrades.includes(grade) ? grade : null;
}

export function sanitizeMarketplaceCondition(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const condition = value.trim();
  if (!condition) return null;

  const directCondition = canonicalKnownValue(
    condition,
    [...RAW_CONDITIONS, ...PACKAGING_CONDITIONS, ...SLAB_CASE_CONDITIONS],
  );
  if (directCondition) return directCondition;

  for (const sealedStatus of SEALED_STATUSES) {
    for (const packagingCondition of PACKAGING_CONDITIONS) {
      const knownComposite = `${sealedStatus} - ${packagingCondition}`;
      if (condition.toLocaleLowerCase('en-US') === knownComposite.toLocaleLowerCase('en-US')) {
        return knownComposite;
      }
    }
  }

  const slabMatch = condition.match(/^(.+?)\s+(10(?:\.0)?|[1-9](?:\.[05])?)(?:\s+-\s+case\s+(.+))?$/i);
  if (!slabMatch) return null;
  const company = sanitizeMarketplaceGradeCompany(slabMatch[1]);
  const grade = sanitizeMarketplaceGrade(slabMatch[2], slabMatch[1]);
  if (!company || !grade) return null;
  if (!slabMatch[3]) return `${company} ${grade}`;

  const caseCondition = canonicalKnownValue(slabMatch[3], SLAB_CASE_CONDITIONS);
  return caseCondition ? `${company} ${grade} - case ${caseCondition.toLocaleLowerCase('en-US')}` : null;
}

export function sanitizeMarketplaceListingMedia(value: unknown): any[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const role = typeof source.role === 'string' && MARKETPLACE_MEDIA_ROLES.has(source.role)
      ? source.role
      : null;
    const slot = typeof source.slot === 'string' && MARKETPLACE_MEDIA_SLOTS.has(source.slot)
      ? source.slot
      : null;
    const url = sanitizeMarketplaceMediaUrl(source.url);
    if (!role || !slot || !url) return [];

    return [{
      role,
      slot,
      url,
      required: source.required === true,
      label: canonicalKnownValue(source.label, MARKETPLACE_MEDIA_LABELS),
    }];
  });
}

export function sanitizeMarketplaceListingPresentationFields<T extends Record<string, any>>(
  row: T,
): T {
  return {
    ...row,
    set_id: sanitizeMarketplaceSetId(row.set_id),
    product_type: sanitizeMarketplaceProductType(row.product_type),
    product_name: sanitizeMarketplaceText(row.product_name, 'Collector listing'),
    pricing_mode: sanitizeMarketplacePricingMode(row.pricing_mode),
    grade_company: sanitizeMarketplaceGradeCompany(row.grade_company),
    grade: sanitizeMarketplaceGrade(row.grade, row.grade_company),
    condition: sanitizeMarketplaceCondition(row.condition),
    listing_media: sanitizeMarketplaceListingMedia(row.listing_media),
  } as T;
}
