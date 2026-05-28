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
  const { user } = useAuth();
  const [unlocks, setUnlocks] = useState<AchievementUnlock[]>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [queue, setQueue] = useState<AchievementUnlock[]>([]);
  const [currentUnlock, setCurrentUnlock] = useState<AchievementUnlock | null>(null);

  const refreshCoins = useCallback(async () => {
    if (!user?.id) {
      setCoinBalance(0);
      return;
    }

    const next = await fetchUserCoinBalance(user.id);
    setCoinBalance(next);
  }, [user?.id]);

  const refreshAchievements = useCallback(async () => {
    if (!user?.id) {
      setUnlocks([]);
      setCoinBalance(0);
      return;
    }

    const [next, nextCoins] = await Promise.all([
      fetchUserAchievementUnlocks(user.id),
      fetchUserCoinBalance(user.id),
    ]);
    setUnlocks(next);
    setCoinBalance(nextCoins);
  }, [user?.id]);

  const enqueueUnlocks = useCallback((nextUnlocks: AchievementUnlock[]) => {
    if (!nextUnlocks.length) return;
    setUnlocks((prev) => {
      const existing = new Set(prev.map((unlock) => unlock.id));
      const merged = [...nextUnlocks.filter((unlock) => !existing.has(unlock.id)), ...prev];
      return merged;
    });
    setCoinBalance((prev) => prev + nextUnlocks.reduce((total, unlock) => total + unlock.coinReward, 0));
    setQueue((prev) => [...prev, ...nextUnlocks]);
  }, []);

  useEffect(() => {
    setAchievementUnlockNotifier(enqueueUnlocks);
    return () => setAchievementUnlockNotifier(null);
  }, [enqueueUnlocks]);

  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements]);

  useEffect(() => {
    if (currentUnlock || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrentUnlock(next);
    setQueue(rest);
  }, [currentUnlock, queue]);

  const recordEvent = useCallback(async (eventType: AchievementEvent, metadata: Record<string, unknown> = {}) => {
    await recordAchievementEvent(eventType, metadata);
  }, []);

  const checkNow = useCallback(async (metadata: Record<string, unknown> = {}) => {
    await checkAchievements(metadata);
  }, []);

  const value = useMemo<AchievementContextType>(() => ({
    unlocks,
    coinBalance,
    refreshAchievements,
    refreshCoins,
    recordEvent,
    checkNow,
  }), [checkNow, coinBalance, recordEvent, refreshAchievements, refreshCoins, unlocks]);

  return (
    <AchievementContext.Provider value={value}>
      {children}
      {currentUnlock && (
        <AchievementToast
          unlock={currentUnlock}
          onDone={() => setCurrentUnlock(null)}
        />
      )}
    </AchievementContext.Provider>
  );
}

export function useAchievements() {
  return useContext(AchievementContext);
}
