/** Display-only approximations. These profiles never identify or reclassify a card. */
export type CardFinishPattern = 'none' | 'geometric' | 'energy' | 'pokeball' | 'masterball' | 'cosmos' | 'stars' | 'confetti' | 'cracked_ice' | 'glitter' | 'radiant';
export type CardFinishCoverage = 'paper' | 'artwork' | 'body' | 'full';
export type CardFinishTexture = 'none' | 'etched' | 'contours';
export type CardFinishPalette = 'paper' | 'rainbow' | 'silver' | 'gold';
export type CardFinishLayout = 'classic' | 'modern' | 'full_art' | 'unknown';

export type CardFinishProfile = {
  id: string;
  label: string;
  coverage: CardFinishCoverage;
  pattern: CardFinishPattern;
  texture: CardFinishTexture;
  palette: CardFinishPalette;
  intensity: number;
};

function profile(id: string, label: string, coverage: CardFinishCoverage, pattern: CardFinishPattern = 'none', texture: CardFinishTexture = 'none', palette: CardFinishPalette = 'rainbow', intensity = 1): CardFinishProfile {
  return { id, label, coverage, pattern, texture, palette, intensity };
}

export const CARD_FINISH_PROFILES = {
  non_holo: profile('non_holo', 'Paper', 'paper', 'none', 'none', 'paper', 0.45),
  holo: profile('holo', 'Holo', 'artwork'),
  reverse_plain: profile('reverse_plain', 'Reverse holo', 'body'),
  reverse_geometric: profile('reverse_geometric', 'Geometric reverse', 'body', 'geometric'),
  reverse_stars: profile('reverse_stars', 'Star reverse', 'body', 'stars'),
  reverse_cosmos: profile('reverse_cosmos', 'Cosmos reverse', 'body', 'cosmos'),
  reverse_energy: profile('reverse_energy', 'Energy reverse', 'body', 'energy'),
  reverse_pokeball: profile('reverse_pokeball', 'Poké Ball reverse', 'body', 'pokeball'),
  reverse_masterball: profile('reverse_masterball', 'Master Ball reverse', 'body', 'masterball'),
  art_rare: profile('art_rare', 'Art / Illustration Rare', 'full', 'none', 'none', 'rainbow', 0.7),
  special_art: profile('special_art', 'SAR / SIR', 'full', 'none', 'contours'),
  full_art: profile('full_art', 'Textured full art', 'full', 'none', 'etched'),
  silver: profile('silver', 'Silver foil', 'full', 'none', 'etched', 'silver'),
  rainbow: profile('rainbow', 'Rainbow foil', 'full', 'none', 'etched'),
  gold: profile('gold', 'Gold foil', 'full', 'none', 'etched', 'gold'),
  vintage_cosmos: profile('vintage_cosmos', 'Cosmos holo', 'artwork', 'cosmos', 'none', 'rainbow', 0.85),
  vintage_stars: profile('vintage_stars', 'Star holo', 'artwork', 'stars', 'none', 'rainbow', 0.85),
  line_holo: profile('line_holo', 'Line holo', 'artwork', 'none', 'etched'),
  baby_shiny: profile('baby_shiny', 'Baby shiny', 'artwork', 'glitter', 'etched', 'silver', 0.8),
  full_art_shiny: profile('full_art_shiny', 'Full-art shiny', 'full', 'glitter', 'contours', 'silver'),
  confetti: profile('confetti', 'Confetti holo', 'artwork', 'confetti'),
  cracked_ice: profile('cracked_ice', 'Cracked ice', 'artwork', 'cracked_ice'),
  radiant: profile('radiant', 'Radiant foil', 'full', 'radiant', 'etched'),
  glitter: profile('glitter', 'Glitter holo', 'artwork', 'glitter'),
} as const satisfies Record<string, CardFinishProfile>;

export type CardFinishProfileId = keyof typeof CARD_FINISH_PROFILES;
export type CardFinishMetadata = {
  variant?: string | null;
  finish?: string | null;
  rarity?: string | null;
  setId?: string | null;
  releaseDate?: string | null;
  language?: string | null;
  layout?: CardFinishLayout | null;
  isHolographic?: boolean;
};

