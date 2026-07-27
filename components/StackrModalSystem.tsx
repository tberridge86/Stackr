import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type DimensionValue,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { typeScale } from '../lib/typography';

type StackrModalBaseProps = {
  visible: boolean;
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
};

export type StackrQuickAction = {
  label: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  imageIcon?: ImageSourcePropType;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function StackrCenterModal({
  visible,
  children,
  onClose,
  dismissible = true,
  maxHeight = '84%',
  contentStyle,
}: StackrModalBaseProps & {
  maxHeight?: DimensionValue;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.centerBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          disabled={!dismissible}
          onPress={dismissible ? onClose : undefined}
        />
        <View
          style={[
            styles.centerCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              maxHeight,
              shadowOpacity: theme.dark ? 0.32 : 0.16,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function StackrBottomSheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
  onClear,
  clearLabel = 'Clear all',
  dismissible = true,
  maxHeight = '78%',
  scroll = true,
  footer,
  contentContainerStyle,
  sheetStyle,
}: StackrModalBaseProps & {
  title?: string;
  subtitle?: string;
  onClear?: () => void;
  clearLabel?: string;
  maxHeight?: DimensionValue;
  scroll?: boolean;
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const hasHeader = Boolean(title || subtitle || onClear);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot}>
        <Pressable
          style={styles.sheetOverlay}
          disabled={!dismissible}
          onPress={dismissible ? onClose : undefined}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 10) + 14,
              maxHeight,
              shadowOpacity: theme.dark ? 0.3 : 0.14,
            },
            sheetStyle,
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
          {hasHeader ? (
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeadingCopy}>
                {title ? (
                  <Text style={[styles.sheetTitle, { color: theme.colors.text }]} numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
                {subtitle ? (
                  <Text style={[styles.sheetSubtitle, { color: theme.colors.textSoft }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <View style={styles.sheetHeaderActions}>
                {onClear ? (
                  <TouchableOpacity
                    onPress={onClear}
                    activeOpacity={0.76}
                    accessibilityRole="button"
                    accessibilityLabel={clearLabel}
                    style={[styles.clearButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  >
                    <Text style={[styles.clearText, { color: theme.colors.primary }]} numberOfLines={1}>
                      {clearLabel}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.76}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={[styles.closeButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                >
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {scroll ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
              contentContainerStyle={[styles.sheetScrollContent, contentContainerStyle]}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.sheetStaticContent, contentContainerStyle]}>{children}</View>
          )}

          {footer}
        </View>
      </View>
    </Modal>
  );
}

export function StackrQuickActionSheet({
  visible,
  title,
  subtitle = 'Quick actions',
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: StackrQuickAction[];
  onClose: () => void;
}) {
  const { theme } = useTheme();

  const pressAction = (action: StackrQuickAction) => {
    if (action.disabled) return;
    onClose();
    if (action.onPress) {
      setTimeout(() => action.onPress?.(), 90);
    }
  };

  return (
    <StackrBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      scroll={false}
      maxHeight="64%"
      contentContainerStyle={styles.quickActions}
    >
      {actions.map((action) => {
        const toneColor = action.destructive ? theme.colors.semantic.error : theme.colors.primary;
        const textColor = action.disabled
          ? theme.colors.textSoft
          : action.destructive
            ? theme.colors.semantic.error
            : theme.colors.text;

        return (
          <TouchableOpacity
            key={action.label}
            onPress={() => pressAction(action)}
            disabled={action.disabled}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={[
              styles.quickActionRow,
              {
                backgroundColor: action.destructive ? `${theme.colors.semantic.error}10` : theme.colors.surface,
                borderColor: action.destructive ? `${theme.colors.semantic.error}24` : theme.colors.border,
                opacity: action.disabled ? 0.48 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.quickActionIcon,
                {
                  backgroundColor: action.destructive ? `${theme.colors.semantic.error}12` : theme.colors.card,
                  borderColor: action.destructive ? `${theme.colors.semantic.error}22` : theme.colors.border,
                },
              ]}
            >
              {action.imageIcon ? (
                <Image source={action.imageIcon} style={styles.quickActionImageIcon} resizeMode="contain" />
              ) : (
                <Ionicons name={action.icon ?? 'sparkles-outline'} size={19} color={toneColor} />
              )}
            </View>
            <View style={styles.quickActionCopy}>
              <Text style={[styles.quickActionLabel, { color: textColor }]} numberOfLines={1}>
                {action.label}
              </Text>
              {action.subtitle ? (
                <Text style={[styles.quickActionSubtitle, { color: theme.colors.textSoft }]} numberOfLines={2}>
                  {action.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons
              name={action.destructive ? 'trash-outline' : 'chevron-forward-outline'}
              size={18}
              color={action.destructive ? theme.colors.semantic.error : theme.colors.textSoft}
            />
          </TouchableOpacity>
        );
      })}
    </StackrBottomSheet>
  );
}

const styles = StyleSheet.create({
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 32, 0.54)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  centerCard: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#07145F',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 13 },
    elevation: 10,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 32, 0.36)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    shadowColor: '#07145F',
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sheetHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    ...typeScale.sectionTitleCompact,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
  },
  sheetSubtitle: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    ...typeScale.buttonSecondary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
  sheetStaticContent: {
    gap: 9,
  },
  quickActions: {
    gap: 9,
    paddingBottom: 2,
  },
  quickActionRow: {
    minHeight: 58,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionImageIcon: {
    width: 24,
    height: 24,
  },
  quickActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  quickActionLabel: {
    ...typeScale.buttonPrimary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  quickActionSubtitle: {
    ...typeScale.caption,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 2,
  },
});
