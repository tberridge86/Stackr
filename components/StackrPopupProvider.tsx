import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { StackrCenterModal } from './StackrModalSystem';
import { typeScale } from '../lib/typography';

type StackrPopupRequest = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

const originalAlert = Alert.alert.bind(Alert);

function normaliseButtons(buttons?: AlertButton[]) {
  if (buttons && buttons.length > 0) return buttons;
  return [{ text: 'OK' }];
}

function getButtonIcon(button: AlertButton) {
  const text = button.text?.toLowerCase() ?? '';
  if (button.style === 'destructive') return 'trash-outline';
  if (button.style === 'cancel') return 'close-outline';
  if (text.includes('detail') || text.includes('view')) return 'information-circle-outline';
  if (text.includes('add') || text.includes('save')) return 'add-circle-outline';
  if (text.includes('share')) return 'share-outline';
  if (text.includes('log out') || text.includes('logout')) return 'log-out-outline';
  if (text.includes('remove') || text.includes('delete') || text.includes('decline') || text.includes('withdraw')) return 'trash-outline';
  if (text.includes('report') || text.includes('dispute')) return 'flag-outline';
  return 'chevron-forward-outline';
}

function getPromptTone(popup: StackrPopupRequest | null, buttons: AlertButton[]) {
  const copy = `${popup?.title ?? ''} ${popup?.message ?? ''}`.toLowerCase();
  const hasDestructive = buttons.some((button) => button.style === 'destructive');

  if (copy.includes('quick actions')) {
    return { icon: 'sparkles' as const, kind: 'primary' as const };
  }
  if (hasDestructive) {
    return { icon: 'shield-checkmark-outline' as const, kind: 'destructive' as const };
  }
  if (
    copy.includes('error') ||
    copy.includes('failed') ||
    copy.includes('could not') ||
    copy.includes('unable') ||
    copy.includes('missing') ||
    copy.includes('invalid')
  ) {
    return { icon: 'alert-circle-outline' as const, kind: 'error' as const };
  }
  if (
    copy.includes('saved') ||
    copy.includes('added') ||
    copy.includes('unlocked') ||
    copy.includes('completed') ||
    copy.includes('sent') ||
    copy.includes('thanks')
  ) {
    return { icon: 'checkmark-circle-outline' as const, kind: 'success' as const };
  }
  if (copy.includes('?') || buttons.length > 1) {
    return { icon: 'help-circle-outline' as const, kind: 'primary' as const };
  }
  return { icon: 'sparkles' as const, kind: 'primary' as const };
}

export function StackrPopupProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [activePopup, setActivePopup] = useState<StackrPopupRequest | null>(null);
  const queueRef = useRef<StackrPopupRequest[]>([]);

  const openNextPopup = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setActivePopup(next);
  }, []);

  const closePopup = useCallback((button?: AlertButton) => {
    setActivePopup(null);
    setTimeout(() => {
      button?.onPress?.();
      openNextPopup();
    }, 80);
  }, [openNextPopup]);

  const dismissPopup = useCallback(() => {
    if (!activePopup?.options?.cancelable) return;
    setActivePopup(null);
    setTimeout(() => {
      activePopup.options?.onDismiss?.();
      openNextPopup();
    }, 80);
  }, [activePopup, openNextPopup]);

  useEffect(() => {
    Alert.alert = (title, message, buttons, options) => {
      const request = { title, message, buttons, options };
      queueRef.current.push(request);
      setActivePopup((current) => current ?? queueRef.current.shift() ?? null);
    };

    return () => {
      Alert.alert = originalAlert;
    };
  }, []);

  const buttons = useMemo(() => normaliseButtons(activePopup?.buttons), [activePopup?.buttons]);
  const primaryButton = buttons.length === 1 ? buttons[0] : null;
  const hasManyActions = buttons.length > 2;
  const tone = useMemo(() => getPromptTone(activePopup, buttons), [activePopup, buttons]);
  const toneColor = tone.kind === 'destructive' || tone.kind === 'error'
    ? theme.colors.semantic.error
    : tone.kind === 'success'
      ? theme.colors.semantic.success
      : theme.colors.primary;

  return (
    <>
      {children}
      <StackrCenterModal
        visible={Boolean(activePopup)}
        onClose={dismissPopup}
        dismissible={Boolean(activePopup?.options?.cancelable)}
        contentStyle={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowOpacity: theme.dark ? 0.32 : 0.14,
          },
        ]}
      >
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: `${toneColor}18`, borderColor: `${toneColor}33` }]}>
                <Ionicons name={tone.icon} size={23} color={toneColor} />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                  {activePopup?.title}
                </Text>
                {!!activePopup?.message && (
                  <Text style={[styles.message, { color: theme.colors.textSoft }]}>
                    {activePopup.message}
                  </Text>
                )}
              </View>
            </View>

            <ScrollView
              style={hasManyActions ? styles.scrollActions : undefined}
              contentContainerStyle={styles.actions}
              showsVerticalScrollIndicator={false}
            >
              {buttons.map((button, index) => {
                const isPrimary = button === primaryButton || (buttons.length > 1 && button.style !== 'cancel' && button.style !== 'destructive' && index === 0);
                const isDestructive = button.style === 'destructive';
                const isCancel = button.style === 'cancel';
                const buttonColor = isDestructive ? theme.colors.semantic.error : isPrimary ? theme.colors.primary : theme.colors.text;
                const buttonBackground = isPrimary
                  ? theme.colors.primary
                  : isDestructive
                    ? `${theme.colors.semantic.error}12`
                    : isCancel
                      ? theme.colors.surface
                      : theme.colors.surface;
                const textColor = isPrimary ? '#FFFFFF' : buttonColor;

                return (
                  <TouchableOpacity
                    key={`${button.text ?? 'Action'}-${index}`}
                    activeOpacity={0.82}
                    onPress={() => closePopup(button)}
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: buttonBackground,
                        borderColor: isPrimary ? theme.colors.primary : isDestructive ? `${theme.colors.semantic.error}25` : theme.colors.border,
                      },
                    ]}
                  >
                    <View style={[
                      styles.actionIcon,
                      {
                        backgroundColor: isPrimary ? 'rgba(255,255,255,0.18)' : theme.colors.card,
                        borderColor: isPrimary ? 'rgba(255,255,255,0.24)' : theme.colors.border,
                      },
                    ]}>
                      <Ionicons name={getButtonIcon(button)} size={18} color={textColor} />
                    </View>
                    <Text style={[styles.actionText, { color: textColor }]} numberOfLines={2}>
                      {button.text ?? 'OK'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
      </StackrCenterModal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingRight: 2,
    marginBottom: 14,
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerText: {
    flex: 1,
    paddingTop: 2,
  },
  title: {
    ...typeScale.sectionTitleCompact,
    fontSize: 20,
    lineHeight: 25,
  },
  message: {
    ...typeScale.body,
    marginTop: 4,
  },
  actions: {
    gap: 9,
  },
  scrollActions: {
    maxHeight: Platform.OS === 'ios' ? 370 : 330,
  },
  actionButton: {
    minHeight: 54,
    borderRadius: 17,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...typeScale.buttonPrimary,
    flex: 1,
    textAlign: 'left',
  },
});