export type CardFinishOverride = {
  setId: string;
  variant: string;
  language?: string;
  profile: CardFinishProfileId;
  layout?: CardFinishLayout;
  /** Link to reviewed evidence; no unverified set-wide defaults. */
  reference: string;
};

// Add reviewed set/variant rules here. Language alone never selects special foil.
export const CARD_FINISH_OVERRIDES: readonly CardFinishOverride[] = [];

export function normalizeFinishToken(value?: string | null) {
  return (value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function explicitProfile(token: string): CardFinishProfileId | undefined {
  const compact = token.replace(/ /g, '');
  if (/^(normal|standard|nonholo|nonholofoil|firsteditionnormal|1steditionnormal|unlimitednormal)$/.test(compact)) return 'non_holo';
  if (/non holo|no foil/.test(token)) return 'non_holo';
  if (/master ?ball/.test(token)) return 'reverse_masterball';
  if (/poke ?ball/.test(token)) return 'reverse_pokeball';
  if (/reverse/.test(token)) {
    if (/cosmos|cosmic/.test(token)) return 'reverse_cosmos';
    if (/star/.test(token)) return 'reverse_stars';
    if (/energy/.test(token)) return 'reverse_energy';
    if (/geometric|pattern/.test(token)) return 'reverse_geometric';
    return 'reverse_plain';
  }
  if (/cosmos|cosmic/.test(token)) return 'vintage_cosmos';
  if (/star (holo|foil)|holo stars/.test(token)) return 'vintage_stars';
  if (/cracked ice/.test(token)) return 'cracked_ice';
  if (/confetti|speckled/.test(token)) return 'confetti';
  if (/line holo/.test(token)) return 'line_holo';
  if (/radiant/.test(token)) return 'radiant';
  if (/glitter/.test(token)) return 'glitter';
  if (/baby shiny/.test(token)) return 'baby_shiny';
  if (/shiny.*full|full.*shiny|(shiny rare|rare shiny).*(vmax|vstar|gx|ex|\bv\b)/.test(token)) return 'full_art_shiny';
  if (/\b(sar|sir)\b|special (art|illustration) rare/.test(token)) return 'special_art';
  if (/\b(ar|ir)\b|art rare|illustration rare/.test(token)) return 'art_rare';
  if (/gold|hyper rare/.test(token)) return 'gold';
  if (/rainbow/.test(token)) return 'rainbow';
  if (/silver/.test(token)) return 'silver';
  if (/textur|full art|ultra rare|rare ultra/.test(token)) return 'full_art';
  if (/shiny rare|rare shiny/.test(token)) return 'baby_shiny';
  if (/holo|foil/.test(token)) return 'holo';
  return undefined;
}

export function resolveCardFinish(metadata: CardFinishMetadata = {}, overrides: readonly CardFinishOverride[] = CARD_FINISH_OVERRIDES) {
  const diagnostics: string[] = [];
  const variant = normalizeFinishToken(metadata.variant);
  const finish = normalizeFinishToken(metadata.finish);
  const rarity = normalizeFinishToken(metadata.rarity);
  const rule = overrides.find((entry) => entry.setId === metadata.setId
    && normalizeFinishToken(entry.variant) === variant
    && (!entry.language || entry.language === metadata.language) && entry.reference.trim());
  // A variant identifies the selected physical version. Rarity cannot override normal.
  const selected = explicitProfile(variant) ?? explicitProfile(finish);
  const rarityProfile = explicitProfile(rarity);
  const id = rule?.profile ?? selected ?? rarityProfile ?? (metadata.isHolographic ? 'holo' : 'non_holo');
  const source = rule ? 'override' : selected ? 'explicit' : rarityProfile ? 'rarity' : 'fallback';
  if (source === 'rarity') diagnostics.push('Finish inferred from rarity; selected variant is unavailable.');
  if (source === 'fallback') diagnostics.push('Unknown finish; conservative display fallback.');
  if (variant && !explicitProfile(variant)) diagnostics.push(`Unrecognised or finish-neutral variant: ${metadata.variant}`);
  if (finish && !explicitProfile(finish)) diagnostics.push(`Unrecognised or finish-neutral finish: ${metadata.finish}`);
  const result = CARD_FINISH_PROFILES[id];
  const layout = rule?.layout ?? metadata.layout ?? (result.coverage === 'full' ? 'full_art' : 'unknown');
  if (layout === 'unknown' && (result.coverage === 'body' || result.coverage === 'artwork')) diagnostics.push('Unknown layout; conservative foil region.');
  return { profile: result, layout, source, diagnostics, approximation: !rule, stamped: /stamp/.test(`${variant} ${finish}`) };
}

export type CardFinishResolution = ReturnType<typeof resolveCardFinish>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim())) ?? null;
}

