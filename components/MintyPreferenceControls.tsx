import React, { useCallback } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { useMintyPreferences } from '../lib/mintyPreferences';
import type { MintyPersonalisationSettings } from '../lib/mintyInsights';

const controls: Array<{ key: keyof MintyPersonalisationSettings; title: string; detail: string }> = [
  { key: 'personalisedInsights', title: 'Personalised advice', detail: 'Use your collection goals to choose Minty tips.' },
  { key: 'useChaseList', title: 'Use chase list', detail: 'Connect advice to cards you are hunting.' },
  { key: 'useViewingHistory', title: 'Use viewing history', detail: 'Use cards and searches you return to.' },
  { key: 'useTradeHistory', title: 'Use trade history', detail: 'Use duplicate activity in trade suggestions.' },
  { key: 'usePriceAlerts', title: 'Use price alerts', detail: 'Prioritise cards you want price help with.' },
  { key: 'useMarketCatalysts', title: 'Use events and releases', detail: 'Consider relevant upcoming releases and events.' },
];

export function MintyPreferenceControls({ userId }: { userId: string | null | undefined }) {
  const { theme } = useTheme();
  const preferences = useMintyPreferences(userId);
  const update = useCallback(async (key: keyof MintyPersonalisationSettings, value: boolean) => {
    try { await preferences.save({ [key]: value } as Partial<MintyPersonalisationSettings>); } catch { /* state exposes a retryable error */ }
  }, [preferences]);

  return <View accessibilityLabel="Minty personalisation controls">
    {controls.map((control, index) => <View key={control.key} style={{ paddingVertical: 12, gap: 5, borderTopWidth: index ? 1 : 0, borderColor: theme.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>{control.title}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, marginTop: 3 }}>{control.detail}</Text>
        </View>
        <Switch
          value={preferences.settings[control.key]}
          disabled={!preferences.loaded || preferences.saving || !userId}
          onValueChange={(value) => void update(control.key, value)}
          accessibilityLabel={control.title}
          accessibilityHint="Saves this preference for the signed-in account on this device."
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        />
      </View>
    </View>)}
    {preferences.error ? <View style={{ marginTop: 10, gap: 6 }}>
      <Text accessibilityRole="alert" style={{ color: theme.colors.semantic.error, fontSize: 13 }}>{preferences.error}</Text>
      <Pressable accessibilityRole="button" onPress={() => void preferences.reload()} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700' }}>Retry loading Minty preferences</Text>
      </Pressable>
    </View> : null}
  </View>;
}
