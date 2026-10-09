import { StackrLoadingIndicator } from '../components/StackrLoadingIndicator';
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CorocoroIssueCover } from '../components/CorocoroIssueCover';
import { StackrImage } from '../components/StackrImage';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import {
  formatCorocoroIssueMonth as issueLabel, getCorocoroIssueGroup, getCorocoroIssuesForPublication,
  getCorocoroPublicationSummaries, type CorocoroIssueRecord,
} from '../lib/corocoroIssueArchive';
import { getCuratedPokemonCardById } from '../lib/curatedPokemonCatalogue';
import { fetchCardById, type PokemonCard } from '../lib/pokemonTcg';

const distributionLabels: Record<string, string> = {
  insert: 'Magazine insert', mail_in_prize_draw: 'Mail-in prize draw',
  ticket_exchange: 'Ticket exchange', paid_applicant_order: 'Paid applicant order',
};

type ArchiveCard = PokemonCard & { runtimeDisplayAttribution?: string };

function CardPocket({ reference, disputed }: { reference: CorocoroIssueRecord['cards'][number]; disputed: boolean }) {
  const { theme } = useTheme();
  const id = disputed ? null : reference.mappedStackrCardId;
  const [card, setCard] = useState<ArchiveCard | null>(() => id ? getCuratedPokemonCardById(id, 'ja') : null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setCard(id ? getCuratedPokemonCardById(id, 'ja') : null);
    setFailed(false);
    if (!id) return;
    setLoading(true);
    void fetchCardById(id, { language: 'ja' }).then((result) => {
      if (active && result) setCard(result);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);
  const nativeName = card?.localName ?? reference.nativeName;
  const fallback = <View style={[styles.missingArt, { backgroundColor: theme.colors.surface }]}>
    <Ionicons name="image-outline" size={30} color={theme.colors.textSoft} />
    <Text style={styles.pocketName}>{nativeName ?? reference.name}</Text>
    <Text style={styles.muted}>{loading ? 'Loading artwork…' : 'Artwork not available yet'}</Text>
  </View>;
  const contents = <>
    <View style={[styles.sleeve, { borderColor: theme.colors.border }]}>
      <StackrImage uri={card?.images?.small} fullUri={card?.images?.large}
        style={styles.cardImage} contentFit="contain" showFallbackIcon={false}
        accessibilityLabel={`${reference.name}, Japanese magazine promo`} fallback={fallback} />
    </View>
    <Text style={styles.pocketName}>{nativeName ?? reference.name}</Text>
    {nativeName && <Text style={styles.muted}>English: {reference.name}</Text>}
    <Text style={styles.muted}>{reference.numbering === 'unnumbered' ? 'Unnumbered' : reference.printedNumber ?? 'Number unverified'} · {reference.format === 'jumbo' ? 'Jumbo card' : 'Standard card'}</Text>
    {card?.runtimeDisplayAttribution && <Text style={styles.muted}>{card.runtimeDisplayAttribution}</Text>}
    {id ? <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>View card</Text>
      : <Text style={styles.muted}>{disputed ? 'Issue match disputed' : 'Catalogue match pending'}</Text>}
  </>;
  return <View style={styles.pocket}>
    {id ? <Link href={{ pathname: '/card/[id]', params: { id, language: 'ja' } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${reference.name} card details`} style={styles.pocketContent}>{contents}</Pressable>
    </Link> : <View style={styles.pocketContent}>{contents}</View>}
    {loading && <StackrLoadingIndicator accessibilityLabel="Loading card artwork" color={theme.colors.primary} />}
    {failed && <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: theme.colors.primary }}>Retry card artwork</Text></Pressable>}
  </View>;
}

export default function CorocoroLibraryScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ publication?: string; issue?: string; q?: string }>();
  const publications = getCorocoroPublicationSummaries();
  const issue = typeof params.issue === 'string' ? getCorocoroIssueGroup(params.issue) : null;
  const publication = publications.find((item) => item.id === (issue?.publicationId ?? params.publication));
  const [query, setQuery] = useState(params.q ?? '');
  useEffect(() => { setQuery(params.q ?? ''); }, [params.q]);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [params.issue, params.publication]);
  const surface = { backgroundColor: theme.colors.card, borderColor: theme.colors.border };
  const link = { color: theme.colors.primary, fontWeight: '700' as const };
  const siblings = publication ? getCorocoroIssuesForPublication(publication.id) : [];
  const position = siblings.findIndex((item) => item.id === issue?.id);
  const filtered = publication ? getCorocoroIssuesForPublication(publication.id, query) : [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <Stack.Screen options={{ headerShown: false, title: issue ? `${issueLabel(issue.issueMonth)} · CoroCoro` : 'CoroCoro library' }} />
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/explore')} style={styles.navAction}><Text style={link}>Back</Text></Pressable>
        {publication && <Link href="/corocoro" style={[link, styles.navAction]}>Magazine library</Link>}
        {issue && publication && <Link href={{ pathname: '/corocoro', params: { publication: publication.id } }} style={[link, styles.navAction]}>{publication.name}</Link>}
      </View>
      <Text style={styles.title}>{issue ? issueLabel(issue.issueMonth) : publication?.name ?? 'The CoroCoro library'}</Text>
      <Text style={styles.intro}>{issue ? `${issue.publication}. Open a card pocket to explore its details.` : 'Choose a magazine, open an edition, and explore the Pokémon cards connected to that issue.'}</Text>
      {params.issue && !issue && <View style={[styles.notice, surface]}><Text>This edition isn’t in the library yet. Choose a publication below.</Text></View>}
      {!issue && <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Search magazine issues and cards"
        placeholder="Search Shining Mew, Pikachu, 2001…" placeholderTextColor={theme.colors.textSoft}
        style={[styles.search, surface, { color: theme.colors.text }]} />}
      {!publication && <View style={styles.shelf}>{publications.map((item) => {
        const matches = getCorocoroIssuesForPublication(item.id, query);
        const featured = matches.find((group) => group.id === 'monthly:2001-05') ?? matches[0];
        return <Link key={item.id} href={{ pathname: '/corocoro', params: { publication: item.id, q: query } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.publication, surface])} accessibilityRole="link">
            {featured && <View style={styles.publicationCover}><CorocoroIssueCover issueGroup={featured} showSources={false} /></View>}
            <Text style={styles.sectionTitle}>{item.nativeName}</Text><Text style={styles.pocketName}>{item.name}</Text>
            <Text style={styles.muted}>{matches.length} {query ? 'matching' : 'documented'} issues</Text><Text style={link}>Browse editions</Text>
          </Pressable>
        </Link>;
      })}</View>}
      {publication && !issue && <>
        <Text style={styles.muted}>{filtered.length} editions · Printed cover month</Text>
        <View style={styles.shelf}>{filtered.map((group) => <Link key={group.id} href={{ pathname: '/corocoro', params: { issue: group.id } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.issueTile, surface])} accessibilityRole="link" accessibilityLabel={`Open ${group.publication}, ${issueLabel(group.issueMonth)} binder`}>
            <View style={styles.cover}><CorocoroIssueCover issueGroup={group} showSources={false} /></View>
            <Text style={styles.pocketName}>{issueLabel(group.issueMonth)}</Text>
            <Text style={styles.muted} numberOfLines={2}>{group.records.flatMap((record) => record.cards.map((card) => card.name)).join(', ')}</Text>
            <Text style={link}>Open issue · {group.cardReferenceCount} card references</Text>
          </Pressable>
        </Link>)}</View>
        {!filtered.length && <Text>No matching editions. Try a card name, year, or printed card number.</Text>}
      </>}
      {issue && <>
        <View style={[styles.binder, surface]}>
          <View style={styles.issueContext}>
            <View style={styles.detailCover}><CorocoroIssueCover issueGroup={issue} /></View>
            <Text style={styles.pocketName}>{issueLabel(issue.issueMonth)}</Text>
            <Text style={styles.muted}>On sale: {issue.onSaleDate ?? 'Date not established'}</Text>
            <Text style={styles.muted}>{issue.cardReferenceCount} documented card references</Text>
          </View>
          <View style={[styles.binderPage, { borderColor: theme.colors.border }]}>
            <Text style={styles.sectionTitle}>Inside this edition</Text>
            {issue.records.map((record) => <View key={record.id} style={styles.distribution}>
              <Text style={[styles.pocketName, { color: theme.colors.primary }]}>{distributionLabels[record.distributionType] ?? record.distributionType}</Text>
              {record.distributionType !== 'insert' && <Text style={styles.muted}>Associated offer; these cards were not guaranteed magazine inserts.</Text>}
              {record.confidence === 'conflicting' && <Text style={styles.dispute}>Sources disagree about this issue’s card. The association is unconfirmed.</Text>}
              <View style={styles.pockets}>{record.cards.map((card, index) => <CardPocket key={`${record.id}:${index}`} reference={card} disputed={record.confidence === 'conflicting'} />)}</View>
              {record.notes && <Text style={styles.notes}>{record.notes}</Text>}
              <View style={styles.navigation}>{record.sourceUrls.map((url, index) => <Link key={url} href={url as `https://${string}`} target="_blank" rel="noopener noreferrer" style={[link, styles.navAction]}>Source {index + 1} · {new URL(url).hostname.replace(/^www\./, '')}</Link>)}</View>
            </View>)}
          </View>
        </View>
        <View style={styles.navigation}>{[siblings[position - 1], siblings[position + 1]].map((adjacent, index) => adjacent ?
          <Link key={adjacent.id} href={{ pathname: '/corocoro', params: { issue: adjacent.id } }} style={[link, styles.navAction]}>{index === 0 ? 'Newer' : 'Older'} issue: {issueLabel(adjacent.issueMonth)}</Link> : null)}</View>
      </>}
      <Text style={styles.footer}>A growing archive of documented issues. Inserts, prize draws and applicant offers are shown separately. Browsing an issue does not add cards to your collection.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 70, gap: 18, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center' }, navAction: { paddingVertical: 12 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: '900' }, intro: { fontSize: 15, lineHeight: 23, maxWidth: 680 },
  sectionTitle: { fontSize: 23, fontWeight: '800' }, muted: { fontSize: 12, lineHeight: 19, opacity: 0.8 },
  search: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  publication: { flexBasis: 280, flexGrow: 1, flexShrink: 1, borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  publicationCover: { height: 260, marginBottom: 10 }, issueTile: { flexBasis: 220, flexGrow: 1, maxWidth: 350, borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  cover: { height: 285 }, binder: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  issueContext: { flexBasis: 240, flexGrow: 1, flexShrink: 1, padding: 22, gap: 12 }, detailCover: { height: 330 },
  binderPage: { flexBasis: 580, flexGrow: 3, flexShrink: 1, minWidth: 0, borderLeftWidth: 1, padding: 20, gap: 24 },
  distribution: { gap: 12 }, pockets: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  pocket: { flexBasis: 190, maxWidth: 300, flexGrow: 1, gap: 10 }, pocketContent: { gap: 8 },
  sleeve: { padding: 10, paddingBottom: 16, borderWidth: 1, borderBottomWidth: 4, borderRadius: 8 },
  cardImage: { width: '100%', aspectRatio: 0.714 }, missingArt: { flex: 1, padding: 15, justifyContent: 'center', alignItems: 'center', gap: 15 },
  pocketName: { fontSize: 16, fontWeight: '800', lineHeight: 22 }, notes: { fontSize: 13, lineHeight: 21 },
  dispute: { color: '#B45309', fontSize: 13, lineHeight: 20 }, notice: { padding: 18, borderRadius: 12, borderWidth: 1 },
  footer: { fontSize: 12, lineHeight: 19, opacity: 0.75, maxWidth: 720 },
});
