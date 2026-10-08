export function normalisePokedexName(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Card catalogues commonly use the gender glyphs while PokéAPI uses
    // `-f`/`-m`. Convert before punctuation is collapsed so Nidoran forms
    // remain distinct instead of both becoming the ungendered base name.
    .replace(/♀/g, ' f ')
    .replace(/♂/g, ' m ')
    .replace(/\bfemale\b/g, 'f')
    .replace(/\bmale\b/g, 'm')
    .replace(/([a-z])[’‘`´']s\b/g, '$1')
    .replace(/[’‘`´']/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a named National-Dex species/form as a whole token sequence.
 * Card titles may add mechanics, possessives or card descriptors, but a
 * shorter species may never match another species (for example Mew/Mewtwo).
 */
export function matchesPokedexSpeciesName(pokemonName, cardName) {
  const species = normalisePokedexName(pokemonName);
  const card = normalisePokedexName(cardName);
  if (!species || !card) return false;
  if (species === card) return true;
  const escaped = species.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(card);
}
