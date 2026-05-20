import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
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
  { id: 'front', label: 'Front', next: 'Front done. Now capture the back.', gradeSide: 'Front' },
  { id: 'back', label: 'Back', next: 'Back done. Optional corner photos can help you review flaws.', gradeSide: 'Back' },
  { id: 'corner_tl', label: 'Top left', next: 'Top-left corner done.' },
  { id: 'corner_tr', label: 'Top right', next: 'Top-right corner done.' },
  { id: 'corner_bl', label: 'Bottom left', next: 'Bottom-left corner done.' },
  { id: 'corner_br', label: 'Bottom right', next: 'Bottom-right corner done. Ready to grade.' },
] as const;

type CaptureStepId = typeof CAPTURE_STEPS[number]['id'];
type GradePhoto = { uri: string; base64: string; stage: CaptureStepId };

const CORNER_STEP_LABELS: Partial<Record<CaptureStepId, string>> = {
  corner_tl: 'Line up top-left corner',
  corner_tr: 'Line up top-right corner',
  corner_bl: 'Line up bottom-left corner',
  corner_br: 'Line up bottom-right corner',
};

function getCornerTargetStyle(step: CaptureStepId) {
  const base = {
    position: 'absolute' as const,
    width: 118,
    height: 118,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.08)',
  };

  if (step === 'corner_tl') return { ...base, top: 18, left: 18, borderTopLeftRadius: 14 };
  if (step === 'corner_tr') return { ...base, top: 18, right: 18, borderTopRightRadius: 14 };
  if (step === 'corner_bl') return { ...base, bottom: 18, left: 18, borderBottomLeftRadius: 14 };
  if (step === 'corner_br') return { ...base, bottom: 18, right: 18, borderBottomRightRadius: 14 };
  return null;
}

export default function CardGraderScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const frameWidth = Math.min(screenWidth - 78, screenHeight < 760 ? 252 : 292);
  const frameHeight = Math.round(frameWidth / 0.716);
  const frameCenterY = (screenHeight - insets.top - insets.bottom - 178) / 2 + insets.top;
  const { camera, device, torch, toggleTorch, takePhoto } = useScanCamera(false, false, {
    cropToCard: true,
    cropFrame: {
      previewWidth: screenWidth,
      previewHeight: screenHeight,
      frameWidth,
      frameHeight,
      frameCenterY,
    },
    resizeWidth: 2000,
    compress: 0.86,
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
  const backPhoto = photosByStage.back;
  const currentStepIndex = CAPTURE_STEPS.findIndex((step) => step.id === currentStep);
  const cornerTargetStyle = getCornerTargetStyle(currentStep);
  const currentStepLabel = CAPTURE_STEPS[currentStepIndex]?.label ?? 'photo';

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
      const gradeImages = [
        frontPhoto ? { base64: frontPhoto.base64, side: 'Front' as const } : null,
        backPhoto ? { base64: backPhoto.base64, side: 'Back' as const } : null,
      ].filter((image): image is { base64: string; side: 'Front' | 'Back' } => Boolean(image));
      const data = await gradeCardWithXimilar(gradeImages);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24 }}>×</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
              AI Card Grader
            </Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 178 }}>
          <View style={{
            width: frameWidth,
            height: frameHeight,
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

            {!grading && cornerTargetStyle && (
              <>
                <View style={cornerTargetStyle}>
                  <View style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', left: 12, top: 12, bottom: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', right: 12, top: 12, bottom: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                </View>
                <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                    {CORNER_STEP_LABELS[currentStep]}
                  </Text>
                </View>
              </>
            )}

            {!grading && frontPhoto && !cornerTargetStyle && (
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
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: insets.bottom + 14, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minHeight: 42, gap: 7, alignItems: 'center', paddingHorizontal: 16 }}>
            {CAPTURE_STEPS.map((step, index) => {
                const photo = photosByStage[step.id];
                const active = currentStep === step.id;
                return (
                  <TouchableOpacity
                    key={step.id}
                    onPress={() => setCurrentStep(step.id)}
                    style={{ width: 64, height: 42, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: active ? theme.colors.primary : 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {photo ? (
                      <>
                        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        </View>
                      </>
                    ) : (
                      <Text style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '900', textAlign: 'center' }}>
                        {index + 1}. {step.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>

          <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '800', textAlign: 'center' }}>
              Good lighting · card flat · edges visible
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleCapture}
            disabled={grading}
            style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: grading ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
          >
            {grading ? (
              <ActivityIndicator color={theme.colors.primary} size="large" />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.primary }} />
            )}
          </TouchableOpacity>

          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
            Tap to capture {currentStepLabel.toLowerCase()}
          </Text>

          <View style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={handleGrade}
              disabled={grading || !frontPhoto}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, opacity: grading || !frontPhoto ? 0.45 : 1 }}
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
