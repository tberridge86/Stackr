import React from 'react';
import {
  type ImageProps,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { PRICE_API_URL } from '../lib/config';
import { getCardArtworkPresentation } from '../lib/cardArtworkPresentation';
import {
  getEditionVariantImageUrl,
  getEditionAwareImageUrl,
  getPublicScrydexCardImageUrl,
  shouldFetchEditionImage,
  verifiedRemoteEditionImage,
  type EditionImageSize,
} from '../lib/editionImages';
import type { ScanEditionHint } from '../types/scan';
import { Text } from './Text';
import { StackrImage } from './StackrImage';

type Props = {
  uri?: string | null;
  fullUri?: string | null;
  fallbackUri?: string | null;
  cardId?: string | null;
  rawData?: any;
  editionHint?: ScanEditionHint | null;
  sourceSize?: EditionImageSize;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageProps['resizeMode'];
  onReferenceImageChange?: (shared: boolean) => void;
};

function EditionAwareCardImageBase({
  uri,
  fullUri,
  fallbackUri,
  cardId,
  rawData,
  editionHint,
  sourceSize = 'large',
  style,
  imageStyle,
  resizeMode = 'contain',
  onReferenceImageChange,
}: Props) {
  const rawVariantUri = React.useMemo(
    () => getEditionVariantImageUrl(rawData, editionHint, sourceSize),
    [editionHint, rawData, sourceSize]
  );
  const [remoteVariantUri, setRemoteVariantUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setRemoteVariantUri(null);

    if (!PRICE_API_URL || !cardId || !editionHint || !shouldFetchEditionImage({
      cardId, editionHint, rawVariantUri, suppliedUri: uri ?? fullUri ?? fallbackUri,
    })) {
      return () => {
        active = false;
      };
    }

    const params = new URLSearchParams({
      cardId,
      editionHint,
      size: sourceSize,
    });

    const controller = new AbortController();
    fetch(`${PRICE_API_URL}/api/card-image/edition?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active) setRemoteVariantUri(verifiedRemoteEditionImage(payload));
      })
      .catch(() => {
        if (active) setRemoteVariantUri(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cardId, editionHint, rawVariantUri, sourceSize, uri, fullUri, fallbackUri]);

  const scrydexUnlimitedUri = React.useMemo(
    () => getPublicScrydexCardImageUrl(cardId, editionHint, sourceSize),
    [cardId, editionHint, sourceSize]
  );
  const resolvedDisplayUri = getEditionAwareImageUrl({
    rawVariantUri,
    remoteVariantUri,
    suppliedUri: uri ?? fullUri ?? fallbackUri,
    scrydexUnlimitedUri,
  });
  const hasSourceVariant = Boolean(rawVariantUri || remoteVariantUri);
  const needsVisualPatch = Boolean(editionHint && !hasSourceVariant && editionHint !== 'unlimited');
  const contentFit = resizeMode === 'cover' ? 'cover' : resizeMode === 'stretch' ? 'fill' : 'contain';
  const artwork = getCardArtworkPresentation(rawData);
  const handleSourceChange = React.useCallback((source: string | null) => {
    onReferenceImageChange?.(artwork?.candidates.some((candidate) => candidate.uri === source && candidate.kind === 'shared') ?? false);
  }, [artwork, onReferenceImageChange]);

  return (
    <View style={[styles.container, style]}>
      {resolvedDisplayUri || fullUri || fallbackUri ? (
        <StackrImage
          uri={resolvedDisplayUri}
          fullUri={!hasSourceVariant ? fullUri : undefined}
          fallbackSource={!hasSourceVariant && fallbackUri ? { uri: fallbackUri } : undefined}
          fallbackUris={!hasSourceVariant ? artwork?.candidates.map((candidate) => candidate.uri).filter((value) => typeof value === 'string') : undefined}
          onSourceChange={handleSourceChange}
          style={styles.image}
          imageStyle={imageStyle}
          contentFit={contentFit}
          priority={sourceSize === 'small' ? 'low' : 'normal'}
          transition={sourceSize === 'small' ? 140 : 220}
          showFallbackIcon
        />
      ) : (
        <View style={styles.fallback} />
      )}

      {needsVisualPatch && editionHint === '1st_edition' && (
        <View pointerEvents="none" style={styles.firstEditionStamp}>
          <Text style={styles.firstEditionOne}>1st</Text>
          <Text style={styles.firstEditionText}>EDITION</Text>
        </View>
      )}

      {needsVisualPatch && editionHint === 'shadowless' && (
        <View pointerEvents="none" style={styles.shadowlessBadge}>
          <Text style={styles.shadowlessText}>SHADOWLESS</Text>
        </View>
      )}
    </View>
  );
}

export default React.memo(EditionAwareCardImageBase);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  firstEditionStamp: {
    position: 'absolute',
    left: '9%',
    top: '43%',
    width: '17%',
    aspectRatio: 0.78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1.4,
    borderColor: '#111111',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    transform: [{ rotate: '-5deg' }],
  },
  firstEditionOne: {
    color: '#111111',
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '900',
  },
  firstEditionText: {
    color: '#111111',
    fontSize: 5,
    lineHeight: 6,
    fontWeight: '900',
    letterSpacing: 0,
  },
  shadowlessBadge: {
    position: 'absolute',
    right: '7%',
    bottom: '8%',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
  },
  shadowlessText: {
    color: '#FFFFFF',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
