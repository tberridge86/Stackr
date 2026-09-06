type HomeCardLabelInput = {
  name?: string | null;
  englishName?: string | null;
  language?: string | null;
};

type HomeSetLabelInput = {
  setName?: string | null;
  englishSetSupplement?: {
    value: string;
    label: 'English set:' | 'English translation:';
    authoritative: boolean;
    status?: string;
  } | null;
  language?: string | null;
};

type HomeActivityLabelInput = {
  title?: string | null;
  cardName?: string | null;
  englishName?: string | null;
  language?: string | null;
};

const clean = (value: string | null | undefined) => typeof value === 'string' ? value.trim() : '';

/** English-script display validation only; this is not a translator or a metadata writer. */
function englishText(value: string | null | undefined, allowNumeric = false): string | null {
  const text = clean(value);
  if (!text || /[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(text)) return null;
  if (/\p{L}/u.test(text.replace(/\p{Script=Latin}/gu, ''))) return null;
  if (!/\p{Script=Latin}/u.test(text) && !(allowNumeric && /\d/.test(text))) return null;
  return text;
}

export function getHomeCardLanguageLabel(language?: string | null): string | null {
  const code = clean(language).toLowerCase().replace(/_/g, '-');
  if (!code || code === 'english' || code === 'en' || code.startsWith('en-')) return null;
  if (code === 'traditional chinese' || code === 'zh-tw' || code === 'zh-hk' || code.startsWith('zh-hant')) return 'Traditional Chinese';
  if (code === 'simplified chinese' || code === 'zh-cn' || code === 'zh-sg' || code.startsWith('zh-hans')) return 'Simplified Chinese';
  const labels: Record<string, string> = {
    ja: 'Japanese', jp: 'Japanese', jpn: 'Japanese', japanese: 'Japanese',
    zh: 'Chinese', chinese: 'Chinese',
    ko: 'Korean', kr: 'Korean', korean: 'Korean',
    fr: 'French', french: 'French', de: 'German', german: 'German',
    es: 'Spanish', spanish: 'Spanish', it: 'Italian', italian: 'Italian',
    pt: 'Portuguese', portuguese: 'Portuguese', id: 'Indonesian', indonesian: 'Indonesian',
    th: 'Thai', thai: 'Thai', nl: 'Dutch', dutch: 'Dutch', ru: 'Russian', russian: 'Russian',
  };
  return labels[code] ?? labels[code.split('-')[0]] ?? null;
}

export function getHomeCardDisplayName(input: HomeCardLabelInput): string {
  const language = getHomeCardLanguageLabel(input.language);
  const english = englishText(input.englishName) ?? (!language ? englishText(input.name) : null);
  if (english) return english;
  return language ? `${language} card` : 'English name unavailable';
}

export function getHomeCardSetDisplayName(input: HomeSetLabelInput): string {
  const supplement = input.englishSetSupplement;
  const englishSupplement = englishText(supplement?.value, true);
  if (englishSupplement) {
    const isDraft = supplement?.label === 'English translation:' || supplement?.status === 'model_translation_draft';
    return isDraft ? `${englishSupplement} (translation draft)` : englishSupplement;
  }
  const language = getHomeCardLanguageLabel(input.language);
  const existingEnglish = !language || /^[\d\s.,:/-]+$/.test(clean(input.setName))
    ? englishText(input.setName, true)
    : null;
  if (existingEnglish) return existingEnglish;
  return language ? `${language} set` : 'English set name unavailable';
}

export function getHomeActivityDisplayTitle(input: HomeActivityLabelInput): string {
  const title = clean(input.title);
  const nativeFragment = clean(input.cardName);
  const englishName = englishText(input.englishName);
  if (getHomeCardLanguageLabel(input.language) && nativeFragment && !englishName) return 'Collection activity';
  // Plain string replacement avoids interpreting card-name punctuation as regex.
  const candidate = nativeFragment && englishName && title.includes(nativeFragment)
    ? title.split(nativeFragment).join(englishName)
    : title;
  return englishText(candidate) ?? 'Collection activity';
}
