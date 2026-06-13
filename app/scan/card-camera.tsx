// app/scan/card-camera.tsx (Refactored - Copy-Paste Replace)
import React, { useCallback, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/Text';
import { Camera } from 'react-native-vision-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../components/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { useScanCamera } from '../../lib/useScanCamera'; // NEW HOOK
import { useScanStore } from '../../lib/scanStore'; // ENHANCED STORE

const CARD_ASPECT_RATIO = 0.716;

export default function CardCameraScreen() {
  const { theme } = useTheme();
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
  const { camera, device, torch, toggleTorch, takePhoto, isContinuous, setIsContinuous } = useScanCamera(true, true, {
    cropToCard: true,
    cropFrame: {
      previewWidth: screenWidth,
      previewHeight: screenHeight,
      frameX: overlayLeft,
      frameY: overlayTop,
      frameWidth: CARD_WIDTH,
      frameHeight: CARD_HEIGHT,
      marginRatio: 0.08,
    },
  }); // Continuous ON by default
  const scanStore = useScanStore();
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    setCapturing(true);
    await takePhoto();
    setCapturing(false);
    if (!isContinuous) {
      // Single mode: Go to review/result after 1 card
      router.push('/scan/result');
    }
  }, [takePhoto, isContinuous]);

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>No camera available</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        torch={torch} // NEW: Torch support
      />
      
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
          borderColor: theme.colors.primary,
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

      {/* Instructions */}
      <View style={{ position: 'absolute', top: Math.max(insets.top + 70, overlayTop - 48), left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', opacity: 0.9 }}>
          {isContinuous ? 'Continuous scanning...' : 'Align card within the frame'}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          Queue: {scanStore.scannedCards.length}
        </Text>
      </View>

      {/* Back Button */}
      <TouchableOpacity
        onPress={() => {
          scanStore.clear();
          router.back();
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
          onPress={handleCapture}
          disabled={capturing}
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: capturing ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
            borderWidth: 4, borderColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {capturing ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.colors.primary }} />
          )}
        </TouchableOpacity>
        <Text style={{ color: '#FFFFFF', marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          {isContinuous ? 'Auto-scan ON' : 'Tap to scan'}
        </Text>
      </View>
    </View>
  );
}
