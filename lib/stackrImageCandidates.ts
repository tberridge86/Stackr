import type { ImageSourcePropType } from 'react-native';

export type StackrImageCandidate = {
  key: string;
  source: ImageSourcePropType;
  uri: string | null;
};

/** Only supplied, policy-checked renditions of the same artwork enter this list. */
export function stackrImageCandidates(
  sources: (ImageSourcePropType | null | undefined)[],
): StackrImageCandidate[] {
  const candidates: StackrImageCandidate[] = [];
  const seen = new Set<string>();
  for (const input of sources) {
    for (const source of Array.isArray(input) ? input : [input]) {
      if (source == null) continue;
      const uri = typeof source === 'object' ? source.uri ?? null : null;
      const key = typeof source === 'number' ? `bundle:${source}` : JSON.stringify(source);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ key, source, uri });
    }
  }
  return candidates;
}

export function nextStackrImageCandidate(
  candidates: StackrImageCandidate[],
  failedKeys: readonly string[],
) {
  return candidates.find((candidate) => !failedKeys.includes(candidate.key)) ?? null;
}
