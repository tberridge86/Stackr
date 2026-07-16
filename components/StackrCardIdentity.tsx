import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { typeScale } from '../lib/typography';
import { Text } from './Text';
import { useTheme } from './theme-context';

type StackrCardIdentitySize = 'hero' | 'detail' | 'compact';

type StackrCardIdentityProps = {
  name: string;
  setName?: string | null;
  number?: string | null;
  rarity?: string | null;
  edition?: string | null;
  size?: StackrCardIdentitySize;
  titleNumberOfLines?: number;
  metaNumberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  metaStyle?: StyleProp<TextStyle>;
};

export function StackrCardIdentity({
  name,
  setName,
  number,
  rarity,
  edition,
  size = 'detail',
  titleNumberOfLines = 2,
  metaNumberOfLines = 2,
  style,
  titleStyle,
  metaStyle,
}: StackrCardIdentityProps) {
  const { theme } = useTheme();
  const meta = [
    setName,
    number ? `#${number}` : null,
    edition,
    rarity,
  ].filter(Boolean).join(' \u00B7 ');

  return (
    <View style={[styles.container, style]}>
      <Text
        style={[
          styles.title,
          size === 'hero' ? styles.titleHero : size === 'compact' ? styles.titleCompact : styles.titleDetail,
          { color: theme.colors.text },
          titleStyle,
        ]}
        numberOfLines={titleNumberOfLines}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {name}
      </Text>
      {meta ? (
        <Text
          style={[
            styles.meta,
            size === 'compact' && styles.metaCompact,
            { color: theme.colors.textSoft },
            metaStyle,
          ]}
          numberOfLines={metaNumberOfLines}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  title: {
    ...typeScale.pageTitle,
    fontWeight: '900',
    letterSpacing: 0,
    paddingTop: 2,
    paddingBottom: 3,
    includeFontPadding: true,
  },
  titleHero: {
    fontSize: 28,
    lineHeight: 36,
  },
  titleDetail: {
    fontSize: 26,
    lineHeight: 34,
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 29,
  },
  meta: {
    ...typeScale.support,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    marginTop: 2,
    paddingBottom: 1,
    includeFontPadding: true,
  },
  metaCompact: {
    fontSize: 14,
    lineHeight: 19,
  },
});
