export type BinderCover = {
  key: string;
  label: string;
  image: any;
  accentColor: string;
};

export const BINDER_COVERS: BinderCover[] = [
  { key: 'mewtwo', label: 'Mewtwo', image: require('../assets/binders/mewtwo.png'), accentColor: '#22C55E' },
  { key: 'lucario', label: 'Lucario', image: require('../assets/binders/lucario.png'), accentColor: '#1D4ED8' },
  { key: 'charizard', label: 'Charizard', image: require('../assets/binders/charizard.png'), accentColor: '#EA580C' },
  { key: 'gardevoir', label: 'Gardevoir', image: require('../assets/binders/gardevoir.png'), accentColor: '#9333EA' },
  { key: 'gengar', label: 'Gengar', image: require('../assets/binders/gengar.png'), accentColor: '#6D28D9' },
  { key: 'arceus', label: 'Arceus', image: require('../assets/binders/arceus.png'), accentColor: '#D1D5DB' },
  { key: 'lucario_dark', label: 'Lucario Dark', image: require('../assets/binders/lucario_dark.png'), accentColor: '#1E3A5F' },
  { key: 'rayquaza', label: 'Rayquaza', image: require('../assets/binders/rayquaza.png'), accentColor: '#4B5563' },
  { key: 'kyogre', label: 'Kyogre', image: require('../assets/binders/kyogre.png'), accentColor: '#0891B2' },
  { key: 'ho_oh', label: 'Ho-Oh', image: require('../assets/binders/ho_oh.png'), accentColor: '#CA8A04' },
  { key: 'mew', label: 'Mew', image: require('../assets/binders/mew.png'), accentColor: '#EC4899' },
  { key: 'eevee', label: 'Eevee', image: require('../assets/binders/eevee.png'), accentColor: '#92400E' },
  { key: 'leafeon', label: 'Leafeon', image: require('../assets/binders/leafeon.png'), accentColor: '#65A30D' },
  { key: 'darkrai', label: 'Darkrai', image: require('../assets/binders/darkrai.png'), accentColor: '#111827' },
  { key: 'sylveon', label: 'Sylveon', image: require('../assets/binders/sylveon.png'), accentColor: '#C084FC' },
  { key: 'snorlax', label: 'Snorlax', image: require('../assets/binders/snorlax.png'), accentColor: '#78716C' },
  { key: 'charizard_dark', label: 'Charizard Dark', image: require('../assets/binders/charizard_dark.png'), accentColor: '#991B1B' },
  { key: 'lugia', label: 'Lugia', image: require('../assets/binders/lugia.png'), accentColor: '#94A3B8' },
  { key: 'volcarona', label: 'Volcarona', image: require('../assets/binders/volcarona.png'), accentColor: '#166534' },
  { key: 'jolteon', label: 'Jolteon', image: require('../assets/binders/jolteon.png'), accentColor: '#CA8A04' },
  { key: 'lugia_blue', label: 'Lugia Blue', image: require('../assets/binders/lugia_blue.png'), accentColor: '#1E40AF' },
  { key: 'sudowoodo', label: 'Sudowoodo', image: require('../assets/binders/sudowoodo.png'), accentColor: '#92400E' },
  { key: 'suicune', label: 'Suicune', image: require('../assets/binders/suicune.png'), accentColor: '#0284C7' },
  { key: 'celebi', label: 'Celebi', image: require('../assets/binders/celebi.png'), accentColor: '#16A34A' },
  { key: 'blaziken', label: 'Blaziken', image: require('../assets/binders/blaziken.png'), accentColor: '#C2410C' },
  { key: 'vaporeon', label: 'Vaporeon', image: require('../assets/binders/vaporeon.png'), accentColor: '#0EA5E9' },
  { key: 'zoroark', label: 'Zoroark', image: require('../assets/binders/zoroark.png'), accentColor: '#7C2D12' },
  { key: 'blissey', label: 'Blissey', image: require('../assets/binders/blissey.png'), accentColor: '#F9A8D4' },
  { key: 'arcanine', label: 'Arcanine', image: require('../assets/binders/arcanine.png'), accentColor: '#B45309' },
  { key: 'umbreon', label: 'Umbreon', image: require('../assets/binders/umbreon.png'), accentColor: '#4C1D95' },
  { key: 'jirachi', label: 'Jirachi', image: require('../assets/binders/jirachi.png'), accentColor: '#D97706' },
  { key: 'darkrai_black', label: 'Darkrai Black', image: require('../assets/binders/darkrai_black.png'), accentColor: '#1F2937' },
  { key: 'blastoise', label: 'Blastoise', image: require('../assets/binders/blastoise.png'), accentColor: '#1D4ED8' },
  { key: 'tyranitar', label: 'Tyranitar', image: require('../assets/binders/tyranitar.png'), accentColor: '#166534' },
  { key: 'espeon', label: 'Espeon', image: require('../assets/binders/espeon.png'), accentColor: '#A855F7' },
  { key: 'typhlosion', label: 'Typhlosion', image: require('../assets/binders/typhlosion.png'), accentColor: '#991B1B' },
  { key: 'skarmory', label: 'Skarmory', image: require('../assets/binders/skarmory.png'), accentColor: '#6B7280' },
  { key: 'garchomp', label: 'Garchomp', image: require('../assets/binders/garchomp.png'), accentColor: '#1E3A5F' },
  { key: 'mismagius', label: 'Mismagius', image: require('../assets/binders/mismagius.png'), accentColor: '#9D174D' },
  { key: 'zapdos', label: 'Zapdos', image: require('../assets/binders/zapdos.png'), accentColor: '#CA8A04' },
];

export function getBinderCover(key: string | null | undefined): BinderCover | null {
  if (!key) return null;
  return BINDER_COVERS.find((c) => c.key === key) ?? null;
}