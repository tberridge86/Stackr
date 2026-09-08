import type { StackrCard, StackrCardVariant, StackrSearchResult } from './stackrApiV1';
import { normaliseOwnerTeachingIdentity, type OwnerTeachingIdentity } from './ownerRecognitionCore';
import { getPreferredCardDisplayName, getPreferredSetDisplayName } from './pokemonDisplayNames';
import { catalogueVariantLabel } from './catalogueVariantPresentation';

export const OWNER_TEACHING_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
] as const;

export type OwnerTeachingLanguage = (typeof OWNER_TEACHING_LANGUAGES)[number]['code'];

export type OwnerTeachingCardChoice = {
  cardId: string;
  name: string;
  nativeName?: string;
  language: string;
  setId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
};

export function ownerTeachingCollectorMatches(candidate: string, query: string) {
  const normalize = (value: string) => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
    .split('/').map((part) => part.replace(/(^|[^0-9])0+(?=\d)/g, '$1').replace(/^0+(?=\d)/, '')).join('/');
  const left = normalize(candidate);
  const right = normalize(query);
  return Boolean(left && right) && (left === right || (!right.includes('/') && left.split('/')[0] === right));
}

export function ownerTeachingCardChoice(card: StackrCard): OwnerTeachingCardChoice {
  return {
    cardId: card.cardId,
    name: getPreferredCardDisplayName({ id: card.cardId, language: card.languageCode,
      localName: card.names.native, englishDisplayName: card.names.englishDisplay,
      collectorNumber: card.collectorNumber.value, raw: { set: { set_code: card.set.setCode } } }),
    ...(card.names.native && card.names.native !== card.names.englishDisplay ? { nativeName: card.names.native } : {}),
    language: card.languageCode,
    setId: card.set.setId,
    setCode: card.set.setCode ?? card.set.setId,
    setName: getPreferredSetDisplayName({ id: card.set.setId, setCode: card.set.setCode,
      language: card.languageCode, localName: card.set.nativeName, englishDisplayName: card.set.englishDisplayName }),
    collectorNumber: card.collectorNumber.value,
  };
}

export function ownerTeachingSearchChoices(results: StackrSearchResult[]): OwnerTeachingCardChoice[] {
  const choices = new Map<string, OwnerTeachingCardChoice>();
  for (const result of results) {
    if (result.type !== 'card' || !result.card) continue;
    const choice = ownerTeachingCardChoice(result.card);
    choices.set(choice.cardId, choice);
  }
  return [...choices.values()];
}

export function ownerTeachingVariantLabel(variant: StackrCardVariant) {
  const englishLabel = (label: string | null | undefined, code: string) =>
    label && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(label) ? label : catalogueVariantLabel(code);
  const variantLabel = englishLabel(variant.variantLabel, variant.variantCode);
  const finishLabel = englishLabel(variant.finishLabel, variant.finishCode ?? 'finish unspecified');
  return `${variantLabel} · ${finishLabel}`;
}

export function ownerTeachingIdentityFromCard(
  card: StackrCard,
  variant: StackrCardVariant,
  catalogueVersion?: string | null,
): OwnerTeachingIdentity {
  const choice = ownerTeachingCardChoice(card);
  if (!variant.canonicalId) throw new Error('This catalogue variant has no canonical identity and cannot be used for teaching.');
  return normaliseOwnerTeachingIdentity({
    variantId: variant.variantId,
    printingId: card.cardId,
    canonicalKey: variant.canonicalId,
    name: choice.name,
    nativeName: choice.nativeName,
    language: choice.language,
    setId: choice.setId,
    setCode: choice.setCode,
    collectorNumber: choice.collectorNumber,
    variantCode: variant.variantCode,
    finishCode: variant.finishCode ?? variant.variantCode,
    ...(catalogueVersion ? { catalogueVersion } : {}),
  });
}

/** Changing a parent field must discard dependent canonical choices. */
export function resetOwnerTeachingAfter(change: 'language' | 'set' | 'card') {
  if (change === 'language') return { setId: null, cardId: null, variantId: null };
  if (change === 'set') return { cardId: null, variantId: null };
  return { variantId: null };
}
