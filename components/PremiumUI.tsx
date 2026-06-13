import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'purple' | 'gold' | 'green' | 'neutral' | 'danger';

const premiumShadow = {
  shadowColor: '#1B2A4B',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function toneColor(tone: Tone, primary: string, secondary: string) {
  if (tone === 'gold') return secondary;
  if (tone === 'green') return '#10B981';
  if (tone === 'danger') return '#EF4444';
  if (tone === 'neutral') return '#7970A9';
  return primary;
}

export function PremiumCard({
  children,
  style,
  selected = false,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  padded?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: selected ? theme.colors.primary + '10' : theme.colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          padding: padded ? 14 : 0,
          ...premiumShadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function LayeredPanel({
  children,
  style,
  accent = 'purple',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: Tone;
}) {
  const { theme } = useTheme();
  const accentColor = toneColor(accent, theme.colors.primary, theme.colors.secondary);

  return (
    <View style={[{ position: 'relative' }, style]}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: -7,
          height: 24,
          borderRadius: 18,
          backgroundColor: accentColor + '18',
          borderWidth: 1,
          borderColor: accentColor + '20',
        }}
      />
      <PremiumCard>{children}</PremiumCard>
    </View>
  );
}

export function StatPill({
  label,
  value,
  icon,
  tone = 'purple',
}: {
  label: string;
  value: string;
  icon?: IconName;
  tone?: Tone;
}) {
  const { theme } = useTheme();
  const color = toneColor(tone, theme.colors.primary, theme.colors.secondary);

  return (
    <View
      style={{
        flex: 1,
        minWidth: 98,
        backgroundColor: color + '12',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: color + '35',
        paddingHorizontal: 11,
        paddingVertical: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>
          {label}
        </Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color, fontSize: 16, fontWeight: '900' }}>
        {value}
      </Text>
    </View>
  );
}

export function ProgressBadge({
  value,
  label,
  complete = false,
}: {
  value: number;
  label?: string;
  complete?: boolean;
}) {
  const { theme } = useTheme();
  const color = complete ? theme.colors.secondary : theme.colors.primary;

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
          {label ?? 'Completion'}
        </Text>
        <Text style={{ color, fontSize: 12, fontWeight: '900' }}>{Math.max(0, Math.min(100, value))}%</Text>
      </View>
      <View style={{ height: 7, borderRadius: 999, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
        <View
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function EmptyStateCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <LayeredPanel accent="purple" style={{ marginHorizontal: 4 }}>
      <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12 }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 19,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <Ionicons name={icon} size={27} color={theme.colors.primary} />
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 }}>
          {body}
        </Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            style={{
              marginTop: 16,
              backgroundColor: theme.colors.primary,
              borderRadius: 14,
              paddingHorizontal: 18,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </LayeredPanel>
  );
}

export function ActionTile({
  icon,
  title,
  body,
  onPress,
  selected = false,
  tone = 'purple',
  badge,
}: {
  icon: IconName;
  title: string;
  body?: string;
  onPress?: () => void;
  selected?: boolean;
  tone?: Tone;
  badge?: string;
}) {
  const { theme } = useTheme();
  const color = toneColor(tone, theme.colors.primary, theme.colors.secondary);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.82}
      style={{
        flex: 1,
        minWidth: 130,
        backgroundColor: selected ? color + '16' : theme.colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: selected ? color : theme.colors.border,
        padding: 13,
        ...premiumShadow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: color + '16',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {badge ? (
          <View style={{ backgroundColor: theme.colors.secondary + '30', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: theme.colors.text, fontSize: 10, fontWeight: '900' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
        {title}
      </Text>
      {body ? (
        <Text numberOfLines={2} style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: 4 }}>
          {body}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export function TrustBadge({
  label,
  icon = 'shield-checkmark',
  tone = 'green',
}: {
  label: string;
  icon?: IconName;
  tone?: Tone;
}) {
  const { theme } = useTheme();
  const color = toneColor(tone, theme.colors.primary, theme.colors.secondary);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
        backgroundColor: color + '13',
        borderWidth: 1,
        borderColor: color + '35',
      }}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: '900' }}>{label}</Text>
    </View>
  );
}

export function ValueSummaryCard({
  label,
  value,
  helper,
  tone = 'green',
  loading = false,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const color = toneColor(tone, theme.colors.primary, theme.colors.secondary);

  return (
    <PremiumCard style={{ flex: 1, minWidth: 102, padding: 12 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900', marginBottom: 5 }}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={{ color, fontSize: 18, fontWeight: '900' }}>
          {value}
        </Text>
      )}
      {helper ? (
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
          {helper}
        </Text>
      ) : null}
    </PremiumCard>
  );
}

export function ScanModeCard(props: {
  title: string;
  body: string;
  icon: IconName;
  onPress: () => void;
  selected?: boolean;
  tone?: Tone;
}) {
  return <ActionTile {...props} />;
}

export function BinderProgressCard({
  title,
  owned,
  total,
  value,
  badge,
  onPress,
}: {
  title: string;
  owned: number;
  total: number;
  value?: string;
  badge?: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const percent = total ? Math.round((owned / total) * 100) : 0;

  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.84}>
      <PremiumCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>
              {title}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
              {owned}/{total} owned{value ? ` - ${value}` : ''}
            </Text>
          </View>
          {badge ? <TrustBadge label={badge} icon="albums-outline" tone="purple" /> : null}
        </View>
        <View style={{ marginTop: 12 }}>
          <ProgressBadge value={percent} complete={percent >= 100} />
        </View>
      </PremiumCard>
    </TouchableOpacity>
  );
}

export function TradeTypeCard({
  title,
  description,
  trustLevel,
  valueRange,
  icon,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  trustLevel: string;
  valueRange?: string;
  icon: IconName;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.84}>
      <PremiumCard selected={selected}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: theme.colors.primary + '14',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={21} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>{title}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{description}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <TrustBadge label={trustLevel} tone="green" />
              {valueRange ? <TrustBadge label={valueRange} icon="cash-outline" tone="gold" /> : null}
            </View>
          </View>
        </View>
      </PremiumCard>
    </TouchableOpacity>
  );
}

export function HeroActionPanel({
  title,
  subtitle,
  icon,
  children,
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  children?: React.ReactNode;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <LayeredPanel accent="purple">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: theme.colors.primary + '14',
            borderWidth: 1,
            borderColor: theme.colors.primary + '30',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={27} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>
            {title}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 5 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      {children ? <View style={{ marginTop: 15 }}>{children}</View> : null}

      {(primaryLabel && onPrimaryPress) || (secondaryLabel && onSecondaryPress) ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {secondaryLabel && onSecondaryPress ? (
            <TouchableOpacity
              onPress={onSecondaryPress}
              style={{
                flex: 1,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                alignItems: 'center',
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {primaryLabel && onPrimaryPress ? (
            <TouchableOpacity
              onPress={onPrimaryPress}
              style={{
                flex: 1,
                borderRadius: 14,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{primaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </LayeredPanel>
  );
}

