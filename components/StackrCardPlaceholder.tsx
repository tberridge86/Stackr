import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { DimensionValue, Image, ImageSourcePropType, View } from 'react-native';

type StackrCardPlaceholderProps = {
  uri?: string | null;
  source?: ImageSourcePropType | null;
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  rotate?: string;
  resizeMode?: 'cover' | 'contain';
};

export function StackrCardPlaceholder({
  uri,
  source,
  width = 72,
  height = 100,
  borderRadius = 10,
  rotate = '0deg',
  resizeMode = 'cover',
}: StackrCardPlaceholderProps) {
  if (uri || source) {
    return (
      <Image
        source={uri ? { uri } : source!}
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: '#F6F3FF',
          transform: [{ rotate }],
        }}
        resizeMode={resizeMode}
      />
    );
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#5F35F5',
        borderWidth: 2,
        borderColor: '#CFC3FF',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#5F35F5',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 3,
        transform: [{ rotate }],
      }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 7,
          borderRadius: Math.max(3, borderRadius - 3),
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.38)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '42%',
          backgroundColor: 'rgba(255,255,255,0.16)',
          transform: [{ rotate: '-18deg' }],
        }}
      />
      <Ionicons name="ellipse-outline" size={36} color="rgba(255,255,255,0.75)" />
      <Ionicons name="sparkles" size={11} color="#FFFFFF" style={{ position: 'absolute', top: 10, left: 10 }} />
      <Ionicons name="sparkles" size={9} color="#FFD166" style={{ position: 'absolute', top: 12, right: 12 }} />
    </View>
  );
}

export function StackrCardFan({
  images = [],
  width = 92,
  height = 126,
  count = 3,
}: {
  images?: (string | null | undefined)[];
  width?: number;
  height?: number;
  count?: number;
}) {
  return (
    <View style={{ width: width + 34, height, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: index * 17,
          }}
        >
          <StackrCardPlaceholder
            uri={images[index] ?? null}
            width={width}
            height={height}
            borderRadius={12}
            rotate={`${(index - 1) * 8}deg`}
          />
        </View>
      ))}
    </View>
  );
}
