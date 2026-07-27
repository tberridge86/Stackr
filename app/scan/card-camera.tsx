// app/scan/card-camera.tsx (Refactored - Copy-Paste Replace)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
  type GestureResponderEvent,
} from 'react-native';
import { Text } from '../../components/Text';
import { Camera } from '../../lib/visionCamera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../components/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { useScanCamera } from '../../lib/useScanCamera'; // NEW HOOK
import { useScanStore } from '../../lib/scanStore'; // ENHANCED STORE
import { useLiveCardFrameAnalyser, type CaptureSource } from '../../lib/useLiveCardFrameAnalyser';
import { useIsFocused } from '@react-navigation/native';
import { deleteTemporaryCardRectificationScan } from '../../lib/cardRectificationStore';
import type { CardFrameAnalyserCorners } from '../../lib/cardVisionFrameAnalyser';

const CARD_ASPECT_RATIO = 0.716;

export default function CardCameraScreen() {
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeWidth = Math.max(1, screenWidth - insets.left - insets.right);
  const safeHeight = Math.max(1, screenHeight - insets.top - insets.bottom);
  const isCompact = safeHeight < 760 || safeWidth < 360;
  const topControlsHeight = isCompact ? 104 : 122;
  const bottomControlsHeight = isCompact ? 122 : 140;
  const scanAreaTop = insets.top + topControlsHeight;
  const scanAreaBottom = screenHeight - insets.bottom - bottomControlsHeight;
  const availableFrameHeight = Math.max(180, scanAreaBottom - scanAreaTop);
  const horizontalGutter = safeWidth < 360 ? 36 : 56;
  const maxFrameWidth = Math.max(160, Math.min(isCompact ? 292 : 320, safeWidth - horizontalGutter));
  const CARD_WIDTH = Math.round(Math.max(160, Math.min(maxFrameWidth, availableFrameHeight * CARD_ASPECT_RATIO)));
  const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT_RATIO);
  const overlayTop = scanAreaTop + Math.max(0, (availableFrameHeight - CARD_HEIGHT) / 2);
  const overlayLeft = (screenWidth - CARD_WIDTH) / 2;
  const topButtonOffset = insets.top + 16;
  const { camera, device, torch, toggleTorch, takePhoto, focusAtPoint, isContinuous, setIsContinuous } = useScanCamera(true, true, {
    cropToCard: true,
    cropFrame: {
      previewWidth: screenWidth,
      previewHeight: screenHeight,
      frameX: overlayLeft,
      frameY: overlayTop,
      frameWidth: CARD_WIDTH,
      frameHeight: CARD_HEIGHT,
      marginRatio: 0.18,
    },
  }); // Continuous ON by default
  const scanStore = useScanStore();
  const [capturing, setCapturing] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInProgressRef = useRef(false);
  const recordCaptureRef = useRef<(source: CaptureSource) => void>(() => undefined);
  const acceptedCornersRef = useRef<CardFrameAnalyserCorners | null>(null);
  const scanSessionIdRef = useRef(`scan-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const analyserGuide = useMemo(() => ({
    x: overlayLeft / Math.max(1, screenWidth),
    y: overlayTop / Math.max(1, screenHeight),
    width: CARD_WIDTH / Math.max(1, screenWidth),
    height: CARD_HEIGHT / Math.max(1, screenHeight),
  }), [CARD_HEIGHT, CARD_WIDTH, overlayLeft, overlayTop, screenHeight, screenWidth]);

  const handleCapture = useCallback(async (source: CaptureSource = 'manual') => {
    if (captureInProgressRef.current) return;

    captureInProgressRef.current = true;
    recordCaptureRef.current(source);
    setCapturing(true);
    try {
      const acceptedCorners = acceptedCornersRef.current;
      await takePhoto(source, {
        scanId: scanSessionIdRef.current,
        acceptedCorners,
        rectify: acceptedCorners != null,
        cameraPosition: 'back',
      });
    } finally {
      captureInProgressRef.current = false;
      setCapturing(false);
    }
    if (!isContinuous) {
      // Single mode: Go to review/result after 1 card
      router.replace('/scan/result');
    }
  }, [takePhoto, isContinuous]);

  const liveAnalyser = useLiveCardFrameAnalyser({
    enabled: isFocused && isContinuous,
    scanId: scanSessionIdRef.current,
    guide: analyserGuide,
    autoCaptureEnabled: isContinuous,
    captureInProgress: capturing,
    onStableCapture: () => handleCapture('auto'),
  });

  useEffect(() => {
    recordCaptureRef.current = liveAnalyser.recordCapture;
  }, [liveAnalyser.recordCapture]);

  useEffect(() => {
    acceptedCornersRef.current = liveAnalyser.latestResult?.qualityAccepted
      ? liveAnalyser.latestResult.corners
      : null;
  }, [liveAnalyser.latestResult]);

  useEffect(() => () => {
    if (focusResetTimeoutRef.current) {
      clearTimeout(focusResetTimeoutRef.current);
      focusResetTimeoutRef.current = null;
    }
  }, []);

  const recordFocusFailure = liveAnalyser.recordFocusFailure;

  const handleFocusTap = useCallback(async (event: GestureResponderEvent) => {
    const point = {
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    };
    const focused = await focusAtPoint(point);
    if (!focused) {
      recordFocusFailure();
      return;
    }

    setFocusPoint(point);
    if (focusResetTimeoutRef.current) clearTimeout(focusResetTimeoutRef.current);
    focusResetTimeoutRef.current = setTimeout(() => {
      void focusAtPoint({ x: screenWidth / 2, y: screenHeight / 2 }).then((resetFocused) => {
        if (!resetFocused) recordFocusFailure();
        setFocusPoint(null);
      });
    }, 2500);
  }, [focusAtPoint, recordFocusFailure, screenHeight, screenWidth]);

  const guidanceColor = liveAnalyser.guidance.tone === 'ready'
    ? '#22C55E'
    : liveAnalyser.guidance.tone === 'warning'
      ? '#F59E0B'
      : theme.colors.primary;
  const frameBorderColor = liveAnalyser.guidance.code === 'ready'
    ? '#22C55E'
    : guidanceColor;

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>No camera available</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleFocusTap}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          photo={true}
          video={Boolean(liveAnalyser.frameProcessor)}
          pixelFormat="yuv"
          frameProcessor={liveAnalyser.frameProcessor}
          torch={torch} // NEW: Torch support
        />
      </Pressable>
      
      {/* Status bar cover */}
      <View style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: insets.top,
        backgroundColor: '#000',
        zIndex: 10,
      }} />

      {/* Overlay Mask + Frame (Unchanged - Perfect!) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: overlayTop, backgroundColor: 'rgba(0,0,0,0.65)' }} />
        <View style={{ position: 'absolute', top: overlayTop + CARD_HEIGHT, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }} />
        <View style={{ position: 'absolute', top: overlayTop, left: 0, width: overlayLeft, height: CARD_HEIGHT, backgroundColor: 'rgba(0,0,0,0.65)' }} />
        <View style={{ position: 'absolute', top: overlayTop, right: 0, width: overlayLeft, height: CARD_HEIGHT, backgroundColor: 'rgba(0,0,0,0.65)' }} />

        <View style={{
          position: 'absolute',
          top: overlayTop,
          left: overlayLeft,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderWidth: 2,
          borderColor: frameBorderColor,
          borderRadius: 14,
        }} />

        {([
          { top: overlayTop - 1, left: overlayLeft - 1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
          { top: overlayTop - 1, left: overlayLeft + CARD_WIDTH - 23, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
          { top: overlayTop + CARD_HEIGHT - 23, left: overlayLeft - 1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
          { top: overlayTop + CARD_HEIGHT - 23, left: overlayLeft + CARD_WIDTH - 23, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
        ] as any[]).map((style, i) => (
          <View key={i} style={{ position: 'absolute', width: 24, height: 24, borderColor: '#FFFFFF', ...style }} />
        ))}
      </View>

      {focusPoint ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: focusPoint.x - 18,
            top: focusPoint.y - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />
      ) : null}

      {/* Instructions */}
      <View style={{ position: 'absolute', top: Math.max(insets.top + 70, overlayTop - 48), left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', opacity: 0.95 }}>
          {isContinuous ? liveAnalyser.guidance.message : 'Align card within the frame'}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          Queue: {scanStore.scannedCards.length}
        </Text>
      </View>

      {/* Back Button */}
      <TouchableOpacity
        onPress={() => {
          void deleteTemporaryCardRectificationScan(scanSessionIdRef.current).finally(() => {
            scanStore.clear();
            router.back();
          });
        }}
        style={{
          position: 'absolute', top: topButtonOffset, left: 16,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* NEW: Torch Toggle */}
      <TouchableOpacity
        onPress={toggleTorch}
        style={{
          position: 'absolute', top: topButtonOffset, right: 16,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={torch === 'on' ? 'flash-off' : 'flash'} size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* NEW: Continuous Toggle */}
      <TouchableOpacity
        onPress={() => setIsContinuous(!isContinuous)}
        style={{
          position: 'absolute', top: topButtonOffset, right: 70,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: isContinuous ? theme.colors.primary : 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={isContinuous ? 'pause' : 'play'} size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Capture Button (Unchanged UI) */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 24, left: 0, right: 0, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => handleCapture('manual')}
          disabled={capturing}
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: capturing ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
            borderWidth: 4, borderColor: frameBorderColor,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {capturing ? (
            <ActivityIndicator color={frameBorderColor} />
          ) : (
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: frameBorderColor }} />
          )}
        </TouchableOpacity>
        <Text style={{ color: '#FFFFFF', marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          {isContinuous
            ? liveAnalyser.analyserAvailable ? 'Auto capture ready' : 'Manual capture ready'
            : 'Tap to scan'}
        </Text>
      </View>
    </View>
  );
}
