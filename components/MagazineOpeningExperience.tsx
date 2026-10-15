import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { CorocoroIssueRecord } from '../lib/corocoroIssueArchive';
import { useCardMotionPreference } from '../lib/cardMotionPreference';
import { getCuratedPokemonCardById } from '../lib/curatedPokemonCatalogue';
import { magazineOpeningAction, type MagazineOpening, type MagazineOpeningPhase } from '../lib/magazineOpenings';
import { getMagazineOpeningArtwork, magazineOpeningCollectionCard } from '../lib/magazineOpeningArtwork';
import { fetchCardById, type PokemonCard } from '../lib/pokemonTcg';
import { StackrButton } from './StackrControls';
import { StackrImage } from './StackrImage';
import { Text } from './Text';
import { useTheme } from './theme-context';

type CardReference = CorocoroIssueRecord['cards'][number];

/** A finite, replayable illustration. Opening never writes collection state. */
export function MagazineOpeningExperience({ opening, references, renderCollectionAction }: {
  opening: MagazineOpening;
  references: readonly CardReference[];
  renderCollectionAction?: (card: PokemonCard, reference: CardReference) => React.ReactNode;
}) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<MagazineOpeningPhase>('sealed');
  const phaseRef = useRef(phase);
  const [reduceMotion, setReduceMotion] = useState(true);
  const preference = useCardMotionPreference();
  const motionAllowed = !reduceMotion && preference.loaded && !preference.reduced;
  const [card, setCard] = useState<PokemonCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const clock = useRef(new Animated.Value(0)).current;
  const generation = useRef(0);
  const reference = references[selected];
  const id = reference?.mappedStackrCardId;
  const name = opening.cards[selected] ?? opening.cards[0];
  const localArtwork = getMagazineOpeningArtwork(opening.id, name);
  const packet = opening.kind === 'packet';

  const setOpeningPhase = (value: MagazineOpeningPhase) => {
    phaseRef.current = value;
    setPhase(value);
  };
  const reveal = () => {
    generation.current += 1;
    clock.stopAnimation();
    clock.setValue(1);
    setOpeningPhase('revealed');
  };
  const reset = (index = selected) => {
    generation.current += 1;
    clock.stopAnimation();
    clock.setValue(0);
    setSelected(index);
    setOpeningPhase('sealed');
  };
  const open = () => {
    // The ref also rejects two taps delivered before React commits the busy state.
    if (phaseRef.current !== 'sealed') return;
    if (!motionAllowed || AppState.currentState !== 'active') { reveal(); return; }
    const token = ++generation.current;
    setOpeningPhase('opening');
    Animated.timing(clock, {
      toValue: 1, duration: packet ? 2300 : 1800,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }).start(({ finished }) => {
      if (finished && token === generation.current) setOpeningPhase('revealed');
    });
  };

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active' && phaseRef.current === 'opening') {
        generation.current += 1;
        clock.stopAnimation(); clock.setValue(1);
        phaseRef.current = 'revealed'; setPhase('revealed');
      }
    });
    return () => { active = false; generation.current += 1; clock.stopAnimation(); motion.remove(); app.remove(); };
  }, [clock]);
  useEffect(() => {
    if (!motionAllowed && phaseRef.current === 'opening') {
      generation.current += 1; clock.stopAnimation(); clock.setValue(1);
      phaseRef.current = 'revealed'; setPhase('revealed');
    }
  }, [clock, motionAllowed]);
  useEffect(() => {
    let active = true;
    const fallback = id ? getCuratedPokemonCardById(id, 'ja') : null;
    setCard(fallback); setFailed(false); setLoading(!!id);
    if (!id) return;
    void fetchCardById(id, { language: 'ja' }).then(result => {
      // A response for a different card or language cannot be used by the reveal.
      if (active && result?.id === id && result.language === 'ja'
        && (!fallback?.set?.id || result.set?.id === fallback.set.id)
        && (!fallback?.number || result.number === fallback.number)) setCard(result);
      else if (active && !fallback) setFailed(true);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);

  const value = (inputRange: number[], outputRange: number[] | string[]) =>
    clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const revealed = phase === 'revealed';
  const canAdd = revealed && reference && !!id && card?.id === id && card.language === 'ja' && !!card.set?.id;
  const cardFallback = <View style={styles.artFallback}>
    <Text style={[styles.cardName, { color: theme.colors.text }]}>{name}</Text>
    <Text style={[styles.caption, { color: theme.colors.textSoft }]}>{loading ? 'Loading artwork…' : 'Artwork not available yet'}</Text>
  </View>;
  return <View style={[styles.experience, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
    <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header">A little piece of Pokémon history</Text>
    <Text style={[styles.caption, { color: theme.colors.textSoft }]}>{opening.edition} · {packet ? 'Paper packet' : 'Peel-off insert'}</Text>
    {opening.cards.length > 1 ? <View style={styles.choices}>{opening.cards.map((item, index) =>
      <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Choose ${item}`}
        accessibilityState={{ selected: selected === index, disabled: phase === 'opening' }}
        disabled={phase === 'opening'} onPress={() => reset(index)}
        style={[styles.choice, { backgroundColor: selected === index ? theme.colors.primary : theme.colors.surface,
          borderColor: selected === index ? theme.colors.primary : theme.colors.border }]}>
        <Text style={{ color: selected === index ? '#FFFFFF' : theme.colors.text, fontWeight: '700' }}>{item}</Text>
      </Pressable>)}</View> : null}
    <View style={[styles.table, { backgroundColor: theme.colors.surface }]}>
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.tableRing} />
      <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.paper, { opacity: value([0, .68, 1], [1, 1, .15]),
          transform: [{ rotate: '-3deg' }, { scale: value([0, 1], [1, .97]) }] }]}>
        <StackrImage source={require('../assets/rev2/01-brand/logos/stackr-wordmark-transparent.png')}
          style={styles.wordmark} contentFit="contain" transition={0} />
        <Text style={styles.paperEdition}>{opening.edition}</Text>
        <View style={styles.sheetSlots}>{opening.cards.map(item => <View key={item} style={styles.sheetSlot}>
          <View style={styles.backStar}><Text style={styles.star}>✦</Text></View>
        </View>)}</View>
        {opening.accessories.length ? <View style={styles.counters}>{opening.accessories.map(item =>
          <View key={item} style={styles.counter}><Text style={styles.counterLabel}>{item}</Text></View>)}</View> : null}
        <Text style={styles.paperCaption}>{opening.copies > 1 ? `${opening.copies} copies inside` : 'A special magazine moment'}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.cardBack, { opacity: value([0, .48, .72, 1], [1, 1, 0, 0]), transform: [
          { perspective: 850 }, { translateY: value([0, .5, 1], [0, -18, -65]) },
          { rotateX: value([0, .55, 1], ['0deg', packet ? '0deg' : '-28deg', packet ? '0deg' : '-95deg']) },
          { rotateY: value([0, .5, 1], ['0deg', packet ? '0deg' : '-50deg', packet ? '0deg' : '-160deg']) },
          { rotate: '-3deg' },
        ] }]}><View style={styles.backBorder}><Text style={styles.backWordmark}>stackr</Text><Text style={styles.backSpark}>✦</Text></View></Animated.View>
      {packet ? <>
        <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.packetFront, { opacity: value([0, .62, .8], [1, 1, 0]), transform: [
            { perspective: 850 }, { rotateX: value([0, .35, .7, 1], ['0deg', '0deg', '-85deg', '-110deg']) },
            { translateY: value([0, .65, 1], [0, 45, 80]) },
          ] }]}>
          <Text style={styles.packetLabel}>A special card, waiting inside.</Text><Text style={styles.packetSpark}>✦</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.tearStrip, { opacity: value([0, .3, .45], [1, 1, 0]), transform: [
            { translateY: value([0, .3, .6, 1], [0, 130, 220, 220]) },
            { rotate: value([0, .3, 1], ['0deg', '13deg', '20deg']) },
          ] }]}><Text style={styles.stripArrow}>↓</Text></Animated.View>
      </> : <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.peelCorner, { opacity: value([0, .35, .6], [1, 1, 0]), transform: [
          { translateY: value([0, .6, 1], [0, 70, 160]) }, { rotate: value([0, 1], ['-4deg', '30deg']) },
        ] }]}><Text style={styles.cornerArrow}>↘</Text></Animated.View>}
      <Animated.View pointerEvents="none" accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        style={[styles.face, { opacity: value([0, .62, 1], [0, 0, 1]), transform: [
          { translateY: value([0, .6, 1], [30, 14, -12]) }, { scale: value([0, .6, 1], [.92, .92, 1]) },
        ] }]}>
        {opening.copies > 1 ? [0, 1, 2].map(index => <View key={index} style={[styles.fanCard,
          { transform: [{ rotate: `${(index - 1) * 9}deg` }, { translateX: (index - 1) * 12 }] }]} />) : null}
        <StackrImage source={localArtwork} uri={localArtwork ? null : card?.images?.small} fullUri={localArtwork ? null : card?.images?.large} style={styles.cardImage} transition={0}
          contentFit="contain" accessibilityLabel={`${name}, Japanese magazine promo`} fallback={cardFallback} />
      </Animated.View>
    </View>
    <Text style={[styles.selectedName, { color: theme.colors.text }]}>{name}</Text>
    <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: theme.colors.textSoft }]}>
      {revealed ? `${name} revealed${opening.copies > 1 ? ` · Original packet: ${opening.copies} copies` : ''}.`
        : phase === 'opening' ? packet ? 'Opening the paper packet…' : 'Lifting the card from its sheet…'
          : packet ? 'Open the sleeve to reveal the card.' : 'Choose a card, then lift it from the sheet.'}
    </Text>
    {opening.accessories.length ? <Text style={[styles.caption, { color: theme.colors.textSoft }]}>Also included: {opening.accessories.join(' · ')}.</Text> : null}
    {!revealed ? <StackrButton label={magazineOpeningAction(opening.kind)} onPress={open} variant="primary" disabled={phase === 'opening'} /> : null}
    {phase === 'opening' ? <StackrButton label="Skip animation" onPress={reveal} variant="ghost" /> : null}
    {canAdd && renderCollectionAction ? renderCollectionAction(magazineOpeningCollectionCard(opening.id, card), reference) : null}
    {revealed && !canAdd ? <Text style={[styles.caption, { color: theme.colors.textSoft }]}>
      Adding this Japanese edition isn’t available yet. You can still explore and replay its opening.
    </Text> : null}
    {failed ? <StackrButton label="Retry card artwork" onPress={() => setAttempt(value => value + 1)} variant="ghost" /> : null}
    {revealed ? <StackrButton label="Replay opening" onPress={() => reset()} variant="secondary" /> : null}
    <Text style={[styles.disclosure, { color: theme.colors.textSoft }]}>{opening.interpretation} Opening a packet does not add cards to your collection.</Text>
  </View>;
}

const styles = StyleSheet.create({
  experience: { padding: 18, borderWidth: 1, borderRadius: 24, gap: 12, maxWidth: 620, width: '100%' },
  heading: { fontSize: 21, fontWeight: '900', lineHeight: 28 }, caption: { fontSize: 14, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1, justifyContent: 'center', flexShrink: 1 },
  table: { height: 410, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tableRing: { width: 320, height: 320, position: 'absolute', borderWidth: 1, borderRadius: 160, borderColor: '#DACDF0' },
  paper: { position: 'absolute', width: '88%', maxWidth: 360, height: 340, borderRadius: 14, padding: 18, backgroundColor: '#FFFCF3', borderColor: '#D9CDB5', borderWidth: 2,
    shadowColor: '#433650', shadowOffset: { width: 0, height: 9 }, shadowOpacity: .16, shadowRadius: 0, elevation: 3, gap: 9 },
  wordmark: { height: 28, width: 105 }, paperEdition: { color: '#5A5065', fontSize: 12, fontWeight: '700' },
  sheetSlots: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 10, alignContent: 'center', justifyContent: 'center' },
  sheetSlot: { width: '40%', height: 90, borderColor: '#D0C1E2', borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  backStar: { width: 34, height: 43, backgroundColor: '#EEE7FF', borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, star: { color: '#6938F5', fontSize: 24 },
  counters: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  counter: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9CDB5', borderRadius: 30, padding: 7, backgroundColor: '#F0EADB' }, counterLabel: { fontSize: 8, color: '#5A5065' },
  paperCaption: { color: '#5A5065', fontSize: 11, textAlign: 'center' },
  cardBack: { position: 'absolute', width: 184, height: 258, padding: 9, borderRadius: 12, backgroundColor: '#6938F5', borderWidth: 2, borderColor: '#4B346B' },
  backBorder: { flex: 1, borderRadius: 8, borderWidth: 2, borderColor: '#C6AEFF', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backWordmark: { color: '#FFFFFF', fontWeight: '900', fontSize: 30, letterSpacing: -1 }, backSpark: { color: '#EEE7FF', fontSize: 62 },
  packetFront: { position: 'absolute', width: 220, height: 250, backgroundColor: '#EEE7FF', borderWidth: 2, borderColor: '#C6AEFF', borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 20 },
  packetLabel: { color: '#4B346B', fontSize: 20, fontWeight: '900', textAlign: 'center' }, packetSpark: { color: '#6938F5', fontSize: 60 },
  tearStrip: { position: 'absolute', width: 24, height: 265, marginLeft: 201, borderWidth: 1, borderStyle: 'dashed', borderColor: '#6938F5', backgroundColor: '#DACDF0', borderRadius: 5, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 15 },
  stripArrow: { color: '#4B346B', fontSize: 24 },
  peelCorner: { position: 'absolute', marginLeft: 156, marginTop: -235, width: 43, height: 43, backgroundColor: '#FFFCF3', borderWidth: 1, borderColor: '#D9CDB5', borderBottomLeftRadius: 30, alignItems: 'center' },
  cornerArrow: { color: '#6938F5', fontSize: 24 },
  face: { position: 'absolute', width: 205, height: 287 }, cardImage: { width: '100%', height: '100%' },
  fanCard: { position: 'absolute', width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#6938F5', borderWidth: 2, borderColor: '#C6AEFF' },
  artFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#DACDF0', backgroundColor: '#FAF9FC' },
  cardName: { fontSize: 22, fontWeight: '800', textAlign: 'center' }, selectedName: { fontSize: 19, fontWeight: '900' }, disclosure: { fontSize: 11, lineHeight: 17 },
});
