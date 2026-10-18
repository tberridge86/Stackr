import React from 'react';
import { Image, type ImageProps, StyleSheet, View, type ViewStyle } from 'react-native';
import { stackrIcons, type StackrIconKey } from '../lib/stackrIcons';
import { STACKR_ICON_OUTLINE, StackrNavigationIcon, type StackrNavigationIconName } from './StackrNavigationIcon';
import { useTheme } from './theme-context';

const functionalNames = {
  binders: 'collection', chase: 'chase', duplicates: 'duplicates', favorite: 'favorite',
  hub: 'home', inbound: 'inbound', info: 'info', marketMovers: 'marketMovers',
  marketplace: 'market', notifications: 'notifications', outbound: 'outbound',
  pokedex: 'pokedex', priceBuilder: 'priceBuilder', profile: 'profile', protect: 'protect',
  scanCard: 'scan', searchCard: 'search', sellCard: 'listings', setDiscovery: 'discover',
  sellerMode: 'inventory', social: 'social', stock: 'priceBuilder', trade: 'trade',
} satisfies Partial<Record<StackrIconKey, StackrNavigationIconName>>;
const functionalSources = Object.entries(functionalNames)
  .map(([key, name]) => [stackrIcons[key as StackrIconKey], name] as const);

// Only explicit functional asset identities opt into SVG. Other image sources,
// including photographs, logos and protection tiers, keep their Image behaviour.
export function StackrFunctionalIcon(props: ImageProps) {
  const { theme } = useTheme();
  const match = functionalSources.find(([source]) => source === props.source);
  if (!match || props.onLoad || props.onError || props.onLoadEnd || props.onLoadStart || props.onProgress) {
    return <Image {...props} />;
  }
  const style = StyleSheet.flatten(props.style) ?? {};
  const { tintColor, resizeMode: _resizeMode, ...frameStyle } = style;
  const width = typeof style.width === 'number' ? style.width : 28;
  const height = typeof style.height === 'number' ? style.height : 28;
  const color = typeof tintColor === 'string' ? tintColor : theme.dark ? theme.colors.text : STACKR_ICON_OUTLINE;
  const accentColor = tintColor ? color : theme.colors.primary;
  return (
    <View
      style={[{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }, frameStyle as ViewStyle]}
      accessible={props.accessible ?? Boolean(props.accessibilityLabel)}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityRole={props.accessibilityRole ?? (props.accessibilityLabel ? 'image' : undefined)}
      accessibilityState={props.accessibilityState}
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      importantForAccessibility={props.importantForAccessibility}
      accessibilityIgnoresInvertColors={props.accessibilityIgnoresInvertColors}
      testID={props.testID}
      nativeID={props.nativeID}
      onLayout={props.onLayout}
    >
      <StackrNavigationIcon name={match[1]} color={color} accentColor={accentColor} size={Math.min(width, height)} />
    </View>
  );
}
