import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType, type CameraType } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { extractCertificationNumberFromText, type CaptureRequirement, type CaptureType } from '../../lib/listingCaptureRequirements';
import {
  captureRectToManipulatorCrop,
  createCapturedFrame,
  createCaptureSessionId,
  getCropFromPreviewRect,
  type CapturedFrame,
  type CaptureRect,
} from '../../lib/captureGeometry';
import { CAPTURE_GEOMETRY_V2_ENABLED } from '../../lib/config';
import {
  validateListingPhotoQuality,
  type ListingPhotoValidationInput,
  type ListingPhotoIssueSeverity,
  type ListingPhotoPurpose,
  type ListingPhotoQualityIssue,
  type ListingPhotoValidationMetrics,
} from '../../lib/listingPhotoValidation';
import type { ListingProtectionTier } from '../../lib/listingFlow';
import { StackrButtonPattern } from '../StackrEmboss';
import { Text } from '../Text';

export const LISTING_CAMERA_BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'pdf417',
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'datamatrix',
  'aztec',
];

export type GuidedCaptureQuality = {
  purpose?: ListingPhotoPurpose;
  purposeLabel?: string;
  fullCardVisible: boolean;
  steady: boolean;
  lighting: boolean;
  singleCard: boolean;
  glareOk?: boolean;
  warning?: string | null;
  issues?: ListingPhotoQualityIssue[];
  highestPriorityIssue?: ListingPhotoQualityIssue | null;
  severity?: ListingPhotoIssueSeverity;
  requiresRetake?: boolean;
  canOverride?: boolean;
  overrideAccepted?: boolean;
  overrideReason?: string | null;
  imageFingerprint?: string | null;
  metrics?: ListingPhotoValidationMetrics | null;
};

export type GuidedCaptureResult = {
  uri: string;
  sourceUri?: string | null;
  previewUri?: string | null;
  width?: number;
  height?: number;
  base64?: string | null;
  crop?: CaptureRect | null;
  captureFrame?: CapturedFrame | null;
  quality: GuidedCaptureQuality;
  barcodeData?: string | null;
  barcodeType?: string | null;
  ocrText?: string | null;
  certificationCandidate?: string | null;
  captureSource: 'manual' | 'auto';
};

type GuideFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  shape: 'rect' | 'corner' | 'horizontal' | 'vertical';
};

type ReadinessState = {
  ready: boolean;
  message: string;
  tone: 'waiting' | 'ready' | 'warning';
};

