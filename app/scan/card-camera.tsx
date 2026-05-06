import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/Text';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { scanStore } from '../../lib/scanStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');
const STATUS_BAR_HEIGHT = StatusBar.currentHeight ?? 0;
const CARD_WIDTH = SCREEN_WIDTH * 0.78;
const CARD_HEIGHT = CARD_WIDTH / 0.716;
const VERTICAL_OFFSET = -(STATUS_BAR_HEIGHT + 80);

export default function CardCameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!camera.current || capturing) return;

    try {
      setCapturing(true);

      const photo = await camera.current.takePhoto({ flash: 'off' });

      // Read as base64
      const response = await fetch(`file://${photo.path}`);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      scanStore.triggerCallback(base64);
      router.back();
    } catch (err) {
      console.log('Capture error:', err);
      setCapturing(false);
    }
  }, [capturing]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', marginBottom: 16 }}>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.colors.primary, padding: 14, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>No camera available</Text>
      </SafeAreaView>
    );
  }

  const overlayTop = (SCREEN_HEIGHT - CARD_HEIGHT) / 2 + VERTICAL_OFFSET;
  const overlayLeft = (SCREEN_WIDTH - CARD_WIDTH) / 2;

 return (
  <View style={{ flex: 1, backgroundColor: '#000', paddingTop: STATUS_BAR_HEIGHT }}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />
       {/* Status bar cover */}
    <View style={{
      position: 'absolute',
      top: 0, left: 0, right: 0,
      height: STATUS_BAR_HEIGHT,
      backgroundColor: '#000',
      zIndex: 10,
    }} />

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

      <View style={{ position: 'absolute', top: overlayTop - 48, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', opacity: 0.9 }}>
          Align card within the frame
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: 'absolute', top: 56, left: 16,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={{ position: 'absolute', top: overlayTop + CARD_HEIGHT + 20, left: 0, right: 0, alignItems: 'center' }}>
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
        <Text style={{ color: '#FFFFFF', marginTop: 10, fontSize: 13, opacity: 0.8 }}>Tap to scan</Text>
      </View>
    </View>
  );
}