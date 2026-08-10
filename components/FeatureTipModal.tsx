import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { StackrHeroBackdrop } from './StackrBackdrop';
import { StackrButtonPattern } from './StackrEmboss';
import { StackrCardActionIcon } from './StackrScreen';
import { StackrCenterModal } from './StackrModalSystem';
import { stackrIcons } from '../lib/stackrIcons';
import { typeScale } from '../lib/typography';

type TipIcon = React.ComponentProps<typeof Ionicons>['name'];

type FeatureTipItem = {
  icon: TipIcon;
  imageIcon?: ImageSourcePropType;
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
  showDontShowAgain?: boolean;
  onClose: (dontShowAgain: boolean) => void;
};

type FeatureTipGateProps = Omit<FeatureTipModalProps, 'visible' | 'onClose'> & {
  tipKey: string;
  enabled?: boolean;
};

const featureTipSeenThisSession = new Set<string>();

function getFeatureTipIcon(title: string): ImageSourcePropType {
  const normalised = title.toLowerCase();
  if (normalised.includes('hub')) return stackrIcons.hub;
  if (normalised.includes('collection')) return stackrIcons.binders;
  if (normalised.includes('social') || normalised.includes('community')) return stackrIcons.social;
  if (normalised.includes('seller')) return stackrIcons.sellerMode;
  if (normalised.includes('pok')) return stackrIcons.pokedex;
  if (normalised.includes('price')) return stackrIcons.priceBuilder;
  return stackrIcons.info;
}

export function FeatureTipModal({
  visible,
  title,
  subtitle,
  items,
  storageLabel = "Don't show this again",
  ctaLabel = 'Got it',
  accentColor,
  showDontShowAgain = true,
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
    <StackrCenterModal visible={visible} onClose={close} contentStyle={styles.card}>
          <StackrHeroBackdrop opacity={0.18} />
          <TouchableOpacity
            onPress={close}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.closeButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Ionicons name="close" size={21} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.header}>
              <StackrCardActionIcon
                source={getFeatureTipIcon(title)}
                frameSize={52}
                artworkSize={42}
                style={[styles.headerIcon, { backgroundColor: `${accent}10`, borderColor: `${accent}20` }]}
              />
              <View style={styles.headerCopy}>
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.84}>
                  {title}
                </Text>
                {!!subtitle && (
                  <Text style={[styles.subtitle, { color: theme.colors.textSoft }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>

            <ScrollView style={styles.itemsScroll} contentContainerStyle={styles.items} showsVerticalScrollIndicator={false}>
              {items.map((item) => (
                <View
                  key={`${item.icon}-${item.title}`}
                  style={[styles.itemCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                    {item.imageIcon ? (
                      <StackrCardActionIcon
                        source={item.imageIcon}
                        frameSize={30}
                        artworkSize={24}
                        style={styles.itemImageIcon}
                      />
                    ) : (
                      <Ionicons name={item.icon} size={18} color={accent} />
                    )}
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.itemBody, { color: theme.colors.textSoft }]} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {showDontShowAgain ? (
              <Pressable
                onPress={() => setDontShowAgain((current) => !current)}
                accessibilityRole="switch"
                accessibilityState={{ checked: dontShowAgain }}
                style={[styles.preferenceRow, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.70)' }]}
              >
                <Text style={[styles.preferenceLabel, { color: theme.colors.textSoft }]}>{storageLabel}</Text>
                <View
                  style={[
                    styles.preferenceTrack,
                    {
                      justifyContent: dontShowAgain ? 'flex-end' : 'flex-start',
                      backgroundColor: dontShowAgain ? `${accent}24` : theme.colors.border,
                      borderColor: dontShowAgain ? `${accent}55` : theme.colors.border,
                    },
                  ]}
                >
                  <View style={[styles.preferenceThumb, { backgroundColor: dontShowAgain ? accent : theme.colors.card }]} />
                </View>
              </Pressable>
            ) : null}

            <TouchableOpacity onPress={close} activeOpacity={0.85} style={styles.ctaShell}>
              <LinearGradient
                colors={theme.gradients.actionPrimary as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <StackrButtonPattern tone="purple" />
                <Text style={styles.ctaText}>{ctaLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
    </StackrCenterModal>
  );
}

export function FeatureTipGate({ tipKey, enabled = true, ...modalProps }: FeatureTipGateProps) {
  const [visible, setVisible] = useState(false);
  const storageKey = `stackr:feature-tip-dismissed:${tipKey}`;

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const checkTip = async () => {
      if (!enabled) return;
      if (featureTipSeenThisSession.has(tipKey)) return;
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
  }, [enabled, storageKey, tipKey]));

  const close = useCallback(async (dontShowAgain: boolean) => {
    featureTipSeenThisSession.add(tipKey);
    setVisible(false);
    if (!dontShowAgain) return;
    try {
      await AsyncStorage.setItem(storageKey, 'true');
    } catch (error) {
      console.log('Feature tip dismiss failed', error);
    }
  }, [storageKey, tipKey]);

  return <FeatureTipModal visible={visible} onClose={close} {...modalProps} />;
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    borderRadius: 26,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  content: {
    padding: 14,
    paddingTop: 18,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 38,
    marginBottom: 12,
  },
  headerIcon: {
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.pageTitle,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'left',
  },
  subtitle: {
    ...typeScale.support,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'left',
    marginTop: 3,
  },
  itemsScroll: {
    flexGrow: 0,
  },
  items: {
    gap: 9,
  },
  itemCard: {
    minHeight: 62,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImageIcon: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    ...typeScale.cardTitle,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  itemBody: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  preferenceRow: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  preferenceLabel: {
    ...typeScale.buttonSecondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    flex: 1,
  },
  preferenceTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  preferenceThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#07145F',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  ctaShell: {
    minHeight: 50,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    shadowColor: '#6136F5',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  cta: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  ctaText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
});
