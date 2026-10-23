import { Image as ExpoImage, type ImageLoadEventData, type ImageProps } from 'expo-image';
import React from 'react';

export type StackrImageElementProps = Omit<ImageProps, 'onLoad'> & {
  /** DOM load events do not reveal whether the browser used its HTTP cache. */
  onLoad?: (event: Omit<ImageLoadEventData, 'cacheType'> & { cacheType?: ImageLoadEventData['cacheType'] }) => void;
  /** Browser scheduling only; native rendering retains Expo's existing policy. */
  loading?: 'lazy' | 'eager';
};

export function StackrImageElement({ loading: _loading, ...props }: StackrImageElementProps) {
  return <ExpoImage {...props} />;
}
