import { Link, Stack, router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MagazineCollectionAction } from '../components/MagazineCollectionAction';
import { MagazineOpeningExperience } from '../components/MagazineOpeningExperience';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { corocoroIssueEvidence, type CorocoroIssueRecord } from '../lib/corocoroIssueArchive';
import { getMagazineOpening, MAGAZINE_OPENINGS } from '../lib/magazineOpenings';

export default function MagazineOpeningsScreen() {
  const { theme } = useTheme();
  const [selected, setSelected] = useState('corocoro-2001-05');
  const opening = MAGAZINE_OPENINGS.find(item => item.id === selected) ?? MAGAZINE_OPENINGS[0];
  const record = corocoroIssueEvidence.issues.find(item => item.id === opening.issueId);
  // Fan Club is a separate publication, not a fabricated CoroCoro issue. Its
  // four copies are packaging history; they do not multiply a collection save.
  const references: CorocoroIssueRecord['cards'] = record && getMagazineOpening(record)
    ? record.cards : opening.cards.map(name => ({ name, nativeName: null, printedNumber: null,
      numbering: 'unnumbered', format: 'standard', mappedStackrCardId: null }));
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <Stack.Screen options={{ headerShown: false, title: 'Magazine openings' }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/corocoro')} style={styles.back}>
        <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Back</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Little moments. Big nostalgia.</Text>
      <Text style={[styles.intro, { color: theme.colors.textSoft }]}>Peel an early promo, explore a card sheet, or open a paper packet. Each opening celebrates the magazine it came from.</Text>
      <View style={styles.choices}>{MAGAZINE_OPENINGS.map(item => <Pressable key={item.id}
        accessibilityRole="button" accessibilityState={{ selected: selected === item.id }}
        accessibilityLabel={`Open ${item.publication}, ${item.edition}`} onPress={() => setSelected(item.id)}
        style={[styles.choice, { backgroundColor: selected === item.id ? theme.colors.primary : theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={{ color: selected === item.id ? '#FFFFFF' : theme.colors.text, fontWeight: '800' }}>{item.edition}</Text>
        <Text style={{ color: selected === item.id ? '#FFFFFF' : theme.colors.textSoft, fontSize: 12 }}>{item.cards.join(' · ')}</Text>
      </Pressable>)}</View>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{opening.publication}</Text>
      <MagazineOpeningExperience key={opening.id} opening={opening} references={references}
        renderCollectionAction={(card) => <MagazineCollectionAction key={card.id} card={card} />} />
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 19 }}>The illustrated packaging is a Stackr recreation. Some editions are available to explore while their collection entry is being checked.</Text>
      <View style={{ gap: 8 }}>{opening.sources.map((url, index) => <Link key={url} href={url as `https://${string}`}
        target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.primary, paddingVertical: 12 }}>Opening reference {index + 1}</Link>)}</View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 70, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' },
  back: { minHeight: 48, justifyContent: 'center' }, title: { fontSize: 32, lineHeight: 39, fontWeight: '900' },
  intro: { fontSize: 15, lineHeight: 23 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { padding: 14, borderWidth: 1, borderRadius: 16, minHeight: 60, flexBasis: 220, flexGrow: 1, flexShrink: 1, gap: 5 },
});
