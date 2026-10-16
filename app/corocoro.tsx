import { StackrLoadingIndicator } from '../components/StackrLoadingIndicator';
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CorocoroIssueCover } from '../components/CorocoroIssueCover';
import { CorocoroIssueOpening } from '../components/CorocoroIssueOpening';
import { useAuth } from '../components/auth-context';
import { StackrImage } from '../components/StackrImage';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import {
  formatCorocoroIssueGroup as issueLabel, getCorocoroIssueGroup, getCorocoroIssuesForPublication,
  getCorocoroPublicationSummaries, getCorocoroVerifiedPrinting, getCorocoroVerifiedPrintingArtwork,
  validateCorocoroVerifiedPrinting, type CorocoroIssueRecord,
} from '../lib/corocoroIssueArchive';
import { getCuratedPokemonCardById } from '../lib/curatedPokemonCatalogue';
import { fetchCardById, type PokemonCard } from '../lib/pokemonTcg';
import { fetchCorocoroOwnedCardKeys, getCorocoroCollectionCard, getCorocoroCollectionDestinations, getCorocoroIssueOwnership, type CorocoroCollectionCard } from '../lib/corocoroIssueCollection';
import { usePokedexOwnership } from '../lib/pokedexOwnershipState';
import { createManualCollectionDraft } from '../lib/manualCollectionDraft';
import { supabase } from '../lib/supabase';

const distributionLabels: Record<string, string> = {
  insert: 'Magazine insert', mail_in_prize_draw: 'Mail-in prize draw',
  ticket_exchange: 'Ticket exchange', paid_applicant_order: 'Paid applicant order',
};

type ArchiveCard = PokemonCard & { runtimeDisplayAttribution?: string };

