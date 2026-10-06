import React from 'react';
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
export function StackrLoadingIndicator({ accessibilityLabel = 'Loading', ...props }: ActivityIndicatorProps) {
  return <ActivityIndicator accessibilityLabel={accessibilityLabel} {...props} />;
}
