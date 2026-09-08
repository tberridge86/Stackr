import React from 'react';
import { StyleSheet, Text as RNText, TextProps } from 'react-native';
import { useTheme } from './theme-context';
import { resolveTypographyStyle, tabularNumberStyle, type TypeScaleKey } from '../lib/typography';

type StackrTextProps = TextProps & {
  variant?: TypeScaleKey;
  numeric?: boolean;
};

export function Text({ variant, numeric = false, style, ...props }: StackrTextProps) {
  const { theme } = useTheme();
  const flattenedStyle = StyleSheet.flatten(style) ?? {};
  const typographyStyle = resolveTypographyStyle(flattenedStyle, variant, numeric);

  return (
    <RNText
      {...props}
      allowFontScaling={props.allowFontScaling ?? true}
      maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 0}
      style={[
        style,
        { color: flattenedStyle.color ?? theme.colors.text },
        typographyStyle,
        numeric ? tabularNumberStyle : null,
      ]}
    />
  );
}