function CollectionAction({ card, owned, available, destinations }: {
  card: CorocoroCollectionCard; owned: boolean | null; available: boolean;
  destinations: ReturnType<typeof getCorocoroCollectionDestinations>;
}) {
  const { theme } = useTheme();
  const { user, loading, error: authError, cachedReadSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<symbol | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const current = useRef({ accountId: user?.id, epoch: cachedReadSession?.epoch, cardId: card.id, setId: card.set.id, ready: !loading && !authError });
  const next = { accountId: user?.id, epoch: cachedReadSession?.epoch, cardId: card.id, setId: card.set.id, ready: !loading && !authError };
  if (current.current.accountId !== next.accountId || current.current.epoch !== next.epoch || current.current.cardId !== next.cardId
    || current.current.setId !== next.setId || current.current.ready !== next.ready) {
    generation.current += 1;
    operation.current = null;
  }
  current.current = next;
  useEffect(() => { setBusy(false); setError(null); }, [user?.id, cachedReadSession?.epoch, card.id, card.set.id, loading, authError]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(false);
    setError(null);
    return () => { focused.current = false; generation.current += 1; operation.current = null; };
  }, []));
  const add = async () => {
    if (!focused.current || operation.current || !current.current.ready || !available) return;
    if (!user) { router.push('/(auth)/login'); return; }
    const token = Symbol('corocoro-review');
    const run = generation.current;
    const accountId = user.id;
    const isCurrent = () => focused.current && operation.current === token && run === generation.current
      && current.current.accountId === accountId && current.current.cardId === card.id && current.current.setId === card.set.id && current.current.ready;
    operation.current = token;
    setBusy(true);
    setError(null);
    try {
      const { data, error: verificationError } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (verificationError) throw verificationError;
      if (data.user?.id !== accountId) throw new Error('Your account changed. Reopen this issue to add the card.');
      const draft = await createManualCollectionDraft(accountId, {
        cardId: card.id, setId: card.set.id, language: 'ja', cardName: card.name,
        cardNumber: card.number, setName: card.set.name, imageUrl: card.images?.large ?? card.images?.small,
      });
      if (isCurrent()) router.push({ pathname: '/collection/add-card', params: { draftId: draft.id } });
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : 'Could not open your collection review. Please retry.');
    } finally {
      if (isCurrent()) { operation.current = null; setBusy(false); }
    }
  };
  const disabled = busy || loading || Boolean(authError) || !available;
  return <View style={{ gap: 6 }}>
    <Text style={styles.muted}>{owned === null ? 'Ownership unknown' : owned ? 'Owned in your collection' : 'Not yet owned'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${card.name} to collection`} accessibilityState={{ disabled, busy }}
      disabled={disabled} onPress={() => { void add(); }} style={styles.collectionAction}>
      <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{busy ? 'Opening collection review…' : 'Add to collection'}</Text>
    </Pressable>
    {owned && destinations.variants ? <Link href={{ pathname: '/set/[id]', params: { id: card.set.id, language: 'ja' } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Manage set ${card.name} copies`} style={styles.collectionAction}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Manage set copies</Text>
      </Pressable>
    </Link> : null}
    {owned ? destinations.binderIds.map((binderId, index) => <Link key={binderId} href={{ pathname: '/binder/[id]', params: { id: binderId } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Manage ${card.name} copies in binder ${index + 1}`} style={styles.collectionAction}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{destinations.binderIds.length === 1 ? 'Manage binder copies' : `Manage binder ${index + 1} copies`}</Text>
      </Pressable>
    </Link>) : null}
    <Text style={styles.muted}>{owned ? 'Choose the saved copy in its collection controls to change quantity or remove it.' : 'Choose your binder and quantity before saving.'}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.notes}>{error}</Text> : null}
  </View>;
}

function CardPocket({ recordId, reference, disputed, collectionEligible, ownership, onIdentityVerified }: {
  recordId: string;
  reference: CorocoroIssueRecord['cards'][number]; disputed: boolean; collectionEligible: boolean;
  ownership: ReturnType<typeof usePokedexOwnership>;
  onIdentityVerified: (id: string, verified: boolean) => void;
}) {
  const { theme } = useTheme();
  const printing = disputed ? null : getCorocoroVerifiedPrinting(recordId, reference);
  const id = disputed ? null : printing?.cardId ?? reference.mappedStackrCardId;
  const [card, setCard] = useState<ArchiveCard | null>(() => id && !printing ? getCuratedPokemonCardById(id, 'ja') : null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [identityVerified, setIdentityVerified] = useState(false);
  useEffect(() => {
    let active = true;
    setCard(id && !printing ? getCuratedPokemonCardById(id, 'ja') : null);
    setFailed(false);
    setLoading(false);
    setIdentityVerified(false);
    if (!id) return;
    if (!printing) onIdentityVerified(id, false);
    setLoading(true);
    void fetchCardById(id, { language: 'ja' }).then((result) => {
      if (active) {
        const verified = printing ? validateCorocoroVerifiedPrinting(printing, result)
          : Boolean(result && getCorocoroCollectionCard(reference, result));
        if (result && (!printing || verified)) setCard(result);
        setIdentityVerified(verified);
        if (!printing) onIdentityVerified(id, verified);
        if (!result || (printing && !verified)) setFailed(true);
      }
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt, reference, printing, onIdentityVerified]);
  const printingArtwork = printing ? getCorocoroVerifiedPrintingArtwork(printing, card) : null;
  const navigationId = printing ? identityVerified && validateCorocoroVerifiedPrinting(printing, card) ? id : null : id;
  const nativeName = printing ? printing.nativeName : card?.localName ?? reference.nativeName;
  const collectionCard = collectionEligible && !disputed && !printing ? getCorocoroCollectionCard(reference, card) : null;
  const fallback = <View style={[styles.missingArt, { backgroundColor: theme.colors.surface }]}>
    <Ionicons name="image-outline" size={30} color={theme.colors.textSoft} />
    <Text style={styles.pocketName}>{nativeName ?? reference.name}</Text>
    <Text style={styles.muted}>{loading ? 'Loading artwork…' : 'Artwork not available yet'}</Text>
  </View>;
  const contents = <>
    <View style={[styles.sleeve, { borderColor: theme.colors.border }]}>
      <StackrImage uri={printing ? printingArtwork?.small : card?.images?.small} fullUri={printing ? printingArtwork?.large : card?.images?.large}
        style={styles.cardImage} contentFit="contain" showFallbackIcon={false}
        accessibilityLabel={`${reference.name}, ${printing ? 'numbered printing artwork reference' : 'Japanese magazine promo'}`} fallback={fallback} />
    </View>
    <Text style={styles.pocketName}>{nativeName ?? reference.name}</Text>
    {nativeName && <Text style={styles.muted}>English: {reference.name}</Text>}
    <Text style={styles.muted}>{reference.numbering === 'unnumbered' ? 'Unnumbered' : reference.printedNumber ?? 'Number unverified'} · {reference.format === 'jumbo' ? 'Jumbo card' : 'Standard card'}</Text>
    {card?.runtimeDisplayAttribution && <Text style={styles.muted}>{card.runtimeDisplayAttribution}</Text>}
    {printingArtwork?.kind === 'shared' ? <Text style={styles.muted}>Shared artwork reference · language or finish may differ</Text> : null}
    {navigationId ? <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{printing ? 'View exact printing' : 'View card'}</Text>
      : <Text style={styles.muted}>{disputed ? 'Issue match disputed' : printing ? loading ? 'Checking exact printing…' : 'Exact printing unavailable' : 'Catalogue match pending'}</Text>}
  </>;
  return <View style={styles.pocket}>
    {navigationId ? <Link href={{ pathname: '/card/[id]', params: { id: navigationId, language: 'ja' } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${reference.name} ${printing ? 'exact printing' : 'card details'}`} style={styles.pocketContent}>{contents}</Pressable>
    </Link> : <View style={styles.pocketContent}>{contents}</View>}
    {loading && <StackrLoadingIndicator accessibilityLabel="Loading card artwork" color={theme.colors.primary} />}
    {failed && <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: theme.colors.primary }}>{printing ? 'Retry printing check' : 'Retry card artwork'}</Text></Pressable>}
    {printing ? <Text style={styles.muted}>Physical finish and edition unverified. Collection controls remain unavailable.</Text> : null}
    {collectionCard ? <CollectionAction key={collectionCard.id} card={collectionCard}
      owned={ownership.values && id ? ownership.values.has(id) : null}
      destinations={getCorocoroCollectionDestinations(reference, ownership.values)}
      available={identityVerified && !loading && !failed && (ownership.status === 'success' || ownership.status === 'idle')} /> : null}
    {collectionEligible && id && !disputed && !printing && !identityVerified ? <Text style={styles.muted}>Exact collection match pending. {loading ? 'Checking the card identity…' : 'Adding remains unavailable until the printing can be verified.'}</Text> : null}
  </View>;
}

