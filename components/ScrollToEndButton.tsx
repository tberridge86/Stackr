import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './theme-context';

export function ScrollToEndButton({
  visible,
  onPress,
  bottom = 24,
  right = 18,
  style,
  accessibilityLabel = 'Skip to end of list',
}: {
  visible: boolean;
  onPress: () => void;
  bottom?: number;
  right?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();

  if (!visible) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.button,
        {
          right,
          bottom,
          backgroundColor: theme.colors.primary,
          shadowColor: theme.colors.primary,
        },
        style,
      ]}
    >
      <Ionicons name="arrow-down" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    zIndex: 40,
    elevation: 12,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
  },
});
