import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from './theme-context';

type StackrLoadingScreenProps = {
  message?: string;
  compact?: boolean;
  busy?: boolean;
};

/** In-app waits use one quiet ring; branding belongs only to startup. */
export function StackrLoadingScreen({ message = 'Loading', compact = false, busy = true }: StackrLoadingScreenProps) {
  const { theme } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy }}
      style={[styles.container, compact && styles.compact, { backgroundColor: theme.colors.bg }]}
    >
      <ActivityIndicator animating={busy} size="small" color={theme.colors.primary} accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 64 },
});
