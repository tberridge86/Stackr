import { Stack } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCardInspection } from '../../components/CardInspectionProvider';
import { Text } from '../../components/Text';
import { CARD_INSPECTION_LONG_PRESS_MS } from '../../lib/cardInspection';

// Original geometric study art. It is embedded only in this development route;
// no catalogue/network image, identity lookup, write, or query is involved.
const MATERIAL_STUDY_ART = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 630 880">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20153d"/><stop offset="1" stop-color="#6b407c"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fedc8b"/><stop offset="1" stop-color="#ea88c2"/></linearGradient></defs>
  <rect width="630" height="880" rx="36" fill="url(#b)"/><rect x="30" y="30" width="570" height="820" rx="22" fill="none" stroke="#f9e7b9" stroke-width="4"/>
  <circle cx="315" cy="330" r="190" fill="#34245a" stroke="url(#a)" stroke-width="14"/><path d="M170 408c80-192 212-250 302-88-88 115-195 166-302 88Z" fill="#65d8d0" opacity=".82"/>
  <circle cx="247" cy="282" r="40" fill="#ffe9b2"/><circle cx="385" cy="388" r="28" fill="#f59ed4"/><path d="M101 608h428M101 660h312M101 712h386" stroke="#eadcf1" stroke-width="18" stroke-linecap="round" opacity=".75"/>
  <text x="315" y="92" text-anchor="middle" fill="#fff2c4" font-family="sans-serif" font-size="34" font-weight="700">MATERIAL STUDY</text>
  <text x="315" y="810" text-anchor="middle" fill="#eadcf1" font-family="sans-serif" font-size="23">SYNTHETIC • LOCAL • DEVELOPMENT ONLY</text>
</svg>`)} `;

const IS_DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;

export default function CardInspectionDevelopmentScreen() {
  const { inspectCard } = useCardInspection();
  const [detailsCount, setDetailsCount] = useState(0);
  const [actionsCount, setActionsCount] = useState(0);

  const openStudy = useCallback(() => {
    if (!IS_DEVELOPMENT) return;
    inspectCard({
      source: 'catalogue',
      card: {
        id: 'synthetic-material-study-card',
        name: 'Material study',
        language: 'en',
      },
      imageUri: MATERIAL_STUDY_ART,
      fullImageUri: MATERIAL_STUDY_ART,
      subtitle: 'Synthetic fixture • not a catalogue card',
      onDetails: () => setDetailsCount(value => value + 1),
      onQuickActions: () => setActionsCount(value => value + 1),
    });
  }, [inspectCard]);

  return <View style={styles.screen}>
    <Stack.Screen options={{ title: 'Card material study' }} />
    {!IS_DEVELOPMENT ? <View style={styles.card}>
      <Text style={styles.title}>Unavailable</Text>
      <Text style={styles.copy}>This fixture route is available only in development builds.</Text>
    </View> : <>
      <Text style={styles.eyebrow}>DEVELOPMENT ONLY</Text>
      <Text style={styles.title}>Material study</Text>
      <Text style={styles.copy}>Synthetic fixture • not a catalogue card</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Open material study inspection" onPress={openStudy} style={styles.primary}>
        <Text style={styles.primaryLabel}>Open inspection</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Hold to open material study inspection" onLongPress={openStudy}
        delayLongPress={CARD_INSPECTION_LONG_PRESS_MS} style={styles.studyCard}>
        <View style={styles.orb} /><Text style={styles.holdLabel}>Press and hold to inspect</Text>
      </Pressable>
      <Text style={styles.state}>Details callback: {detailsCount} · Actions callback: {actionsCount}</Text>
      <Text style={styles.note}>This page has no catalogue requests, storage writes, or remote artwork.</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2EFF7', paddingHorizontal: 24, paddingTop: 32, alignItems: 'center' },
  eyebrow: { color: '#7A3D85', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 12 },
  title: { color: '#433650', fontSize: 30, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  copy: { color: '#696373', fontSize: 15, lineHeight: 22, marginTop: 7, textAlign: 'center' },
  primary: { backgroundColor: '#6938F5', borderRadius: 24, marginTop: 24, minHeight: 48, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  studyCard: { backgroundColor: '#34245A', borderRadius: 20, height: 280, marginTop: 26, overflow: 'hidden', padding: 24, width: 200, alignItems: 'center', justifyContent: 'flex-end', borderWidth: 2, borderColor: '#F9E7B9' },
  orb: { position: 'absolute', top: 42, width: 130, height: 130, borderRadius: 65, backgroundColor: '#65D8D0', opacity: 0.85, shadowColor: '#F59ED4', shadowOpacity: 0.7, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } },
  holdLabel: { color: '#FFF2C4', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  state: { color: '#5A5065', fontSize: 13, marginTop: 22, textAlign: 'center' },
  note: { color: '#696373', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: 42, padding: 24, width: '100%' },
});
