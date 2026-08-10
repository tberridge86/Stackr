import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { stackrLogoSizes } from '../lib/stackrSizing';
import { typeScale } from '../lib/typography';

type StackrLoadingScreenProps = {
  message?: string;
  compact?: boolean;
};

const BRAND_ICON = require('../assets/rev2/01-brand/logos/logo.png');
const WORDMARK = require('../assets/rev2/01-brand/logos/Spelt.png');
const BLOB_PURPLE = require('../assets/rev2/01-brand/logos/purple.png');
const BLOB_LIGHT_PURPLE = require('../assets/rev2/01-brand/logos/lpurple.png');
const BLOB_ORANGE = require('../assets/rev2/01-brand/logos/orange.png');
const DOUBLE_STAR = require('../assets/rev2/01-brand/logos/doublestar.png');

export function StackrLoadingScreen({
  message = 'Opening your vault',
  compact = false,
}: StackrLoadingScreenProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const blobFloat = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    Animated.spring(reveal, {
      toValue: 1,
      tension: reduceMotion ? 80 : 58,
      friction: reduceMotion ? 12 : 8,
      useNativeDriver: true,
    }).start();

    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );

    if (reduceMotion) {
      Animated.timing(sweep, {
        toValue: 1,
        duration: 650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return () => sweep.stopAnimation();
    }

    const twinkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, {
          toValue: 1,
          duration: 980,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: 980,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1550,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const blobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(blobFloat, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(blobFloat, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    sweepLoop.start();
    twinkleLoop.start();
    floatLoop.start();
    blobLoop.start();

    return () => {
      sweepLoop.stop();
      twinkleLoop.stop();
      floatLoop.stop();
      blobLoop.stop();
    };
  }, [blobFloat, float, reduceMotion, reveal, sweep, twinkle]);

  const logoScale = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const logoOpacity = reveal;
  const logoLift = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const idleLift = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });
  const twinkleScale = twinkle.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.08],
  });
  const twinkleOpacity = twinkle.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 150],
  });
  const blobShift = blobFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 14],
  });
  const compactScale = compact ? 0.78 : 1;
  const iconSize = Math.min(width * 0.32, compact ? 112 : 150) * compactScale;
  const wordmarkWidth = Math.min(width * 0.66, compact ? 210 : 300) * compactScale;

  return (
    <View style={[styles.container, compact && styles.compactContainer, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        colors={theme.dark ? ['#17112A', '#24143D', '#0F172A'] : ['#FFFFFF', '#F6F2FF', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {!compact && (
        <>
          <Animated.Image
            source={BLOB_LIGHT_PURPLE}
            style={[
              styles.lightBlob,
              {
                width: width * 0.86,
                height: width * 0.86,
                opacity: theme.dark ? 0.1 : 0.22,
                transform: [{ translateY: Animated.multiply(blobShift, -0.65) }],
              },
            ]}
            resizeMode="contain"
          />
          <Animated.Image
            source={BLOB_PURPLE}
            style={[
              styles.purpleBlob,
              {
                width: width * 0.96,
                height: width * 0.96,
                opacity: theme.dark ? 0.2 : 0.82,
                transform: [{ translateY: blobShift }],
              },
            ]}
            resizeMode="contain"
          />
          <Animated.Image
            source={BLOB_ORANGE}
            style={[
              styles.orangeBlob,
              {
                width: width * 0.9,
                height: width * 0.9,
                opacity: theme.dark ? 0.18 : 0.9,
                transform: [{ translateY: Animated.multiply(blobShift, 0.72) }],
              },
            ]}
            resizeMode="contain"
          />
        </>
      )}

      <Animated.Image
        source={DOUBLE_STAR}
        style={[
          styles.sparkleTop,
          {
            opacity: twinkleOpacity,
            transform: [{ scale: twinkleScale }],
          },
        ]}
        resizeMode="contain"
      />
      <Animated.View style={[styles.dotPurple, { opacity: twinkleOpacity }]} />
      <Animated.View style={[styles.dotOrange, { opacity: twinkleOpacity }]} />

      <View style={[styles.stage, compact && styles.compactStage]}>
        <Animated.View
          style={[
            styles.logoStack,
            {
              opacity: logoOpacity,
              transform: [{ translateY: Animated.add(logoLift, idleLift) }, { scale: logoScale }],
            },
          ]}
        >
          <Image source={BRAND_ICON} style={{ width: iconSize, height: iconSize }} resizeMode="contain" />
          <Image
            source={WORDMARK}
            style={{ width: wordmarkWidth, height: wordmarkWidth * stackrLogoSizes.loadingWordmarkHeightRatio }}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sloganRow,
            {
              opacity: logoOpacity,
              transform: [{ translateY: logoLift }],
            },
          ]}
        >
          <Text
            style={[
              styles.sloganLeading,
              {
                color: theme.dark ? '#FFFFFF' : '#061844',
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Collect. Trade. Protect.
          </Text>
        </Animated.View>

        <Animated.Image
          source={DOUBLE_STAR}
          style={[
            styles.doubleStar,
            {
              opacity: twinkleOpacity,
              transform: [{ scale: twinkleScale }],
            },
          ]}
          resizeMode="contain"
        />

        <View style={styles.track}>
          <Animated.View
            style={[
              styles.trackSweep,
              {
                transform: [{ translateX: sweepTranslate }],
              },
            ]}
          />
        </View>

        <Text style={[styles.message, { color: theme.colors.text }]} numberOfLines={1}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compactContainer: {
    minHeight: 320,
  },
  stage: {
    width: '100%',
    minHeight: 390,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  compactStage: {
    minHeight: 280,
  },
  lightBlob: {
    position: 'absolute',
    right: -180,
    top: -120,
  },
  purpleBlob: {
    position: 'absolute',
    left: -210,
    bottom: -210,
  },
  orangeBlob: {
    position: 'absolute',
    right: -210,
    bottom: -220,
  },
  sparkleTop: {
    position: 'absolute',
    left: 28,
    bottom: 176,
    width: 34,
    height: 34,
  },
  dotPurple: {
    position: 'absolute',
    right: 98,
    bottom: 192,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6938F5',
  },
  dotOrange: {
    position: 'absolute',
    right: 48,
    bottom: 258,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
  },
  logoStack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sloganRow: {
    marginTop: 16,
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sloganLeading: {
    ...typeScale.sectionTitle,
    fontSize: 25,
    lineHeight: 31,
    textAlign: 'center',
  },
  doubleStar: {
    width: 70,
    height: 38,
    marginTop: 12,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  track: {
    width: 156,
    height: 6,
    borderRadius: 999,
    marginTop: 20,
    backgroundColor: 'rgba(139,92,246,0.14)',
    overflow: 'hidden',
  },
  trackSweep: {
    width: 72,
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
    shadowColor: '#F6C453',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  message: {
    ...typeScale.caption,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 17,
  },
});
