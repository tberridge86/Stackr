import { StyleSheet, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Text } from './Text';
import { typeScale } from '../lib/typography';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    ...typeScale.body,
    fontSize: 16,
    lineHeight: 23,
  },
  defaultSemiBold: {
    ...typeScale.body,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    ...typeScale.pageTitle,
    fontSize: 32,
    lineHeight: 37,
  },
  subtitle: {
    ...typeScale.sectionTitleCompact,
    fontSize: 20,
  },
  link: {
    ...typeScale.body,
    fontSize: 16,
    lineHeight: 24,
    color: '#0a7ea4',
  },
});
