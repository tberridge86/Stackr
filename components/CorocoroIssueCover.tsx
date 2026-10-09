import React from 'react';
import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { CorocoroIssueGroup } from '../lib/corocoroIssueArchive';
import { getCorocoroIssueCoverPresentation } from '../lib/corocoroCoverReferences';
import { StackrImage } from './StackrImage';
import { Text } from './Text';
import { getCorocoroSuppliedCover } from '../lib/corocoroSuppliedCovers';

/** The resolver separates source-page pointers from displayable exact-issue covers. */
export function CorocoroIssueCover({ issueGroup, showSources = true }: { issueGroup: CorocoroIssueGroup; showSources?: boolean }) {
  const supplied = getCorocoroSuppliedCover(issueGroup.id);
  const presentation = getCorocoroIssueCoverPresentation(issueGroup.id, {
    development: __DEV__, platform: Platform.OS,
    hostname: typeof window === 'undefined' ? '' : window.location.hostname,
    sourceEnabled: process.env.EXPO_PUBLIC_COROCORO_COVER_REFERENCES_ENABLED !== 'false',
  });
  const cover = presentation.image;
  const month = new Date(`${issueGroup.issueMonth}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const placeholder = <View style={styles.placeholder}><Text style={styles.label}>ISSUE RECORD</Text><Text style={styles.publication} numberOfLines={2}>{issueGroup.publication}</Text><View style={styles.rule} /><Text style={styles.month}>{month}</Text><Text style={styles.year}>{issueGroup.issueMonth.slice(0, 4)}</Text><Text style={styles.caption}>PLACEHOLDER · NO COVER</Text></View>;
  const links = [...presentation.alternativeSources, ...(presentation.source ? [presentation.source] : [])];
  return <View style={styles.root}>
    <View style={styles.art}>{supplied || cover ? <StackrImage source={supplied} uri={supplied ? undefined : cover?.imageUrl} contentFit="contain" style={styles.fill} accessibilityLabel={supplied ? `${issueGroup.publication}, ${issueGroup.issueMonth} supplied cover` : cover?.alt} showFallbackIcon={false} fallback={placeholder} /> : placeholder}</View>
    {showSources && <Text style={styles.source}>{supplied ? 'Supplied reference cover' : presentation.caption}</Text>}
    {showSources && links.map((source) => <Link key={source.url} href={source.url as `https://${string}`} target="_blank" rel="noopener noreferrer" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={source.label} onPress={(event) => event.stopPropagation()}>
        <Text style={styles.source}>{source.label} ↗</Text>
      </Pressable>
    </Link>)}
  </View>;
}
const styles = StyleSheet.create({ root: { width: '100%', height: '100%', gap: 3 }, art: { flex: 1, overflow: 'hidden', borderRadius: 7 }, fill: { width: '100%', height: '100%' }, placeholder: { flex: 1, width: '100%', height: '100%', padding: 10, backgroundColor: '#DFD6C5', borderLeftWidth: 6, borderLeftColor: '#BEB29B', justifyContent: 'center', gap: 3 }, label: { color: '#887A65', fontSize: 7, letterSpacing: 1, fontWeight: '800' }, publication: { color: '#534638', fontSize: 12, lineHeight: 14, fontWeight: '900' }, rule: { height: 1, backgroundColor: '#BBAE98', marginVertical: 3 }, month: { color: '#64503D', fontSize: 16, lineHeight: 19, fontWeight: '800' }, year: { color: '#64503D', fontSize: 24, lineHeight: 28, fontWeight: '900' }, caption: { color: '#887A65', fontSize: 7, lineHeight: 9, marginTop: 2 }, source: { color: '#6938B7', fontSize: 10, lineHeight: 13, paddingVertical: 3 } });
