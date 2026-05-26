import type { ScanEditionHint } from '../types/scan';

export type EditionImageSize = 'small' | 'medium' | 'large';

function normalizeEditionText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function collectImageText(value: any) {
  if (!value || typeof value !== 'object') return '';

  return [
    value.name,
    value.type,
    value.variant,
    value.variantName,
    value.variant_name,
    value.printing,
    value.edition,
    value.label,
    value.key,
    value.id,
  ]
    .map(normalizeEditionText)
    .filter(Boolean)
    .join(' ');
}

function matchesEdition(value: any, editionHint?: ScanEditionHint | null) {
  if (!editionHint) return false;

  const text = collectImageText(value);
  if (!text) return false;

  const compact = text.replace(/\s+/g, '');
  const hasFirstEdition =
    /\b1st\s*(edition|ed)\b/.test(text)
    || /\bfirst\s*(edition|ed)\b/.test(text)
    || compact.includes('firstedition')
    || compact.includes('1stedition');
  const hasUnlimited = /\bunlimited\b/.test(text);
  const hasShadowless = /\bshadowless\b/.test(text);

  if (editionHint === '1st_edition') return hasFirstEdition;
  if (editionHint === 'unlimited') return hasUnlimited && !hasFirstEdition;
  if (editionHint === 'shadowless') return hasShadowless;

  return false;
}

function imageUrlFromEntry(entry: any, size: EditionImageSize) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object') return null;

  const preferred =
    size === 'small'
      ? ['small', 'medium', 'large', 'url', 'imageUrl', 'image_url']
      : size === 'medium'
        ? ['medium', 'large', 'small', 'url', 'imageUrl', 'image_url']
        : ['large', 'medium', 'small', 'url', 'imageUrl', 'image_url'];

  for (const key of preferred) {
    const value = entry[key];
    if (typeof value === 'string' && value.startsWith('http')) return value;
  }

  return null;
}

function getVariantEntries(rawData: any) {
  const variants = rawData?.variants;
  if (Array.isArray(variants)) return variants;
  if (!variants || typeof variants !== 'object') return [];

  return Object.entries(variants).map(([name, value]) => ({
    name,
    ...(value && typeof value === 'object' ? value : { value }),
  }));
}

export function getEditionVariantImageUrl(
  rawData: any,
  editionHint?: ScanEditionHint | null,
  size: EditionImageSize = 'large'
) {
  if (!rawData || !editionHint) return null;

  for (const variant of getVariantEntries(rawData)) {
    if (!matchesEdition(variant, editionHint)) continue;

    const images = Array.isArray((variant as any).images)
      ? (variant as any).images
      : [(variant as any).image, (variant as any).imageUrl, (variant as any).image_url].filter(Boolean);

    for (const image of images) {
      const url = imageUrlFromEntry(image, size);
      if (url) return url;
    }
  }

  const topLevelImages = Array.isArray(rawData?.images) ? rawData.images : [];
  for (const image of topLevelImages) {
    if (!matchesEdition(image, editionHint)) continue;
    const url = imageUrlFromEntry(image, size);
    if (url) return url;
  }

  return null;
}
