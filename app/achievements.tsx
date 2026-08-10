import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrPageTitle } from '../components/StackrScreen';
import { Text } from '../components/Text';
import { useAchievements } from '../components/achievement-context';
import { useTheme } from '../components/theme-context';
import { ACHIEVEMENTS, type AchievementDefinition } from '../lib/achievements';
import { stackrIcons } from '../lib/stackrIcons';

const ACHIEVEMENT_ICONS = {
  binders: stackrIcons.binders,
  cards: stackrIcons.scanCard,
  progress: stackrIcons.hub,
  protect: stackrIcons.protect,
  featured: stackrIcons.scanCard,
  coins: stackrIcons.priceBuilder,
};

type AchievementFilter = 'all' | 'completed' | 'locked' | 'collector' | 'binder' | 'marketplace' | 'social' | 'seller';

const filters: AchievementFilter[] = ['all', 'completed', 'locked', 'collector', 'binder', 'marketplace', 'social', 'seller'];

function getIcon(achievement: AchievementDefinition): ImageSourcePropType {
  if (achievement.id.includes('binder')) return ACHIEVEMENT_ICONS.binders;
  if (achievement.id.includes('scan')) return ACHIEVEMENT_ICONS.cards;
  if (achievement.id.includes('master')) return ACHIEVEMENT_ICONS.protect;
  if (achievement.id.includes('card')) return ACHIEVEMENT_ICONS.featured;
  return ACHIEVEMENT_ICONS.progress;
}

function getTierColour(tier: AchievementDefinition['tier']) {
  if (tier === 'rainbow') return '#8B5CF6';
  if (tier === 'gold') return '#F6C453';
  if (tier === 'silver') return '#94A3B8';
  return '#C08457';
}

function getCategory(achievement: AchievementDefinition): AchievementFilter {
  if (achievement.id.includes('binder') || achievement.id.includes('master')) return 'binder';
  if (achievement.id.includes('card') || achievement.id.includes('scan')) return 'collector';
  return 'collector';
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { unlocks } = useAchievements();
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const unlockMap = useMemo(() => new Map(unlocks.map((unlock) => [unlock.id, unlock])), [unlocks]);

  const filtered = useMemo(() => {
    return ACHIEVEMENTS.filter((achievement) => {
      const completed = unlockMap.has(achievement.id);
      if (filter === 'completed') return completed;
      if (filter === 'locked') return !completed;
      if (filter === 'all') return true;
      return getCategory(achievement) === filter;
    });
  }, [filter, unlockMap]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 72 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <StackrPageTitle title="Achievements" accentText="ments" />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>
              Badges earned across your Stackr journey.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
          {filters.map((item) => {
            const active = item === filter;
            const label = item[0].toUpperCase() + item.slice(1);
            return (
              <TouchableOpacity
                key={item}
                onPress={() => setFilter(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ minHeight: 38, borderRadius: 999, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.colors.primary : '#FFFFFF', borderWidth: 1, borderColor: active ? theme.colors.primary : '#E8E1FF' }}
              >
                <Text style={{ color: active ? '#FFFFFF' : theme.colors.textSoft, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {filtered.map((achievement) => {
            const unlocked = unlockMap.get(achievement.id);
            const tierColour = getTierColour(achievement.tier);
            return (
              <View key={achievement.id} style={{ width: '48%', minHeight: 148, borderRadius: 20, padding: 12, backgroundColor: unlocked ? '#FFFFFF' : 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: unlocked ? tierColour : '#E8E1FF', opacity: unlocked ? 1 : 0.66 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: unlocked ? tierColour : '#DCD5F4', backgroundColor: unlocked ? `${tierColour}18` : '#F7F3FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={getIcon(achievement)} resizeMode="contain" style={{ width: 28, height: 28, opacity: unlocked ? 1 : 0.56 }} />
                  </View>
                  <Text style={{ color: unlocked ? tierColour : theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase' }}>{achievement.tier}</Text>
                </View>
                <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 10 }} numberOfLines={2}>{achievement.title}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>{achievement.description}</Text>
                <Text style={{ color: unlocked ? tierColour : theme.colors.textSoft, fontSize: 11.5, lineHeight: 14, fontWeight: '900', marginTop: 10 }}>
                  {unlocked ? 'Unlocked' : 'Locked'} · +{achievement.coinReward} coins
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
