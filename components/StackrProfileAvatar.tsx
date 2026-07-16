import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { getProfileAvatar } from '../lib/profileAvatars';
import { stackrIcons } from '../lib/stackrIcons';
import { useTheme } from './theme-context';

type StackrProfileAvatarProps = {
  avatarUrl?: string | null;
  avatarPreset?: string | null;
  size?: number;
  borderWidth?: number;
  accessibilityLabel?: string;
};

export function StackrProfileAvatar({
  avatarUrl,
  avatarPreset,
  size = 40,
  borderWidth = 2,
  accessibilityLabel = 'Profile image',
}: StackrProfileAvatarProps) {
  const { theme } = useTheme();
  const stackrAvatar = getProfileAvatar(avatarPreset);
  const source: ImageSourcePropType | { uri: string } = avatarUrl
    ? { uri: avatarUrl }
    : stackrAvatar?.image ?? stackrIcons.profile;
  const isPhoto = Boolean(avatarUrl);
  const isCharacter = Boolean(!avatarUrl && stackrAvatar);
  const innerSize = Math.max(0, size - borderWidth * 2);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityIgnoresInvertColors
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: 'rgba(255,255,255,0.9)',
          backgroundColor: isCharacter ? theme.colors.surface : theme.colors.card,
        },
      ]}
    >
      <Image
        source={source}
        resizeMode={isPhoto ? 'cover' : 'contain'}
        style={{
          width: isCharacter ? Math.round(innerSize * 1.1) : innerSize,
          height: isCharacter ? Math.round(innerSize * 1.1) : innerSize,
          borderRadius: isPhoto ? innerSize / 2 : 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
