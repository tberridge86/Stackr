import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { canInspectCatalogueCard, type CardInspectionRequest } from '../lib/cardInspection';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import { VERIFIED_CARD_HOLO_MASKS } from '../lib/cardHoloMaskRegistry';
import { resolvePrintingMaterial } from '../lib/cardPrintingMaterial';
import { REVIEWED_PRINTING_MATERIALS } from '../lib/cardPrintingMaterialRegistry';
import { stackrCardImageSizes } from '../lib/stackrSizing';
import { stackrHaptics } from '../lib/haptics';
import { stackrBrand } from '../lib/stackrBrand';
import type { RetrievalImageEvent } from '../lib/performance';
import { InteractiveCardPreview } from './InteractiveCardPreview';
import { CardInspectionStage, CARD_INSPECTION_STAGE_INSETS, CARD_SHOWCASE_COLORS as colors } from './CardInspectionStage';
import { CardStudioLight } from './CardStudioLight';
import { StackrImage } from './StackrImage';
import { Text } from './Text';

const CardFoilSurface = lazy(() => import('./CardFoilSurface'));

class MaterialBoundary extends React.Component<{ children: React.ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function CardInspectionViewer({ request, onClose, onDiagnostic }: {
  request: CardInspectionRequest; onClose: (action?: () => void) => void;
  onDiagnostic?: (event: RetrievalImageEvent) => void;
}) {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height * 1.2;
  const insets = useSafeAreaInsets();
  const [resetKey, setResetKey] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadedFullUri, setLoadedFullUri] = useState<string | null>(null);
  const fullLoaded = Boolean(request.fullImageUri && loadedFullUri === request.fullImageUri);
  const [baseArtworkUri, setBaseArtworkUri] = useState<string | null>(request.imageUri);
  const [motionPaused, setMotionPaused] = useState(false);
  const [lighting, setLighting] = useState(true);
  const feedback = useRef({ active: true, generation: 0 });
  const artworkKey = JSON.stringify([request.card.id, request.selectedVariantId, request.imageUri, request.fullImageUri]);
  const artworkScope = useRef({ key: artworkKey, generation: 0 });
  if (artworkScope.current.key !== artworkKey) {
    artworkScope.current = { key: artworkKey, generation: artworkScope.current.generation + 1 };
    feedback.current.generation++;
  }
  const artworkGeneration = artworkScope.current.generation;
  const imageIsCurrent = () => feedback.current.active && artworkScope.current.generation === artworkGeneration;
  useEffect(() => {
    const scope = feedback.current;
    scope.active = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') scope.generation++;
    });
    return () => { scope.active = false; scope.generation++; subscription.remove(); };
  }, []);
  const close = (action?: () => void) => {
    feedback.current.active = false;
    feedback.current.generation++;
    onClose(action);
  };
  const controlFeedback = () => {
    const generation = ++feedback.current.generation;
    void stackrHaptics.cardShowcaseControl(() => feedback.current.active
      && feedback.current.generation === generation && AppState.currentState === 'active');
  };
  const onMotionPreference = useCallback((value: boolean) => {
    feedback.current.generation++;
    setReduced(value);
  }, []);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const profile = useMemo(() => resolveCardHoloProfile(request.card.raw_data, {
    cardId: request.card.id, selectedVariantId: request.selectedVariantId,
    languageCode: request.card.language, masks: VERIFIED_CARD_HOLO_MASKS,
  }), [request]);
  const stagePaddingX = CARD_INSPECTION_STAGE_INSETS.horizontal * 2;
  const stagePaddingY = CARD_INSPECTION_STAGE_INSETS.top + CARD_INSPECTION_STAGE_INSETS.bottom;
  const availableHeight = height - insets.top - insets.bottom - (landscape ? 88 : Math.min(360, 292 * fontScale)) - 16;
  const availableWidth = (landscape ? width * 0.48 - 32 : width - 32) - stagePaddingX;
  const cardWidth = Math.max(1, Math.min(460, availableWidth, Math.max(1, availableHeight - stagePaddingY) * stackrCardImageSizes.cardAspectRatio));
  const cardHeight = cardWidth / stackrCardImageSizes.cardAspectRatio;
  const displayedArtworkUri = fullLoaded && request.fullImageUri ? request.fullImageUri : baseArtworkUri;
  const printingMaterial = useMemo(() => resolvePrintingMaterial(profile, displayedArtworkUri, REVIEWED_PRINTING_MATERIALS), [profile, displayedArtworkUri]);
  const motionEnabled = !reduced && !motionPaused && imageLoaded;
  const hasVerifiedMaterial = Boolean(printingMaterial);
  // Neutral studio light is presentation, not evidence of a printing's finish.
  // Exact foil still requires its reviewed material and currently displayed art.
  const lightingEnabled = lighting && motionEnabled;
  const foilEnabled = lightingEnabled && !unavailable && hasVerifiedMaterial;
  const hint = reduced ? 'Motion is off with Reduce Motion.'
    : motionPaused ? 'Motion paused. Take in every detail.'
      : Platform.OS === 'web' ? 'Drag slowly to turn the card in the light.'
        : 'Tilt your phone or drag slowly to catch the light.';
  if (!canInspectCatalogueCard(request)) return null;
  return <Modal visible animationType="none" presentationStyle="overFullScreen" statusBarTranslucent
    onRequestClose={() => close()} supportedOrientations={['portrait', 'landscape']}>
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal
      onAccessibilityEscape={() => close()}>
      <StatusBar style="light" />
      <LinearGradient pointerEvents="none" colors={['#14213A', colors.background, '#050914']} locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <View style={styles.headingGroup} accessible accessibilityLabel="Stackr card showcase">
          <Image source={stackrBrand.wordmark} resizeMode="contain" style={styles.wordmark} accessible={false} />
          <Text style={styles.heading}>SHOWCASE</Text></View>
        <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Report a card issue" onPress={() => close(() => router.push({ pathname: '/help', params: {
          screen: 'Card inspection', cardId: request.card.id, setId: request.card.setId ?? '',
          language: request.card.language ?? '', finish: profile.identity?.finishCode ?? '', variantId: request.selectedVariantId ?? '',
        } }))} style={styles.iconButton}><Ionicons name="flag-outline" size={18} color={colors.muted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close card inspection" onPress={() => close()} style={styles.iconButton}>
          <Ionicons name="close" size={23} color={colors.text} />
        </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, landscape && styles.landscapeContent]} bounces={false}>
        <View style={[styles.stage, landscape && styles.landscapeStage, { minHeight: cardHeight + stagePaddingY + 16 }]}>
          <CardInspectionStage style={{ width: cardWidth + stagePaddingX }}>
          <View style={{ width: cardWidth, height: cardHeight }}>
            <InteractiveCardPreview resetKey={resetKey} onMotionPreference={onMotionPreference} motionPaused={motionPaused || !imageLoaded}
              foilHaptics={foilEnabled} lightHaptics={lightingEnabled}
              renderMaterial={light => lightingEnabled ? <>
                <CardStudioLight {...light} width={cardWidth} height={cardHeight} />
                {foilEnabled ? <MaterialBoundary key={`${request.selectedVariantId ?? ''}:${displayedArtworkUri}`} onUnavailable={onUnavailable}>
                <Suspense fallback={null}><CardFoilSurface {...light} source="catalogue" profile={profile}
                  artworkUri={displayedArtworkUri} width={cardWidth} height={cardHeight} onUnavailable={onUnavailable} /></Suspense>
              </MaterialBoundary> : null}
              </> : null}>
              <StackrImage cardShape uri={request.imageUri} fullUri={request.fullImageUri} contentFit="contain"
                onDiagnostic={onDiagnostic}
                rounded={14} placeholderColor="transparent" priority="high" transition={0} style={StyleSheet.absoluteFill}
                accessibilityLabel={`${request.card.name ?? 'Pokémon card'}, catalogue artwork`}
                onSourceChange={setBaseArtworkUri}
                onLoad={() => { if (imageIsCurrent()) setImageLoaded(true); }}
                onError={() => { if (imageIsCurrent()) { feedback.current.generation++; setImageLoaded(false); } }} />
              {imageLoaded && request.fullImageUri && request.fullImageUri !== request.imageUri ?
                <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { opacity: fullLoaded ? 1 : 0 }]}>
                  <StackrImage cardShape preserveDetail uri={request.fullImageUri} contentFit="contain" rounded={14} priority="high" transition={0}
                    onDiagnostic={event => onDiagnostic?.({ ...event, rendition: 'detail' })}
                    placeholderColor="transparent" style={StyleSheet.absoluteFill} showFallbackIcon={false}
                    onLoad={() => { if (imageIsCurrent()) setLoadedFullUri(request.fullImageUri ?? null); }} />
                </View> : null}
            </InteractiveCardPreview>
          </View>
          </CardInspectionStage>
        </View>
        <View style={landscape ? styles.landscapeDetails : undefined}>
        <View style={styles.caption}>
          <Text style={styles.name}>{request.card.name ?? 'Pokémon card'}</Text>
          {request.subtitle ? <Text style={styles.subtitle}>{request.subtitle}</Text> : null}
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Recenter card and light" disabled={!motionEnabled}
            accessibilityState={{ disabled: !motionEnabled }} onPress={() => { setResetKey(value => value + 1); controlFeedback(); }}
            style={({ pressed }) => [styles.control, !motionEnabled && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name="scan-outline" size={21} color={colors.accentText} /><Text style={styles.controlLabel}>Recenter</Text>
          </Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel="Card motion" disabled={reduced}
            accessibilityState={{ checked: motionEnabled, disabled: reduced }}
            onPress={() => { setMotionPaused(value => !value); controlFeedback(); }}
            style={({ pressed }) => [styles.control, motionEnabled && styles.controlActive, reduced && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name={motionEnabled ? 'phone-portrait-outline' : 'pause-outline'} size={21} color={colors.accentText} />
            <Text style={styles.controlLabel}>{motionEnabled ? 'Motion on' : 'Motion off'}</Text>
          </Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel="Studio lighting" disabled={!motionEnabled}
            accessibilityState={{ checked: lightingEnabled, disabled: !motionEnabled }}
            onPress={() => { setLighting(value => !value); controlFeedback(); }}
            style={({ pressed }) => [styles.control, lightingEnabled && styles.controlActive,
              !motionEnabled && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name="sunny-outline" size={21} color={colors.accentText} />
            <Text style={styles.controlLabel}>{lightingEnabled ? 'Lighting on' : 'Lighting off'}</Text>
          </Pressable>
        </View>
        <Text style={styles.disclosure}>{unavailable ? 'Studio lighting · foil preview unavailable'
          : printingMaterial ? `Studio lighting + simulated ${(profile.identity?.finishCode ?? 'foil').replace(/_/g, ' ')} for this card version`
            : 'Studio lighting · catalogue artwork'}</Text>
        <View style={styles.actions}>
          {request.onDetails ? <Pressable accessibilityRole="button" onPress={() => close(request.onDetails)} style={[styles.action, styles.primaryAction]}>
            <Text style={styles.primaryLabel}>Card details</Text><Ionicons name="chevron-forward" size={17} color={colors.text} /></Pressable> : null}
          {request.onQuickActions ? <Pressable accessibilityRole="button" accessibilityLabel="Card quick actions" onPress={() => close(request.onQuickActions)} style={styles.action}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.accentText} /><Text style={styles.actionLabel}>Card actions</Text>
          </Pressable> : null}
        </View>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 24, paddingRight: 12, minHeight: 56 },
  headingGroup: { flex: 1, alignItems: 'flex-start', gap: 3, paddingVertical: 6 },
  wordmark: { width: 84, height: 24, tintColor: colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  heading: { fontSize: 9, lineHeight: 13, fontWeight: '700', letterSpacing: 2.5, color: colors.accentText },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flexGrow: 1, paddingBottom: 10, justifyContent: 'center' },
  landscapeContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  landscapeStage: { flexShrink: 0 },
  landscapeDetails: { flex: 1, maxWidth: 440 },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  caption: { alignItems: 'center', paddingHorizontal: 24, marginTop: 12, gap: 5 },
  name: { fontSize: 25, lineHeight: 31, fontWeight: '700', textAlign: 'center', color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  hint: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12, paddingHorizontal: 16 },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, paddingHorizontal: 10,
    paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(250,249,252,0.025)' },
  controlActive: { borderColor: 'rgba(105,56,245,0.65)', backgroundColor: 'rgba(105,56,245,0.14)' },
  controlLabel: { fontSize: 12, fontWeight: '600', color: colors.text },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  disclosure: { marginTop: 8, paddingHorizontal: 24, fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12, paddingHorizontal: 16 },
  action: { minHeight: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  primaryAction: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
