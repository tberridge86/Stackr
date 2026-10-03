import type { CardHoloIdentity, CardHoloProfile } from './cardHoloProfile';

/** Reviewed, local-only material data. Never infer it from rarity or an image. */
export const PRINTING_MAP_ROLES = ['coverage', 'surface', 'pattern', 'optical'] as const;
export type PrintingMapRole = typeof PRINTING_MAP_ROLES[number];
export type PrintingMap = Readonly<{
  encoding: 'png-base64'; base64: string; sha256: string; width: number; height: number;
}>;
export type PrintingMaterial = Readonly<{
  schemaVersion: 1;
  materialVersion: string;
  identity: CardHoloIdentity;
  artwork: Readonly<{ uri: string; sha256: string; width: number; height: number }>;
  review: Readonly<{
    status: 'reference-reviewed'; reviewer: string; reviewedAt: string;
    /** Digest of retained physical front, tilt and surface-reference evidence. */
    evidenceSha256: string; physicalReference: string;
  }>;
  maps: Readonly<Record<PrintingMapRole, PrintingMap>>;
  gain: number;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const identityFields = ['cardId', 'languageCode', 'variantId', 'variantCode', 'finishCode'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const dimension = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 2048;
const digest = (value: unknown): value is string => typeof value === 'string' && SHA256.test(value);

/** Structural safety only: this cannot authenticate the physical references. */
export function isPrintingMaterial(value: unknown): value is PrintingMaterial {
  if (!isRecord(value) || value.schemaVersion !== 1 || !text(value.materialVersion)) return false;
  const identity = value.identity;
  if (!isRecord(identity) || !identityFields.every(key => text(identity[key]))) return false;
  const art = value.artwork;
  if (!isRecord(art) || !text(art.uri) || !art.uri.startsWith('https://') || !digest(art.sha256)
    || !dimension(art.width) || !dimension(art.height)) return false;
  const review = value.review;
  if (!isRecord(review) || review.status !== 'reference-reviewed' || !text(review.reviewer)
    || !text(review.reviewedAt) || !Number.isFinite(Date.parse(review.reviewedAt))
    || !digest(review.evidenceSha256) || !text(review.physicalReference)) return false;
  if (typeof value.gain !== 'number' || !Number.isFinite(value.gain) || value.gain <= 0 || value.gain > 1) return false;
  const maps = value.maps;
  if (!isRecord(maps)) return false;
  let pixels = 0;
  let size: string | null = null;
  for (const role of PRINTING_MAP_ROLES) {
    const map = maps[role];
    if (!isRecord(map) || map.encoding !== 'png-base64' || !dimension(map.width) || !dimension(map.height)
      || !digest(map.sha256) || typeof map.base64 !== 'string' || map.base64.length > 8_000_000
      || !map.base64.startsWith('iVBORw0KGgo') || map.base64.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(map.base64)) return false;
    const nextSize = `${map.width}x${map.height}`;
    if (size !== null && size !== nextSize) return false;
    size = nextSize;
    if (Math.abs(map.width / map.height - art.width / art.height) > 0.002) return false;
    pixels += map.width * map.height;
  }
  // Four RGBA maps: at most 24 MiB decoded, excluding base artwork and GPU copies.
  return pixels * 4 <= 24 * 1024 * 1024;
}

/** Exact canonical selection; ambiguous versions fail closed, not first-match. */
export function resolvePrintingMaterial(
  profile: CardHoloProfile,
  artworkUri: string | null | undefined,
  records: readonly unknown[],
): PrintingMaterial | null {
  if (!profile || profile.profile === 'plain' || !profile.identity || !artworkUri || !Array.isArray(records)) return null;
  if (!['verified_finish', 'verified_finish_generic_mask'].includes(profile.confidence)) return null;
  const matches = records.filter((entry): entry is PrintingMaterial => isPrintingMaterial(entry)
    && identityFields.every(key => entry.identity[key] === profile.identity![key])
    && entry.artwork.uri === artworkUri);
  return matches.length === 1 ? matches[0] : null;
}

/** Match the base image's contain transform; do not stretch foil onto margins. */
export function containedMaterialRect(width: number, height: number, artWidth: number, artHeight: number) {
  if (![width, height, artWidth, artHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(width / artWidth, height / artHeight);
  const w = artWidth * scale; const h = artHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
