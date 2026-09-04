export function isTcgdexAssetPointer(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.hostname.toLowerCase().replace(/\.$/, '') === 'assets.tcgdex.net';
  } catch {
    return false;
  }
}

/**
 * Return a public-display copy with exact TCGdex-hosted pointers suppressed.
 * Key names are deliberately irrelevant so existing Stackr-hosted, bundled,
 * relative, and other reviewed values remain byte-for-byte unchanged.
 */
export function sanitizeTcgdexAssetPointersForPublicDisplay(value) {
  if (Array.isArray(value)) return value.map(sanitizeTcgdexAssetPointersForPublicDisplay);
  if (isTcgdexAssetPointer(value)) return null;
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = sanitizeTcgdexAssetPointersForPublicDisplay(entry);
  }
  return output;
}
