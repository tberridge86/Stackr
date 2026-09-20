import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  STACKR_LOADING_COLORS,
  STACKR_LOADING_GRADIENTS,
  STACKR_LOADING_MARK_LAYERS,
  STACKR_LOADING_SPARKLES,
  STACKR_LOADING_WORDMARK,
  type StackrLoadingLayer,
  type StackrLoadingGradientName,
  type StackrLoadingPaint,
} from '../lib/stackrLoadingArtwork';

type LoadingArtworkProps = {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  /** Use when the mark is the only accessible loading indicator on screen. */
  accessibilityLabel?: string;
};

export type LoadingMarkLayerProps = LoadingArtworkProps & {
  layer: 'rear' | 'middle' | 'front' | 'star';
};

function gradientId(name: string, idPrefix: string) {
  return `${idPrefix}-${name}`;
}

function isGradientName(fill: StackrLoadingPaint): fill is StackrLoadingGradientName {
  return fill === 'purpleGradient' || fill === 'goldGradient' || fill === 'wordmarkGradient';
}

function LoadingGradients({ idPrefix }: { idPrefix: string }) {
  return (
    <Defs>
      {Object.entries(STACKR_LOADING_GRADIENTS).map(([name, gradient]) => {
        const { stops, ...gradientProps } = gradient;
        return (
          <LinearGradient key={name} id={gradientId(name, idPrefix)} {...gradientProps}>
            {stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </LinearGradient>
        );
      })}
    </Defs>
  );
}

function paintFor(fill: StackrLoadingPaint, idPrefix: string) {
  if (isGradientName(fill)) return `url(#${gradientId(fill, idPrefix)})`;
  return STACKR_LOADING_COLORS[fill];
}

function Artwork({ artwork, width, height, style, accessibilityLabel }: LoadingArtworkProps & { artwork: StackrLoadingLayer }) {
  const idPrefix = `stackr-loading-${React.useId().replace(/:/g, '')}`;
  const accessibilityProps = Platform.OS === 'web'
    ? accessibilityLabel ? { role: 'img' as const, 'aria-label': accessibilityLabel } : {}
    : accessibilityLabel ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel } : {};

  return (
    <Svg
      width={width}
      height={height}
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      {...accessibilityProps}
    >
      <LoadingGradients idPrefix={idPrefix} />
      {artwork.paths.map((path, index) => (
        <Path
          key={`${index}-${path.fill}`}
          d={path.d}
          fill={paintFor(path.fill, idPrefix)}
          stroke={path.stroke ? paintFor(path.stroke, idPrefix) : undefined}
          strokeWidth={path.strokeWidth}
          transform={path.transform}
          fillRule={path.fillRule}
          clipRule={path.fillRule}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** A crisp, independently animatable part of the Stackr card mark. */
export function LoadingMarkLayer({ layer, ...props }: LoadingMarkLayerProps) {
  return <Artwork artwork={STACKR_LOADING_MARK_LAYERS[layer]} {...props} />;
}

/** The traced Stackr wordmark, rendered as vector contours rather than a bitmap. */
export function LoadingWordmark(props: LoadingArtworkProps) {
  return <Artwork artwork={STACKR_LOADING_WORDMARK} {...props} />;
}

/** Companion stars for use beneath the loading slogan. */
export function LoadingSparkles(props: LoadingArtworkProps) {
  return <Artwork artwork={STACKR_LOADING_SPARKLES} {...props} />;
}