const CAMERA_AUTO_CHECK_INTERVAL_MS = 900;
const CAMERA_AUTO_READY_FRAMES = 2;
const CAMERA_AUTO_COOLDOWN_MS = 2600;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getGuideFrame(
  captureType: CaptureType,
  width: number,
  height: number,
  topInset: number,
  bottomInset: number,
  slabProfile?: string | null,
  reservedTop?: number,
  reservedBottom?: number
): GuideFrame {
  const availableWidth = Math.max(260, width - 54);
  const topChrome = reservedTop ?? topInset + 170;
  const bottomChrome = reservedBottom ?? bottomInset + 230;
  const availableHeight = Math.max(220, height - topChrome - bottomChrome);
  const centerX = width / 2;
  const centerY = topChrome + availableHeight / 2;

  if (captureType.startsWith('corner_')) {
    const size = clamp(
      Math.min(availableWidth * 0.68, availableHeight * 0.72),
      Math.min(178, availableHeight * 0.78),
      Math.min(314, availableHeight * 0.92)
    );
    return {
      left: centerX - size / 2,
      top: centerY - size / 2,
      width: size,
      height: size,
      radius: 30,
      shape: 'corner',
    };
  }

  if (captureType === 'edge_left' || captureType === 'edge_right') {
    const frameHeight = clamp(availableHeight * 0.72, Math.min(210, availableHeight * 0.75), Math.min(410, availableHeight * 0.94));
    const frameWidth = clamp(availableWidth * 0.32, 92, 132);
    return {
      left: centerX - frameWidth / 2,
      top: centerY - frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
      radius: 24,
      shape: 'vertical',
    };
  }

  if (captureType === 'edge_top' || captureType === 'edge_bottom') {
    const frameWidth = clamp(availableWidth * 0.84, 270, 560);
    const frameHeight = clamp(availableHeight * 0.24, 78, 126);
    return {
      left: centerX - frameWidth / 2,
      top: centerY - frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
      radius: 24,
      shape: 'horizontal',
    };
  }

  if (captureType === 'slab_label' || captureType === 'slab_qr') {
    const profile = slabProfile ?? 'generic';
    const labelWidthRatio = profile === 'tag' || profile === 'beckett' ? 0.92 : 0.88;
    const labelHeightRatio = profile === 'tag'
      ? 0.2
      : profile === 'beckett'
        ? 0.3
        : profile === 'cgc'
          ? 0.28
          : 0.24;
    const frameWidth = clamp(availableWidth * labelWidthRatio, 290, 640);
    const frameHeight = captureType === 'slab_qr'
      ? clamp(availableHeight * 0.32, 150, 220)
      : clamp(availableHeight * labelHeightRatio, 108, profile === 'beckett' ? 190 : 160);
    return {
      left: centerX - frameWidth / 2,
      top: centerY - frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
      radius: 22,
      shape: 'horizontal',
    };
  }

  if (captureType === 'packaging_front' || captureType === 'packaging_back' || captureType === 'packaging_top' || captureType === 'packaging_bottom' || captureType === 'sealed_detail') {
    const frameWidth = clamp(availableWidth * 0.86, 270, 560);
    const frameHeight = clamp(availableHeight * 0.68, Math.min(230, availableHeight * 0.74), Math.min(420, availableHeight * 0.94));
    return {
      left: centerX - frameWidth / 2,
      top: centerY - frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
      radius: 30,
      shape: 'rect',
    };
  }

  if (captureType === 'slab_front' || captureType === 'slab_back') {
    const profile = slabProfile ?? 'generic';
    const slabAspect = profile === 'beckett' ? 0.7 : profile === 'cgc' ? 0.66 : 0.68;
    const frameHeight = clamp(Math.min(availableHeight * 0.86, availableWidth / slabAspect), 360, 560);
    const frameWidth = frameHeight * slabAspect;
    return {
      left: centerX - frameWidth / 2,
      top: centerY - frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
      radius: 34,
      shape: 'rect',
    };
  }

  const cardAspect = 0.716;
  const frameHeight = clamp(
    Math.min(availableHeight * 0.84, availableWidth / cardAspect),
    Math.min(286, availableHeight * 0.78),
    Math.min(520, availableHeight * 0.94)
  );
  const frameWidth = frameHeight * cardAspect;
  return {
    left: centerX - frameWidth / 2,
    top: centerY - frameHeight / 2,
    width: frameWidth,
    height: frameHeight,
    radius: 28,
    shape: 'rect',
  };
}

export function assessGuidedCaptureQuality(
  base64: string | null | undefined,
  captureType: CaptureType,
  options: Omit<ListingPhotoValidationInput, 'base64' | 'captureType'> = {}
): GuidedCaptureQuality {
  return validateListingPhotoQuality({
    ...options,
    base64,
    captureType,
  });
}

function getReadinessFromQuality(quality: GuidedCaptureQuality, requirement: CaptureRequirement): ReadinessState {
  if (quality.warning || quality.requiresRetake || !quality.lighting || !quality.steady || quality.glareOk === false) {
    return {
      ready: false,
      message: quality.highestPriorityIssue?.guidance
        ?? quality.warning
        ?? (requirement.captureType.startsWith('slab') ? 'Show the complete slab.' : 'Show the complete card.'),
      tone: 'warning',
    };
  }

  return {
    ready: true,
    message: 'Perfect',
    tone: 'ready',
  };
}

function needsCertificationRead(requirement: CaptureRequirement) {
  return requirement.captureType === 'slab_label' || requirement.captureType === 'slab_qr';
}

function needsTextRead(requirement: CaptureRequirement) {
  return needsCertificationRead(requirement)
    || requirement.captureType === 'full_front'
    || requirement.captureType === 'full_back';
}

function getQualityRetakeCopy(quality: GuidedCaptureQuality) {
  return quality.warning ?? quality.highestPriorityIssue?.message ?? 'Keep the full item in the guide and try again.';
}

function getPreviewCropPadding(captureType: CaptureType) {
  if (captureType.startsWith('corner_')) return 0.08;
  if (captureType.startsWith('edge_')) return 0.1;
  if (captureType === 'slab_label' || captureType === 'slab_qr') return 0.04;
  if (captureType.startsWith('surface_')) return 0.03;
  return 0.02;
}

