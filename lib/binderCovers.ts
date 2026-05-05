export type BinderCover = {
  key: string;
  label: string;
  image: any;
  accentColor: string;
};

export const BINDER_COVERS: BinderCover[] = [
{ key: 'arcanine', label: 'Arcanine', image: require('../assets/binders/arcanine.png'), accentColor: '#C2410C' },
{ key: 'blastoise', label: 'Blastoise', image: require('../assets/binders/blastoise.png'), accentColor: '#1D4ED8' },
{ key: 'charizard', label: 'Charizard', image: require('../assets/binders/charizard.png'), accentColor: '#EA580C' },
{ key: 'cleffa', label: 'Cleffa', image: require('../assets/binders/cleffa.png'), accentColor: '#EC4899' },
{ key: 'eevee', label: 'Eevee', image: require('../assets/binders/eevee.png'), accentColor: '#92400E' },
{ key: 'froakie', label: 'Froakie', image: require('../assets/binders/froakie.png'), accentColor: '#0E7490' },
{ key: 'illustrator', label: 'Illustrator', image: require('../assets/binders/illustrator.png'), accentColor: '#1E3A5F' },
{ key: 'mantine', label: 'Mantine', image: require('../assets/binders/mantine.png'), accentColor: '#1D4ED8' },
{ key: 'mew', label: 'Mew', image: require('../assets/binders/mew.png'), accentColor: '#A855F7' },
{ key: 'mewtwo', label: 'Mewtwo', image: require('../assets/binders/mewtwo.png'), accentColor: '#7C3AED' },
{ key: 'pikachu', label: 'Pikachu', image: require('../assets/binders/pikachu.png'), accentColor: '#EAB308' },
{ key: 'psyduck', label: 'Psyduck', image: require('../assets/binders/psyduck.png'), accentColor: '#B45309' },
{ key: 'snorlax', label: 'Snorlax', image: require('../assets/binders/snorlax.png'), accentColor: '#15803D' },
{ key: 'sylveon', label: 'Sylveon', image: require('../assets/binders/sylveon.png'), accentColor: '#EC4899' },
{ key: 'togepi', label: 'Togepi', image: require('../assets/binders/togepi.png'), accentColor: '#D97706' },
{ key: 'tyranitar', label: 'Tyranitar', image: require('../assets/binders/tyranitar.png'), accentColor: '#166534' },
{ key: 'vaporeon', label: 'Vaporeon', image: require('../assets/binders/vaporeon.png'), accentColor: '#0369A1' },
];

export function getBinderCover(key: string | null | undefined): BinderCover | null {
  if (!key) return null;
  return BINDER_COVERS.find((c) => c.key === key) ?? null;
}