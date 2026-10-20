import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { stackrControlTokens } from '../lib/stackrSizing';
import { useTheme } from './theme-context';

export function StackrRatingInput({ value, onChange, disabled = false }: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const controls = useRef<(View | null)[]>([]);

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Rate this trader" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <Pressable
          key={rating}
          ref={(node) => { controls.current[rating - 1] = node; }}
          accessibilityRole="radio"
          accessibilityLabel={`${rating} of 5 stars`}
          accessibilityState={{ checked: value === rating, disabled }}
          aria-checked={value === rating}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => onChange(rating)}
          {...(Platform.OS === 'web' ? {
            tabIndex: disabled ? -1 : value === rating || (value === 0 && rating === 1) ? 0 : -1,
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (disabled) return;
              const next = event.key === 'Home' ? 1
                : event.key === 'End' ? 5
                  : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? rating % 5 + 1
                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (rating + 3) % 5 + 1
                      : null;
              if (next == null) return;
              event.preventDefault();
              onChange(next);
              controls.current[next - 1]?.focus();
            },
          } : {})}
          style={({ pressed }) => ({
            width: stackrControlTokens.minTapTarget,
            minHeight: stackrControlTokens.minTapTarget,
            borderRadius: stackrControlTokens.utilityRadius,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value === rating || pressed ? theme.colors.primary + '12' : 'transparent',
            opacity: disabled ? 0.58 : 1,
          })}
        >
          <Ionicons name={rating <= value ? 'star' : 'star-outline'} size={32} color={theme.colors.primary} accessible={false} />
        </Pressable>
      ))}
    </View>
  );
}
