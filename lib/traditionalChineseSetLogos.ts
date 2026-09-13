import type { ImageSourcePropType } from 'react-native';

export type TraditionalChineseSetLogoLookupInput = {
  id?: string | null;
  setId?: string | null;
  language?: string | null;
};

type TraditionalChineseSetLogoMatch = {
  setId: string;
  source: ImageSourcePropType;
};

// Six preserved marks selected for in-app identification by the owner's
// 13 September request. Exact source bytes and scope are recorded in the
// manifest; this selection does not assert a new upstream licence grant.
const TRADITIONAL_CHINESE_SET_LOGOS: Record<string, TraditionalChineseSetLogoMatch> = {
  '41251d8a-6a1c-4f91-8e84-22e2fe7737fd': { setId: '41251d8a-6a1c-4f91-8e84-22e2fe7737fd', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/sca.webp') as ImageSourcePropType },
  '5578c7d0-f386-4945-b651-65dd2f3ee2d3': { setId: '5578c7d0-f386-4945-b651-65dd2f3ee2d3', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scb.webp') as ImageSourcePropType },
  'c816b27f-f145-413b-b971-3f7b1542f24c': { setId: 'c816b27f-f145-413b-b971-3f7b1542f24c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scc.webp') as ImageSourcePropType },
  '70184f97-2d37-457a-8ae4-21a4b40d270c': { setId: '70184f97-2d37-457a-8ae4-21a4b40d270c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scd.webp') as ImageSourcePropType },
  '52d0226c-123a-4b62-bcc4-0433b5afb56f': { setId: '52d0226c-123a-4b62-bcc4-0433b5afb56f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/s8a.webp') as ImageSourcePropType },
  '9932f014-e867-49a3-8597-424386f59ba5': { setId: '9932f014-e867-49a3-8597-424386f59ba5', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/sn.webp') as ImageSourcePropType },
};

function isTraditionalChineseLanguage(language?: string | null) {
  return ['zh-tw', 'zh-hant'].includes(String(language ?? '').trim().toLowerCase().replace(/_/g, '-'));
}

export function getTraditionalChineseSetLogoSourceForSet(
  input?: TraditionalChineseSetLogoLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  if (!input || !isTraditionalChineseLanguage(input.language ?? fallbackLanguage)) return null;
  const setId = String(input.id ?? input.setId ?? '').trim().toLowerCase();
  return TRADITIONAL_CHINESE_SET_LOGOS[setId]?.source ?? null;
}
