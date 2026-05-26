import React from 'react';
import {
  Image,
  type ImageProps,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { PRICE_API_URL } from '../lib/config';
import { getEditionVariantImageUrl, type EditionImageSize } from '../lib/editionImages';
import type { ScanEditionHint } from '../types/scan';
import { Text } from './Text';

type Props = {
  uri?: string | null;
  cardId?: string | null;
  rawData?: any;
  editionHint?: ScanEditionHint | null;
  sourceSize?: EditionImageSize;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageProps['resizeMode'];
};

export default function EditionAwareCardImage({
  uri,
  cardId,
  rawData,
  editionHint,
  sourceSize = 'large',
  style,
  imageStyle,
  resizeMode = 'contain',
}: Props) {
  const rawVariantUri = React.useMemo(
    () => getEditionVariantImageUrl(rawData, editionHint, sourceSize),
    [editionHint, rawData, sourceSize]
  );
  const [remoteVariantUri, setRemoteVariantUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setRemoteVariantUri(null);

    if (rawVariantUri || !PRICE_API_URL || !cardId || !editionHint) {
      return () => {
        active = false;
      };
    }

    const params = new URLSearchParams({
      cardId,
      editionHint,
      size: sourceSize,
    });

    fetch(`${PRICE_API_URL}/api/card-image/edition?${params.toString()}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.ok && typeof payload.imageUri === 'string') {
          setRemoteVariantUri(payload.imageUri);
        }
      })
      .catch(() => {
        if (active) setRemoteVariantUri(null);
      });

    return () => {
      active = false;
    };
  }, [cardId, editionHint, rawVariantUri, sourceSize]);

  const displayUri = rawVariantUri ?? remoteVariantUri ?? uri ?? null;
  const hasSourceVariant = Boolean(rawVariantUri || remoteVariantUri);
  const needsVisualPatch = Boolean(editionHint && !hasSourceVariant);

  return (
    <View style={[styles.container, style]}>
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={[styles.image, imageStyle]}
          resizeMode={resizeMode}
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

      {needsVisualPatch && editionHint === 'unlimited' && (
        <View pointerEvents="none" style={styles.unlimitedCover}>
          <Text style={styles.unlimitedText}>UNLIMITED</Text>
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
  unlimitedCover: {
    position: 'absolute',
    left: '7%',
    top: '43%',
    width: '23%',
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.18)',
    backgroundColor: 'rgba(245, 205, 118, 0.94)',
  },
  unlimitedText: {
    color: '#111111',
    fontSize: 7,
    lineHeight: 9,
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
