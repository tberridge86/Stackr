import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
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
      <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.48)', justifyContent: 'center', padding: 20 }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} />
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
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
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons name="close" size={19} color={theme.colors.textSoft} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 16, paddingHorizontal: 24 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: `${accent}1A`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Ionicons name="sparkles-outline" size={28} color={accent} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {subtitle}
              </Text>
            )}
          </View>

          <View style={{ gap: 10 }}>
            {items.map((item) => (
              <View
                key={`${item.icon}-${item.title}`}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: theme.colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Ionicons name={item.icon} size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setDontShowAgain((current) => !current)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '800' }}>{storageLabel}</Text>
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
            style={{ marginTop: 16, backgroundColor: accent, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>{ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
