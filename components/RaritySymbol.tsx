import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type RaritySymbolKey =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'doubleRare'
  | 'tripleRare'
  | 'ultraRare'
  | 'hyperRare'
  | 'secretRare'
  | 'illustrationRare'
  | 'specialIllustrationRare'
  | 'promo'
  | 'megaAttackRare'
  | 'megaHyperRare';

type RaritySymbolAsset = {
  source: ImageSourcePropType;
  aspect: number;
  wide?: boolean;
};

export const RARITY_SYMBOL_CARD_OVERLAY: ViewStyle = {
  position: 'absolute',
  right: 4,
  bottom: 4,
};

const RARITY_SYMBOL_ASSETS: Record<RaritySymbolKey, RaritySymbolAsset> = {
  common: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Common.png') as ImageSourcePropType,
    aspect: 92 / 100,
  },
  uncommon: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Uncommon.png') as ImageSourcePropType,
    aspect: 324 / 288,
  },
  rare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Rare.png') as ImageSourcePropType,
    aspect: 128 / 117,
  },
  doubleRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Doublew rare.png') as ImageSourcePropType,
    aspect: 164 / 101,
    wide: true,
  },
  tripleRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Mega attack rare.png') as ImageSourcePropType,
    aspect: 610 / 424,
    wide: true,
  },
  ultraRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Ultra Rare.png') as ImageSourcePropType,
    aspect: 153 / 82,
    wide: true,
  },
  hyperRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Hyper.png') as ImageSourcePropType,
    aspect: 160 / 127,
  },
  secretRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Secret.png') as ImageSourcePropType,
    aspect: 516 / 170,
    wide: true,
  },
  illustrationRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Illustration rare.png') as ImageSourcePropType,
    aspect: 104 / 100,
  },
  specialIllustrationRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/SIR.png') as ImageSourcePropType,
    aspect: 134 / 75,
    wide: true,
  },
  promo: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Promo.png') as ImageSourcePropType,
    aspect: 132 / 121,
  },
  megaAttackRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/Mega attack rare.png') as ImageSourcePropType,
    aspect: 610 / 424,
    wide: true,
  },
  megaHyperRare: {
    source: require('../assets/rev2/03-ui-illustrations/rarity-symbols/mega hyper rare.png') as ImageSourcePropType,
    aspect: 267 / 266,
  },
};

function normalizeRarity(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/pokemon/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasToken(tokens: string[], token: string) {
  return tokens.includes(token);
}

export function getRaritySymbolKey(rarity?: string | null): RaritySymbolKey | null {
  const normalized = normalizeRarity(rarity);
  if (!normalized || normalized === 'unknown') return null;

  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (hasToken(tokens, 'promo') || normalized.includes('black star')) return 'promo';
  if (
    hasToken(tokens, 'sar') ||
    hasToken(tokens, 'sir') ||
    normalized.includes('special illustration') ||
    normalized.includes('special art')
  ) {
    return 'specialIllustrationRare';
  }
  if (
    hasToken(tokens, 'ar') ||
    hasToken(tokens, 'ir') ||
    normalized.includes('illustration rare') ||
    normalized.includes('art rare') ||
    normalized.includes('character rare')
  ) {
    return 'illustrationRare';
  }
  if (normalized.includes('mega hyper')) return 'megaHyperRare';
  if (normalized.includes('mega attack')) return 'megaAttackRare';
  if (hasToken(tokens, 'ur') || normalized.includes('ultra rare') || normalized.includes('rare ultra')) {
    return 'ultraRare';
  }
  if (
    hasToken(tokens, 'hr') ||
    normalized.includes('hyper rare') ||
    normalized.includes('rainbow rare') ||
    normalized.includes('rare rainbow')
  ) {
    return 'hyperRare';
  }
  if (
    hasToken(tokens, 'sr') ||
    normalized.includes('super rare') ||
    normalized.includes('secret rare') ||
    normalized.includes('rare secret') ||
    normalized.includes('ace spec')
  ) {
    return 'secretRare';
  }
  if (hasToken(tokens, 'rrr') || normalized.includes('triple rare')) return 'tripleRare';
  if (hasToken(tokens, 'rr') || normalized.includes('double rare')) return 'doubleRare';
  if (hasToken(tokens, 'u') || normalized.includes('uncommon')) return 'uncommon';
  if (hasToken(tokens, 'c') || normalized.includes('common')) return 'common';
  if (hasToken(tokens, 'r') || normalized.includes('rare')) return 'rare';

  return null;
}

export function RaritySymbol({
  rarity,
  size = 15,
  style,
}: {
  rarity?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const key = getRaritySymbolKey(rarity);
  if (!key) return null;

  const asset = RARITY_SYMBOL_ASSETS[key];
  const height = Math.round(size * (asset.wide ? 0.84 : 1));
  const width = Math.round(Math.min(size * asset.aspect, size * 2.05));

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.symbolFrame,
        {
          width,
          height,
        },
        style,
      ]}
    >
      <Image
        source={asset.source}
        resizeMode="contain"
        style={styles.symbolImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  symbolFrame: {
    overflow: 'visible',
    backgroundColor: 'transparent',
    opacity: 0.92,
  },
  symbolImage: {
    width: '100%',
    height: '100%',
  },
});
