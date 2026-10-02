import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { canInspectCatalogueCard, type CardInspectionRequest } from '../lib/cardInspection';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import { VERIFIED_CARD_HOLO_MASKS } from '../lib/cardHoloMaskRegistry';
import { stackrCardImageSizes } from '../lib/stackrSizing';
import { stackrHaptics } from '../lib/haptics';
import { InteractiveCardPreview } from './InteractiveCardPreview';
import { StackrImage } from './StackrImage';
import { Text } from './Text';

const CardFoilSurface = lazy(() => import('./CardFoilSurface'));

class MaterialBoundary extends React.Component<{ children: React.ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function CardInspectionViewer({ request, onClose }: {
  request: CardInspectionRequest; onClose: (action?: () => void) => void;
}) {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height * 1.2;
  const insets = useSafeAreaInsets();
  const [resetKey, setResetKey] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [lighting, setLighting] = useState(true);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const profile = useMemo(() => resolveCardHoloProfile(request.card.raw_data, {
    cardId: request.card.id, selectedVariantId: request.selectedVariantId,
    languageCode: request.card.language, masks: VERIFIED_CARD_HOLO_MASKS,
  }), [request]);
  const availableHeight = height - insets.top - insets.bottom - (landscape ? 108 : Math.min(480, 382 * fontScale));
  const cardWidth = Math.max(Math.min(200, width - 64), Math.min(420, landscape ? width * 0.43 : width - 64, availableHeight * stackrCardImageSizes.cardAspectRatio));
  const cardHeight = cardWidth / stackrCardImageSizes.cardAspectRatio;
  const motionEnabled = !reduced && !motionPaused && imageLoaded;
  const hasFoil = profile.profile !== 'plain' && profile.material.foilStrength > 0;
  const lightingEnabled = lighting && imageLoaded && !unavailable;
  const hint = reduced ? 'Motion is off with Reduce Motion.'
    : motionPaused ? 'Motion paused. Take in every detail.'
      : Platform.OS === 'web' ? 'Drag slowly to turn the card in the light.'
        : 'Tilt your phone or drag slowly to catch the light.';
  if (!canInspectCatalogueCard(request)) return null;
  return <Modal visible animationType="none" presentationStyle="overFullScreen" statusBarTranslucent
    onRequestClose={() => onClose()} supportedOrientations={['portrait', 'landscape']}>
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal
      onAccessibilityEscape={() => onClose()}>
      <StatusBar style="light" />
      <LinearGradient pointerEvents="none" colors={['#39304D', '#211C31', '#171522']} locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <View style={styles.headingGroup}><Ionicons name="layers-outline" size={19} color="#D5C6F3" />
          <Text style={styles.heading}>Card showcase</Text></View>
        <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Report a card issue" onPress={() => onClose(() => router.push({ pathname: '/help', params: {
          screen: 'Card inspection', cardId: request.card.id, setId: request.card.setId ?? '',
          language: request.card.language ?? '', finish: profile.identity?.finishCode ?? '', variantId: request.selectedVariantId ?? '',
        } }))} style={styles.iconButton}><Ionicons name="flag-outline" size={18} color="#B5A7C6" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close card inspection" onPress={() => onClose()} style={styles.iconButton}>
          <Ionicons name="close" size={23} color="#F4F0FA" />
        </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, landscape && styles.landscapeContent]} bounces={false}>
        <View style={[styles.stage, landscape && styles.landscapeStage, { minHeight: cardHeight + 32 }]}>
          <View pointerEvents="none" accessible={false} style={[styles.stageLight, { width: cardWidth * 0.84, height: cardHeight * 0.82 }]} />
          <View style={{ width: cardWidth, height: cardHeight }}>
            <InteractiveCardPreview resetKey={resetKey} onMotionPreference={setReduced} motionPaused={motionPaused || !imageLoaded}
              foilHaptics={hasFoil && lightingEnabled}
              renderMaterial={light => lightingEnabled ? <MaterialBoundary onUnavailable={onUnavailable}>
                <Suspense fallback={null}><CardFoilSurface {...light} source="catalogue" profile={profile}
                  width={cardWidth} height={cardHeight} onUnavailable={onUnavailable}
                  artworkUri={fullLoaded ? request.fullImageUri ?? request.imageUri : request.imageUri} /></Suspense>
              </MaterialBoundary> : null}>
              <StackrImage cardShape uri={request.imageUri} fullUri={request.fullImageUri} contentFit="contain"
                rounded={14} placeholderColor="transparent" priority="high" transition={0} style={StyleSheet.absoluteFill}
                accessibilityLabel={`${request.card.name ?? 'Pokémon card'}, catalogue artwork`}
                onLoad={() => setImageLoaded(true)} onError={() => setImageLoaded(false)} />
              {imageLoaded && request.fullImageUri && request.fullImageUri !== request.imageUri ?
                <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { opacity: fullLoaded ? 1 : 0 }]}>
                  <StackrImage cardShape uri={request.fullImageUri} contentFit="contain" rounded={14} priority="high" transition={0}
                    placeholderColor="transparent" style={StyleSheet.absoluteFill} showFallbackIcon={false} onLoad={() => setFullLoaded(true)} />
                </View> : null}
            </InteractiveCardPreview>
          </View>
        </View>
        <View style={landscape ? styles.landscapeDetails : undefined}>
        <View style={styles.caption}>
          <Text style={styles.name}>{request.card.name ?? 'Pokémon card'}</Text>
          {request.subtitle ? <Text style={styles.subtitle}>{request.subtitle}</Text> : null}
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Recenter card and light" disabled={!motionEnabled}
            accessibilityState={{ disabled: !motionEnabled }} onPress={() => { setResetKey(value => value + 1); void stackrHaptics.selection(); }}
            style={({ pressed }) => [styles.control, !motionEnabled && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name="scan-outline" size={21} color="#E1D5F6" /><Text style={styles.controlLabel}>Recenter</Text>
          </Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel="Card motion" disabled={reduced}
            accessibilityState={{ checked: motionEnabled, disabled: reduced }}
            onPress={() => { setMotionPaused(value => !value); void stackrHaptics.selection(); }}
            style={({ pressed }) => [styles.control, motionEnabled && styles.controlActive, reduced && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name={motionEnabled ? 'phone-portrait-outline' : 'pause-outline'} size={21} color="#E1D5F6" />
            <Text style={styles.controlLabel}>{motionEnabled ? 'Motion on' : 'Motion off'}</Text>
          </Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel="Simulated lighting" disabled={!motionEnabled || unavailable || !imageLoaded}
            accessibilityState={{ checked: lightingEnabled && motionEnabled, disabled: !motionEnabled || unavailable || !imageLoaded }}
            onPress={() => { setLighting(value => !value); void stackrHaptics.selection(); }}
            style={({ pressed }) => [styles.control, lightingEnabled && motionEnabled && styles.controlActive,
              (!motionEnabled || unavailable || !imageLoaded) && styles.disabled, pressed && styles.pressed]}>
            <Ionicons name="sunny-outline" size={21} color="#E1D5F6" />
            <Text style={styles.controlLabel}>{lightingEnabled && motionEnabled ? 'Light on' : 'Light off'}</Text>
          </Pressable>
        </View>
        <Text style={styles.disclosure}>{unavailable ? 'Lighting is unavailable. Your artwork is still here.'
          : profile.confidence === 'verified_finish_generic_mask' ? 'Simulated foil · pattern may differ from the physical card'
            : 'Catalogue artwork · simulated lighting'}</Text>
        <View style={styles.actions}>
          {request.onDetails ? <Pressable accessibilityRole="button" onPress={() => onClose(request.onDetails)} style={[styles.action, styles.primaryAction]}>
            <Text style={styles.primaryLabel}>Card details</Text><Ionicons name="chevron-forward" size={17} color="#29203A" /></Pressable> : null}
          {request.onQuickActions ? <Pressable accessibilityRole="button" accessibilityLabel="Card quick actions" onPress={() => onClose(request.onQuickActions)} style={styles.action}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#DED2EF" /><Text style={styles.actionLabel}>Card actions</Text>
          </Pressable> : null}
        </View>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#211C31' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 24, paddingRight: 12, minHeight: 56 },
  headingGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  heading: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#E7DFF1' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flexGrow: 1, paddingBottom: 10, justifyContent: 'center' },
  landscapeContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  landscapeStage: { paddingHorizontal: 24, flexShrink: 0 },
  landscapeDetails: { flex: 1, maxWidth: 440 },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  stageLight: { position: 'absolute', borderRadius: 140, backgroundColor: '#443557', opacity: 0.32,
    shadowColor: '#A68AC5', shadowOpacity: 0.22, shadowRadius: 70, shadowOffset: { width: 0, height: 0 } },
  caption: { alignItems: 'center', paddingHorizontal: 24, marginTop: 12, gap: 5 },
  name: { fontSize: 25, lineHeight: 31, fontWeight: '700', textAlign: 'center', color: '#F4F0FA' },
  subtitle: { fontSize: 13, lineHeight: 18, color: '#C2B5D2', textAlign: 'center' },
  hint: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#CBBEDA', textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12, paddingHorizontal: 16 },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, paddingHorizontal: 10,
    paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(218,202,239,0.16)', backgroundColor: 'rgba(230,215,248,0.035)' },
  controlActive: { borderColor: 'rgba(218,202,239,0.32)', backgroundColor: 'rgba(210,181,245,0.11)' },
  controlLabel: { fontSize: 12, fontWeight: '600', color: '#E1D5F6' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  disclosure: { marginTop: 8, paddingHorizontal: 24, fontSize: 11, lineHeight: 16, color: '#B5A7C6', textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12, paddingHorizontal: 16 },
  action: { minHeight: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(218,202,239,0.2)',
    flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#DED2EF', fontSize: 13, fontWeight: '600' },
  primaryAction: { backgroundColor: '#E7DCF7', borderColor: '#E7DCF7' },
  primaryLabel: { color: '#29203A', fontSize: 13, fontWeight: '700' },
});
