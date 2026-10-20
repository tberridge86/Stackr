import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StackrLoadingIndicator } from './StackrLoadingIndicator';
import { Text } from './Text';
import { useTheme } from './theme-context';

type StackrLoadingScreenProps = {
  message?: string;
  compact?: boolean;
  busy?: boolean;
};

/** In-app waits use the card protection loop; the opening logo reveal is separate. */
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
      <StackrLoadingIndicator animating={busy} size={compact ? 110 : 200} accessible={false} />
      <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 12, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 160 },
});
