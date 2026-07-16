import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme-context';

export function StackrBackButton({
  onPress,
  accessibilityLabel = 'Go back',
  style,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <Ionicons name="arrow-back" size={27} color={theme.colors.primary} />
    </TouchableOpacity>
  );
}
