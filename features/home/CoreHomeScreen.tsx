import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { isKnownAuthDenial, useAuth } from '../../components/auth-context';
import { startCoreHomeRead, type CoreHomeBinder, type CoreHomeSection } from '../../lib/coreHomeData';
import { subscribeCollectionSummaryInvalidation } from '../../lib/collectionSummaryInvalidation';
import type { CollectionSummary } from '../../lib/collectionSummary';
import { readPersistedBinderOverview } from '../../lib/binderLibraryCache';

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.text }]}>Home</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => router.push('/settings')} style={{ padding: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Account</Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSoft }]}>Your cards. Your binders.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search cards and sets"
          onPress={() => router.push('/(tabs)/search')} style={[styles.search, { backgroundColor: colors.primary }]}>
          <Text style={styles.searchText}>Search cards and sets</Text>
          <Text style={styles.searchArrow}>›</Text>
        </Pressable>

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
            <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.heading, { color: colors.text }]}>Your collection</Text>
              <View style={styles.stats}>
                {[
                  ['Cards owned', visible.summary?.totalCardsOwned],
                  ['Unique cards', visible.summary?.uniqueCards],
                  ['Binders', visible.summary?.binderCount],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.stat}>
                    <Text style={[styles.count, { color: colors.text }]}>{typeof value === 'number' ? value.toLocaleString() : '—'}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSoft }]}>{label}</Text>
                  </View>
                ))}
              </View>
              {visible.errors.summary ? <Text style={{ color: colors.textSoft }}>{visible.errors.summary}</Text>
                : !visible.summary ? <Text style={{ color: colors.textSoft }}>Loading collection totals…</Text> : null}
            </View>

            <View style={styles.sectionHeading}>
              <Text style={[styles.heading, { color: colors.text }]}>Your binders</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/binder')} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.primary }]}>View all</Text>
              </Pressable>
            </View>
            {visible.binders?.map((binder) => (
              <Pressable key={binder.id} accessibilityRole="button" accessibilityLabel={'Open ' + binder.name}
                onPress={() => router.push({ pathname: '/binder/[id]', params: { id: binder.id } })}
                style={[styles.binder, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.binderText}>
                  <Text numberOfLines={2} style={[styles.binderName, { color: colors.text }]}>{binder.name}</Text>
                  <Text style={{ color: colors.textSoft }}>{binder.type === 'official' ? 'Set binder' : 'Custom binder'}</Text>
                </View>
                <Text style={[styles.arrow, { color: colors.primary }]}>›</Text>
              </Pressable>
            ))}
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
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 120, gap: 14 },
  title: { fontSize: 30, fontWeight: '800' }, subtitle: { fontSize: 15, lineHeight: 22 },
  search: { minHeight: 62, borderRadius: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  searchText: { color: '#fff', fontSize: 17, fontWeight: '700' }, searchArrow: { color: '#fff', fontSize: 30 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 }, heading: { fontSize: 19, fontWeight: '700' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, stat: { flex: 1, gap: 5 },
  count: { fontSize: 25, fontWeight: '800' }, statLabel: { fontSize: 12 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center' }, linkText: { fontSize: 15, fontWeight: '700' },
  binder: { borderWidth: 1, borderRadius: 14, minHeight: 78, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  binderText: { flex: 1, gap: 5 }, binderName: { fontSize: 16, fontWeight: '700' }, arrow: { fontSize: 28 },
  create: { minHeight: 48, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
});
