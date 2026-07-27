import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrButton, StackrChip } from '../../components/StackrControls';
import { StackrPageTitle, StackrScreen } from '../../components/StackrScreen';
import { StackrLoadingState, StackrPermissionState, StackrStateBlock } from '../../components/StackrStates';
import { Text } from '../../components/Text';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import { Camera, useCameraPermission } from '../../lib/visionCamera';
import { useScanCamera } from '../../lib/useScanCamera';
import { useLiveCardFrameAnalyser } from '../../lib/useLiveCardFrameAnalyser';
import { collectOcrEvidence, type OcrLanguageHint } from '../../lib/ocrEvidence';
import type { CardFrameAnalyserCorners } from '../../lib/cardVisionFrameAnalyser';
import {
  SCAN_LAB_CARD_SIDES,
  SCAN_LAB_HOLDER_STATES,
  SCAN_LAB_LIGHTING_CATEGORIES,
  SCAN_LAB_SLEEVE_STATES,
  applyScanLabReviewDecision,
  normaliseScanLabIdentity,
  shouldDeleteScanLabBackendCapture,
  validateScanLabCaptureForUpload,
  type ScanLabCardIdentity,
  type ScanLabCaptureRecord,
  type ScanLabCardSide,
  type ScanLabHolderState,
  type ScanLabLightingCategory,
  type ScanLabSleeveState,
} from '../../lib/scanLabCore';
import {
  createLocalScanLabRecord,
  createPhysicalCardSessionId,
  deleteScanLabCapture,
  isScanLabAvailableForProfile,
  loadScanLabQueue,
  saveScanLabCapture,
  updateScanLabCapture,
  uploadScanLabCapture,
} from '../../lib/scanLab';

const CARD_ASPECT_RATIO = 0.716;

const LABELS: Record<string, string> = {
  bright_indoor: 'Bright indoor',
  dim_indoor: 'Dim indoor',
  daylight: 'Daylight',
  mixed: 'Mixed',
  unknown: 'Unknown',
  none: 'None',
  sleeved: 'Sleeved',
  binder_pocket: 'Binder',
  toploader: 'Top-loader',
  slab: 'Slab',
  front: 'Front',
  back: 'Back',
  pending: 'Pending',
  confirmed: 'Confirmed',
  corrected: 'Corrected',
  unresolved: 'Unresolved',
  wrong_variant: 'Wrong variant',
  poor_capture: 'Poor capture',
  uploaded: 'Uploaded',
  failed: 'Failed',
  local_only: 'Local only',
  metadata_received: 'Metadata saved',
  deleted: 'Deleted',
};

function labelFor(value: string) {
  return LABELS[value] ?? value;
}

function languageToOcrHint(language: string): OcrLanguageHint {
  const value = language.trim().toLowerCase();
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('ko')) return 'ko';
  if (value === 'zh-hans' || value.includes('simplified')) return 'zh-Hans';
  if (value === 'zh-hant' || value.includes('traditional')) return 'zh-Hant';
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('en')) return 'en';
  return 'unknown';
}

function identityFromFields(fields: IdentityFields): ScanLabCardIdentity {
  return normaliseScanLabIdentity({
    stackrCardId: fields.stackrCardId,
    cardName: fields.cardName,
    setId: fields.setId,
    language: fields.language,
    variant: fields.variant,
  });
}

type IdentityFields = {
  stackrCardId: string;
  cardName: string;
  setId: string;
  language: string;
  variant: string;
};

function identityToFields(identity?: ScanLabCardIdentity | null): IdentityFields {
  return {
    stackrCardId: identity?.stackrCardId ?? '',
    cardName: identity?.cardName ?? '',
    setId: identity?.setId ?? '',
    language: identity?.language ?? 'en',
    variant: identity?.variant ?? '',
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSoft }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSoft}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
          },
        ]}
      />
    </View>
  );
}

