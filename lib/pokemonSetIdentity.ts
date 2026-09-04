const SET_LANGUAGE_PREFIX = /^(?:en|ja|jp|jpn|zh-cn|zh_cn|zhcn|zh-hans|zh_hans|zhhans|zh-sg|zh_sg|zhsg|zh-tw|zh_tw|zhtw|zh-hant|zh_hant|zhhant|zh):/i;

export function stripPokemonSetLanguagePrefix(setId?: string | null) {
  return String(setId ?? '').trim().replace(SET_LANGUAGE_PREFIX, '');
}

export function getPokemonSetLanguageFromPrefixedId(setId?: string | null) {
  const prefix = String(setId ?? '').trim().match(SET_LANGUAGE_PREFIX)?.[0]
    ?.slice(0, -1).toLowerCase().replace(/_/g, '-');
  if (!prefix) return null;
  if (prefix === 'ja' || prefix === 'jp' || prefix === 'jpn') return 'ja' as const;
  if (['zh-cn', 'zhcn', 'zh-hans', 'zhhans', 'zh-sg', 'zhsg'].includes(prefix)) return 'zh-cn' as const;
  if (['zh-tw', 'zhtw', 'zh-hant', 'zhhant', 'zh'].includes(prefix)) return 'zh-tw' as const;
  if (prefix === 'en') return 'en' as const;
  return null;
}
