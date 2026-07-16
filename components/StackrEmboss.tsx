import React from 'react';
import { StyleSheet, View } from 'react-native';

export type StackrEmbossTone = 'purple' | 'light' | 'gold';

type StackrButtonPatternProps = {
  tone?: StackrEmbossTone;
  compact?: boolean;
};

export function StackrButtonPattern({ tone = 'purple', compact = false }: StackrButtonPatternProps) {
  const purple = tone === 'purple';
  const gold = tone === 'gold';
  const topHighlight = purple
    ? 'rgba(255,255,255,0.24)'
    : gold
      ? 'rgba(255,255,255,0.42)'
      : 'rgba(255,255,255,0.88)';
  const lowerDepth = purple
    ? 'rgba(29,12,109,0.16)'
    : gold
      ? 'rgba(142,91,0,0.10)'
      : 'rgba(82,38,217,0.08)';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 1,
          right: 1,
          height: 1,
          borderRadius: 999,
          backgroundColor: topHighlight,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: compact ? 7 : 14,
          right: compact ? 7 : 14,
          height: 1,
          borderRadius: 999,
          backgroundColor: lowerDepth,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 1,
          right: 1,
          top: 1,
          bottom: 1,
          borderRadius: compact ? 10 : 14,
          borderWidth: 1,
          borderColor: purple ? 'rgba(255,255,255,0.08)' : 'rgba(105,56,245,0.05)',
        }}
      />
    </View>
  );
}
