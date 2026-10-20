import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import {
  AchievementUnlock,
  checkAchievements,
  fetchUserCoinBalance,
  fetchUserAchievementUnlocks,
  recordAchievementEvent,
  setAchievementUnlockNotifier,
  type AchievementEvent,
} from '../lib/achievements';
import { useAuth } from './auth-context';

type AchievementContextType = {
  unlocks: AchievementUnlock[];
  coinBalance: number;
  refreshAchievements: () => Promise<void>;
  refreshCoins: () => Promise<void>;
  recordEvent: (eventType: AchievementEvent, metadata?: Record<string, unknown>) => Promise<void>;
  checkNow: (metadata?: Record<string, unknown>) => Promise<void>;
};

const AchievementContext = createContext<AchievementContextType>({
  unlocks: [],
  coinBalance: 0,
  refreshAchievements: async () => {},
  refreshCoins: async () => {},
  recordEvent: async () => {},
  checkNow: async () => {},
});

const TIER_COLORS: Record<string, string> = {
  bronze: '#C08457',
  silver: '#94A3B8',
  gold: '#F6C453',
  rainbow: '#8B5CF6',
};

function AchievementToast({
  unlock,
  onDone,
}: {
  unlock: AchievementUnlock;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const slide = useRef(new Animated.Value(-140)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const tick = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const tierColor = TIER_COLORS[unlock.tier] ?? theme.colors.primary;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 70,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 90,
        }),
      ]),
      Animated.parallel([
        Animated.timing(tick, {
          toValue: 1,
          duration: 430,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 1,
          duration: 950,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(sparkle, {
              toValue: 1,
              duration: 520,
              useNativeDriver: true,
            }),
            Animated.timing(sparkle, {
              toValue: 0,
              duration: 520,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 3 }
        ),
      ]),
      Animated.delay(2300),
      Animated.timing(slide, {
        toValue: -150,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(onDone);
  }, [onDone, progress, scale, slide, sparkle, tick]);

  const tickScale = tick.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.2, 1.15, 1],
  });
  const sparkleRotate = sparkle.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '18deg'],
  });
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        top: 52,
        zIndex: 999,
        transform: [{ translateY: slide }, { scale }],
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tierColor,
          padding: 14,
          shadowColor: '#000',
          shadowOpacity: theme.dark ? 0.35 : 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            opacity: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            transform: [{ rotate: sparkleRotate }],
          }}
        >
          <Ionicons name="sparkles" size={22} color={tierColor} />
        </Animated.View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: tierColor + '22',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: tierColor,
            }}
          >
            <Animated.View style={{ transform: [{ scale: tickScale }] }}>
              <Ionicons name="checkmark" size={26} color={tierColor} />
            </Animated.View>
          </View>

          <View style={{ flex: 1, paddingRight: 18 }}>
            <Text style={{ color: tierColor, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>
              Achievement unlocked
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginTop: 2 }} numberOfLines={1}>
              {unlock.title}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
              {unlock.accolade}
            </Text>
            {unlock.coinReward > 0 && (
              <Text style={{ color: tierColor, fontSize: 12, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>
                +{unlock.coinReward} Stackr Coins
              </Text>
            )}
          </View>
        </View>

        <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 999, marginTop: 12, overflow: 'hidden' }}>
          <Animated.View style={{ height: '100%', width: progressWidth, backgroundColor: tierColor, borderRadius: 999 }} />
        </View>
      </View>
    </Animated.View>
  );
}

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const { user, cachedReadSession } = useAuth();
  const accountId = user?.id ?? null;
  // This is only a lifetime marker for UI work. It never grants access: the
  // live user ID remains required, and account switches with the same final
  // ID still invalidate earlier asynchronous reads and notifier leases.
  const accountEpoch = accountId && cachedReadSession?.userId === accountId
    ? cachedReadSession?.epoch ?? 0
    : 0;
  const [unlocks, setUnlocks] = useState<AchievementUnlock[]>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [queue, setQueue] = useState<{ generation: number; unlock: AchievementUnlock }[]>([]);
  const [currentUnlock, setCurrentUnlock] = useState<{ generation: number; unlock: AchievementUnlock } | null>(null);
  const mountedRef = useRef(false);
  const accountRef = useRef({ id: accountId, epoch: accountEpoch, generation: 0 });
  const unlocksGenerationRef = useRef(-1);
  const coinsGenerationRef = useRef(-1);
  if (accountRef.current.id !== accountId || accountRef.current.epoch !== accountEpoch) {
    accountRef.current = { id: accountId, epoch: accountEpoch, generation: accountRef.current.generation + 1 };
  }
  const activeAccount = accountRef.current;
  const isCurrentAccount = useCallback((expectedId: string | null, expectedGeneration: number) => (
    mountedRef.current
    && accountRef.current.id === expectedId
    && accountRef.current.generation === expectedGeneration
  ), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshCoins = useCallback(async () => {
    const expectedId = user?.id ?? null;
    const expectedEpoch = accountEpoch;
    if (accountRef.current.epoch !== expectedEpoch) return;
    const expectedGeneration = accountRef.current.generation;
    if (!expectedId) {
      if (!isCurrentAccount(null, expectedGeneration)) return;
      coinsGenerationRef.current = expectedGeneration;
      setCoinBalance(0);
      return;
    }

    const next = await fetchUserCoinBalance(expectedId);
    if (!isCurrentAccount(expectedId, expectedGeneration)) return;
    coinsGenerationRef.current = expectedGeneration;
    setCoinBalance(next);
  }, [accountEpoch, isCurrentAccount, user?.id]);

  const refreshAchievements = useCallback(async () => {
    const expectedId = user?.id ?? null;
    const expectedEpoch = accountEpoch;
    if (accountRef.current.epoch !== expectedEpoch) return;
    const expectedGeneration = accountRef.current.generation;
    if (!expectedId) {
      if (!isCurrentAccount(null, expectedGeneration)) return;
      unlocksGenerationRef.current = expectedGeneration;
      coinsGenerationRef.current = expectedGeneration;
      setUnlocks([]);
      setCoinBalance(0);
      return;
    }

    const [next, nextCoins] = await Promise.all([
      fetchUserAchievementUnlocks(expectedId),
      fetchUserCoinBalance(expectedId),
    ]);
    if (!isCurrentAccount(expectedId, expectedGeneration)) return;
    unlocksGenerationRef.current = expectedGeneration;
    coinsGenerationRef.current = expectedGeneration;
    setUnlocks(next);
    setCoinBalance(nextCoins);
  }, [accountEpoch, isCurrentAccount, user?.id]);

  const enqueueUnlocks = useCallback((expectedId: string, expectedGeneration: number, nextUnlocks: AchievementUnlock[]) => {
    if (!nextUnlocks.length || !isCurrentAccount(expectedId, expectedGeneration)) return;
    // State is render-masked during an account transition, but React still
    // retains its previous values. Capture their provenance before marking
    // this generation current so an early B notification cannot merge A.
    const hasCurrentUnlocks = unlocksGenerationRef.current === expectedGeneration;
    const hasCurrentCoins = coinsGenerationRef.current === expectedGeneration;
    unlocksGenerationRef.current = expectedGeneration;
    coinsGenerationRef.current = expectedGeneration;
    setUnlocks((prev) => {
      const baseline = hasCurrentUnlocks ? prev : [];
      const existing = new Set(baseline.map((unlock) => unlock.id));
      const merged = [...nextUnlocks.filter((unlock) => !existing.has(unlock.id)), ...baseline];
      return merged;
    });
    setCoinBalance((prev) => (hasCurrentCoins ? prev : 0) + nextUnlocks.reduce((total, unlock) => total + unlock.coinReward, 0));
    setQueue((prev) => [...prev, ...nextUnlocks.map((unlock) => ({ generation: expectedGeneration, unlock }))]);
  }, [isCurrentAccount]);

  useEffect(() => {
    const expectedId = activeAccount.id;
    const expectedGeneration = activeAccount.generation;
    setAchievementUnlockNotifier((notifierUserId, nextUnlocks) => {
      if (!expectedId || notifierUserId !== expectedId || !isCurrentAccount(expectedId, expectedGeneration)) return;
      enqueueUnlocks(expectedId, expectedGeneration, nextUnlocks);
    });
    return () => setAchievementUnlockNotifier(null);
  }, [activeAccount.generation, activeAccount.id, enqueueUnlocks, isCurrentAccount]);

  useEffect(() => {
    // The render-time generation mask prevents a cross-account flash; clearing
    // stale toast work here lets the current account's queue continue normally.
    setQueue((previous) => previous.filter((entry) => entry.generation === activeAccount.generation));
    setCurrentUnlock((current) => current?.generation === activeAccount.generation ? current : null);
  }, [activeAccount.generation]);

  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements]);

  useEffect(() => {
    if (currentUnlock || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (next.generation !== activeAccount.generation) {
      setQueue(rest);
      return;
    }
    setCurrentUnlock(next);
    setQueue(rest);
  }, [activeAccount.generation, currentUnlock, queue]);

  const recordEvent = useCallback(async (eventType: AchievementEvent, metadata: Record<string, unknown> = {}) => {
    await recordAchievementEvent(eventType, metadata);
  }, []);

  const checkNow = useCallback(async (metadata: Record<string, unknown> = {}) => {
    await checkAchievements(metadata);
  }, []);

  const value = useMemo<AchievementContextType>(() => ({
    unlocks: unlocksGenerationRef.current === activeAccount.generation ? unlocks : [],
    coinBalance: coinsGenerationRef.current === activeAccount.generation ? coinBalance : 0,
    refreshAchievements,
    refreshCoins,
    recordEvent,
    checkNow,
  }), [activeAccount.generation, checkNow, coinBalance, recordEvent, refreshAchievements, refreshCoins, unlocks]);

  return (
    <AchievementContext.Provider value={value}>
      {children}
      {currentUnlock?.generation === activeAccount.generation && (
        <AchievementToast
          unlock={currentUnlock.unlock}
          onDone={() => setCurrentUnlock((current) => (
            current?.generation === activeAccount.generation ? null : current
          ))}
        />
      )}
    </AchievementContext.Provider>
  );
}

export function useAchievements() {
  return useContext(AchievementContext);
}
