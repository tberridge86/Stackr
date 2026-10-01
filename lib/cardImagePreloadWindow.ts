/** Only supplied display thumbnails are eligible; never construct an image URL
 * or select another printing, language, finish, or full-size rendition here. */
export function cardImagePreloadWindow(
  thumbnails: readonly (string | null | undefined)[],
  visibleIndices: readonly number[],
  lookahead = 6,
  maximum = 18,
): string[] {
  const limit = Math.max(0, Math.min(18, Math.floor(maximum)));
  const visible = [...new Set(visibleIndices.filter(index => Number.isInteger(index)
    && index >= 0 && index < thumbnails.length))].sort((a, b) => a - b);
  if (!visible.length || !limit) return [];
  const next = Array.from({ length: Math.max(0, Math.min(6, Math.floor(lookahead))) },
    (_, index) => visible[visible.length - 1] + index + 1);
  const urls: string[] = [];
  for (const index of [...visible, ...next]) {
    const uri = thumbnails[index];
    if (typeof uri !== 'string' || !uri || urls.includes(uri)) continue;
    urls.push(uri);
    if (urls.length === limit) break;
  }
  return urls;
}
