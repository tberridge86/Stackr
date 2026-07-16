import type { ImageSourcePropType } from 'react-native';

export const STACKR_PROFILE_TEAM_KEYS = [
  'light',
  'honorable',
  'wanderers',
  'chaos',
  'dark',
  'evil',
] as const;

export type StackrProfileTeamKey = typeof STACKR_PROFILE_TEAM_KEYS[number];

export type StackrProfileTeam = {
  key: StackrProfileTeamKey;
  label: string;
  tagline: string;
  color: string;
  accent: string;
  softColor: string;
  logo?: ImageSourcePropType;
};

export type StackrProfileAvatar = {
  key: string;
  team: StackrProfileTeamKey;
  label: string;
  image: ImageSourcePropType;
  cropScale?: number;
  cropX?: number;
  cropY?: number;
};

export const STACKR_PROFILE_TEAMS: StackrProfileTeam[] = [
  {
    key: 'light',
    label: 'Light',
    tagline: 'Warm gold crest with bright profile accents.',
    color: '#F7B731',
    accent: '#FFF7D7',
    softColor: '#FFF8DF',
    logo: require('../assets/rev2/06-profile-teams/light/logo.png'),
  },
  {
    key: 'honorable',
    label: 'Honorable',
    tagline: 'Polished purple crest with clean profile trim.',
    color: '#6A35F5',
    accent: '#EDE7FF',
    softColor: '#F6F2FF',
    logo: require('../assets/rev2/06-profile-teams/honorable/logo.png'),
  },
  {
    key: 'wanderers',
    label: 'Wanderers',
    tagline: 'Blue crest with open, travel-inspired profile accents.',
    color: '#2F80ED',
    accent: '#DDEBFF',
    softColor: '#F1F7FF',
    logo: require('../assets/rev2/06-profile-teams/wanderers/logo.png'),
  },
  {
    key: 'chaos',
    label: 'Chaos',
    tagline: 'Electric purple crest with bold profile effects.',
    color: '#7A3CFF',
    accent: '#F0E6FF',
    softColor: '#F8F1FF',
    logo: require('../assets/rev2/06-profile-teams/chaos/logo.png'),
  },
  {
    key: 'dark',
    label: 'Dark',
    tagline: 'Deep violet crest with premium vault styling.',
    color: '#3D2D78',
    accent: '#E8E1FF',
    softColor: '#F2EFFF',
    logo: require('../assets/rev2/06-profile-teams/dark/logo.png'),
  },
  {
    key: 'evil',
    label: 'Evil',
    tagline: 'Warm orange crest with high-contrast profile accents.',
    color: '#D9480F',
    accent: '#FFE8DA',
    softColor: '#FFF4EE',
    logo: require('../assets/rev2/06-profile-teams/evil/logo.png'),
  },
];

const profileAvatarSources: Record<
  StackrProfileTeamKey,
  { labels: readonly string[]; images: readonly ImageSourcePropType[] }
> = {
  light: {
    labels: ['Luma', 'Halo', 'Sol', 'Verdant', 'Spark'],
    images: [
      require('../assets/rev2/06-profile-teams/light/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/light/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/light/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/light/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/light/profile/character-05.png'),
    ],
  },
  honorable: {
    labels: [
      'Ari',
      'Noctis',
      'Stella',
      'Violet',
      'Pika',
      'Azure',
      'Fern',
      'Gengar',
      'Cinder',
      'Moon',
      'Ivy',
      'Sylvie',
      'Frost',
      'Aegis',
      'Rosie',
      'Leaf',
      'Lyra',
      'Drake',
      'Celeste',
    ],
    images: [
      require('../assets/rev2/06-profile-teams/honorable/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-05.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-06.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-07.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-08.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-09.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-10.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-11.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-12.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-13.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-14.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-15.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-16.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-17.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-18.png'),
      require('../assets/rev2/06-profile-teams/honorable/profile/character-19.png'),
    ],
  },
  wanderers: {
    labels: [
      'Atlas',
      'Meadow',
      'Moonstep',
      'Harbour',
      'Tide',
      'Ruins',
      'Scout',
      'Rift',
      'Blaze',
      'Verdant',
      'Rocket',
      'Volt',
      'Ridge',
      'Rose',
      'Umbra',
    ],
    images: [
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-05.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-06.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-07.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-08.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-09.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-10.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-11.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-12.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-13.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-14.png'),
      require('../assets/rev2/06-profile-teams/wanderers/profile/character-15.png'),
    ],
  },
  chaos: {
    labels: [
      'Flux',
      'Rift',
      'Blaze',
      'Nightshade',
      'Rocket',
      'Static',
      'Mimik',
      'Azure',
      'Glitch',
      'Bolt',
      'Cipher',
      'Ember',
      'Thorn',
      'Pix',
      'Spectre',
    ],
    images: [
      require('../assets/rev2/06-profile-teams/chaos/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-05.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-06.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-07.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-08.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-09.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-10.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-11.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-12.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-13.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-14.png'),
      require('../assets/rev2/06-profile-teams/chaos/profile/character-15.png'),
    ],
  },
  dark: {
    labels: ['Nocturne', 'Obsidian', 'Shade', 'Eclipse', 'Moonlit', 'Phantom'],
    images: [
      require('../assets/rev2/06-profile-teams/dark/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/dark/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/dark/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/dark/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/dark/profile/character-05.png'),
      require('../assets/rev2/06-profile-teams/dark/profile/character-06.png'),
    ],
  },
  evil: {
    labels: ['Vex', 'Hex', 'Ruin', 'Omen', 'Cipher', 'Dread'],
    images: [
      require('../assets/rev2/06-profile-teams/evil/profile/character-01.png'),
      require('../assets/rev2/06-profile-teams/evil/profile/character-02.png'),
      require('../assets/rev2/06-profile-teams/evil/profile/character-03.png'),
      require('../assets/rev2/06-profile-teams/evil/profile/character-04.png'),
      require('../assets/rev2/06-profile-teams/evil/profile/character-05.png'),
      require('../assets/rev2/06-profile-teams/evil/profile/character-06.png'),
    ],
  },
};

function buildProfileAvatars(team: StackrProfileTeamKey): StackrProfileAvatar[] {
  const source = profileAvatarSources[team];
  return source.images.map((image, index) => ({
    key: `stackr-${team}-${String(index + 1).padStart(2, '0')}`,
    team,
    label: source.labels[index] ?? `${team} ${index + 1}`,
    image,
  }));
}

export const STACKR_PROFILE_AVATARS: StackrProfileAvatar[] = STACKR_PROFILE_TEAM_KEYS.flatMap(buildProfileAvatars);

export function getProfileTeam(key?: string | null) {
  const normalized = key?.trim().toLowerCase();
  return STACKR_PROFILE_TEAMS.find((team) => team.key === normalized || team.label.toLowerCase() === normalized);
}

export function getProfileAvatar(key?: string | null) {
  return STACKR_PROFILE_AVATARS.find((avatar) => avatar.key === key);
}

export function getProfileAvatarsForTeam(teamKey: StackrProfileTeamKey) {
  return STACKR_PROFILE_AVATARS.filter((avatar) => avatar.team === teamKey);
}
