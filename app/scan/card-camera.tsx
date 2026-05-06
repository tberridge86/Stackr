import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/Text';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Card aspect ratio is 63mm x 88mm = 0.716
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CARD_HEIGHT = CARD_WIDTH / 0.716;

export default function CardCameraScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!camera.current || capturing) return;

    try {
      setCapturing(true);

      const photo = await camera.current.takePhoto({
        flash: 'off',
      });

      // Convert to base64
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

      // Navigate back with the base64 image
      router.back();
      // Pass via global or params — use router params
      router.setParams({ scannedImage: base64 });

    } catch (err) {
      console.log('Capture error:', err);
    } finally {
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

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />

      {/* Dark overlay with card cutout */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Top overlay */}
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: (SCREEN_HEIGHT - CARD_HEIGHT) / 2,
          backgroundColor: 'rgba(0,0,0,0.6)',
        }} />
        {/* Bottom overlay */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: (SCREEN_HEIGHT - CARD_HEIGHT) / 2,
          backgroundColor: 'rgba(0,0,0,0.6)',
        }} />
        {/* Left overlay */}
        <View style={{
          position: 'absolute',
          top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2,
          left: 0,
          width: (SCREEN_WIDTH - CARD_WIDTH) / 2,
          height: CARD_HEIGHT,
          backgroundColor: 'rgba(0,0,0,0.6)',
        }} />
        {/* Right overlay */}
        <View style={{
          position: 'absolute',
          top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2,
          right: 0,
          width: (SCREEN_WIDTH - CARD_WIDTH) / 2,
          height: CARD_HEIGHT,
          backgroundColor: 'rgba(0,0,0,0.6)',
        }} />

        {/* Card frame border */}
        <View style={{
          position: 'absolute',
          top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2,
          left: (SCREEN_WIDTH - CARD_WIDTH) / 2,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderWidth: 2,
          borderColor: theme.colors.primary,
          borderRadius: 12,
        }} />

        {/* Corner markers */}
        {[
          { top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 2, left: (SCREEN_WIDTH - CARD_WIDTH) / 2 - 2 },
          { top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 2, right: (SCREEN_WIDTH - CARD_WIDTH) / 2 - 2 },
          { bottom: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 2, left: (SCREEN_WIDTH - CARD_WIDTH) / 2 - 2 },
          { bottom: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 2, right: (SCREEN_WIDTH - CARD_WIDTH) / 2 - 2 },
        ].map((pos, i) => (
          <View key={i} style={{
            position: 'absolute',
            width: 24, height: 24,
            borderColor: '#FFFFFF',
            borderTopWidth: i < 2 ? 3 : 0,
            borderBottomWidth: i >= 2 ? 3 : 0,
            borderLeftWidth: i % 2 === 0 ? 3 : 0,
            borderRightWidth: i % 2 === 1 ? 3 : 0,
            borderTopLeftRadius: i === 0 ? 4 : 0,
            borderTopRightRadius: i === 1 ? 4 : 0,
            borderBottomLeftRadius: i === 2 ? 4 : 0,
            borderBottomRightRadius: i === 3 ? 4 : 0,
            ...pos,
          }} />
        ))}
      </View>

      {/* Instructions */}
      <View style={{
        position: 'absolute',
        top: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 50,
        left: 0, right: 0,
        alignItems: 'center',
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center', opacity: 0.9 }}>
          Align card within the frame
        </Text>
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: 'absolute',
          top: 56, left: 16,
          width: 44, height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Capture button */}
      <View style={{
        position: 'absolute',
        bottom: (SCREEN_HEIGHT - CARD_HEIGHT) / 2 - 80,
        left: 0, right: 0,
        alignItems: 'center',
      }}>
        <TouchableOpacity
          onPress={handleCapture}
          disabled={capturing}
          style={{
            width: 72, height: 72,
            borderRadius: 36,
            backgroundColor: capturing ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
            borderWidth: 4,
            borderColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {capturing ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{
              width: 54, height: 54,
              borderRadius: 27,
              backgroundColor: theme.colors.primary,
            }} />
          )}
        </TouchableOpacity>
        <Text style={{ color: '#FFFFFF', marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          Tap to scan
        </Text>
      </View>
    </View>
  );
}