import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { theme } from '../lib/theme';

export function Text(props: TextProps) {
  return (
    <RNText
      {...props}
      style={[{ color: theme.colors.text }, props.style]}
    />
  );
}