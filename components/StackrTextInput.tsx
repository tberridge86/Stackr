import React, { forwardRef, useId } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { stackrControlTokens } from '../lib/stackrSizing';
import { resolveTypographyStyle } from '../lib/typography';
import { Text } from './Text';
import { useTheme } from './theme-context';

export type StackrTextInputProps = TextInputProps & {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string | null;
  showLabel?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/** A stable field name stays available when its placeholder disappears. */
export const StackrTextInput = forwardRef<TextInput, StackrTextInputProps>(function StackrTextInput({
  label,
  required = false,
  helpText,
  error,
  showLabel = true,
  containerStyle,
  style,
  multiline,
  accessibilityLabel,
  accessibilityHint,
  ...props
}, ref) {
  const { theme } = useTheme();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const descriptionIds = [helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');
  const typography = resolveTypographyStyle({ fontSize: 16, ...StyleSheet.flatten(style) }, 'body');

  return (
    <View style={[{ minWidth: 0, gap: 6 }, containerStyle]}>
      {showLabel ? <Text variant="body" style={{ fontWeight: '700' }}>{label}{required ? ' (required)' : ''}</Text> : null}
      <TextInput
        {...props}
        {...(Platform.OS === 'web' ? {
          'aria-required': required,
          'aria-invalid': Boolean(error),
          'aria-describedby': descriptionIds || undefined,
        } : {})}
        ref={ref}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? `${label}${required ? ', required' : ''}`}
        accessibilityHint={accessibilityHint ?? [helpText, error].filter(Boolean).join('. ')}
        placeholderTextColor={props.placeholderTextColor ?? theme.colors.textSoft}
        style={[
          {
            minHeight: multiline ? 96 : stackrControlTokens.minTapTarget,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderRadius: stackrControlTokens.utilityRadius,
            backgroundColor: theme.colors.card,
            borderColor: error ? theme.colors.semantic.error : theme.colors.border,
            color: theme.colors.text,
            fontSize: 16,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
          typography,
        ]}
      />
      {helpText ? <Text nativeID={helpId} variant="support" style={{ color: theme.colors.textSoft }}>{helpText}</Text> : null}
      {error ? <Text nativeID={errorId} accessibilityRole="alert" accessibilityLiveRegion="polite" variant="support" style={{ color: theme.colors.semantic.error }}>{error}</Text> : null}
    </View>
  );
});