export default function CorocoroLibraryScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ publication?: string; issue?: string; q?: string }>();
  const publications = getCorocoroPublicationSummaries();
  const issue = typeof params.issue === 'string' ? getCorocoroIssueGroup(params.issue) : null;
  const ownership = usePokedexOwnership(fetchCorocoroOwnedCardKeys);
  const issueOwnership = issue ? getCorocoroIssueOwnership(issue.records, ownership.values) : null;
  const [identityChecks, setIdentityChecks] = useState({ issueId: issue?.id, keys: new Set<string>() });
  const onIdentityVerified = useCallback((id: string, verified: boolean) => {
    setIdentityChecks(previous => {
      const keys = new Set(previous.issueId === issue?.id ? previous.keys : []);
      if (verified) keys.add(id); else keys.delete(id);
      return { issueId: issue?.id, keys };
    });
  }, [issue?.id]);
  const runtimePending = issue?.records.reduce((count, record) => count + (record.distributionType === 'insert' && record.confidence !== 'conflicting'
    ? record.cards.filter(card => getCorocoroCollectionCard(card)
      && !(identityChecks.issueId === issue.id && card.mappedStackrCardId && identityChecks.keys.has(card.mappedStackrCardId))).length : 0), 0) ?? 0;
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
    <Stack.Screen options={{ headerShown: false, title: issue ? `${issueLabel(issue)} · CoroCoro` : 'CoroCoro library' }} />
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/explore')} style={styles.navAction}><Text style={link}>Back</Text></Pressable>
        {publication && <Link href="/corocoro" style={[link, styles.navAction]}>Magazine library</Link>}
        {issue && publication && <Link href={{ pathname: '/corocoro', params: { publication: publication.id } }} style={[link, styles.navAction]}>{publication.name}</Link>}
      </View>
      <Text style={styles.title}>{issue ? issueLabel(issue) : publication?.name ?? 'The CoroCoro library'}</Text>
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
          <Pressable style={StyleSheet.flatten([styles.issueTile, surface])} accessibilityRole="link" accessibilityLabel={`Open ${group.publication}, ${issueLabel(group)} binder`}>
            <View style={styles.cover}><CorocoroIssueCover issueGroup={group} showSources={false} /></View>
            <Text style={styles.pocketName}>{issueLabel(group)}</Text>
            <Text style={styles.muted} numberOfLines={2}>{group.records.flatMap((record) => record.cards.map((card) => card.name)).join(', ')}</Text>
            <Text style={link}>Open issue · {group.cardReferenceCount} card references</Text>
          </Pressable>
        </Link>)}</View>
        {!filtered.length && <Text>No matching editions. Try a card name, year, or printed card number.</Text>}
      </>}
      {issue && <>
        <CorocoroIssueOpening key={issue.id} issue={issue} />
        {issueOwnership && issueOwnership.total > 0 ? <View style={[styles.notice, surface]}>
          <Text style={styles.pocketName}>{issueOwnership.owned === null ? 'Ownership unknown' : `${issueOwnership.owned} of ${issueOwnership.total} owned`}</Text>
          {issueOwnership.pending + runtimePending > 0 ? <Text style={styles.muted}>{issueOwnership.pending + runtimePending} {issueOwnership.pending + runtimePending === 1 ? 'card match is' : 'card matches are'} pending. Issue completion remains unverified.</Text> : null}
          {ownership.message ? <Text style={styles.muted}>{ownership.message}</Text> : null}
          {ownership.status === 'error' ? <Pressable accessibilityRole="button" onPress={() => { void ownership.retryOwnership(); }} style={styles.collectionAction}><Text style={link}>Retry ownership</Text></Pressable> : null}
          {ownership.status === 'idle' ? <Link href="/(auth)/login" style={[link, styles.navAction]}>Sign in to check your collection</Link> : null}
        </View> : null}
        <View style={[styles.binder, surface]}>
          <View style={styles.issueContext}>
            <View style={styles.detailCover}><CorocoroIssueCover issueGroup={issue} /></View>
            <Text style={styles.pocketName}>{issueLabel(issue)}</Text>
            <Text style={styles.muted}>On sale: {issue.onSaleDate ?? 'Date not established'}</Text>
            <Text style={styles.muted}>{issue.cardReferenceCount} documented card references</Text>
          </View>
          <View style={[styles.binderPage, { borderColor: theme.colors.border }]}>
            <Text style={styles.sectionTitle}>Inside this edition</Text>
            {issue.records.map((record) => <View key={record.id} style={styles.distribution}>
              <Text style={[styles.pocketName, { color: theme.colors.primary }]}>{distributionLabels[record.distributionType] ?? record.distributionType}</Text>
              {record.distributionType !== 'insert' && <Text style={styles.muted}>Associated offer; these cards were not guaranteed magazine inserts.</Text>}
              {record.confidence === 'conflicting' && <Text style={styles.dispute}>Sources disagree about this issue’s card. The association is unconfirmed.</Text>}
              <View style={styles.pockets}>{record.cards.map((card, index) => <CardPocket key={`${record.id}:${index}`} recordId={record.id} reference={card}
                disputed={record.confidence === 'conflicting'} collectionEligible={record.distributionType === 'insert'} ownership={ownership} onIdentityVerified={onIdentityVerified} />)}</View>
              {record.notes && <Text style={styles.notes}>{record.notes}</Text>}
              <View style={styles.navigation}>{record.sourceUrls.map((url, index) => <Link key={url} href={url as `https://${string}`} target="_blank" rel="noopener noreferrer" style={[link, styles.navAction]}>Source {index + 1} · {new URL(url).hostname.replace(/^www\./, '')}</Link>)}</View>
            </View>)}
          </View>
        </View>
        <View style={styles.navigation}>{[siblings[position - 1], siblings[position + 1]].map((adjacent, index) => adjacent ?
          <Link key={adjacent.id} href={{ pathname: '/corocoro', params: { issue: adjacent.id } }} style={[link, styles.navAction]}>{index === 0 ? 'Newer' : 'Older'} issue: {issueLabel(adjacent)}</Link> : null)}</View>
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
  collectionAction: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
  footer: { fontSize: 12, lineHeight: 19, opacity: 0.75, maxWidth: 720 },
});
