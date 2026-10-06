import React from 'react';
import { type ImageProps, type ImageStyle, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { getCardArtworkPresentation } from '../lib/cardArtworkPresentation';
import { getEditionAwareImageUrl, getEditionVariantImageUrl, type EditionImageSize } from '../lib/editionImages';
import type { ScanEditionHint } from '../types/scan';
import { Text } from './Text';
import { StackrImage } from './StackrImage';
import { CardFinishArtwork } from './CardFinishArtwork';
import type { CardFinishMetadata } from '../lib/cardFinishProfiles';

type Props = {
  uri?: string | null;
  fullUri?: string | null;
  fallbackUri?: string | null;
  cardId?: string | null;
  /** Catalogue language scopes artwork identity and cache entries. */
  language?: string | null;
  rawData?: any;
  editionHint?: ScanEditionHint | null;
  sourceSize?: EditionImageSize;
  /** Retained for callers; the disabled legacy edition endpoint is never used. */
  resolveRemoteEdition?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageProps['resizeMode'];
  onReferenceImageChange?: (shared: boolean) => void;
  cropToCard?: boolean;
  fallback?: React.ReactNode;
  finishMetadata?: CardFinishMetadata;
  isSlabbed?: boolean;
};

function isForeignLanguage(language: unknown) {
  const value = String(language ?? '').trim().toLowerCase().replace(/_/g, '-');
  return Boolean(value && value !== 'en' && value !== 'english' && !value.startsWith('en-'));
}

function EditionAwareCardImageBase({ uri, fullUri, fallbackUri, cardId, language, rawData, editionHint, sourceSize = 'large', style, imageStyle, resizeMode = 'contain', onReferenceImageChange, cropToCard = false, fallback, finishMetadata, isSlabbed }: Props) {
  const rawVariantUri = React.useMemo(() => getEditionVariantImageUrl(rawData, editionHint, sourceSize), [editionHint, rawData, sourceSize]);
  const foreign = isForeignLanguage(language ?? rawData?.language);
  // Only exact supplied catalogue artwork and an explicitly tagged local variant
  // are admissible. The old edition route is contained, and constructed/provider
  // fallbacks do not establish a foreign printing's language or identity.
  const resolvedDisplayUri = getEditionAwareImageUrl({ rawVariantUri, suppliedUri: sourceSize === 'small' ? uri ?? fullUri ?? fallbackUri : fullUri ?? uri ?? fallbackUri });
  const hasSourceVariant = Boolean(rawVariantUri);
  const needsVisualPatch = !foreign && Boolean(editionHint && !hasSourceVariant && editionHint !== 'unlimited');
  const contentFit = resizeMode === 'cover' ? 'cover' : resizeMode === 'stretch' ? 'fill' : 'contain';
  const artwork = getCardArtworkPresentation(rawData);
  const handleSourceChange = React.useCallback((source: string | null) => {
    onReferenceImageChange?.(artwork?.candidates.some((candidate) => candidate.uri === source && candidate.kind === 'shared') ?? false);
  }, [artwork, onReferenceImageChange]);

  const face = <View style={[styles.container, finishMetadata ? { width: '100%', height: '100%' } : style]}>
    {resolvedDisplayUri || fullUri || fallbackUri ? <StackrImage
      uri={resolvedDisplayUri}
      fullUri={!hasSourceVariant ? fullUri : undefined}
      fallbackSource={!hasSourceVariant && fallbackUri ? { uri: fallbackUri } : undefined}
      fallbackUris={!foreign && !hasSourceVariant ? artwork?.candidates.map((candidate) => candidate.uri) : undefined}
      cacheKey={[String(language ?? rawData?.language ?? 'en').toLowerCase(), cardId ?? 'unknown', sourceSize].join(':')}
      onSourceChange={handleSourceChange}
      style={styles.image}
      imageStyle={imageStyle}
      contentFit={contentFit}
      cropToCard={cropToCard}
      preserveDetail={sourceSize !== 'small'}
      fallback={fallback}
      priority={sourceSize === 'small' ? 'low' : 'normal'}
      transition={sourceSize === 'small' ? 140 : 220}
      showFallbackIcon
      cardShape
    /> : fallback ?? <View style={styles.fallback} />}
    {needsVisualPatch && editionHint === '1st_edition' && <View pointerEvents="none" style={styles.firstEditionStamp}><Text style={styles.firstEditionOne}>1st</Text><Text style={styles.firstEditionText}>EDITION</Text></View>}
    {needsVisualPatch && editionHint === 'shadowless' && <View pointerEvents="none" style={styles.shadowlessBadge}><Text style={styles.shadowlessText}>SHADOWLESS</Text></View>}
  </View>;
  return finishMetadata ? <CardFinishArtwork cardMetadata={finishMetadata} isSlabbed={isSlabbed} style={style}>{face}</CardFinishArtwork> : face;
}

export default React.memo(EditionAwareCardImageBase);
const styles = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative', backgroundColor: 'transparent' },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(148, 163, 184, 0.18)' },
  firstEditionStamp: { position: 'absolute', left: '9%', top: '43%', width: '17%', aspectRatio: 0.78, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1.4, borderColor: '#111111', backgroundColor: 'rgba(255, 255, 255, 0.82)', transform: [{ rotate: '-5deg' }] },
  firstEditionOne: { color: '#111111', fontSize: 9, lineHeight: 10, fontWeight: '900' },
  firstEditionText: { color: '#111111', fontSize: 5, lineHeight: 6, fontWeight: '900' },
  shadowlessBadge: { position: 'absolute', right: '7%', bottom: '8%', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(17, 24, 39, 0.78)' },
  shadowlessText: { color: '#FFFFFF', fontSize: 7, lineHeight: 9, fontWeight: '900' },
});
