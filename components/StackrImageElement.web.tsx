import { Image as ExpoImage, type ImageSource } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StackrImageElementProps } from './StackrImageElement';

function anonymousSource(source: StackrImageElementProps['source']): ImageSource | null {
  if (!source || typeof source !== 'object' || Array.isArray(source) || !('uri' in source)
    || typeof source.uri !== 'string' || source.headers) return null;
  try {
    const url = new URL(source.uri);
    // Signed/private query URLs and header-based requests retain Expo's handling.
    return ['https:', 'http:'].includes(url.protocol) && !url.search && !url.username && !url.password
      ? source : null;
  } catch { return null; }
}

/** Expo Image 3 does not forward loading to its img. Keep the native image path
 * and special Expo features intact, and use browser scheduling for plain CDN art. */
export function StackrImageElement({ loading = 'lazy', ...props }: StackrImageElementProps) {
  const source = anonymousSource(props.source);
  const style = StyleSheet.flatten(props.style);
  const direct = source && !props.placeholder && !props.transition && !props.tintColor
    && !style?.tintColor && (!props.cachePolicy || props.cachePolicy === 'memory-disk');
  if (!direct) return <ExpoImage {...props} />;

  return (
    <View style={[{ overflow: 'hidden' }, props.style]}>
      <img
        src={source.uri}
        alt={props.accessibilityLabel ?? props.alt ?? ''}
        loading={loading}
        decoding="async"
        fetchPriority={props.priority === 'high' || props.priority === 'low' ? props.priority : 'auto'}
        width={source.width ?? undefined}
        height={source.height ?? undefined}
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: props.contentFit ?? 'cover' }}
        onLoad={event => {
          props.onLoad?.({ source: { url: source.uri!, width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight, mediaType: null } });
          props.onDisplay?.();
        }}
        onError={() => props.onError?.({ error: 'Image request failed.' })}
      />
    </View>
  );
}
