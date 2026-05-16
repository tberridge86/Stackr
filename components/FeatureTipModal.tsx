import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type TipIcon = React.ComponentProps<typeof Ionicons>['name'];

type FeatureTipItem = {
  icon: TipIcon;
  title: string;
  body: string;
};

type FeatureTipModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: FeatureTipItem[];
  storageLabel?: string;
  ctaLabel?: string;
  accentColor?: string;
  onClose: (dontShowAgain: boolean) => void;
};

type FeatureTipGateProps = Omit<FeatureTipModalProps, 'visible' | 'onClose'> & {
  tipKey: string;
  enabled?: boolean;
};

export function FeatureTipModal({
  visible,
  title,
  subtitle,
  items,
  storageLabel = "Don't show this again",
  ctaLabel = 'Got it',
  accentColor,
  onClose,
}: FeatureTipModalProps) {
  const { theme } = useTheme();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const accent = accentColor ?? theme.colors.primary;

  const close = () => {
    onClose(dontShowAgain);
    setDontShowAgain(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.48)', justifyContent: 'center', padding: 18 }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} />
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            maxHeight: '82%',
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          }}
        >
          <TouchableOpacity
            onPress={close}
            activeOpacity={0.75}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons name="close" size={19} color={theme.colors.textSoft} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 12, paddingHorizontal: 24 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 15,
                backgroundColor: `${accent}1A`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 9,
              }}
            >
              <Ionicons name="sparkles-outline" size={23} color={accent} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900', textAlign: 'center' }}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 5, lineHeight: 17 }}>
                {subtitle}
              </Text>
            )}
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <View
                key={`${item.icon}-${item.title}`}
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    width: 31,
                    height: 31,
                    borderRadius: 10,
                    backgroundColor: theme.colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Ionicons name={item.icon} size={17} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: 2 }}>{item.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => setDontShowAgain((current) => !current)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>{storageLabel}</Text>
            <Switch
              value={dontShowAgain}
              onValueChange={setDontShowAgain}
              trackColor={{ false: theme.colors.border, true: `${accent}66` }}
              thumbColor={dontShowAgain ? accent : theme.colors.card}
            />
          </Pressable>

          <TouchableOpacity
            onPress={close}
            activeOpacity={0.85}
            style={{ marginTop: 12, backgroundColor: accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>{ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function FeatureTipGate({ tipKey, enabled = true, ...modalProps }: FeatureTipGateProps) {
  const [visible, setVisible] = useState(false);
  const storageKey = `stackr:feature-tip-dismissed:${tipKey}`;

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const checkTip = async () => {
      if (!enabled) return;
      try {
        const dismissed = await AsyncStorage.getItem(storageKey);
        if (mounted && dismissed !== 'true') setVisible(true);
      } catch (error) {
        console.log('Feature tip check failed', error);
      }
    };
    checkTip();
    return () => {
      mounted = false;
    };
  }, [enabled, storageKey]));

  const close = useCallback(async (dontShowAgain: boolean) => {
    setVisible(false);
    if (!dontShowAgain) return;
    try {
      await AsyncStorage.setItem(storageKey, 'true');
    } catch (error) {
      console.log('Feature tip dismiss failed', error);
    }
  }, [storageKey]);

  return <FeatureTipModal visible={visible} onClose={close} {...modalProps} />;
}
