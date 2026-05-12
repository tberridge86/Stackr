import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { useTheme } from './theme-context';

export function Text(props: TextProps) {
  const { theme } = useTheme();
  return (
    <RNText
      {...props}
      style={[{ color: theme.colors.text }, props.style]}
    />
  );
}
