import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';
import React from 'react';
import {
  InteractionManager,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './theme-context';
import {
  enforceTcgdexRuntimeImagePolicy,
  isTcgdexControlledCardReferenceUrl,
  TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY,
} from '../lib/tcgdexControlledCardReference';

type StackrImagePriority = 'low' | 'normal' | 'high';

type StackrImageProps = {
  uri?: string | null;
  thumbnailUri?: string | null;
  fullUri?: string | null;
  source?: ImageSourcePropType | null;
  fallbackSource?: ImageSourcePropType | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  priority?: StackrImagePriority;
  transition?: number;
  prefetch?: boolean;
  cacheKey?: string | null;
  rounded?: number;
  placeholderColor?: string;
  showFallbackIcon?: boolean;
  accessibilityLabel?: string;
  onLoad?: () => void;
  onError?: () => void;
};

const prefetchedUris = new Set<string>();

function sanitizeImageSource(source?: ImageSourcePropType | null): ImageSourcePropType | null {
  if (source == null || typeof source === 'number') return source ?? null;
  if (Array.isArray(source)) {
    const sanitized = source.flatMap((candidate) => {
      const next = sanitizeImageSource(candidate as ImageSourcePropType);
      return next == null ? [] : Array.isArray(next) ? next : [next];
    });
    return sanitized.length ? sanitized as ImageSourcePropType : null;
  }
  if (typeof source === 'object' && typeof source.uri === 'string') {
    const uri = enforceTcgdexRuntimeImagePolicy(source.uri);
    return uri ? { ...source, uri } : null;
  }
  return source;
}

const getBestUri = ({
  thumbnailUri,
  uri,
  fullUri,
}: Pick<StackrImageProps, 'thumbnailUri' | 'uri' | 'fullUri'>) =>
  thumbnailUri || uri || fullUri || null;

export async function prefetchStackrImages(
  urls: (string | null | undefined)[],
  limit = 18
) {
  const uniqueUrls = [...new Set(urls.map((url) => enforceTcgdexRuntimeImagePolicy(url)).filter((url): url is string => Boolean(url)))].filter(
    (url) => !prefetchedUris.has(url)
  );
  const nextUrls = uniqueUrls.slice(0, limit);
  if (!nextUrls.length) return false;

  nextUrls.forEach((url) => prefetchedUris.add(url));

  try {
    const controlled = nextUrls.filter(isTcgdexControlledCardReferenceUrl);
    const ordinary = nextUrls.filter((url) => !isTcgdexControlledCardReferenceUrl(url));
    const results = await Promise.all([
      ordinary.length ? ExpoImage.prefetch(ordinary, { cachePolicy: 'memory-disk' }) : true,
      controlled.length ? ExpoImage.prefetch(controlled, { cachePolicy: 'memory' }) : true,
    ]);
    return results.every(Boolean);
  } catch {
    nextUrls.forEach((url) => prefetchedUris.delete(url));
    return false;
  }
}

export function prefetchStackrImagesAfterInteractions(
  urls: (string | null | undefined)[],
  limit = 18
) {
  const task = InteractionManager.runAfterInteractions(() => {
    void prefetchStackrImages(urls, limit);
  });

  return () => {
    task.cancel?.();
  };
}

function StackrImageBase({
  uri,
  thumbnailUri,
  fullUri,
  source,
  fallbackSource,
  style,
  imageStyle,
  contentFit = 'cover',
  priority = 'normal',
  transition = 180,
  prefetch = false,
  cacheKey,
  rounded,
  placeholderColor,
  showFallbackIcon = true,
  accessibilityLabel,
  onLoad,
  onError,
}: StackrImageProps) {
  const { theme } = useTheme();
  const [failed, setFailed] = React.useState(false);
  const remoteUri = enforceTcgdexRuntimeImagePolicy(getBestUri({ thumbnailUri, uri, fullUri }));
  const isRemoteImage = Boolean(remoteUri);
  const remoteSource = remoteUri
    ? {
        uri: remoteUri,
        cacheKey: cacheKey ?? remoteUri,
      }
    : null;
  const sanitizedSource = sanitizeImageSource(source);
  const sanitizedFallbackSource = sanitizeImageSource(fallbackSource);
  const resolvedSource = failed
    ? sanitizedFallbackSource ?? sanitizedSource ?? null
    : sanitizedSource ?? remoteSource ?? sanitizedFallbackSource ?? null;
  const backgroundColor = placeholderColor ?? theme.colors.surface;

  React.useEffect(() => {
    setFailed(false);
  }, [remoteUri, source]);

  React.useEffect(() => {
    if (!prefetch || !remoteUri || prefetchedUris.has(remoteUri)) return;
    prefetchedUris.add(remoteUri);
    const task = InteractionManager.runAfterInteractions(() => {
      ExpoImage.prefetch(remoteUri, { cachePolicy: isTcgdexControlledCardReferenceUrl(remoteUri) ? 'memory' : 'memory-disk' }).catch(() => {
        prefetchedUris.delete(remoteUri);
      });
    });

    return () => {
      task.cancel?.();
    };
  }, [prefetch, remoteUri]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, borderRadius: rounded },
        style,
      ]}
    >
      {resolvedSource ? (
        <ExpoImage
          source={resolvedSource}
          style={[styles.image, imageStyle]}
          contentFit={contentFit}
          placeholder={isRemoteImage ? { blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' } : undefined}
          placeholderContentFit={contentFit}
          cachePolicy={isTcgdexControlledCardReferenceUrl(remoteUri) ? 'memory' : 'memory-disk'}
          priority={priority}
          transition={transition}
          recyclingKey={remoteUri ?? cacheKey ?? undefined}
          accessibilityLabel={accessibilityLabel}
          onLoad={() => onLoad?.()}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : null}

      {!resolvedSource && showFallbackIcon ? (
        <View style={styles.fallbackIcon}>
          <Ionicons name="image-outline" size={20} color={theme.colors.textSoft} />
        </View>
      ) : null}

      {isTcgdexControlledCardReferenceUrl(remoteUri) ? (
        <View pointerEvents="none" style={styles.providerAttribution}>
          <Text style={styles.providerAttributionText}>{TCGDEX_CONTROLLED_CARD_REFERENCE_POLICY.attributionText}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const StackrImage = React.memo(StackrImageBase);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fallbackIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAttribution: { position: 'absolute', right: 3, bottom: 3, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(15, 23, 42, 0.78)' },
  providerAttributionText: { color: '#FFFFFF', fontSize: 7, lineHeight: 9, fontWeight: '700' },
});
