import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { StackrHeroBackdrop } from './StackrBackdrop';
import { stackrBrand } from '../lib/stackrBrand';
import { stackrIcons } from '../lib/stackrIcons';
import {
  getStackrHeaderLogoWidth,
  stackrActionIconSizes,
  stackrLogoSizes,
} from '../lib/stackrSizing';
import { StackrCardActionIcon, StackrPageTitle } from './StackrScreen';
import { StackrProfileAvatar } from './StackrProfileAvatar';
import { useProfile } from './profile-context';

type StackrScreenHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  variant?: 'compact' | 'hero';
  showLogo?: boolean;
  accentText?: string;
};

export function StackrScreenHeader({
  title,
  subtitle,
  rightIcon = 'notifications-outline',
  onRightPress,
  variant = 'compact',
  showLogo = false,
  accentText,
}: StackrScreenHeaderProps) {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const logoWidth = getStackrHeaderLogoWidth(width);
  const isHero = variant === 'hero';
  const rightImageIcon =
    rightIcon === 'notifications-outline'
      ? stackrIcons.notifications
      : rightIcon === 'information-circle-outline'
        ? stackrIcons.info
        : rightIcon === 'person-circle-outline'
          ? stackrIcons.profile
          : rightIcon === 'search-outline'
            ? stackrIcons.searchCard
            : null;

  return (
    <View style={{ position: 'relative', paddingTop: 2, paddingBottom: 12, overflow: 'hidden' }}>
      <StackrHeroBackdrop opacity={isHero ? 0.24 : 0.18} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {showLogo ? (
          <Image source={stackrBrand.wordmark} style={{ width: logoWidth, height: stackrLogoSizes.screenHeaderWordmark.height }} resizeMode="contain" />
        ) : (
          <View style={{ flex: 1 }}>
            <StackrPageTitle
              title={title}
              accentText={accentText}
            />
            {subtitle ? (
              <Text variant="support" style={{ color: theme.colors.textSoft, fontSize: isHero ? 15 : 12, marginTop: isHero ? 4 : 2 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
        <Pressable
          onPress={onRightPress}
          style={{
            width: stackrActionIconSizes.headerTouch,
            height: stackrActionIconSizes.headerTouch,
            borderRadius: stackrActionIconSizes.headerTouch / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {rightIcon === 'person-circle-outline' ? (
            <StackrProfileAvatar
              avatarUrl={profile?.avatar_url}
              avatarPreset={profile?.avatar_preset}
              size={stackrActionIconSizes.headerAvatar}
              borderWidth={1}
              accessibilityLabel="Open profile"
            />
          ) : rightImageIcon ? (
            <StackrCardActionIcon
              source={rightImageIcon}
              frameSize={stackrActionIconSizes.headerFrame}
              artworkSize={stackrActionIconSizes.headerArtwork}
            />
          ) : (
            <Ionicons name={rightIcon} size={24} color={theme.colors.text} />
          )}
          {rightIcon === 'notifications-outline' && (
            <View style={{ position: 'absolute', right: 8, top: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} />
          )}
        </Pressable>
      </View>
      {showLogo ? (
        <>
          <Ionicons name="sparkles" size={22} color="#F59E0B" style={{ position: 'absolute', left: 292, top: 86 }} />
          <Ionicons name="sparkles" size={16} color={theme.colors.primary} style={{ position: 'absolute', left: 324, top: 110 }} />
          <StackrPageTitle
            title={title}
            accentText={accentText}
            style={{ marginTop: 8 }}
          />
          {subtitle ? (
            <Text variant="support" style={{ color: theme.colors.textSoft, fontSize: isHero ? 15 : 12, marginTop: isHero ? 4 : 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
