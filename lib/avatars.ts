import { STACKR_PROFILE_AVATARS } from './profileAvatars';

const legacyKeys = [
  'blaze',
  'aqua',
  'volt',
  'leaf',
  'nova',
  'luna',
  'cinder',
  'myst',
  'kai',
  'sky',
  'aurora',
  'rook',
] as const;

const LEGACY_AVATAR_PRESETS = legacyKeys.map((key, index) => ({
  key,
  image: STACKR_PROFILE_AVATARS[index % STACKR_PROFILE_AVATARS.length]?.image ?? STACKR_PROFILE_AVATARS[0].image,
}));

export const AVATAR_PRESETS = [
  ...LEGACY_AVATAR_PRESETS,
  ...STACKR_PROFILE_AVATARS.map(({ key, image }) => ({ key, image })),
];
