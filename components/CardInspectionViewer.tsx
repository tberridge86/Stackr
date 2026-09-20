import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canInspectCatalogueCard, type CardInspectionRequest } from '../lib/cardInspection';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';
import { VERIFIED_CARD_HOLO_MASKS } from '../lib/cardHoloMaskRegistry';
import { stackrCardImageSizes } from '../lib/stackrSizing';
import { stackrSemanticColors } from '../lib/theme';
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
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height * 1.2;
  const insets = useSafeAreaInsets();
  const [resetKey, setResetKey] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const profile = useMemo(() => resolveCardHoloProfile(request.card.raw_data, {
    cardId: request.card.id, selectedVariantId: request.selectedVariantId,
    languageCode: request.card.language, masks: VERIFIED_CARD_HOLO_MASKS,
  }), [request]);
  const availableHeight = height - insets.top - insets.bottom - (landscape ? 104 : Math.min(440, 304 * fontScale));
  const cardWidth = Math.max(96, Math.min(420, landscape ? width * 0.43 : width - 64, availableHeight * stackrCardImageSizes.cardAspectRatio));
  const cardHeight = cardWidth / stackrCardImageSizes.cardAspectRatio;
  if (!canInspectCatalogueCard(request)) return null;
  return <Modal visible animationType="none" presentationStyle="overFullScreen" statusBarTranslucent
    onRequestClose={() => onClose()} supportedOrientations={['portrait', 'landscape']}>
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal
      onAccessibilityEscape={() => onClose()}>
      <View style={styles.header}>
        <Text style={styles.heading}>Card inspection</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close card inspection" onPress={() => onClose()} style={styles.iconButton}>
          <Ionicons name="close" size={25} color={stackrSemanticColors.textPrimary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, landscape && styles.landscapeContent]} bounces={false}>
        <View style={[styles.stage, landscape && styles.landscapeStage, { minHeight: cardHeight + 32 }]}>
          <View style={{ width: cardWidth, height: cardHeight }}>
            <InteractiveCardPreview resetKey={resetKey} onMotionPreference={setReduced}
              renderMaterial={light => imageLoaded && !unavailable ? <MaterialBoundary onUnavailable={onUnavailable}>
                <Suspense fallback={null}><CardFoilSurface {...light} source="catalogue" profile={profile}
                  width={cardWidth} height={cardHeight} onUnavailable={onUnavailable} /></Suspense>
              </MaterialBoundary> : null}>
              <StackrImage uri={request.imageUri} fullUri={request.fullImageUri} contentFit="contain"
                rounded={14} priority="high" transition={0} style={StyleSheet.absoluteFill}
                accessibilityLabel={`${request.card.name ?? 'Pokémon card'}, catalogue artwork`}
                onLoad={() => setImageLoaded(true)} onError={() => setImageLoaded(false)} />
              {imageLoaded && request.fullImageUri && request.fullImageUri !== request.imageUri ?
                <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { opacity: fullLoaded ? 1 : 0 }]}>
                  <StackrImage uri={request.fullImageUri} contentFit="contain" rounded={14} priority="high" transition={0}
                    style={StyleSheet.absoluteFill} showFallbackIcon={false} onLoad={() => setFullLoaded(true)} />
                </View> : null}
            </InteractiveCardPreview>
          </View>
        </View>
        <View style={landscape ? styles.landscapeDetails : undefined}>
        <View style={styles.caption}>
          <Text style={styles.name}>{request.card.name ?? 'Pokémon card'}</Text>
          {request.subtitle ? <Text style={styles.subtitle}>{request.subtitle}</Text> : null}
          <Text style={styles.hint}>{reduced ? 'Motion effects are off with Reduce Motion.' : Platform.OS === 'web' ? 'Drag the card to turn it in the light.' : 'Tilt your phone or drag the card to move the light.'}</Text>
          <Text style={styles.disclosure}>Catalogue artwork · simulated lighting</Text>
          {unavailable ? <Text style={styles.hint}>Interactive lighting is unavailable on this device.</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Recenter card and light" onPress={() => setResetKey(value => value + 1)} style={styles.action}>
            <Ionicons name="refresh-outline" size={18} color={stackrSemanticColors.brand} /><Text style={styles.actionLabel}>Recenter</Text>
          </Pressable>
          {request.onDetails ? <Pressable accessibilityRole="button" onPress={() => onClose(request.onDetails)} style={styles.action}><Text style={styles.actionLabel}>Card details</Text></Pressable> : null}
          {request.onQuickActions ? <Pressable accessibilityRole="button" accessibilityLabel="Card quick actions" onPress={() => onClose(request.onQuickActions)} style={styles.action}>
            <Ionicons name="ellipsis-horizontal" size={18} color={stackrSemanticColors.brand} /><Text style={styles.actionLabel}>Card actions</Text>
          </Pressable> : null}
        </View>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2EFF7' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 24, paddingRight: 12, minHeight: 56 },
  heading: { fontSize: 16, fontWeight: '700', color: '#433650' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  content: { flexGrow: 1, paddingBottom: 20, justifyContent: 'center' },
  landscapeContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  landscapeStage: { paddingHorizontal: 24, flexShrink: 0 },
  landscapeDetails: { flex: 1, maxWidth: 440 },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  caption: { alignItems: 'center', paddingHorizontal: 24, marginTop: 14, gap: 5 },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center', color: '#433650' },
  subtitle: { fontSize: 13, color: '#696373', textAlign: 'center' },
  hint: { marginTop: 7, fontSize: 13, lineHeight: 19, color: '#5A5065', textAlign: 'center' },
  disclosure: { fontSize: 11, color: '#696373', textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18, paddingHorizontal: 16 },
  action: { minHeight: 46, paddingHorizontal: 15, borderRadius: 23, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#6938F5', fontSize: 13, fontWeight: '700' },
});
