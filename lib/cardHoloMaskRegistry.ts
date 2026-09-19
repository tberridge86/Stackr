import type { CardHoloMaskDescriptor } from './cardHoloProfile';

/**
 * Identity-bound local mask registry. It is intentionally empty until an
 * approved catalogue record supplies an exact card/language/variant geometry.
 * Consumers may append their verified immutable records at build time; this
 * module never fetches masks or treats an image URL as evidence.
 */
export const VERIFIED_CARD_HOLO_MASKS: readonly CardHoloMaskDescriptor[] = Object.freeze([]);