function ChipGroup<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.chipGroup}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSoft }]}>{label}</Text>
      <View style={styles.chipRow}>
        {values.map((item) => (
          <StackrChip
            key={item}
            label={labelFor(item)}
            selected={value === item}
            onPress={() => onChange(item)}
          />
        ))}
      </View>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.metricPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.metricValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.colors.textSoft }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function QueueItem({
  record,
  selected,
  onPress,
}: {
  record: ScanLabCaptureRecord;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const imageUri = record.thumbnailUri ?? record.rectifiedCardUri ?? record.originalPhotoUri;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[
        styles.queueItem,
        {
          backgroundColor: selected ? `${theme.colors.primary}12` : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.queueThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.queueThumb, styles.queueThumbEmpty, { borderColor: theme.colors.border }]}>
          <Ionicons name="image-outline" size={20} color={theme.colors.textSoft} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.queueTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {record.userConfirmedIdentity?.cardName ?? record.expectedIdentity.cardName ?? 'Unlabelled capture'}
        </Text>
        <Text style={[styles.queueMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {labelFor(record.reviewStatus)} - {labelFor(record.uploadStatus)}
        </Text>
        <Text style={[styles.queueMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {record.physicalCardSessionId}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminScanLabScreen() {
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const { profile, loading } = useProfile();
  const { width: screenWidth } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [queue, setQueue] = useState<ScanLabCaptureRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [identityFields, setIdentityFields] = useState<IdentityFields>(() => identityToFields());
  const [confirmedFields, setConfirmedFields] = useState<IdentityFields>(() => identityToFields());
  const [physicalCardSessionId, setPhysicalCardSessionId] = useState(() => createPhysicalCardSessionId());
  const [lightingCategory, setLightingCategory] = useState<ScanLabLightingCategory>('bright_indoor');
  const [sleeveState, setSleeveState] = useState<ScanLabSleeveState>('sleeved');
  const [holderState, setHolderState] = useState<ScanLabHolderState>('none');
  const [cardSide, setCardSide] = useState<ScanLabCardSide>('front');
  const [consentToUploadImages, setConsentToUploadImages] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const acceptedCornersRef = useRef<CardFrameAnalyserCorners | null>(null);
  const scanIdRef = useRef(`scanlab-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const previewWidth = Math.max(280, screenWidth - 32);
  const previewHeight = Math.round(Math.min(520, Math.max(360, previewWidth * 1.28)));
  const guideWidth = Math.round(Math.min(previewWidth - 72, previewHeight * CARD_ASPECT_RATIO * 0.82));
  const guideHeight = Math.round(guideWidth / CARD_ASPECT_RATIO);
  const guideX = Math.round((previewWidth - guideWidth) / 2);
  const guideY = Math.round((previewHeight - guideHeight) / 2);
  const analyserGuide = useMemo(() => ({
    x: guideX / previewWidth,
    y: guideY / previewHeight,
    width: guideWidth / previewWidth,
    height: guideHeight / previewHeight,
  }), [guideHeight, guideWidth, guideX, guideY, previewHeight, previewWidth]);

  const { camera, device, torch, toggleTorch, takePhoto, focusAtPoint } = useScanCamera(false, false, {
    cropToCard: false,
    includeBase64: false,
    cropFrame: {
      previewWidth,
      previewHeight,
      frameX: guideX,
      frameY: guideY,
      frameWidth: guideWidth,
      frameHeight: guideHeight,
      marginRatio: 0.08,
    },
  });

  const liveAnalyser = useLiveCardFrameAnalyser({
    enabled: isFocused && hasPermission,
    scanId: scanIdRef.current,
    guide: analyserGuide,
    autoCaptureEnabled: false,
    captureInProgress: capturing,
    onStableCapture: () => undefined,
  });

  const selectedRecord = queue.find((record) => record.localId === selectedId) ?? null;

  useEffect(() => {
    void loadScanLabQueue().then((records) => {
      setQueue(records);
      setSelectedId(records[0]?.localId ?? null);
    });
  }, []);

  useEffect(() => {
    acceptedCornersRef.current = liveAnalyser.latestResult?.qualityAccepted
      ? liveAnalyser.latestResult.corners
      : null;
  }, [liveAnalyser.latestResult]);

  useEffect(() => {
    if (!selectedRecord) return;
    setConsentToUploadImages(selectedRecord.consentToUploadImages);
    setConfirmedFields(identityToFields(selectedRecord.userConfirmedIdentity ?? selectedRecord.expectedIdentity));
  }, [selectedRecord]);

  const canUseScanLab = isScanLabAvailableForProfile(profile);
  const latestQuality = liveAnalyser.latestResult;
  const guidanceColor = liveAnalyser.guidance.tone === 'ready'
    ? '#22C55E'
    : liveAnalyser.guidance.tone === 'warning'
      ? '#F59E0B'
      : theme.colors.primary;

  const requestCamera = useCallback(async () => {
    await requestPermission();
  }, [requestPermission]);

  const setIdentityField = useCallback((key: keyof IdentityFields, value: string) => {
    setIdentityFields((previous) => ({ ...previous, [key]: value }));
  }, []);

  const setConfirmedField = useCallback((key: keyof IdentityFields, value: string) => {
    setConfirmedFields((previous) => ({ ...previous, [key]: value }));
  }, []);

  const handleFocusTap = useCallback(async (event: GestureResponderEvent) => {
    const focused = await focusAtPoint({
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    });
    if (!focused) liveAnalyser.recordFocusFailure();
  }, [focusAtPoint, liveAnalyser]);

  const refreshSelectedQueue = useCallback((records: ScanLabCaptureRecord[], selectedLocalId?: string | null) => {
    setQueue(records);
    setSelectedId(selectedLocalId ?? records[0]?.localId ?? null);
  }, []);

  const captureForLab = useCallback(async () => {
    if (capturing) return;
    if (!device) {
      Alert.alert('Camera unavailable', 'No back camera was found for Scan Lab capture.');
      return;
    }

    setCapturing(true);
    setMessage(null);
    try {
      liveAnalyser.recordCapture('manual');
      const acceptedCorners = acceptedCornersRef.current;
      const capture = await takePhoto('manual', {
        scanId: scanIdRef.current,
        acceptedCorners,
        rectify: acceptedCorners != null,
        cameraPosition: 'back',
      });
      if (!capture?.originalPhotoUri) {
        throw new Error('Camera did not return an original photo URI.');
      }

      let ocrEvidence = null;
      if (capture.rectification?.status === 'success') {
        try {
          ocrEvidence = await collectOcrEvidence({
            scanId: scanIdRef.current,
            rectification: capture.rectification,
            probableLanguage: languageToOcrHint(identityFields.language),
            visualCandidates: [{
              id: identityFields.stackrCardId || undefined,
              name: identityFields.cardName || undefined,
              language: identityFields.language || undefined,
              setId: identityFields.setId || undefined,
            }],
            readNameWhen: identityFields.cardName ? 'needed' : 'always',
          });
        } catch (error) {
          setMessage(`OCR evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const rectifiedCard = capture.rectification?.status === 'success'
        ? capture.rectification.rectifiedFull
        : null;
      const recognitionCrop = capture.rectification?.status === 'success'
        ? capture.rectification.recognitionCrop
        : null;
      const ocrSourceCrop = capture.rectification?.status === 'success'
        ? capture.rectification.ocrSourceCrop
        : null;
      const thumbnail = capture.rectification?.status === 'success'
        ? capture.rectification.thumbnail
        : null;
      const record = createLocalScanLabRecord({
        physicalCardSessionId,
        originalPhotoUri: capture.originalPhotoUri,
        originalPhotoWidth: capture.originalPhotoWidth,
        originalPhotoHeight: capture.originalPhotoHeight,
        originalPhotoOrientation: capture.originalPhotoOrientation,
        rectifiedCardUri: rectifiedCard?.uri ?? null,
        rectifiedCardWidth: rectifiedCard?.width ?? null,
        rectifiedCardHeight: rectifiedCard?.height ?? null,
        recognitionCropUri: recognitionCrop?.uri ?? null,
        ocrSourceCropUri: ocrSourceCrop?.uri ?? null,
        thumbnailUri: thumbnail?.uri ?? null,
        rectification: capture.rectification,
        captureQuality: latestQuality,
        ocrEvidence,
        expectedIdentity: identityFromFields(identityFields),
        userConfirmedIdentity: null,
        consentToUploadImages: false,
        lightingCategory,
        sleeveState,
        holderState,
        cardSide,
      });
      const records = await saveScanLabCapture(record);
      refreshSelectedQueue(records, record.localId);
      setConfirmedFields(identityToFields(record.expectedIdentity));
      setMessage(capture.rectification?.status === 'success'
        ? 'Capture saved with rectified card and evidence.'
        : 'Capture saved, but rectification was not available for this frame.');
      scanIdRef.current = `scanlab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (error) {
      Alert.alert('Scan Lab capture failed', error instanceof Error ? error.message : String(error));
    } finally {
      setCapturing(false);
    }
  }, [
    capturing,
    cardSide,
    device,
    holderState,
    identityFields,
    latestQuality,
    lightingCategory,
    liveAnalyser,
    physicalCardSessionId,
    refreshSelectedQueue,
    sleeveState,
    takePhoto,
  ]);

  const updateSelected = useCallback(async (
    updater: Partial<ScanLabCaptureRecord> | ((record: ScanLabCaptureRecord) => ScanLabCaptureRecord)
  ) => {
    if (!selectedRecord) return;
    const records = await updateScanLabCapture(selectedRecord.localId, updater);
    refreshSelectedQueue(records, selectedRecord.localId);
  }, [refreshSelectedQueue, selectedRecord]);

  const applyDecision = useCallback(async (
    status: 'confirmed' | 'corrected' | 'unresolved' | 'wrong_variant' | 'poor_capture'
  ) => {
    if (!selectedRecord) return;
    const identity = identityFromFields(confirmedFields);
    const next = status === 'unresolved'
      ? applyScanLabReviewDecision(selectedRecord, { status: 'unresolved' })
      : status === 'confirmed'
        ? applyScanLabReviewDecision(selectedRecord, { status: 'confirmed', identity })
        : status === 'corrected'
          ? applyScanLabReviewDecision(selectedRecord, { status: 'corrected', identity })
          : status === 'wrong_variant'
            ? applyScanLabReviewDecision(selectedRecord, { status: 'wrong_variant', identity })
            : applyScanLabReviewDecision(selectedRecord, { status: 'poor_capture', identity });
    const records = await updateScanLabCapture(selectedRecord.localId, next);
    refreshSelectedQueue(records, selectedRecord.localId);
    setMessage(`Marked capture as ${labelFor(status).toLowerCase()}.`);
  }, [confirmedFields, refreshSelectedQueue, selectedRecord]);

  const toggleSelectedConsent = useCallback(async () => {
    if (!selectedRecord) return;
    const nextConsent = !selectedRecord.consentToUploadImages;
    await updateSelected({ consentToUploadImages: nextConsent, uploadError: null });
    setConsentToUploadImages(nextConsent);
  }, [selectedRecord, updateSelected]);

  const uploadSelected = useCallback(async () => {
    if (!selectedRecord || uploading) return;
    setUploading(true);
    setMessage(null);
    try {
      const uploadableRecord = {
        ...selectedRecord,
        consentToUploadImages,
      };
      const validation = validateScanLabCaptureForUpload(uploadableRecord);
      if (!validation.ok) {
        throw new Error(validation.reasons.join(', '));
      }
      await updateSelected({ consentToUploadImages, uploadStatus: 'metadata_received', uploadError: null });
      const uploaded = await uploadScanLabCapture(uploadableRecord);
      const records = await updateScanLabCapture(uploaded.localId, uploaded);
      refreshSelectedQueue(records, uploaded.localId);
      setMessage('Capture uploaded through the protected Scan Lab route.');
    } catch (error) {
      const uploadError = error instanceof Error ? error.message : String(error);
      await updateSelected({ uploadStatus: 'failed', uploadError });
      Alert.alert('Scan Lab upload failed', uploadError);
    } finally {
      setUploading(false);
    }
  }, [consentToUploadImages, refreshSelectedQueue, selectedRecord, updateSelected, uploading]);

  const deleteSelected = useCallback(async () => {
    if (!selectedRecord) return;
    const shouldDeleteBackendCapture = shouldDeleteScanLabBackendCapture(selectedRecord);
    Alert.alert(
      'Delete Scan Lab capture?',
      shouldDeleteBackendCapture
        ? 'This deletes local files and asks the protected backend to delete uploaded training data.'
        : 'This deletes the queued local files for this capture.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteScanLabCapture(selectedRecord, {
              deleteLocalFiles: true,
              deleteUploaded: shouldDeleteBackendCapture,
            })
              .then((records) => refreshSelectedQueue(records, null))
              .catch((error) => {
                Alert.alert('Delete failed', error instanceof Error ? error.message : String(error));
              });
          },
        },
      ]
    );
  }, [refreshSelectedQueue, selectedRecord]);

  if (loading) {
    return (
      <StackrScreen variant="form" contentStyle={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrLoadingState label="Checking Scan Lab access..." />
      </StackrScreen>
    );
  }

  if (!canUseScanLab) {
    return (
      <StackrScreen variant="form" contentStyle={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrPermissionState
          title="Scan Lab is internal"
          body="This capture tool is hidden from ordinary production users and requires an admin tester profile."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </StackrScreen>
    );
  }

  return (
    <StackrScreen variant="form" contentStyle={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <StackrPageTitle title="Scan Lab" accentText="Lab" />
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
              Internal capture review for local recognition training data.
            </Text>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Expected card</Text>
            <StackrButton
              label="New physical card"
              icon="albums-outline"
              variant="utility"
              onPress={() => setPhysicalCardSessionId(createPhysicalCardSessionId())}
              style={styles.compactButton}
            />
          </View>
          <Field
            label="Physical card session ID"
            value={physicalCardSessionId}
            onChangeText={setPhysicalCardSessionId}
          />
          <View style={styles.fieldGrid}>
            <Field label="Stackr card ID" value={identityFields.stackrCardId} onChangeText={(value) => setIdentityField('stackrCardId', value)} placeholder="sv1-099" />
            <Field label="Card name" value={identityFields.cardName} onChangeText={(value) => setIdentityField('cardName', value)} placeholder="Pikachu" />
            <Field label="Set ID" value={identityFields.setId} onChangeText={(value) => setIdentityField('setId', value)} placeholder="sv1" />
            <Field label="Language" value={identityFields.language} onChangeText={(value) => setIdentityField('language', value)} placeholder="en, ja, ko, zh-Hans" />
            <Field label="Variant" value={identityFields.variant} onChangeText={(value) => setIdentityField('variant', value)} placeholder="normal, reverse_holo" />
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Capture setup</Text>
          <ChipGroup label="Lighting" values={SCAN_LAB_LIGHTING_CATEGORIES} value={lightingCategory} onChange={setLightingCategory} />
          <ChipGroup label="Sleeve" values={SCAN_LAB_SLEEVE_STATES} value={sleeveState} onChange={setSleeveState} />
          <ChipGroup label="Holder" values={SCAN_LAB_HOLDER_STATES} value={holderState} onChange={setHolderState} />
          <ChipGroup label="Side" values={SCAN_LAB_CARD_SIDES} value={cardSide} onChange={setCardSide} />
        </View>

        <View style={[styles.cameraPanel, { borderColor: theme.colors.border, backgroundColor: '#05020E' }]}>
          {!hasPermission ? (
            <View style={styles.cameraFallback}>
              <Ionicons name="camera-outline" size={34} color="#FFFFFF" />
              <Text style={styles.cameraFallbackTitle}>Camera permission required</Text>
              <StackrButton label="Allow camera" icon="camera-outline" variant="primary" onPress={requestCamera} />
            </View>
          ) : !device ? (
            <View style={styles.cameraFallback}>
              <Ionicons name="camera-reverse-outline" size={34} color="#FFFFFF" />
              <Text style={styles.cameraFallbackTitle}>No back camera available</Text>
            </View>
          ) : (
            <Pressable onPress={handleFocusTap} style={{ width: previewWidth, height: previewHeight }}>
              <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={isFocused}
                photo={true}
                video={Boolean(liveAnalyser.frameProcessor)}
                pixelFormat="yuv"
                frameProcessor={liveAnalyser.frameProcessor}
                torch={torch}
              />
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={[styles.scanGuide, {
                  left: guideX,
                  top: guideY,
                  width: guideWidth,
                  height: guideHeight,
                  borderColor: latestQuality?.qualityAccepted ? '#22C55E' : guidanceColor,
                }]} />
              </View>
            </Pressable>
          )}
        </View>

        <View style={[styles.statusPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusDot, { backgroundColor: guidanceColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: theme.colors.text }]}>{liveAnalyser.guidance.message}</Text>
              <Text style={[styles.statusMeta, { color: theme.colors.textSoft }]}>
                Stable frames {liveAnalyser.stableFrameCount} - analyser {liveAnalyser.analyserAvailable ? 'ready' : 'not linked'}
              </Text>
            </View>
            <StackrButton label={torch === 'on' ? 'Torch on' : 'Torch'} icon="flash-outline" variant="utility" onPress={toggleTorch} style={styles.compactButton} />
          </View>
          <View style={styles.metricGrid}>
            <MetricPill label="Fill" value={`${Math.round((latestQuality?.fillRatio ?? 0) * 100)}%`} />
            <MetricPill label="Blur" value={(latestQuality?.blurScore ?? 0).toFixed(2)} />
            <MetricPill label="Glare" value={`${Math.round((latestQuality?.glareRatio ?? 0) * 100)}%`} />
            <MetricPill label="Frame ms" value={(latestQuality?.processingMs ?? 0).toFixed(1)} />
          </View>
          <StackrButton
            label="Capture for lab"
            icon="camera-outline"
            variant="primary"
            loading={capturing}
            disabled={!hasPermission || !device || capturing}
            onPress={captureForLab}
          />
          {message ? (
            <Text style={[styles.message, { color: theme.colors.textSoft }]}>{message}</Text>
          ) : null}
        </View>

        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Queued captures</Text>
            <Text style={[styles.statusMeta, { color: theme.colors.textSoft }]}>{queue.length} local</Text>
          </View>
          {queue.length ? queue.map((record) => (
            <QueueItem
              key={record.localId}
              record={record}
              selected={record.localId === selectedId}
              onPress={() => setSelectedId(record.localId)}
            />
          )) : (
            <StackrStateBlock
              title="No Scan Lab captures"
              body="Capture a real card to create a local reviewed training example."
              tone="info"
              icon="flask-outline"
            />
          )}
        </View>

        {selectedRecord ? (
          <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.panelTitle, { color: theme.colors.text }]}>Review selected capture</Text>
            <View style={styles.fieldGrid}>
              <Field label="Confirmed card ID" value={confirmedFields.stackrCardId} onChangeText={(value) => setConfirmedField('stackrCardId', value)} />
              <Field label="Confirmed name" value={confirmedFields.cardName} onChangeText={(value) => setConfirmedField('cardName', value)} />
              <Field label="Confirmed set" value={confirmedFields.setId} onChangeText={(value) => setConfirmedField('setId', value)} />
              <Field label="Confirmed language" value={confirmedFields.language} onChangeText={(value) => setConfirmedField('language', value)} />
              <Field label="Confirmed variant" value={confirmedFields.variant} onChangeText={(value) => setConfirmedField('variant', value)} />
            </View>
            <View style={styles.reviewActions}>
              <StackrButton label="Confirm" icon="checkmark-circle-outline" variant="secondary" onPress={() => applyDecision('confirmed')} />
              <StackrButton label="Correct" icon="create-outline" variant="secondary" onPress={() => applyDecision('corrected')} />
              <StackrButton label="Unresolved" icon="help-circle-outline" variant="secondary" onPress={() => applyDecision('unresolved')} />
              <StackrButton label="Wrong variant" icon="git-compare-outline" variant="secondary" onPress={() => applyDecision('wrong_variant')} />
              <StackrButton label="Poor capture" icon="warning-outline" variant="secondary" onPress={() => applyDecision('poor_capture')} />
            </View>

            <TouchableOpacity
              onPress={toggleSelectedConsent}
              activeOpacity={0.82}
              style={[
                styles.consentRow,
                {
                  backgroundColor: selectedRecord.consentToUploadImages ? `${theme.colors.primary}12` : theme.colors.surface,
                  borderColor: selectedRecord.consentToUploadImages ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Ionicons
                name={selectedRecord.consentToUploadImages ? 'checkbox-outline' : 'square-outline'}
                size={22}
                color={selectedRecord.consentToUploadImages ? theme.colors.primary : theme.colors.textSoft}
              />
              <Text style={[styles.consentText, { color: theme.colors.text }]}>
                I explicitly consent to upload this capture and rectified image for internal recognition training.
              </Text>
            </TouchableOpacity>

            {selectedRecord.uploadError ? (
              <Text style={[styles.errorText, { color: theme.colors.semantic.error }]}>
                {selectedRecord.uploadError}
              </Text>
            ) : null}

            <View style={styles.reviewActions}>
              <StackrButton
                label="Upload reviewed capture"
                icon="cloud-upload-outline"
                variant="primary"
                loading={uploading}
                disabled={uploading || !selectedRecord.consentToUploadImages}
                onPress={uploadSelected}
              />
              <StackrButton
                label="Delete capture"
                icon="trash-outline"
                variant="destructive"
                disabled={uploading}
                onPress={deleteSelected}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </StackrScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  compactButton: {
    minHeight: 42,
    paddingHorizontal: 12,
  },
  fieldGrid: {
    gap: 10,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  chipGroup: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cameraPanel: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  cameraFallback: {
    width: '100%',
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
  },
  cameraFallbackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  scanGuide: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statusPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  statusMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricPill: {
    minWidth: 74,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  queueItem: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  queueThumb: {
    width: 50,
    height: 64,
    borderRadius: 10,
  },
  queueThumbEmpty: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  queueTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  queueMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  reviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  consentRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
});
