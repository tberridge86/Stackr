const SET_ABBREVIATIONS: Record<string, string> = {
  base: 'base set',
  bs: 'base set',
  jungle: 'jungle',
  fossil: 'fossil',
  sv: 'scarlet violet',
  's&v': 'scarlet violet',
  swsh: 'sword shield',
  sm: 'sun moon',
};

const GRADER_ALIASES: Record<string, string> = {
  bgs: 'beckett',
  beckett: 'beckett',
  psa: 'psa',
  cgc: 'cgc',
  ace: 'ace',
  tag: 'tag',
};

export function normaliseSearchText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00e2\u20ac[\u2122\u02dc]/g, "'")
    .replace(/[\u2018\u2019`]/g, "'")
    .toLowerCase()
    .replace(/\bpokemon\b/g, 'pokemon')
    .replace(/[^a-z0-9#'&/.\s-]+/g, ' ')
    .replace(/#\s*/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandSearchQuery(value: string) {
  const normalised = normaliseSearchText(value);
  const tokens = normalised.split(' ').filter(Boolean);
  const expanded = tokens.map((token) => SET_ABBREVIATIONS[token] ?? GRADER_ALIASES[token] ?? token);
  return Array.from(new Set([normalised, expanded.join(' '), normalised.replace(/'/g, '')].filter(Boolean)));
}
