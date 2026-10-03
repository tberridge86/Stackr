import type { PrintingMaterial } from './cardPrintingMaterial';

/**
 * Deliberately no invented approvals. Populate only from a reviewed map pack,
 * using scripts/prepare-printing-material-pack.cjs and retained reference evidence.
 * The procedural study fixtures must never be added to this production registry.
 */
export const REVIEWED_PRINTING_MATERIALS: readonly PrintingMaterial[] = Object.freeze([]);
