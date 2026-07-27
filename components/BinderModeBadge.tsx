import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { typeScale } from '../lib/typography';

export type BinderModeBadgeType = 'master' | 'graded';

export const BINDER_MODE_BADGE_SOURCES: Record<BinderModeBadgeType, ImageSourcePropType> = {
  master: require('../assets/rev2/09-grading-master-set/mode-icons/master-set-cutout.png') as ImageSourcePropType,
  graded: require('../assets/rev2/09-grading-master-set/mode-icons/graded-cutout.png') as ImageSourcePropType,
};

const BADGE_LABELS: Record<BinderModeBadgeType, string> = {
  master: 'Master set',
  graded: 'Graded',
};

export function BinderModeIconBadge({
  type,
  size = 23,
  style,
}: {
  type: BinderModeBadgeType;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.iconShell, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Image source={BINDER_MODE_BADGE_SOURCES[type]} resizeMode="contain" style={styles.iconImage} />
    </View>
  );
}

export function BinderModePill({
  type,
  label = BADGE_LABELS[type],
  style,
}: {
  type: BinderModeBadgeType;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, style]}>
      <BinderModeIconBadge type={type} size={30} />
      <Text numberOfLines={1} style={styles.pillText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(232,225,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#6136F5',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  iconImage: {
    width: '82%',
    height: '82%',
  },
  pill: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(232,225,255,0.92)',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingLeft: 5,
    paddingRight: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  pillText: {
    ...typeScale.caption,
    color: '#07145F',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
});
