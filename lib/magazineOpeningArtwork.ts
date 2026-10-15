import type { ImageSourcePropType } from 'react-native';
import type { PokemonCard } from './pokemonTcg';

export function magazineOpeningCollectionCard(openingId: string, card: PokemonCard): PokemonCard {
  if (openingId !== 'corocoro-2001-05' || card.id !== 'ja:corocoro-shining-mew-2001'
    || card.language !== 'ja' || card.set?.id !== 'ja:corocoro-comic-may-2001-promo'
    || card.images?.large || card.images?.small) return card;
  // A bundle-local file URI is not a durable image reference for a saved binder.
  const original = 'https://storage.googleapis.com/images.pricecharting.com/e5ugsqovgiiisj6o/1600.jpg';
  return { ...card, images: { small: original, large: original } };
}

/** Bundled, unchanged source photograph for this specific magazine recreation. */
export function getMagazineOpeningArtwork(openingId: string, cardName: string): ImageSourcePropType | null {
  if (openingId === 'corocoro-1996-11') {
    if (cardName === 'Pikachu') return require('../assets/magazine-openings/pikachu-1996.jpg');
    if (cardName === 'Jigglypuff') return require('../assets/magazine-openings/jigglypuff-1996.jpg');
  }
  if (openingId === 'corocoro-1997-09') {
    if (cardName === 'Surfing Pikachu') return require('../assets/magazine-openings/surfing-pikachu-1997.jpg');
    if (cardName === 'Imakuni?') return require('../assets/magazine-openings/imakuni-1997.jpg');
  }
  if (openingId === 'corocoro-1998-04') {
    if (cardName === "Farfetch'd") return require('../assets/magazine-openings/farfetchd-1998.jpg');
    if (cardName === 'Jynx') return require('../assets/magazine-openings/jynx-1998.jpg');
    if (cardName === 'Cubone') return require('../assets/magazine-openings/cubone-1998.jpg');
  }
  if (openingId === 'corocoro-1998-12') {
    if (cardName === "Brock's Mankey") return require('../assets/magazine-openings/brocks-mankey-1998.jpg');
    if (cardName === "Erika's Bulbasaur") return require('../assets/magazine-openings/erikas-bulbasaur-1998.jpg');
    if (cardName === "Misty's Tentacool") return require('../assets/magazine-openings/mistys-tentacool-1998.jpg');
    if (cardName === "Lt. Surge's Jolteon") return require('../assets/magazine-openings/lt-surges-jolteon-1998.jpg');
  }
  if (openingId === 'corocoro-2001-05' && cardName === 'Shining Mew') {
    return require('../assets/magazine-openings/shining-mew-2001.jpg');
  }
  if (openingId === 'fan-club-volume-5' && cardName === 'Touch Change!') {
    return require('../assets/magazine-openings/touch-change-1998.jpg');
  }
  return null;
}
