import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCardMotionPreference } from '../lib/cardMotionPreference';
import { formatCorocoroIssueGroup, type CorocoroIssueGroup } from '../lib/corocoroIssueArchive';
import { getCorocoroSuppliedCover } from '../lib/corocoroSuppliedCovers';
import { StackrImage } from './StackrImage';
import { Text } from './Text';
import { useTheme } from './theme-context';

/** Optional cover entrance; browsing and collection controls remain available throughout. */
export function CorocoroIssueOpening({ issue }: { issue: CorocoroIssueGroup }) {
  const { theme } = useTheme();
  const preference = useCardMotionPreference();
  const [systemReduced, setSystemReduced] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const source = getCorocoroSuppliedCover(issue.id);
  const reduced = !preference.loaded || preference.reduced || systemReduced;
  const settle = React.useCallback(() => {
    generation.current += 1;
    animation.current?.stop();
    animation.current = null;
    progress.setValue(1);
    if (mounted.current) setPhase('open');
  }, [progress]);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    const appState = AppState.addEventListener('change', state => { if (state !== 'active') settle(); });
    return () => {
      active = false;
      mounted.current = false;
      generation.current += 1;
      animation.current?.stop();
      motion.remove();
      appState.remove();
    };
  }, [settle]);
  useFocusEffect(React.useCallback(() => () => { settle(); }, [settle]));
  useEffect(() => { if (reduced && phase === 'opening') settle(); }, [reduced, phase, settle]);
  const open = () => {
    if (phase === 'opening' || !source || !ready || failed) return;
    if (reduced) { settle(); return; }
    const run = ++generation.current;
    progress.setValue(0);
    setPhase('opening');
    animation.current = Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    animation.current.start(({ finished }) => { if (finished && mounted.current && generation.current === run) settle(); });
  };
  return <View style={[styles.root, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    {source && !failed ? <View style={[styles.stage, phase === 'open' && styles.settledStage]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.paper, { backgroundColor: theme.colors.card }]} />
      <Animated.View style={[styles.hinge, { opacity: progress.interpolate({ inputRange: [0, .72, 1], outputRange: [1, 1, 0] }),
        transform: [{ perspective: 1100 }, { translateX: 96 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) }] }]}>
        <View style={styles.cover}><StackrImage source={source} style={styles.image} contentFit="contain" transition={0}
          onLoad={() => setReady(true)} onError={() => { setFailed(true); settle(); }} /></View>
      </Animated.View>
    </View> : null}
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 20 }}>
      {phase === 'opening' ? `Opening ${formatCorocoroIssueGroup(issue)}…`
        : failed ? 'Cover unavailable. The issue and its cards are ready to browse.'
          : phase === 'open' ? 'Ready to browse. Opening does not mark any card owned.'
            : source ? 'Open the real issue cover, then browse the cards below.' : 'No verified cover yet. Browse the documented cards below.'}
    </Text>
    <View style={styles.actions}>
      {source && !failed ? <Pressable accessibilityRole="button" accessibilityLabel={phase === 'open' ? 'Replay magazine opening' : 'Open magazine cover'}
        disabled={!ready || phase === 'opening'} onPress={open} style={styles.button}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{phase === 'open' ? 'Replay opening' : ready ? 'Open cover' : 'Loading cover…'}</Text>
      </Pressable> : null}
      {phase !== 'open' ? <Pressable accessibilityRole="button" accessibilityLabel="Skip magazine opening" onPress={settle} style={styles.button}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Browse cards</Text>
      </Pressable> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  stage: { height: 300, width: 240, maxWidth: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  settledStage: { height: 0, opacity: 0, overflow: 'hidden' },
  paper: { position: 'absolute', width: 192, height: 280, borderRadius: 3, borderWidth: 1, borderColor: '#CFC5B6' },
  hinge: { position: 'absolute', width: 192, height: 280, backfaceVisibility: 'hidden' },
  cover: { width: 192, height: 280, transform: [{ translateX: -96 }] },
  image: { width: '100%', height: '100%' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
});
