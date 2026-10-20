import type { EditionImageSize } from './editionImages';

type ArtworkInput = {
  uri?: string | null;
  fullUri?: string | null;
  rawData?: any;
  size?: EditionImageSize;
  editionUris?: readonly (string | null | undefined)[];
};

/** Use supplied renditions only. Exact edition artwork precedes generic artwork. */
export function getCardArtworkImageCandidates({ uri, fullUri, rawData, size = 'large', editionUris = [] }: ArtworkInput): string[] {
  const large = [fullUri, rawData?.images?.large, rawData?.image_large, rawData?.raw_data?.images?.large, rawData?.raw_data?.image_large];
  const small = [uri, rawData?.images?.small, rawData?.image_small, rawData?.raw_data?.images?.small, rawData?.raw_data?.image_small];
  return [...new Set([...editionUris, ...(size === 'small' ? [...small, ...large] : [...large, ...small])]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
}
