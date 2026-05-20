import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/Text';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useTheme } from '../../components/theme-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useScanCamera } from '../../lib/useScanCamera';
import { gradeCardWithXimilar } from '../../lib/ximilar';

const CAPTURE_STEPS = [
  { id: 'front', label: 'Front', next: 'Front done. Now capture the back.' },
  { id: 'back', label: 'Back', next: 'Back done. Add corners/details or grade now.' },
  { id: 'corners', label: 'Corners', next: 'Details captured. Ready to grade.' },
] as const;

type CaptureStepId = typeof CAPTURE_STEPS[number]['id'];
type GradePhoto = { uri: string; base64: string; stage: CaptureStepId };

export default function CardGraderScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { camera, device, torch, toggleTorch, takePhoto } = useScanCamera(false, false, {
    cropToCard: true,
    resizeWidth: 900,
    compress: 0.72,
  });
  const { hasPermission, requestPermission } = useCameraPermission();
  const [photos, setPhotos] = useState<GradePhoto[]>([]);
  const [currentStep, setCurrentStep] = useState<CaptureStepId>('front');
  const [captureNotice, setCaptureNotice] = useState('Capture the front of the card');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const photosByStage = useMemo(() => {
    return photos.reduce<Partial<Record<CaptureStepId, GradePhoto>>>((acc, photo) => {
      acc[photo.stage] = photo;
      return acc;
    }, {});
  }, [photos]);

  const frontPhoto = photosByStage.front;
  const currentStepIndex = CAPTURE_STEPS.findIndex((step) => step.id === currentStep);

  const moveToNextStep = useCallback((step: CaptureStepId) => {
    const nextStep = CAPTURE_STEPS.find((candidate) => !photosByStage[candidate.id] && candidate.id !== step);
    if (nextStep) setCurrentStep(nextStep.id);
  }, [photosByStage]);

  const handleCapture = useCallback(async () => {
    const photo = await takePhoto();
    if (photo?.base64) {
      const step = currentStep;
      setPhotos(prev => [
        ...prev.filter(existing => existing.stage !== step),
        { uri: photo.uri, base64: photo.base64!, stage: step },
      ]);
      const stepInfo = CAPTURE_STEPS.find(candidate => candidate.id === step);
      setCaptureNotice(stepInfo?.next ?? 'Captured.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      moveToNextStep(step);
    }
  }, [currentStep, moveToNextStep, takePhoto]);

  const handleGrade = async () => {
    if (!frontPhoto) return;

    setGrading(true);
    try {
      const data = await gradeCardWithXimilar(
        CAPTURE_STEPS
          .map((step) => photosByStage[step.id]?.base64)
          .filter((base64): base64 is string => Boolean(base64))
      );
      setResult(data.records?.[0] || null);
    } catch (e) {
      console.error(e);
      alert('Grading failed');
    } finally {
      setGrading(false);
    }
  };

  if (result) {
    const record = result;
    const grades = record.grades || {};
    const centering = record.card?.centering || {};

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 }}>
          AI Grade Result
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          {frontPhoto && <Image source={{ uri: frontPhoto.uri }} style={{ width: 140, height: 190, borderRadius: 8 }} />}
          {record._clean_url_card && (
            <Image source={{ uri: record._clean_url_card }} style={{ width: 140, height: 190, borderRadius: 8 }} />
          )}
        </View>

        <View style={{ backgroundColor: '#111', padding: 16, borderRadius: 12, marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>
            Estimated Grade: {grades.final ? grades.final.toFixed(1) : '--'}/10
          </Text>
          <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            AI estimate only — not official
          </Text>
        </View>

        <Text style={{ color: '#aaa', marginBottom: 6 }}>Centering</Text>
        <Text style={{ color: '#fff', fontSize: 16, marginBottom: 16 }}>
          Left/Right: {centering.left_right || '--'} • Top/Bottom: {centering.top_bottom || '--'}
        </Text>

        <Text style={{ color: '#aaa', marginBottom: 6 }}>Breakdown</Text>
        <View style={{ backgroundColor: '#111', padding: 14, borderRadius: 10, gap: 6 }}>
          <Text style={{ color: '#fff' }}>Corners: {grades.corners ?? '--'}</Text>
          <Text style={{ color: '#fff' }}>Edges: {grades.edges ?? '--'}</Text>
          <Text style={{ color: '#fff' }}>Surface: {grades.surface ?? '--'}</Text>
          <Text style={{ color: '#fff' }}>Centering: {grades.centering ?? '--'}</Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            setResult(null);
            setPhotos([]);
            setCurrentStep('front');
            setCaptureNotice('Capture the front of the card');
          }}
          style={{ backgroundColor: '#3b82f6', padding: 14, borderRadius: 10, marginTop: 24, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Grade Another Card</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 16 }}>
          Camera access is needed to grade a card.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: '#fff' }}>No camera available</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        photo={true}
        torch={torch}
      />

      <SafeAreaView style={StyleSheet.absoluteFill}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24 }}>×</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
              AI Card Grader
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {captureNotice}
            </Text>
          </View>

          <TouchableOpacity
            onPress={toggleTorch}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: torch === 'on' ? '#F59E0B' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: torch === 'on' ? 2 : 0, borderColor: '#F59E0B' }}
          >
            <Ionicons name={torch === 'on' ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Frame guide */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 310,
            height: 433,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: grading ? theme.colors.primary : frontPhoto ? '#10B981' : 'rgba(255,255,255,0.5)',
          }}>
            <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />

            {grading && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  Analysing card...
                </Text>
              </View>
            )}

            {!grading && frontPhoto && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(16,185,129,0.92)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={34} color="#FFFFFF" />
                </View>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  {currentStep === 'back' ? 'Front captured' : 'Ready for next photo'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bottom controls */}
        <View style={{ alignItems: 'center', paddingBottom: insets.bottom + 48, gap: 14 }}>
          <View style={{ minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {CAPTURE_STEPS.map((step, index) => {
              const photo = photosByStage[step.id];
              const active = currentStep === step.id;
              return (
                <TouchableOpacity
                  key={step.id}
                  onPress={() => setCurrentStep(step.id)}
                  style={{ width: 72, height: 50, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: active ? theme.colors.primary : 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
                >
                  {photo ? (
                    <>
                      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <View style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    </>
                  ) : (
                    <Text style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '900' }}>
                      {index + 1}. {step.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24 }}>
            {['Good lighting', 'Card flat', 'Edges visible'].map((tip) => (
              <View key={tip} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{tip}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleCapture}
            disabled={grading}
            style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: grading ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
          >
            {grading ? (
              <ActivityIndicator color={theme.colors.primary} size="large" />
            ) : (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary }} />
            )}
          </TouchableOpacity>

          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            Tap to capture {CAPTURE_STEPS[currentStepIndex]?.label.toLowerCase() ?? 'photo'}
          </Text>

          <View style={{ height: 42, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={handleGrade}
              disabled={grading || !frontPhoto}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, opacity: grading || !frontPhoto ? 0.45 : 1 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                {grading ? 'Grading...' : 'Grade Card'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
