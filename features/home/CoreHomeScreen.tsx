import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { isKnownAuthDenial, useAuth } from '../../components/auth-context';
import { startCoreHomeRead, type CoreHomeBinder, type CoreHomeSection } from '../../lib/coreHomeData';
import { subscribeCollectionSummaryInvalidation } from '../../lib/collectionSummaryInvalidation';
import type { CollectionSummary } from '../../lib/collectionSummary';
import { readPersistedBinderOverview } from '../../lib/binderLibraryCache';
import { BinderArtwork } from '../../components/BinderArtwork';
import { StackrNavigationIcon } from '../../components/StackrNavigationIcon';
import { stackrBrand } from '../../lib/stackrBrand';
import { stackrIcons } from '../../lib/stackrIcons';
import { getCoreHomeValuePresentation } from '../../lib/coreHomePresentation';

type HomeState = {
  accountId: string | null;
  summary: CollectionSummary | null;
  binders: CoreHomeBinder[] | null;
  errors: Partial<Record<CoreHomeSection, string>>;
  refreshing: boolean;
};
const emptyState = (accountId: string | null): HomeState => ({ accountId, summary: null, binders: null, errors: {}, refreshing: false });

export default function CoreHomeScreen() {
  const { theme } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  // The logo shelf can be 18% wider than its artwork stage. Keep both inside
  // the two-column card on small phones, including its padding and border.
  const binderArtworkWidth = Math.min(126, Math.max(70, Math.floor(((Math.min(viewportWidth, 640) - 52) / 2 - 22) / 1.18)));
  const auth = useAuth();
  const accountId = auth.loading || auth.error ? null : auth.user?.id ?? null;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const identityRef = useRef({ accountId, epoch: auth.cachedReadSession?.epoch });
  const generationRef = useRef(0);
  if (identityRef.current.accountId !== accountId || identityRef.current.epoch !== auth.cachedReadSession?.epoch) {
    identityRef.current = { accountId, epoch: auth.cachedReadSession?.epoch };
    generationRef.current += 1;
  }
  const requestRef = useRef<ReturnType<typeof startCoreHomeRead> | null>(null);
  const savedSessionRef = useRef(auth.cachedReadSession);
  savedSessionRef.current = auth.cachedReadSession;
  const [savedBinderSessionKey, setSavedBinderSessionKey] = useState<string | null>(null);
  const cachedReadKey = auth.cachedReadSession
    ? `${auth.cachedReadSession.userId}:${auth.cachedReadSession.expiresAt}:${auth.cachedReadSession.epoch}` : null;
  const [state, setState] = useState<HomeState>(() => emptyState(accountId));
  const visible = state.accountId === accountId ? state : emptyState(accountId);
  const colors = theme.colors;
  const value = getCoreHomeValuePresentation(visible.summary);

  useEffect(() => {
    let cancelled = false;
    const session = savedSessionRef.current;
    setSavedBinderSessionKey(null);
    if ((!auth.loading && !auth.error) || !session || session.expiresAt * 1000 <= Date.now()) return;
    const expected = `${session.userId}:${session.expiresAt}:${session.epoch}`;
    // This optional disk proof does not hold public navigation or live reads.
    // The existing reader validates the snapshot's account and runtime envelope.
    void readPersistedBinderOverview(session.userId).then((snapshot) => {
      const current = savedSessionRef.current;
      if (cancelled || !current || current.expiresAt * 1000 <= Date.now()
        || `${current.userId}:${current.expiresAt}:${current.epoch}` !== expected) return;
      setSavedBinderSessionKey(snapshot ? expected : null);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [auth.loading, auth.error, cachedReadKey]);

  const openSavedBinders = useCallback(() => {
    const current = savedSessionRef.current;
    if ((!auth.loading && !auth.error) || !current || current.expiresAt * 1000 <= Date.now()
      || savedBinderSessionKey !== `${current.userId}:${current.expiresAt}:${current.epoch}`) return;
    router.push({ pathname: '/(tabs)/binder', params: { readOnly: 'true' } });
  }, [auth.loading, auth.error, savedBinderSessionKey]);
  const canViewSavedBinders = Boolean((auth.loading || auth.error) && auth.cachedReadSession
    && auth.cachedReadSession.expiresAt * 1000 > Date.now()
    && cachedReadKey === savedBinderSessionKey);

  const load = useCallback((forceRefresh = false) => {
    requestRef.current?.dispose();
    const generation = generationRef.current;
    if (!accountId) { setState(emptyState(null)); return; }
    setState((previous) => ({ ...(previous.accountId === accountId ? previous : emptyState(accountId)), errors: {}, refreshing: true }));
    const update = (patch: Partial<HomeState>) => setState((previous) => ({
      ...(previous.accountId === accountId ? previous : emptyState(accountId)), ...patch,
    }));
    requestRef.current = startCoreHomeRead({
      userId: accountId,
      forceRefresh,
      isCurrent: () => accountRef.current === accountId && generationRef.current === generation,
      isAccessDenied: isKnownAuthDenial,
      onSummary: (summary) => update({ summary }),
      onBinders: (binders) => update({ binders }),
      onError: (section, error) => setState((previous) => ({
        ...(previous.accountId === accountId ? previous : emptyState(accountId)),
        ...(isKnownAuthDenial(error) ? { [section]: null } : {}),
        errors: { ...previous.errors, [section]: isKnownAuthDenial(error)
          ? 'Please sign in again to refresh your collection.'
          : section === 'summary' ? 'Totals could not refresh. Try again.' : 'Binders could not refresh. Try again.' },
      })),
      onDone: () => update({ refreshing: false }),
    });
  }, [accountId]);

  useFocusEffect(useCallback(() => {
    load();
    const unsubscribe = subscribeCollectionSummaryInvalidation(() => load(true));
    return () => { requestRef.current?.dispose(); unsubscribe(); };
  }, [load, auth.cachedReadSession?.epoch]));

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={visible.refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
        <View style={styles.header}>
          <View style={[styles.brandPlate, theme.dark && styles.darkBrandPlate]}>
            <Image source={stackrBrand.wordmark} accessibilityLabel="Stackr" resizeMode="contain" style={styles.wordmark} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => router.push('/settings')}
            style={[styles.account, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <StackrNavigationIcon name="profile" size={24} color={colors.text} accentColor={colors.primary} />
          </Pressable>
        </View>

        <LinearGradient colors={['#321847', '#51216D', '#7444A4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.valuePanel}>
          <View pointerEvents="none" style={styles.valueGlow} />
          <View style={styles.valueHeading}>
            <Text style={styles.valueLabel}>COLLECTION VALUE</Text>
            <StackrNavigationIcon name="collection" color="#E6D7F7" accentColor="#FFB272" size={28} />
          </View>
          <Text accessibilityLabel={'Collection value ' + value.amount} style={styles.valueAmount} adjustsFontSizeToFit numberOfLines={1}>{value.amount}</Text>
          <Text style={styles.valueCoverage}>{accountId ? value.coverage : 'Your collection, in one place'}</Text>
          {accountId && value.detail ? <Text style={styles.valueDetail}>{value.detail}</Text> : null}
          {accountId && value.pricedPercent !== null ? <View accessibilityRole="progressbar" accessibilityLabel="Copies with a stored price"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(value.pricedPercent) }} style={styles.valueTrack}>
            <View style={[styles.valueFill, { width: `${value.pricedPercent}%` }]} />
          </View> : null}
          <View style={styles.stats}>
            {[
              ['Cards', visible.summary?.totalCardsOwned],
              ['Unique', visible.summary?.uniqueCards],
              ['Binders', visible.summary?.binderCount],
            ].map(([label, count]) => <View key={String(label)} style={styles.stat}>
              <Text style={styles.count}>{typeof count === 'number' ? count.toLocaleString() : '—'}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>)}
          </View>
          {accountId && visible.errors.summary ? <Text accessibilityRole="alert" style={styles.valueCoverage}>{visible.errors.summary}</Text>
            : accountId && !visible.summary ? <Text style={styles.valueDetail}>Loading your saved totals…</Text> : null}
        </LinearGradient>

        <Pressable accessibilityRole="button" accessibilityLabel="Search cards and sets"
          onPress={() => router.push('/(tabs)/search')} style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StackrNavigationIcon name="search" size={25} color={colors.primary} />
          <Text style={[styles.searchText, { color: colors.textSoft }]}>Search cards and sets</Text>
          <Text style={[styles.arrow, { color: colors.primary }]}>›</Text>
        </Pressable>

        <View style={styles.shortcuts}>
          <Pressable accessibilityRole="button" accessibilityLabel="Discover sets" onPress={() => router.push('/(tabs)/explore')}
            style={[styles.shortcut, { backgroundColor: theme.dark ? colors.card : '#EDE5F9', borderColor: theme.dark ? colors.border : '#DFD1EF' }]}>
            <Image source={stackrIcons.setDiscovery} resizeMode="contain" style={styles.shortcutArt} accessible={false} />
            <Text style={[styles.shortcutTitle, { color: colors.text }]}>Discover sets</Text>
            <Text style={[styles.shortcutCaption, { color: colors.textSoft }]}>Browse every release</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open collection Pokédex" onPress={() => router.push('/(tabs)/pokedex')}
            style={[styles.shortcut, { backgroundColor: theme.dark ? colors.card : '#FFF0E2', borderColor: theme.dark ? colors.border : '#F4DCC5' }]}>
            <Image source={stackrIcons.pokedex} resizeMode="contain" style={styles.shortcutArt} accessible={false} />
            <Text style={[styles.shortcutTitle, { color: colors.text }]}>Pokédex</Text>
            <Text style={[styles.shortcutCaption, { color: colors.textSoft }]}>Your Pokémon collection</Text>
          </Pressable>
        </View>

        {auth.loading ? <View style={styles.panel}>
          <ActivityIndicator accessibilityLabel="Checking your sign-in" color={colors.primary} />
          <Text style={{ color: colors.textSoft }}>Checking your sign-in.</Text>
        </View> : auth.error ? (
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text accessibilityRole="alert" style={{ color: colors.text }}>Your sign-in could not be checked.</Text>
            <Pressable accessibilityRole="button" onPress={() => void auth.refreshAuth()} style={styles.link}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Retry sign-in check</Text>
            </Pressable>
          </View>
        ) : !accountId ? (
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.text }]}>Keep your collection together</Text>
            <Text style={[styles.subtitle, { color: colors.textSoft }]}>Sign in to see your saved cards and binders.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/login')} style={styles.link}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Sign in</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeading}>
              <Text style={[styles.heading, { color: colors.text }]}>Your binders</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/binder')} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.primary }]}>View all</Text>
              </Pressable>
            </View>
            <View style={styles.binderGrid}>{visible.binders?.map((binder) => (
              <Pressable key={binder.id} accessibilityRole="button" accessibilityLabel={'Open ' + binder.name}
                onPress={() => router.push({ pathname: '/binder/[id]', params: { id: binder.id } })}
                style={[styles.binder, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <BinderArtwork coverKey={binder.cover_key} sourceSetId={binder.source_set_id}
                  setName={binder.source_set_display_name ?? binder.name} sourceSetLanguage={binder.language}
                  fallbackLogoUrl={binder.source_set_logo_url} fallbackColor={binder.color}
                  width={binderArtworkWidth} stageHeight={142} artworkWidth={102} artworkHeight={132}
                  showFan={false} showProgressBar={false} showProgressText={false} />
                <View style={styles.binderText}>
                  <Text numberOfLines={2} style={[styles.binderName, { color: colors.text }]}>{binder.name}</Text>
                  <Text style={[styles.binderCaption, { color: colors.textSoft }]}>{binder.type === 'official' ? 'Set binder' : 'Custom binder'}</Text>
                </View>
              </Pressable>
            ))}</View>
            {visible.errors.binders ? <Text style={{ color: colors.textSoft }}>{visible.errors.binders}</Text>
              : visible.binders === null ? <Text style={{ color: colors.textSoft }}>Loading your binders…</Text>
                : visible.binders.length === 0 ? <Text style={{ color: colors.textSoft }}>Start a binder for the cards you collect.</Text> : null}
            {Object.keys(visible.errors).length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => load(true)} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.primary }]}>Try again</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.push('/binder/new')}
              style={[styles.create, { borderColor: colors.primary }]}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Create binder</Text>
            </Pressable>
          </>
        )}
        {canViewSavedBinders ? <Pressable accessibilityRole="button" onPress={openSavedBinders}
          style={[styles.create, { borderColor: colors.primary }]}>
          <Text style={[styles.linkText, { color: colors.primary }]}>View saved binders</Text>
        </Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 130, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 },
  brandPlate: { paddingHorizontal: 8, borderRadius: 12 }, darkBrandPlate: { backgroundColor: '#FAF8FC' },
  wordmark: { width: 150, height: 48 }, account: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22 },
  valuePanel: { borderRadius: 24, padding: 22, gap: 8, overflow: 'hidden' },
  valueGlow: { position: 'absolute', right: -36, top: -55, width: 180, height: 180, borderRadius: 90, backgroundColor: '#A97BCD', opacity: 0.18 },
  valueHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueLabel: { color: '#E7D7F2', fontSize: 12, fontWeight: '700', letterSpacing: 1.8 },
  valueAmount: { color: '#FFFFFF', fontSize: 43, fontWeight: '800', lineHeight: 54 },
  valueCoverage: { color: '#F3E9FA', fontSize: 14, lineHeight: 20 },
  valueDetail: { color: '#D9C5E9', fontSize: 12, lineHeight: 18 },
  valueTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: 4 },
  valueFill: { height: '100%', borderRadius: 2, backgroundColor: '#FFBE8F' },
  search: { minHeight: 58, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, gap: 12, flexDirection: 'row', alignItems: 'center' },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 12 }, shortcut: { flex: 1, borderWidth: 1, borderRadius: 20, padding: 14, gap: 6 },
  shortcutArt: { width: 58, height: 58, marginBottom: 3 }, shortcutTitle: { fontSize: 16, fontWeight: '800' },
  shortcutCaption: { fontSize: 12, lineHeight: 18 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 }, heading: { fontSize: 19, fontWeight: '700' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 16, marginTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' }, stat: { flex: 1, gap: 5 },
  count: { fontSize: 23, fontWeight: '800', color: '#FFFFFF' }, statLabel: { fontSize: 12, color: '#E7D7F2' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center' }, linkText: { fontSize: 15, fontWeight: '700' },
  binderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  binder: { borderWidth: 1, borderRadius: 18, width: '46%', flexGrow: 1, maxWidth: '49%', padding: 10, alignItems: 'center', gap: 8 },
  binderText: { width: '100%', gap: 5, paddingHorizontal: 2, paddingBottom: 6 }, binderName: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  binderCaption: { fontSize: 12 }, arrow: { fontSize: 26 },
  create: { minHeight: 48, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
});
