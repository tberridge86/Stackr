/**
 * Finish presentation is deliberately resolved from the canonical variant,
 * never from a card name, rarity label, condition, or image URL.
 */
export type CardHoloProfileName = 'plain' | 'cosmos' | 'reverse' | 'diagonal' | 'textured' | 'radiant';
export type CardHoloConfidence = 'invalid_identity' | 'unknown_finish' | 'no_holo_finish' | 'verified_finish' | 'verified_finish_generic_mask';

export type NormalizedHoloRegion = Readonly<{ x: number; y: number; width: number; height: number }>;
export type CardHoloMaskDescriptor = Readonly<{
  kind: 'printing' | 'template';
  cardId: string;
  languageCode: string;
  variantId: string;
  /** include applies foil inside regions; exclude applies it outside them. */
  coverage?: 'include' | 'exclude';
  regions: readonly NormalizedHoloRegion[];
}>;

export type CardHoloMaterial = Readonly<{
  foilStrength: number;
  specularStrength: number;
  textureStrength: number;
  patternScale: number;
}>;

export type CardHoloIdentity = Readonly<{
  cardId: string;
  languageCode: string;
  variantId: string;
  variantCode: string;
  finishCode: string;
}>;

export type CardHoloProfile = Readonly<{
  profile: CardHoloProfileName;
  confidence: CardHoloConfidence;
  identity: CardHoloIdentity | null;
  material: CardHoloMaterial;
  mask: Readonly<{
    kind: 'none' | 'full' | 'artwork' | 'outside-artwork' | 'regions';
    provenance: 'generic' | 'template' | 'printing-specific';
    regions?: readonly NormalizedHoloRegion[];
  }>;
}>;

export type ResolveCardHoloProfileOptions = Readonly<{
  selectedVariantId?: string | null;
  /** The displayed card identity, used to reject stale raw_data attachments. */
  cardId?: string | null;
  /** Viewer context for legacy payloads that did not persist stackr.language. */
  languageCode?: string | null;
  masks?: readonly CardHoloMaskDescriptor[] | null;
}>;

type CanonicalVariant = { variantId: string; variantCode: string; finishCode: string };

const FULL_CARD: readonly NormalizedHoloRegion[] = Object.freeze([{ x: 0, y: 0, width: 1, height: 1 }]);
const EMPTY_MASK = Object.freeze({ kind: 'none' as const, provenance: 'generic' as const });
const PLAIN_MATERIAL: CardHoloMaterial = Object.freeze({
  foilStrength: 0, specularStrength: 0.06, textureStrength: 0, patternScale: 1,
});

const MATERIALS: Record<Exclude<CardHoloProfileName, 'plain'>, CardHoloMaterial> = {
  cosmos: { foilStrength: 0.18, specularStrength: 0.16, textureStrength: 0.16, patternScale: 1.4 },
  reverse: { foilStrength: 0.14, specularStrength: 0.12, textureStrength: 0.1, patternScale: 1.1 },
  diagonal: { foilStrength: 0.16, specularStrength: 0.15, textureStrength: 0.12, patternScale: 2.2 },
  textured: { foilStrength: 0.12, specularStrength: 0.1, textureStrength: 0.28, patternScale: 1.8 },
  radiant: { foilStrength: 0.14, specularStrength: 0.15, textureStrength: 0.2, patternScale: 2.6 },
};

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

function normalizedLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = normalizedCode(value);
  if (['en', 'english'].includes(code)) return 'en';
  if (['ja', 'jp', 'japanese'].includes(code)) return 'ja';
  if (['ko', 'kr', 'korean'].includes(code)) return 'ko';
  if (['zh_cn', 'zh_hans', 'simplified_chinese'].includes(code)) return 'zh-cn';
  if (['zh_tw', 'zh_hant', 'chinese', 'traditional_chinese'].includes(code)) return 'zh-tw';
  return code || null;
}

function profileForFinish(finish: string): CardHoloProfileName | null {
  // These are closed canonical finish codes. Deliberately do not pattern-match
  // arbitrary labels: a new/unrecognised finish must remain visually plain.
  if (['normal', 'non_holo', 'non_foil', 'regular', 'base'].includes(finish)) return 'plain';
  if (['cosmos', 'cosmos_holo'].includes(finish)) return 'cosmos';
  if (['reverse', 'reverse_holo', 'reverse_holofoil', 'reverse_holo_energy'].includes(finish)) return 'reverse';
  // Generic holo is deliberately neutral until an identity-bound mask/recipe
  // confirms where an effect belongs. This profile keeps the renderer stable.
  if (['holo', 'holofoil', 'regular_holo', 'line_holo', 'line_holofoil', 'diagonal_holo'].includes(finish)) return 'diagonal';
  if (['textured', 'texture_holo', 'textured_holo'].includes(finish)) return 'textured';
  if (['radiant', 'radiant_holo', 'radiant_holofoil'].includes(finish)) return 'radiant';
  return null;
}