function getCaptureStepIcon(captureType: CaptureType): keyof typeof Ionicons.glyphMap {
  if (captureType.startsWith('corner_')) return 'scan-outline';
  if (captureType.startsWith('edge_')) return 'resize-outline';
  if (captureType.startsWith('surface_')) return 'flashlight-outline';
  if (captureType === 'slab_label' || captureType === 'slab_qr') return 'barcode-outline';
  if (captureType.startsWith('slab')) return 'albums-outline';
  if (captureType.startsWith('packaging') || captureType === 'sealed_detail') return 'cube-outline';
  return 'card-outline';
}

function getCaptureWindowHint(requirement: CaptureRequirement) {
  if (requirement.captureType.startsWith('corner_')) return 'Fill the small window with this corner.';
  if (requirement.captureType.startsWith('edge_')) return 'Use the narrow window to keep the full edge visible.';
  if (requirement.captureType.startsWith('surface_')) return 'Tilt slowly so marks catch the light.';
  if (requirement.captureType === 'slab_label' || requirement.captureType === 'slab_qr') return 'Keep the code and label sharp.';
  return requirement.captureType.startsWith('slab') ? 'Keep the slab flat and inside the guide.' : 'Keep the card flat and fill the guide.';
}

async function buildSameSourcePreviewCrop(
  sourceUri: string,
  frame: CapturedFrame,
  guideFrame: GuideFrame,
  captureType: CaptureType
) {
  const crop = getCropFromPreviewRect(frame, {
    x: guideFrame.left,
    y: guideFrame.top,
    width: guideFrame.width,
    height: guideFrame.height,
  }, getPreviewCropPadding(captureType));

  if (!crop) return { previewUri: sourceUri, crop: null, previewBase64: null, previewWidth: null, previewHeight: null };

  const preview = await ImageManipulator.manipulateAsync(
    sourceUri,
    [
      { crop: captureRectToManipulatorCrop(crop) },
      { resize: { width: captureType.startsWith('edge_') ? 720 : 900 } },
    ],
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  return {
    previewUri: preview.uri,
    crop,
    previewBase64: preview.base64 ?? null,
    previewWidth: preview.width ?? null,
    previewHeight: preview.height ?? null,
  };
}

export function GuidedListingCamera({
  visible,
  requirement,
  requirements,
  capturedRequirementIds,
  previewUri,
  validationTier = 'bronze',
  onCaptured,
  onSelectRequirement,
  onUseSystemCamera,
  onClose,
}: {
  visible: boolean;
  requirement: CaptureRequirement | null;
  requirements?: CaptureRequirement[];
  capturedRequirementIds?: string[];
  previewUri?: string | null;
  validationTier?: ListingProtectionTier;
  onCaptured: (result: GuidedCaptureResult) => void;
  onSelectRequirement?: (requirement: CaptureRequirement) => void;
  onUseSystemCamera?: () => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const autoCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReadyFrames = useRef(0);
  const lastAutoCaptureAt = useRef(0);
  const autoCheckBusy = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [barcode, setBarcode] = useState<{ data: string; type: string } | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState>({
    ready: false,
    message: 'Aligning...',
    tone: 'waiting',
  });
  const [mountError, setMountError] = useState<string | null>(null);
  const compactHeight = height < 760;
  const headerReservedHeight = insets.top + (compactHeight ? 156 : 172);
  const bottomReservedHeight = insets.bottom + (compactHeight ? 218 : 246);
  const hasCaptureSequence = Boolean(requirements?.length);
  const captureSequence = useMemo(() => (
    requirements?.length ? requirements : requirement ? [requirement] : []
  ), [requirement, requirements]);
  const activeStepIndex = captureSequence.findIndex((item) => item.id === requirement?.id);
  const completedIds = useMemo(() => new Set(capturedRequirementIds ?? []), [capturedRequirementIds]);
  const stepLabel = activeStepIndex >= 0
    ? `Step ${activeStepIndex + 1} of ${captureSequence.length}`
    : captureSequence.length ? `Step 1 of ${captureSequence.length}` : 'Photo step';

  const guideFrame = useMemo(() => {
    const fallbackRequirement = requirement?.captureType ?? 'full_front';
    return getGuideFrame(
      fallbackRequirement,
      width,
      height,
      insets.top,
      insets.bottom,
      requirement?.slabProfile,
      headerReservedHeight,
      bottomReservedHeight
    );
  }, [bottomReservedHeight, headerReservedHeight, height, insets.bottom, insets.top, requirement?.captureType, requirement?.slabProfile, width]);

  const frameTone = readiness.tone === 'ready' ? '#22C55E' : readiness.tone === 'warning' ? '#F59E0B' : '#A78BFA';
  const permissionGranted = Boolean(permission?.granted);
  const shouldRenderCamera = visible && permissionGranted && !mountError && requirement;
  const certificationStep = requirement ? needsCertificationRead(requirement) : false;
  const surfaceCapture = requirement?.captureType.startsWith('surface_') ?? false;
  const lightAssistedCapture = surfaceCapture && facing === 'back';

  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    setMountError(null);
    setBarcode(null);
    setTorchEnabled(false);
    setAutoEnabled(false);
    setCameraSessionKey((key) => key + 1);
    setReadiness({ ready: false, message: 'Warming up...', tone: 'waiting' });
    autoReadyFrames.current = 0;
    if (!permission?.granted) void requestPermission();
  }, [permission?.granted, requestPermission, requirement?.id, visible]);

  useEffect(() => {
    if (!visible) {
      setTorchEnabled(false);
      return;
    }

    if (surfaceCapture && facing === 'back') {
      setTorchEnabled(true);
      return;
    }

    setTorchEnabled(false);
  }, [facing, requirement?.id, surfaceCapture, visible]);

  useEffect(() => () => {
    if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
  }, []);

  const scanCaptureText = useCallback(async (uri: string) => {
    if (!requirement || !needsTextRead(requirement)) return { ocrText: null, candidate: null };
    try {
      const result = await TextRecognition.recognize(uri);
      const ocrText = result?.text?.trim() ?? '';
      return {
        ocrText,
        candidate: needsCertificationRead(requirement) ? extractCertificationNumberFromText(ocrText) : null,
      };
    } catch {
      return { ocrText: null, candidate: null };
    }
  }, [requirement]);

  const confirmCaptureQuality = useCallback((quality: GuidedCaptureQuality): Promise<GuidedCaptureQuality | null> => {
    if (!quality.warning && !quality.requiresRetake) return Promise.resolve(quality);

    if (quality.requiresRetake || !quality.canOverride) {
      return new Promise((resolve) => {
        Alert.alert(
          'Retake needed',
          getQualityRetakeCopy(quality),
          [{ text: 'OK', onPress: () => resolve(null) }]
        );
      });
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Photo warning',
        `${getQualityRetakeCopy(quality)}\n\nYou can continue if the item is still clearly identifiable and the issue does not hide condition detail.`,
        [
          { text: 'Retake', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Use photo',
            onPress: () => resolve({
              ...quality,
              overrideAccepted: true,
              overrideReason: quality.warning ?? quality.highestPriorityIssue?.code ?? 'manual-quality-override',
            }),
          },
        ]
      );
    });
  }, []);

  const retryCamera = useCallback(async () => {
    setMountError(null);
    setCameraReady(false);
    setBarcode(null);
    setReadiness({ ready: false, message: 'Warming up...', tone: 'waiting' });
    autoReadyFrames.current = 0;
    setCameraSessionKey((key) => key + 1);

    if (!permission?.granted) {
      try {
        await requestPermission();
      } catch (error: any) {
        Alert.alert('Camera permission needed', error?.message ?? 'Allow camera access to take listing photos.');
      }
    }
  }, [permission?.granted, requestPermission]);

  const capture = useCallback(async (source: 'manual' | 'auto' = 'manual') => {
    if (!requirement || capturing) return;
    if (!cameraReady || !cameraRef.current) {
      setReadiness({ ready: false, message: 'Camera is still warming up.', tone: 'waiting' });
      return;
    }
    setCapturing(true);
    setReadiness({ ready: false, message: source === 'auto' ? 'Capturing...' : 'Saving photo...', tone: 'waiting' });

    try {
      if (source === 'manual') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.84,
        base64: true,
        exif: false,
        shutterSound: false,
      });
      if (!photo?.uri) throw new Error('Camera did not return a usable photo.');

      const captureFrame = CAPTURE_GEOMETRY_V2_ENABLED
        ? createCapturedFrame({
            originalUri: photo.uri,
            pixelWidth: photo.width,
            pixelHeight: photo.height,
            orientation: width >= height ? 'landscapeLeft' : 'portrait',
            rotationDegrees: 0,
            mirrored: facing === 'front',
            previewWidth: width,
            previewHeight: height,
            previewResizeMode: 'cover',
            safeAreaInsets: insets,
            detectedCardPreviewRect: {
              x: guideFrame.left,
              y: guideFrame.top,
              width: guideFrame.width,
              height: guideFrame.height,
            },
            capturedAt: new Date().toISOString(),
            scanSessionId: createCaptureSessionId(`listing-${requirement.id}`),
          })
        : null;
      const previewCrop = captureFrame
        ? await buildSameSourcePreviewCrop(photo.uri, captureFrame, guideFrame, requirement.captureType)
        : { previewUri: photo.uri, crop: null, previewBase64: null, previewWidth: null, previewHeight: null };

      console.log('[listing-camera] captured frame', {
        requirementId: requirement.id,
        scanSessionId: captureFrame?.scanSessionId ?? null,
        source: { uri: photo.uri, width: photo.width, height: photo.height },
        previewUri: previewCrop.previewUri,
        crop: previewCrop.crop,
        geometryV2: Boolean(captureFrame),
      });

      const { ocrText, candidate } = await scanCaptureText(photo.uri);
      const quality = assessGuidedCaptureQuality(previewCrop.previewBase64 ?? photo.base64, requirement.captureType, {
        purpose: requirement.photoPurpose,
        tier: validationTier,
        required: requirement.required,
        source: 'guided_camera',
        width: previewCrop.previewWidth ?? photo.width,
        height: previewCrop.previewHeight ?? photo.height,
        ocrText,
      });
      const resolvedQuality = await confirmCaptureQuality(quality);
      if (!resolvedQuality) {
        setReadiness(getReadinessFromQuality(quality, requirement));
        return;
      }

      onCaptured({
        uri: photo.uri,
        sourceUri: photo.uri,
        previewUri: previewCrop.previewUri,
        width: photo.width,
        height: photo.height,
        base64: photo.base64 ?? null,
        crop: previewCrop.crop,
        captureFrame,
        quality: resolvedQuality,
        barcodeData: barcode?.data ?? null,
        barcodeType: barcode?.type ?? null,
        ocrText,
        certificationCandidate: extractCertificationNumberFromText(barcode?.data) ?? candidate,
        captureSource: source,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!hasCaptureSequence) onClose();
    } catch (error: any) {
      Alert.alert('Photo not captured', error?.message ?? 'Try again with the guide visible.');
    } finally {
      setCapturing(false);
      lastAutoCaptureAt.current = Date.now();
    }
  }, [barcode, cameraReady, capturing, facing, guideFrame, hasCaptureSequence, height, insets, onCaptured, onClose, requirement, scanCaptureText, validationTier, confirmCaptureQuality, width]);

  const runAutoCheck = useCallback(async () => {
    if (!autoEnabled || !visible || !requirement || !cameraReady || capturing || autoCheckBusy.current || !cameraRef.current) return;
    if (Date.now() - lastAutoCaptureAt.current < CAMERA_AUTO_COOLDOWN_MS) return;

    autoCheckBusy.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.34,
        base64: true,
        exif: false,
        shutterSound: false,
      });
      const quality = assessGuidedCaptureQuality(photo?.base64, requirement.captureType, {
        purpose: requirement.photoPurpose,
        tier: validationTier,
        required: requirement.required,
        source: 'guided_camera',
        width: photo?.width,
        height: photo?.height,
      });
      const nextReadiness = getReadinessFromQuality(quality, requirement);
      setReadiness(nextReadiness.ready ? { ...nextReadiness, message: 'Hold steady...' } : nextReadiness);
      if (!nextReadiness.ready) {
        autoReadyFrames.current = 0;
        return;
      }

      autoReadyFrames.current += 1;
      if (autoReadyFrames.current < CAMERA_AUTO_READY_FRAMES) return;
      autoReadyFrames.current = 0;
      setReadiness({ ready: true, message: 'Perfect', tone: 'ready' });
      await capture('auto');
    } catch {
      setReadiness({ ready: true, message: 'Manual capture is ready.', tone: 'ready' });
    } finally {
      autoCheckBusy.current = false;
    }
  }, [autoEnabled, cameraReady, capture, capturing, requirement, validationTier, visible]);

  useEffect(() => {
    if (autoCheckTimer.current) {
      clearTimeout(autoCheckTimer.current);
      autoCheckTimer.current = null;
    }

    if (!visible || !autoEnabled || !cameraReady || !requirement || capturing) return undefined;

    const schedule = () => {
      autoCheckTimer.current = setTimeout(async () => {
        await runAutoCheck();
        if (visible && autoEnabled) schedule();
      }, CAMERA_AUTO_CHECK_INTERVAL_MS);
    };

    schedule();
    return () => {
      if (autoCheckTimer.current) {
        clearTimeout(autoCheckTimer.current);
        autoCheckTimer.current = null;
      }
    };
  }, [autoEnabled, cameraReady, capturing, requirement, runAutoCheck, visible]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!certificationStep || !result?.data) return;
    setBarcode({ data: result.data, type: result.type });
    setReadiness({ ready: true, message: 'Code found. Hold steady...', tone: 'ready' });
  }, [certificationStep]);

  if (!requirement) return null;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        {shouldRenderCamera ? (
          <CameraView
            key={`${facing}:${cameraSessionKey}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            enableTorch={torchEnabled && facing === 'back'}
            animateShutter={false}
            autofocus="on"
            onCameraReady={() => {
              setCameraReady(true);
              setMountError(null);
              setReadiness({
                ready: true,
                message: autoEnabled ? 'Aligning...' : 'Manual capture is ready.',
                tone: autoEnabled ? 'waiting' : 'ready',
              });
            }}
            onMountError={(error) => {
              setCameraReady(false);
              setMountError(error?.message ?? 'Camera preview could not start.');
            }}
            onBarcodeScanned={certificationStep ? handleBarcodeScanned : undefined}
            barcodeScannerSettings={certificationStep ? { barcodeTypes: LISTING_CAMERA_BARCODE_TYPES } : undefined}
          />
        ) : null}

        {!permissionGranted || mountError ? (
          <View style={[StyleSheet.absoluteFill, styles.permissionPanel, { backgroundColor: '#070711' }]}>
            <Ionicons name="camera-outline" size={34} color="#A78BFA" />
            <Text style={styles.permissionTitle}>{mountError ? 'Camera unavailable' : 'Camera permission needed'}</Text>
            <Text style={styles.permissionBody}>
              {mountError ?? 'Allow camera access so StackR can guide the listing photos.'}
            </Text>
            <TouchableOpacity onPress={() => void retryCamera()} style={styles.permissionButton}>
              <Text style={styles.permissionButtonText}>{mountError ? 'Try camera again' : 'Check permission'}</Text>
            </TouchableOpacity>
            {onUseSystemCamera ? (
              <TouchableOpacity onPress={onUseSystemCamera} style={styles.fallbackButton}>
                <Text style={styles.fallbackButtonText}>Use device camera</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.mask, { top: 0, left: 0, right: 0, height: guideFrame.top }]} />
          <View style={[styles.mask, { top: guideFrame.top + guideFrame.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.mask, { top: guideFrame.top, left: 0, width: guideFrame.left, height: guideFrame.height }]} />
          <View style={[styles.mask, { top: guideFrame.top, right: 0, width: guideFrame.left, height: guideFrame.height }]} />
          <View
            style={[
              styles.guideGlow,
              {
                top: guideFrame.top - 9,
                left: guideFrame.left - 9,
                width: guideFrame.width + 18,
                height: guideFrame.height + 18,
                borderRadius: guideFrame.radius + 10,
                borderColor: frameTone,
              },
            ]}
          />
          <View
            style={[
              styles.guideFrame,
              {
                top: guideFrame.top,
                left: guideFrame.left,
                width: guideFrame.width,
                height: guideFrame.height,
                borderRadius: guideFrame.radius,
                borderColor: frameTone,
              },
            ]}
          />
          <View style={[styles.centerGuide, {
            top: guideFrame.top + guideFrame.height / 2,
            left: guideFrame.left + 18,
            width: guideFrame.width - 36,
            backgroundColor: frameTone,
          }]} />
          <View style={[styles.corner, styles.cornerTopLeft, { top: guideFrame.top - 2, left: guideFrame.left - 2, borderColor: frameTone }]} />
          <View style={[styles.corner, styles.cornerTopRight, { top: guideFrame.top - 2, left: guideFrame.left + guideFrame.width - 34, borderColor: frameTone }]} />
          <View style={[styles.corner, styles.cornerBottomLeft, { top: guideFrame.top + guideFrame.height - 34, left: guideFrame.left - 2, borderColor: frameTone }]} />
          <View style={[styles.corner, styles.cornerBottomRight, { top: guideFrame.top + guideFrame.height - 34, left: guideFrame.left + guideFrame.width - 34, borderColor: frameTone }]} />
          {requirement.captureType.startsWith('surface_') ? (
            <View style={[styles.tiltGuide, {
              top: guideFrame.top + 18,
              left: guideFrame.left + guideFrame.width - 62,
              borderColor: frameTone,
            }]}>
              <Ionicons name="phone-portrait-outline" size={22} color={frameTone} />
            </View>
          ) : null}
          {requirement.overlayLabel ? (
            <View style={[styles.overlayLabel, {
              top: guideFrame.top + 12,
              left: guideFrame.left + 12,
              backgroundColor: `${frameTone}22`,
              borderColor: `${frameTone}55`,
            }]}>
              <Text style={[styles.overlayLabelText, { color: '#FFFFFF' }]}>{requirement.overlayLabel}</Text>
            </View>
          ) : null}
        </View>

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.headerPanel, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} style={styles.iconButton} accessibilityLabel="Close listing camera">
              <Ionicons name="chevron-back" size={28} color="#180B4A" />
            </TouchableOpacity>
            <View style={styles.titlePill}>
              <Text style={styles.captureTitle} numberOfLines={1}>Listing Photos</Text>
              <Text style={styles.captureEyebrow} numberOfLines={1}>
                {stepLabel} - {requirement.required ? 'Required' : 'Optional'} - {requirement.label}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setTorchEnabled((value) => !value);
                void Haptics.selectionAsync().catch(() => {});
              }}
              style={[styles.iconButton, torchEnabled ? styles.iconButtonActive : null]}
              accessibilityLabel="Toggle torch"
            >
              <Ionicons name={torchEnabled ? 'flashlight' : 'flashlight-outline'} size={22} color={torchEnabled ? '#FFFFFF' : '#6D35F5'} />
            </TouchableOpacity>
          </View>
          </View>

          <View style={[styles.instructionCard, { maxWidth: width - 36 }]} pointerEvents="none">
            <Text style={styles.instructionText}>{requirement.instruction}</Text>
            {lightAssistedCapture ? (
              <Text style={styles.lightAssistText}>Torch starts on for surface reflections. Tap the flashlight to adjust.</Text>
            ) : null}
            {requirement.reason ? <Text style={styles.reasonText}>{requirement.reason}</Text> : null}
          </View>

          <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 14 }]}>
            <View style={[styles.statusPill, { borderColor: frameTone }]}>
              <View style={[styles.readyDot, { backgroundColor: readiness.tone === 'ready' ? '#22C55E' : readiness.tone === 'warning' ? '#F59E0B' : '#A78BFA' }]} />
              <Text style={styles.statusText}>{capturing ? 'Capturing...' : readiness.message}</Text>
            </View>

            {barcode ? (
              <View style={styles.codePill}>
                <Ionicons name="qr-code-outline" size={16} color="#22C55E" />
                <Text style={styles.codeText} numberOfLines={1}>{barcode.data}</Text>
              </View>
            ) : null}

            {previewUri ? (
              <View style={styles.previewStrip}>
                <Image source={{ uri: previewUri }} style={styles.previewThumb} />
                <Text style={styles.previewText}>Current photo saved. Retake when ready.</Text>
              </View>
            ) : null}

            <View style={styles.windowHint} pointerEvents="none">
              <Ionicons name={getCaptureStepIcon(requirement.captureType)} size={19} color="#6D35F5" />
              <View style={styles.windowHintCopy}>
                <Text style={styles.windowHintTitle}>{requirement.label}</Text>
                <Text style={styles.windowHintText}>{getCaptureWindowHint(requirement)}</Text>
              </View>
            </View>

            {captureSequence.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stepRail}
                contentContainerStyle={styles.stepRailContent}
              >
                {captureSequence.map((item, index) => {
                  const selected = item.id === requirement.id;
                  const complete = completedIds.has(item.id);
                  const iconName = complete ? 'checkmark' : getCaptureStepIcon(item.captureType);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelectRequirement?.(item)}
                      disabled={!onSelectRequirement}
                      style={[
                        styles.stepChip,
                        selected ? styles.stepChipActive : null,
                        complete && !selected ? styles.stepChipComplete : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open photo step ${index + 1}, ${item.label}`}
                    >
                      <Ionicons name={iconName} size={17} color={selected ? '#FFFFFF' : complete ? '#22C55E' : '#4C3D79'} />
                      <Text style={[styles.stepChipText, selected ? styles.stepChipTextActive : null]} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => {
                  autoReadyFrames.current = 0;
                  setAutoEnabled((value) => !value);
                  setReadiness((current) => ({ ...current, message: autoEnabled ? 'Manual capture is ready.' : 'Aligning...' }));
                }}
                style={[styles.modeButton, { borderColor: autoEnabled ? '#A78BFA' : 'rgba(255,255,255,0.22)' }]}
              >
                <Ionicons name={autoEnabled ? 'sparkles-outline' : 'hand-left-outline'} size={18} color="#FFFFFF" />
                <Text style={styles.modeText}>{autoEnabled ? 'Auto on' : 'Manual'}</Text>
              </Pressable>

              <TouchableOpacity
                onPress={() => void capture('manual')}
                disabled={capturing || !cameraReady}
                activeOpacity={0.86}
                style={[styles.captureButton, { opacity: capturing || !cameraReady ? 0.62 : 1 }]}
                accessibilityLabel="Capture photo"
              >
                <LinearGradient
                  colors={['#8B55FF', '#6938F5', '#5226D9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <StackrButtonPattern tone="purple" compact />
                {capturing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="camera" size={34} color="#FFFFFF" />}
              </TouchableOpacity>

              <Pressable
                onPress={() => {
                  setCameraReady(false);
                  setTorchEnabled(false);
                  setFacing((current) => current === 'back' ? 'front' : 'back');
                }}
                style={styles.modeButton}
              >
                <Ionicons name="camera-reverse-outline" size={18} color="#FFFFFF" />
                <Text style={styles.modeText}>Flip</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#070711',
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(7,7,17,0.48)',
  },
  guideGlow: {
    position: 'absolute',
    borderWidth: 7,
    opacity: 0.18,
  },
  guideFrame: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'rgba(167,139,250,0.035)',
  },
  centerGuide: {
    position: 'absolute',
    height: 1,
    opacity: 0.58,
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderWidth: 5,
  },
  cornerTopLeft: {
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
  },
  cornerTopRight: {
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 18,
  },
  cornerBottomLeft: {
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
  },
  cornerBottomRight: {
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 18,
  },
  tiltGuide: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,7,17,0.42)',
  },
  overlayLabel: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overlayLabelText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  headerPanel: {
    backgroundColor: 'rgba(250,248,255,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,53,245,0.12)',
    shadowColor: '#180B4A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(109,53,245,0.1)',
    shadowColor: '#180B4A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  iconButtonActive: {
    backgroundColor: '#6D35F5',
    borderColor: 'rgba(109,53,245,0.22)',
  },
  titlePill: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureEyebrow: {
    color: '#6D35F5',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 1,
  },
  captureTitle: {
    color: '#12072F',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  instructionCard: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(7,7,17,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  lightAssistText: {
    color: '#DDD6FE',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },
  reasonText: {
    color: '#DDD6FE',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomPanel: {
    marginTop: 'auto',
    paddingHorizontal: 18,
    gap: 10,
  },
  statusPill: {
    alignSelf: 'center',
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(7,7,17,0.56)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readyDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  codePill: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(20,83,45,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  codeText: {
    flex: 1,
    color: '#DCFCE7',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  previewStrip: {
    borderRadius: 18,
    backgroundColor: 'rgba(7,7,17,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewThumb: {
    width: 42,
    height: 56,
    borderRadius: 8,
  },
  previewText: {
    flex: 1,
    color: '#EDE9FE',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  windowHint: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(250,248,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(109,53,245,0.12)',
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  windowHintCopy: {
    flex: 1,
    minWidth: 0,
  },
  windowHintTitle: {
    color: '#160B3F',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  windowHintText: {
    color: '#4C3D79',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 1,
  },
  stepRail: {
    marginHorizontal: -18,
  },
  stepRailContent: {
    paddingHorizontal: 18,
    gap: 8,
  },
  stepChip: {
    width: 86,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: 'rgba(250,248,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(109,53,245,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 5,
  },
  stepChipActive: {
    backgroundColor: '#6D35F5',
    borderColor: '#6D35F5',
    shadowColor: '#6D35F5',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  stepChipComplete: {
    borderColor: 'rgba(34,197,94,0.26)',
  },
  stepChipText: {
    color: '#2A2158',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  stepChipTextActive: {
    color: '#FFFFFF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  modeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(7,7,17,0.5)',
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modeText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D35F5',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    shadowColor: '#6D35F5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  permissionPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  permissionBody: {
    color: '#DDD6FE',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#6D35F5',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  fallbackButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
});
