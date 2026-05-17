import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type StackrScreenHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
};

export function StackrScreenHeader({ title, subtitle, rightIcon = 'notifications-outline', onRightPress }: StackrScreenHeaderProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(182, Math.max(132, width * 0.42));

  return (
    <View style={{ position: 'relative', paddingTop: 8, paddingBottom: 16, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image source={require('../assets/images/hub.png')} style={{ width: logoWidth, height: 58 }} resizeMode="contain" />
        <Pressable
          onPress={onRightPress}
          style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={rightIcon} size={24} color={theme.colors.text} />
          {rightIcon === 'notifications-outline' && (
            <View style={{ position: 'absolute', right: 8, top: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} />
          )}
        </Pressable>
      </View>
      <Ionicons name="sparkles" size={22} color="#F59E0B" style={{ position: 'absolute', left: 292, top: 86 }} />
      <Ionicons name="sparkles" size={16} color={theme.colors.primary} style={{ position: 'absolute', left: 324, top: 110 }} />
      <Text style={{ color: theme.colors.text, fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: 0, marginTop: 8 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.textSoft, fontSize: 17, fontWeight: '700', marginTop: 5 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