function identityFrom(rawData: unknown, options: ResolveCardHoloProfileOptions): CardHoloIdentity | null {
  const raw = rawData as Record<string, any> | null;
  const stackr = raw?.stackr;
  if (!stackr || typeof stackr !== 'object' || stackr.canonical !== true) return null;
  const cardId = nonEmpty(stackr.cardId);
  const suppliedCardId = nonEmpty(options.cardId);
  if (suppliedCardId && suppliedCardId !== cardId) return null;
  // Current legacy adapters retain language at raw_data.language, while direct
  // API-shaped payloads may carry it on Stackr. A viewer may supply its already
  // validated card language only when the legacy payload lacks it.
  const declaredLanguageValue = stackr.languageCode ?? stackr.language ?? raw?.languageCode ?? raw?.language;
  if (declaredLanguageValue != null && typeof declaredLanguageValue !== 'string') return null;
  const declaredLanguage = normalizedLanguage(declaredLanguageValue);
  if (options.languageCode != null && typeof options.languageCode !== 'string') return null;
  const suppliedLanguage = normalizedLanguage(options.languageCode);
  if (declaredLanguage && suppliedLanguage && declaredLanguage !== suppliedLanguage) return null;
  const languageCode = declaredLanguage ?? suppliedLanguage;
  const defaultVariantId = nonEmpty(stackr.defaultVariantId);
  if (!cardId || !languageCode || !defaultVariantId || !Array.isArray(stackr.variants)) return null;
  const variants: CanonicalVariant[] = [];
  const ids = new Set<string>();
  for (const source of stackr.variants) {
    const variantId = nonEmpty(source?.variantId);
    const variantCode = normalizedCode(source?.variantCode);
    const finishCode = normalizedCode(source?.finishCode ?? source?.variantCode);
    if (!variantId || !variantCode || !finishCode || ids.has(variantId)) return null;
    ids.add(variantId);
    variants.push({ variantId, variantCode, finishCode });
  }
  const preferredId = options.selectedVariantId == null ? defaultVariantId : nonEmpty(options.selectedVariantId);
  // A stale explicit selection is not allowed to silently fall back to default.
  if (!preferredId) return null;
  const selected = variants.find((variant) => variant.variantId === preferredId);
  if (!selected) return null;
  return Object.freeze({ cardId, languageCode: languageCode.toLowerCase(), ...selected });
}

function validRegions(regions: unknown): regions is readonly NormalizedHoloRegion[] {
  return Array.isArray(regions) && regions.length > 0 && regions.every((region) => {
    if (!region || typeof region !== 'object') return false;
    const { x, y, width, height } = region as NormalizedHoloRegion;
    return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1;
  }) && regions.length <= 4;
}

function resolvedMask(identity: CardHoloIdentity, masks: readonly CardHoloMaskDescriptor[] | null | undefined) {
  // Mask registries can be refreshed outside TypeScript. Treat every malformed
  // record as unavailable rather than allowing display metadata to crash a card.
  const records: unknown[] = Array.isArray(masks) ? masks : [];
  const candidates = records.filter((mask): mask is CardHoloMaskDescriptor => {
    if (!mask || typeof mask !== 'object') return false;
    const candidate = mask as Partial<CardHoloMaskDescriptor>;
    const exact = candidate.cardId === identity.cardId
      && normalizedLanguage(candidate.languageCode) === identity.languageCode
      && candidate.variantId === identity.variantId;
    if (!exact) return false;
    return true;
  });
  for (const kind of ['printing', 'template'] as const) {
    // Prefer the first valid record of the stronger scope. An invalid printing
    // row must not hide a later valid printing row or demote it to a template.
    const mask = candidates.find((candidate) => candidate.kind === kind
      && validRegions(candidate.regions)
      && (candidate.coverage == null || candidate.coverage === 'include' || candidate.coverage === 'exclude'));
    if (!mask) continue;
    return Object.freeze({
      kind: (mask.coverage === 'exclude' ? 'outside-artwork' : 'regions') as 'outside-artwork' | 'regions',
      provenance: kind === 'printing' ? 'printing-specific' as const : 'template' as const,
      regions: Object.freeze(mask.regions.map((region) => Object.freeze({ ...region }))),
    });
  }
  return EMPTY_MASK;
}

function colourSuppressed(material: CardHoloMaterial): CardHoloMaterial {
  return Object.freeze({ ...material, foilStrength: 0, specularStrength: 0.06, textureStrength: 0 });
}

/** Pure resolver for a canonical Stackr raw_data payload. */
export function resolveCardHoloProfile(rawData: unknown, options: ResolveCardHoloProfileOptions = {}): CardHoloProfile {
  const identity = identityFrom(rawData, options);
  if (!identity) return Object.freeze({ profile: 'plain', confidence: 'invalid_identity', identity: null, material: PLAIN_MATERIAL, mask: EMPTY_MASK });
  const profile = profileForFinish(identity.finishCode);
  if (!profile) return Object.freeze({ profile: 'plain', confidence: 'unknown_finish', identity, material: PLAIN_MATERIAL, mask: EMPTY_MASK });
  if (profile === 'plain') return Object.freeze({ profile, confidence: 'no_holo_finish', identity, material: PLAIN_MATERIAL, mask: EMPTY_MASK });
  const mask = resolvedMask(identity, options.masks);
  if (mask.kind !== 'none') {
    return Object.freeze({ profile, confidence: 'verified_finish', identity, material: MATERIALS[profile], mask });
  }
  // Only explicitly full-card material types may use a restrained generic mask.
  if (profile === 'textured' || profile === 'radiant') {
    return Object.freeze({ profile, confidence: 'verified_finish_generic_mask', identity, material: MATERIALS[profile], mask: Object.freeze({ kind: 'full' as const, provenance: 'generic' as const, regions: FULL_CARD }) });
  }
  return Object.freeze({ profile, confidence: 'verified_finish', identity, material: colourSuppressed(MATERIALS[profile]), mask });
}