/** Read selected values only. `variants` and price keys describe availability, not selection. */
export function getCardFinishMetadata(value: unknown): CardFinishMetadata {
  const card = record(value);
  const raw = record(card.raw_data);
  const set = record(card.set);
  const rawSet = record(raw.set);
  const layout = stringValue(card.layout, raw.layout);
  return {
    variant: stringValue(card.variant, card.variant_code, card.variantId, raw.variant, raw.variant_code, raw.variantId),
    finish: stringValue(card.finish, card.finish_code, raw.finish, raw.finish_code),
    rarity: stringValue(card.rarity, raw.rarity),
    setId: stringValue(card.setId, card.set_id, set.id, rawSet.id),
    releaseDate: stringValue(card.releaseDate, set.releaseDate, rawSet.releaseDate),
    language: stringValue(card.language, raw.language, rawSet.language),
    layout: layout === 'classic' || layout === 'modern' || layout === 'full_art' ? layout : null,
    isHolographic: typeof card.isHolographic === 'boolean' ? card.isHolographic : undefined,
  };
}

/** A combined library tile can represent several copies; only a single owned finish is unambiguous. */
export function getLibraryCardFinishMetadata(value: unknown, ownedVariants: readonly string[] = []): CardFinishMetadata {
  const base = getCardFinishMetadata(value);
  const selected = [...new Set(ownedVariants.filter((variant) => {
    const token = normalizeFinishToken(variant);
    return token && token !== 'card';
  }))];
  return selected.length === 1 ? { ...base, variant: selected[0] } : base;
}

/** Keep a saved finish only when hydration still refers to that same card and set. */
export function mergeShowcaseFinishMetadata(fresh: unknown, saved: unknown): CardFinishMetadata {
  const current = record(fresh);
  const previous = record(saved);
  const base = getCardFinishMetadata(fresh);
  const fallback = getCardFinishMetadata(saved);
  if (current.id !== previous.id || (base.setId && fallback.setId && base.setId !== fallback.setId)) return base;
  return {
    ...base,
    rarity: base.rarity ?? fallback.rarity,
    variant: fallback.variant ?? base.variant,
    finish: fallback.finish ?? base.finish,
    layout: fallback.layout ?? base.layout,
    language: fallback.language ?? base.language,
    releaseDate: fallback.releaseDate ?? base.releaseDate,
  };
}

/** SVG coordinates in a fixed 100 × 140 card space; estimates, not per-card segmentation. */
export function getCardFinishMask(coverage: CardFinishCoverage, layout: CardFinishLayout) {
  const window = layout === 'classic' ? [10, 17, 80, 43] : layout === 'modern' ? [8, 14, 84, 43] : [17, 23, 66, 30];
  const [x, y, width, height] = window;
  if (coverage === 'artwork') return `M${x} ${y}h${width}v${height}h-${width}Z`;
  if (coverage === 'body') {
    const hole = layout === 'unknown' || layout === 'full_art' ? [5, 10, 90, 59] : window;
    return `M3 3h94v134H3Z M${hole[0]} ${hole[1]}h${hole[2]}v${hole[3]}h-${hole[2]}Z`;
  }
  return 'M3 3h94v134H3Z';
}
