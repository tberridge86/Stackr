import { getPokemonSetLogoUrl } from './pokemonTcg';

type SetDisplayInput = {
  setId?: string | null;
  setName?: string | null;
  set?: {
    id?: string | null;
    name?: string | null;
    images?: {
      logo?: string | null;
      symbol?: string | null;
    } | null;
  } | null;
  rawData?: any;
};

const TECHNICAL_SET_ID_PATTERN = /^(sv|swsh|sm|xy|bw|dp|ex|hgss|pl|pop|base|gym|neo|ecard|me)\d*[a-z0-9.-]*(_[a-z]+)?$/i;

const clean = (value?: string | null) => String(value ?? '').trim();

export function isTechnicalSetLabel(value?: string | null) {
  const label = clean(value);
  if (!label) return false;
  return TECHNICAL_SET_ID_PATTERN.test(label) || /^[a-z]{1,5}\d{1,4}(_[a-z]{2})?$/i.test(label);
}

export function getDisplaySetName(input: SetDisplayInput, fallback = 'Pokemon TCG') {
  const setId = clean(input.setId ?? input.set?.id ?? input.rawData?.set?.id);
  const candidates = [
    input.setName,
    input.set?.name,
    input.rawData?.set?.name,
  ];

  for (const candidate of candidates) {
    const label = clean(candidate);
    if (!label) continue;
    if (setId && label.toLowerCase() === setId.toLowerCase()) continue;
    if (isTechnicalSetLabel(label)) continue;
    return label;
  }

  const fallbackLabel = clean(input.setId);
  if (fallbackLabel && !isTechnicalSetLabel(fallbackLabel)) return fallbackLabel;
  return fallback;
}

export function getDisplaySetLogoUrl(input: SetDisplayInput) {
  const setId = input.setId ?? input.set?.id ?? input.rawData?.set?.id ?? null;
  return (
    input.set?.images?.logo ??
    input.rawData?.set?.images?.logo ??
    getPokemonSetLogoUrl(setId) ??
    null
  );
}
