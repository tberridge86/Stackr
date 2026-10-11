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

// Exact reviewed provider routes only. Keep in step with the mobile matcher;
// the backend is deployed independently of the mobile source tree.
const REVIEWED_CARD_TITLE_ALIASES = new Map([
  ['raichu alola', 'alolan raichu'],
  ['deoxys normal', 'deoxys'],
]);

export function pokedexCardLookupName(value) {
  const name = normalisePokedexName(value);
  // Regional token order differs between provider routes and printed titles.
  // Retrieve the bounded species candidates, then apply the strict alias match.
  if (name === 'raichu alola') return 'raichu';
  return (REVIEWED_CARD_TITLE_ALIASES.get(name) ?? name).replace(/\s+[fm]$/, '');
}

function matchesWholeName(species, card) {
  const escaped = species.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(card);
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
  if (matchesWholeName(species, card)) return true;
  const alias = REVIEWED_CARD_TITLE_ALIASES.get(species);
  if (!alias) return false;
  if (species === 'deoxys normal') {
    // A bare/default species title does not establish a physical card form.
    // Allow printed mechanics, but never erase an explicit/unknown form label.
    if (/\b(?:forme?|attack|defense|speed)\b/.test(card)) return false;
    return /^deoxys(?:\s+(?:ex|gx|v|vmax|vstar|break|prime|lv\s+x))*$/.test(card);
  }
  return matchesWholeName(alias, card);
}
