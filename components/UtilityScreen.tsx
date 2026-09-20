import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { StackrBackButton } from './StackrBackButton';
import { useTheme } from './theme-context';

export function UtilityScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { theme } = useTheme();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <View style={styles.header}>
      <StackrBackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', flex: 1 }}>{title}</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
  </SafeAreaView>;
}

export function UtilityGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return <View style={{ marginBottom: 24 }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginBottom: 8, marginLeft: 12 }}>{title}</Text>
    <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, overflow: 'hidden' }}>{children}</View>
  </View>;
}

export function UtilityRow({ title, detail, onPress, trailing, disabled = false, destructive = false }: {
  title: string; detail?: string; onPress?: () => void; trailing?: React.ReactNode; disabled?: boolean; destructive?: boolean;
}) {
  const { theme } = useTheme();
  const content = <>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: destructive ? theme.colors.semantic.error : theme.colors.text }}>{title}</Text>
      {detail ? <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>{detail}</Text> : null}
    </View>
    {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} /> : null)}
  </>;
  const style = [styles.row, { borderBottomColor: theme.colors.border, opacity: disabled ? 0.55 : 1 }];
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={style}>{content}</Pressable>
    : <View style={style}>{content}</View>;
}

const styles = StyleSheet.create({
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  content: { padding: 16, paddingBottom: 112, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { paddingHorizontal: 16, paddingVertical: 15, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 14 },
});
