import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { getBinderCover } from '../lib/binderCovers';
import { getPokemonSetLogoUrl } from '../lib/pokemonTcg';
import { stackrFonts } from '../lib/typography';
import { StackrImage } from './StackrImage';
import { useTheme } from './theme-context';

type BinderArtworkProps = {
  coverKey?: string | null;
  sourceSetId?: string | null;
  setName?: string | null;
  fallbackLogoUrl?: string | null;
  fallbackArtSource?: ImageSourcePropType | null;
  fallbackColor?: string | null;
  progress?: number;
  width?: number;
  stageHeight?: number;
  plateWidth?: number;
  plateHeight?: number;
  artworkWidth?: number;
  artworkHeight?: number;
  progressWidth?: number;
  progressHeight?: number;
  showProgressText?: boolean;
  showFan?: boolean;
  style?: StyleProp<ViewStyle>;
};

const clampPercent = (value?: number) => Math.max(0, Math.min(100, Number(value ?? 0)));

export function BinderArtwork({
  coverKey,
  sourceSetId,
  fallbackLogoUrl,
  fallbackArtSource,
  fallbackColor,
  progress = 0,
  width = 98,
  stageHeight = 112,
  plateWidth = 82,
  plateHeight = 92,
  artworkWidth = 66,
  artworkHeight = 80,
  progressWidth = 82,
  progressHeight = 4,
  showProgressText = true,
  showFan = true,
  style,
}: BinderArtworkProps) {
  const { theme } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);
  const cover = getBinderCover(coverKey);
  const resolvedLogoUrl = fallbackLogoUrl ?? (cover ? undefined : getPokemonSetLogoUrl(coverKey ?? sourceSetId));
  const accentColor = cover?.accentColor ?? fallbackColor ?? theme.colors.primary;
  const percent = clampPercent(progress);
  const progressBarHeight = Math.max(3, progressHeight);
  const progressGap = Math.max(4, Math.round(stageHeight * 0.035));
  const artAreaHeight = Math.max(38, stageHeight - progressBarHeight - progressGap);
  const binderWidth = Math.min(artworkWidth, Math.round(width * (showFan ? 0.82 : 0.76)));
  const binderHeight = Math.min(artworkHeight, Math.round(artAreaHeight * (showFan ? 0.96 : 0.88)));
  const binderLeft = (width - binderWidth) / 2;
  const binderTop = Math.max(0, Math.round((artAreaHeight - binderHeight) * (showFan ? 0.46 : 0.5)));
  const progressBarWidth = Math.max(18, Math.min(progressWidth, Math.round(binderWidth * 0.82)));
  const progressLeft = (width - progressBarWidth) / 2;
  const progressTop = Math.min(stageHeight - progressBarHeight, binderTop + binderHeight + progressGap);
  const fanWidth = Math.round(binderWidth * 0.66);
  const fanHeight = Math.round(binderHeight * 0.82);
  const fanTop = Math.max(0, binderTop + Math.round(binderHeight * 0.08));
  const fanCenterLeft = (width - fanWidth) / 2;
  const fanSpread = Math.max(13, Math.round(width * 0.15));
  const targetFillWidth = useMemo(
    () => (percent > 0 ? Math.max(progressBarHeight * 1.45, Math.round((percent / 100) * progressBarWidth)) : 0),
    [percent, progressBarHeight, progressBarWidth]
  );
  const fillWidth = useRef(new Animated.Value(targetFillWidth)).current;
  const shouldShowProgressText = showProgressText && progressBarWidth >= 50;

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUrl]);

  useEffect(() => {
    Animated.timing(fillWidth, {
      toValue: targetFillWidth,
      duration: 460,
      useNativeDriver: false,
    }).start();
  }, [fillWidth, targetFillWidth]);

  return (
    <View style={[styles.wrap, { width }, style]}>
      <View style={[styles.stage, { width, height: stageHeight }]}>
        {showFan ? (
          <>
            <LinearGradient
              colors={['rgba(7,20,95,0.34)', 'rgba(124,60,255,0.34)', 'rgba(177,92,255,0.20)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.fanCard,
                {
                  left: fanCenterLeft - fanSpread * 1.25,
                  top: fanTop + Math.round(fanHeight * 0.11),
                  width: fanWidth,
                  height: fanHeight,
                  transform: [{ rotate: '-24deg' }],
                },
              ]}
            />
            <LinearGradient
              colors={['rgba(105,56,245,0.34)', 'rgba(177,92,255,0.24)', 'rgba(255,255,255,0.20)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.fanCard,
                {
                  left: fanCenterLeft - fanSpread * 0.52,
                  top: fanTop,
                  width: fanWidth,
                  height: fanHeight,
                  transform: [{ rotate: '-13deg' }],
                },
              ]}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(124,60,255,0.28)', 'rgba(105,56,245,0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.fanCard,
                {
                  left: fanCenterLeft + fanSpread * 0.52,
                  top: fanTop,
                  width: fanWidth,
                  height: fanHeight,
                  transform: [{ rotate: '13deg' }],
                },
              ]}
            />
            <LinearGradient
              colors={['rgba(177,92,255,0.26)', 'rgba(105,56,245,0.34)', 'rgba(7,20,95,0.30)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.fanCard,
                {
                  left: fanCenterLeft + fanSpread * 1.25,
                  top: fanTop + Math.round(fanHeight * 0.11),
                  width: fanWidth,
                  height: fanHeight,
                  transform: [{ rotate: '24deg' }],
                },
              ]}
            />
          </>
        ) : null}

        <View
          style={[
            styles.binderSlot,
            {
              left: binderLeft,
              top: binderTop,
              width: binderWidth,
              height: binderHeight,
            },
          ]}
        >
          {cover?.image ? (
            <Image
              source={cover.image}
              style={styles.coverImage}
              resizeMode="contain"
            />
          ) : fallbackArtSource ? (
            <Image
              source={fallbackArtSource}
              style={styles.fallbackNameArt}
              resizeMode="contain"
            />
          ) : resolvedLogoUrl && !logoFailed ? (
            <StackrImage
              uri={resolvedLogoUrl}
              onError={() => setLogoFailed(true)}
              style={styles.fallbackLogo}
              contentFit="contain"
              priority="low"
              showFallbackIcon={false}
              placeholderColor="transparent"
            />
          ) : (
            <Ionicons name="albums-outline" size={Math.min(42, binderWidth * 0.58)} color={accentColor} />
          )}

        </View>

        <View
          pointerEvents="none"
          style={[
            styles.progressTrack,
            {
              left: progressLeft,
              top: progressTop,
              width: progressBarWidth,
              height: progressBarHeight,
              borderRadius: progressBarHeight / 2,
            },
          ]}
        >
          <View style={styles.progressInnerHighlight} />
          <Animated.View
            style={[
              styles.progressFillClip,
              {
                width: fillWidth,
                borderRadius: progressBarHeight / 2,
              },
            ]}
          >
            <LinearGradient
              colors={['#8557FF', '#A274FF', '#C69BFF']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {shouldShowProgressText ? (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.progressText,
                {
                  right: 5,
                  lineHeight: progressBarHeight,
                  fontSize: Math.max(5.5, Math.min(7, progressBarHeight + 1)),
                },
              ]}
            >
              {percent}%
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  fanCard: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.50)',
    shadowColor: '#6136F5',
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  binderSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  fallbackLogo: {
    width: '78%',
    height: '40%',
  },
  fallbackNameArt: {
    width: '94%',
    height: '42%',
  },
  progressTrack: {
    position: 'absolute',
    backgroundColor: 'rgba(105,56,245,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#7C3CFF',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  progressInnerHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  progressFillClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  progressText: {
    position: 'absolute',
    top: 0,
    color: '#FFFFFF',
    fontFamily: stackrFonts.extraBold,
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(4,11,63,0.78)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
});
