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

// The six preserved marks and 36 high-resolution additions are selected for
// in-app identification. Manifests retain exact identity, hashes and image
// origin; generated enhancements are not official high-resolution masters.
const TRADITIONAL_CHINESE_SET_LOGOS: Record<string, TraditionalChineseSetLogoMatch> = {
  '41251d8a-6a1c-4f91-8e84-22e2fe7737fd': { setId: '41251d8a-6a1c-4f91-8e84-22e2fe7737fd', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/sca.webp') as ImageSourcePropType },
  '5578c7d0-f386-4945-b651-65dd2f3ee2d3': { setId: '5578c7d0-f386-4945-b651-65dd2f3ee2d3', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scb.webp') as ImageSourcePropType },
  'c816b27f-f145-413b-b971-3f7b1542f24c': { setId: 'c816b27f-f145-413b-b971-3f7b1542f24c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scc.webp') as ImageSourcePropType },
  '70184f97-2d37-457a-8ae4-21a4b40d270c': { setId: '70184f97-2d37-457a-8ae4-21a4b40d270c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/scd.webp') as ImageSourcePropType },
  '52d0226c-123a-4b62-bcc4-0433b5afb56f': { setId: '52d0226c-123a-4b62-bcc4-0433b5afb56f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/s8a.webp') as ImageSourcePropType },
  '9932f014-e867-49a3-8597-424386f59ba5': { setId: '9932f014-e867-49a3-8597-424386f59ba5', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos/sn.webp') as ImageSourcePropType },
  '9a71e2aa-241a-4895-9224-959e6983c4a3': { setId: '9a71e2aa-241a-4895-9224-959e6983c4a3', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s10a.webp') as ImageSourcePropType },
  'ff1e5d11-3043-4137-a0a2-bc2b2da43d9e': { setId: 'ff1e5d11-3043-4137-a0a2-bc2b2da43d9e', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s10b.webp') as ImageSourcePropType },
  'fd0c18a1-c4c3-451d-a43f-4593cd07804e': { setId: 'fd0c18a1-c4c3-451d-a43f-4593cd07804e', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s10d.webp') as ImageSourcePropType },
  '71a109c6-2c3a-4e6d-ae1b-4cdce9441c8c': { setId: '71a109c6-2c3a-4e6d-ae1b-4cdce9441c8c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s10p.webp') as ImageSourcePropType },
  'a7f84e96-a008-47f0-8b41-a05de3f23618': { setId: 'a7f84e96-a008-47f0-8b41-a05de3f23618', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s11.webp') as ImageSourcePropType },
  '545b8020-25d6-4e10-b380-1856f905956f': { setId: '545b8020-25d6-4e10-b380-1856f905956f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s11a.webp') as ImageSourcePropType },
  'eb834c9a-e8b3-474b-8ddb-6f57bf58d3d2': { setId: 'eb834c9a-e8b3-474b-8ddb-6f57bf58d3d2', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s12.webp') as ImageSourcePropType },
  'eed3fcbd-fd4c-4b7f-9b75-a68e15d61476': { setId: 'eed3fcbd-fd4c-4b7f-9b75-a68e15d61476', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s12a.webp') as ImageSourcePropType },
  'e6feffca-611b-479c-bfb2-43b80374458f': { setId: 'e6feffca-611b-479c-bfb2-43b80374458f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s4a.webp') as ImageSourcePropType },
  '8ee58e69-05d9-4aca-94be-9b1099f0aa3f': { setId: '8ee58e69-05d9-4aca-94be-9b1099f0aa3f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s5a.webp') as ImageSourcePropType },
  '384319e0-5887-4575-933c-5d05848e8e1f': { setId: '384319e0-5887-4575-933c-5d05848e8e1f', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s5i.webp') as ImageSourcePropType },
  'fa4fe313-ee43-4824-91bd-b3a6c16aaf7c': { setId: 'fa4fe313-ee43-4824-91bd-b3a6c16aaf7c', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s5r.webp') as ImageSourcePropType },
  'b4dbdf8f-b0ec-4185-8e74-0c3b2b0e7648': { setId: 'b4dbdf8f-b0ec-4185-8e74-0c3b2b0e7648', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s6a.webp') as ImageSourcePropType },
  '631ac177-7fbc-4a0f-9ec5-85660f4009cd': { setId: '631ac177-7fbc-4a0f-9ec5-85660f4009cd', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s6h.webp') as ImageSourcePropType },
  '565ca9b6-c3b7-4398-a96a-d0dfd1bc1886': { setId: '565ca9b6-c3b7-4398-a96a-d0dfd1bc1886', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s6k.webp') as ImageSourcePropType },
  '4a00009f-25a3-4dce-83dd-7bc6b757c046': { setId: '4a00009f-25a3-4dce-83dd-7bc6b757c046', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s7d.webp') as ImageSourcePropType },
  'dfc21eb0-e33a-4cc8-b368-82e5bafa71da': { setId: 'dfc21eb0-e33a-4cc8-b368-82e5bafa71da', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s7r.webp') as ImageSourcePropType },
  '87c0562d-f7e7-4395-8a2a-a17705341951': { setId: '87c0562d-f7e7-4395-8a2a-a17705341951', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s8.webp') as ImageSourcePropType },
  '7201a603-407b-491c-b118-467f6549e400': { setId: '7201a603-407b-491c-b118-467f6549e400', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s8b.webp') as ImageSourcePropType },
  'ec704d48-6e26-4489-9063-4eb4f5924233': { setId: 'ec704d48-6e26-4489-9063-4eb4f5924233', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s9.webp') as ImageSourcePropType },
  '834c9416-bd5e-4a1d-9170-d8e4ba817d20': { setId: '834c9416-bd5e-4a1d-9170-d8e4ba817d20', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/s9a.webp') as ImageSourcePropType },
  '929a6c13-5b43-4aba-b887-1f86cc94ce31': { setId: '929a6c13-5b43-4aba-b887-1f86cc94ce31', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sh.webp') as ImageSourcePropType },
  '6c446b0c-155d-4926-b0ee-5369f6ac44d3': { setId: '6c446b0c-155d-4926-b0ee-5369f6ac44d3', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sj.webp') as ImageSourcePropType },
  '1217161f-69bf-4176-acce-93f23e475d04': { setId: '1217161f-69bf-4176-acce-93f23e475d04', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sk.webp') as ImageSourcePropType },
  '99d2cff9-6664-4b0f-8e9a-f9c9ed4fd563': { setId: '99d2cff9-6664-4b0f-8e9a-f9c9ed4fd563', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sld.webp') as ImageSourcePropType },
  'c1a9f285-94bb-40a6-acef-547a5a0b0fb0': { setId: 'c1a9f285-94bb-40a6-acef-547a5a0b0fb0', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sll.webp') as ImageSourcePropType },
  '104c8230-fefa-450c-8b97-0773154d456b': { setId: '104c8230-fefa-450c-8b97-0773154d456b', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sp5.webp') as ImageSourcePropType },
  'b29d2b28-f5a2-474a-9173-0d29fb5aeb55': { setId: 'b29d2b28-f5a2-474a-9173-0d29fb5aeb55', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sp6.webp') as ImageSourcePropType },
  '2d2c36be-9511-4b30-9979-ad6af1a4f9ee': { setId: '2d2c36be-9511-4b30-9979-ad6af1a4f9ee', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/spd.webp') as ImageSourcePropType },
  '0dc7982d-2a45-4984-b930-0d4e688d4fa9': { setId: '0dc7982d-2a45-4984-b930-0d4e688d4fa9', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/spz.webp') as ImageSourcePropType },
  '92afdf21-b16e-4e85-b54f-5f0603cbf6fa': { setId: '92afdf21-b16e-4e85-b54f-5f0603cbf6fa', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sv1s.webp') as ImageSourcePropType },
  '496f02eb-5cda-4b1b-a5cf-e46816c6f834': { setId: '496f02eb-5cda-4b1b-a5cf-e46816c6f834', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sv1v.webp') as ImageSourcePropType },
  '0c790038-ee1a-411f-bd9c-fed9238c1c42': { setId: '0c790038-ee1a-411f-bd9c-fed9238c1c42', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/sv2p.webp') as ImageSourcePropType },
  '0c39417c-7e51-4c2e-83a4-e7180ff18ed1': { setId: '0c39417c-7e51-4c2e-83a4-e7180ff18ed1', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/svc.webp') as ImageSourcePropType },
  'aeacc226-2669-41be-87af-adb0792b6a26': { setId: 'aeacc226-2669-41be-87af-adb0792b6a26', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/svd.webp') as ImageSourcePropType },
  '34e5af6e-66d0-4fea-98ce-b1fa1ec1d1dd': { setId: '34e5af6e-66d0-4fea-98ce-b1fa1ec1d1dd', source: require('../assets/rev2/12-traditional-chinese-set-logo/logos-hires-20261016/svp1.webp') as ImageSourcePropType },
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
