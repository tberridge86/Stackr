import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Keyboard,
  Image,
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from '../Text';
import { useTheme } from '../theme-context';
import { StackrBackButton } from '../StackrBackButton';
import { StackrButtonPattern } from '../StackrEmboss';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../RaritySymbol';
import { StackrCardActionIcon } from '../StackrScreen';
import { stackrIcons } from '../../lib/stackrIcons';
import {
  PROTECTION_COPY,
  formatCurrency,
  formatProtectionTier,
  type EvidenceRequirement,
  type ListingFlowStage,
  type ListingProtectionTier,
  type MissingRequirement,
} from '../../lib/listingFlow';

type IconName = keyof typeof Ionicons.glyphMap;

export const STACKR_LISTING_INPUT_ACCESSORY_ID = 'stackr-listing-keyboard-accessory';

const STAGE_LABELS: Record<ListingFlowStage, string> = {
  card: 'Card',
  condition: 'Condition',
  value: 'Value',
  protection: 'Protection',
  evidence: 'Evidence',
  ai: 'AI check',
  gold: 'Gold',
  details: 'Details',
  review: 'Review',
};

const PROTECTION_TIER_ICON_SOURCE: Record<ListingProtectionTier, ImageSourcePropType> = {
  bronze: require('../../assets/rev2/10-market-trade/protection-tiers/Bronze.png'),
  silver: require('../../assets/rev2/10-market-trade/protection-tiers/silver.png'),
  gold: require('../../assets/rev2/10-market-trade/protection-tiers/gold.png'),
};

export function ListingFlowHeader({
  title = 'Create Listing',
  subtitle = 'Identify your card and build a trusted listing.',
  stages,
  activeStage,
  completedStages,
  onBack,
  onStagePress,
  stageLabels,
  rightAccessory,
}: {
  title?: string;
  subtitle?: string;
  stages: ListingFlowStage[];
  activeStage: ListingFlowStage;
  completedStages: ListingFlowStage[];
  onBack: () => void;
  onStagePress?: (stage: ListingFlowStage) => void;
  stageLabels?: Partial<Record<ListingFlowStage, string>>;
  rightAccessory?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const titleParts = title.trim().split(/\s+/);
  const titleAccent = titleParts.length > 1 ? titleParts.pop() : '';
  const titlePrefix = titleParts.join(' ');

  return (
    <View style={styles.headerShell}>
      <View style={styles.headerTopRow}>
        <StackrBackButton onPress={onBack} />
        <View style={styles.headerCopy}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            style={[styles.headerTitle, { color: theme.colors.text }]}
          >
            {titlePrefix || title}
            {titleAccent ? (
              <Text style={[styles.headerTitle, { color: theme.colors.primary }]}>
                {` ${titleAccent}`}
              </Text>
            ) : null}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: theme.colors.textSoft }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
          >
            {subtitle}
          </Text>
        </View>
        {rightAccessory ? <View style={styles.headerRight}>{rightAccessory}</View> : null}
      </View>
      <ListingProgressStepper
        stages={stages}
        activeStage={activeStage}
        completedStages={completedStages}
        onStagePress={onStagePress}
        stageLabels={stageLabels}
      />
    </View>
  );
}

export function ListingProgressStepper({
  stages,
  activeStage,
  completedStages,
  onStagePress,
  stageLabels,
}: {
  stages: ListingFlowStage[];
  activeStage: ListingFlowStage;
  completedStages: ListingFlowStage[];
  onStagePress?: (stage: ListingFlowStage) => void;
  stageLabels?: Partial<Record<ListingFlowStage, string>>;
}) {
  const { theme } = useTheme();
  const activeIndex = stages.indexOf(activeStage);
  const completedSet = new Set(completedStages);

  return (
    <View style={styles.progressTrack}>
      {stages.map((stage, index) => {
        const completed = completedSet.has(stage);
        const active = stage === activeStage;
        const future = index > activeIndex && !completed;
        const pressable = completed && onStagePress;
        const previousCompleted = index > 0 && completedSet.has(stages[index - 1]);
        const nextUnlocked = completed;
        const label = stageLabels?.[stage] ?? STAGE_LABELS[stage];
        const stateLabel = completed ? 'complete' : active ? 'current' : 'not started';
        return (
          <View key={stage} style={styles.progressStep}>
            {index === 0 ? (
              <View style={styles.progressConnectorSpacer} />
            ) : (
              <View
                style={[
                  styles.progressConnector,
                  { backgroundColor: previousCompleted ? theme.colors.primary : theme.colors.border },
                ]}
              />
            )}
            <TouchableOpacity
              onPress={pressable ? () => onStagePress?.(stage) : undefined}
              disabled={!pressable}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={`Stage ${index + 1}, ${label}, ${stateLabel}`}
              accessibilityState={{ selected: active, disabled: !pressable }}
              style={{
                opacity: future ? 0.66 : 1,
              }}
            >
              <View
                style={[
                  styles.progressCircle,
                  {
                    backgroundColor: active || completed ? theme.colors.primary : theme.colors.bg,
                    borderColor: active || completed ? theme.colors.primary : theme.colors.border,
                  },
                  active ? { shadowColor: theme.colors.primary } : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.progressCircleText,
                    { color: active || completed ? '#FFFFFF' : theme.colors.textSoft },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
            </TouchableOpacity>
            {index === stages.length - 1 ? (
              <View style={styles.progressConnectorSpacer} />
            ) : (
              <View
                style={[
                  styles.progressConnector,
                  { backgroundColor: nextUnlocked ? theme.colors.primary : theme.colors.border },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

export function DraftSavedIndicator({ visible }: { visible: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.draftIndicator,
        {
          backgroundColor: visible ? theme.colors.primary + '12' : 'transparent',
          borderColor: visible ? theme.colors.primary + '28' : 'transparent',
        },
      ]}
    >
      {visible ? (
        <>
          <Ionicons name="cloud-done-outline" size={14} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            Draft saved
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function CardIdentificationTile({
  title,
  body,
  source,
  icon,
  primary,
  onPress,
  style,
}: {
  title: string;
  body: string;
  source?: ImageSourcePropType;
  icon?: IconName;
  primary?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const gradient = primary ? theme.gradients.actionPrimary : theme.gradients.actionLight;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.identificationTile, theme.shadows.card, style]}
    >
      <LinearGradient
        colors={gradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />
      <View style={[styles.identificationIconFrame, { backgroundColor: primary ? 'rgba(255,255,255,0.18)' : theme.colors.surface }]}>
        {source ? (
          <StackrCardActionIcon
            source={source}
            frameSize={48}
            artworkSize={38}
            accessibilityLabel={title}
          />
        ) : (
          <Ionicons name={icon ?? 'albums-outline'} size={25} color={primary ? '#FFFFFF' : theme.colors.primary} />
        )}
      </View>
      <View style={styles.identificationCopy}>
        <Text style={[styles.identificationTitle, { color: primary ? '#FFFFFF' : theme.colors.text }]}>{title}</Text>
        <Text style={[styles.identificationBody, { color: primary ? 'rgba(255,255,255,0.84)' : theme.colors.textSoft }]}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={primary ? '#FFFFFF' : theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

export function CardMatchConfirmation({
  imageUrl,
  name,
  setName,
  number,
  rarity,
  language,
  variant,
  rawValue,
  gradedValue,
}: {
  imageUrl?: string | null;
  name: string;
  setName?: string | null;
  number?: string | null;
  rarity?: string | null;
  language?: string | null;
  variant?: string | null;
  rawValue?: number | null;
  gradedValue?: number | null;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.matchCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, theme.shadows.card]}>
      <View style={[styles.matchImage, styles.matchImageFrame, { backgroundColor: theme.colors.surface }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <StackrCardActionIcon source={stackrIcons.searchCard} frameSize={72} artworkSize={58} />
        )}
        <RaritySymbol
          rarity={rarity}
          size={14}
          style={RARITY_SYMBOL_CARD_OVERLAY}
        />
      </View>
      <View style={styles.matchCopy}>
        <Text style={[styles.matchTitle, { color: theme.colors.text }]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.matchMeta, { color: theme.colors.textSoft }]} numberOfLines={2}>
          {[setName, number ? `#${number}` : null].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.matchMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {[language ?? 'English', variant ?? 'Standard'].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.valuePills}>
          <InfoPill label="Estimated value" value={formatCurrency(rawValue)} />
          {gradedValue != null ? <InfoPill label="Estimated slab value" value={formatCurrency(gradedValue)} /> : null}
        </View>
      </View>
    </View>
  );
}

export function ConditionSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useTheme();
  const conditions = [
    {
      key: 'Near Mint',
      label: 'Near Mint',
      body: 'Clean overall with only very minor imperfections.',
      signs: 'Sharp corners, clean surface, almost no whitening.',
    },
    {
      key: 'Lightly Played',
      label: 'Lightly Played',
      body: 'Minor whitening, scratching or edge wear visible on close inspection.',
      signs: 'Small edge marks or light surface wear.',
    },
    {
      key: 'Moderately Played',
      label: 'Moderately Played',
      body: 'Visible wear, but the card remains complete and presentable.',
      signs: 'Clear edge wear, scratches or scuffs.',
    },
    {
      key: 'Heavily Played',
      label: 'Heavily Played',
      body: 'Significant wear, possible bends or creases.',
      signs: 'Heavy whitening, visible damage or deeper marks.',
    },
    {
      key: 'Damaged',
      label: 'Damaged',
      body: 'Heavy damage, tears, dents, water damage or serious creases.',
      signs: 'Structural damage or major defects.',
    },
    {
      key: 'Not sure',
      label: 'Not sure',
      body: 'Stackr will keep this cautious and the photos will carry more weight.',
      signs: 'Use this if you need help choosing.',
    },
  ];

  return (
    <View style={styles.conditionGrid}>
      {conditions.map((condition) => {
        const active = value === condition.key;
        return (
          <TouchableOpacity
            key={condition.key}
            onPress={() => onChange(condition.key)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.conditionCard,
              {
                backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <View style={styles.conditionHeader}>
              <Text style={[styles.conditionTitle, { color: theme.colors.text }]}>{condition.label}</Text>
              <View style={[styles.conditionCheck, { backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}>
                {active ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
              </View>
            </View>
            <Text style={[styles.conditionBody, { color: theme.colors.textSoft }]}>{condition.body}</Text>
            <Text style={[styles.conditionSigns, { color: theme.colors.textSoft }]}>{condition.signs}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ValueComparisonCard({
  estimate,
  listingValue,
  tradeValue,
  mode,
  warning,
}: {
  estimate?: number | null;
  listingValue?: number | null;
  tradeValue?: number | null;
  mode: 'sell' | 'trade' | 'both';
  warning?: string | null;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.valueCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.valueCardHeader}>
        <Ionicons name="analytics-outline" size={18} color={theme.colors.primary} />
        <Text style={[styles.valueCardTitle, { color: theme.colors.text }]}>Estimated value</Text>
      </View>
      <Text style={[styles.valueEstimate, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>
        {formatCurrency(estimate)}
      </Text>
      <Text style={[styles.valueSupport, { color: theme.colors.textSoft }]}>
        StackR guide price from available market data. Your listing price is set separately.
      </Text>
      <View style={styles.valueRows}>
        {mode !== 'trade' ? <InfoPill label="Your listing price" value={formatCurrency(listingValue)} /> : null}
        {mode !== 'sell' ? <InfoPill label="Your trade value" value={formatCurrency(tradeValue)} /> : null}
      </View>
      {warning ? (
        <View style={[styles.inlineWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#92400E" />
          <Text style={{ flex: 1, color: '#92400E', fontSize: 12, lineHeight: 16, fontWeight: '800' }}>{warning}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ProtectionTierReveal({
  tier,
  decisionValue,
  reason,
  thresholdNote,
  message,
  requirements,
}: {
  tier: ListingProtectionTier;
  decisionValue?: number | null;
  reason: string;
  thresholdNote?: string;
  message?: string;
  requirements?: string[];
}) {
  const { theme } = useTheme();
  const copy = PROTECTION_COPY[tier];
  const isGold = tier === 'gold';
  const gradient = isGold ? ['#27104F', '#4A2394', '#6938F5'] : tier === 'silver' ? ['#F8FAFC', '#EEF2F7', '#E2E8F0'] : ['#FFF8EA', '#F8E5C2', '#E9C47E'];
  const textColor = isGold ? '#FFFFFF' : theme.colors.text;
  return (
    <View style={[styles.protectionReveal, theme.shadows.elevated]}>
      <LinearGradient colors={gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.protectionShield, { borderColor: copy.accent, backgroundColor: isGold ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.72)' }]}>
        <Image source={PROTECTION_TIER_ICON_SOURCE[tier]} style={styles.protectionTierIcon} resizeMode="contain" />
      </View>
      <Text style={[styles.protectionTitle, { color: textColor }]}>{copy.revealTitle}</Text>
      <Text style={[styles.protectionMessage, { color: isGold ? 'rgba(255,255,255,0.84)' : theme.colors.textSoft }]}>{message ?? copy.message}</Text>
      <View style={[styles.protectionReasonBox, { backgroundColor: isGold ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)', borderColor: isGold ? 'rgba(255,255,255,0.18)' : theme.colors.border }]}>
        <Text style={[styles.protectionReasonTitle, { color: textColor }]}>Protection level based on the card and transaction value.</Text>
        <Text style={[styles.protectionReasonBody, { color: isGold ? 'rgba(255,255,255,0.82)' : theme.colors.textSoft }]}>
          {decisionValue != null ? `Value used: ${formatCurrency(decisionValue)}. ` : ''}
          {reason}
        </Text>
        {thresholdNote ? (
          <Text style={[styles.protectionReasonBody, { color: isGold ? '#FDE68A' : '#92400E', marginTop: 5 }]}>{thresholdNote}</Text>
        ) : null}
      </View>
      <View style={styles.requirementList}>
        {(requirements ?? copy.sellerRequirements).map((item) => (
          <View key={item} style={styles.requirementLine}>
            <Ionicons name="checkmark-circle" size={16} color={isGold ? '#FACC15' : copy.accent} />
            <Text style={{ flex: 1, color: isGold ? 'rgba(255,255,255,0.88)' : theme.colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function EvidenceChecklist({
  requirements,
  captured,
  activeKey,
  onSelect,
}: {
  requirements: (Pick<EvidenceRequirement, 'label'> & {
    key?: string;
    id?: string;
    optional?: boolean;
    required?: boolean;
    groupLabel?: string;
  })[];
  captured: string[];
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  const { theme } = useTheme();
  const capturedSet = new Set(captured);
  return (
    <View style={styles.evidenceChecklist}>
      {requirements.map((requirement) => {
        const requirementKey = requirement.id ?? requirement.key ?? requirement.label;
        const done = capturedSet.has(requirementKey);
        const active = activeKey === requirementKey;
        const required = requirement.required ?? !requirement.optional;
        return (
          <TouchableOpacity
            key={requirementKey}
            onPress={onSelect ? () => onSelect(requirementKey) : undefined}
            disabled={!onSelect}
            activeOpacity={0.78}
            style={[
              styles.evidenceRow,
              {
                backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <View style={[styles.evidenceStatus, { backgroundColor: done ? '#16A34A' : theme.colors.surface, borderColor: done ? '#16A34A' : theme.colors.border }]}>
              {done ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : <Ionicons name={required ? 'camera-outline' : 'add'} size={13} color={theme.colors.textSoft} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.evidenceTitle, { color: theme.colors.text }]}>{requirement.label}</Text>
              <Text style={[styles.evidenceInstruction, { color: theme.colors.textSoft }]}>
                {requirement.groupLabel ? `${requirement.groupLabel} - ` : ''}{required ? 'Required' : 'Optional'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ImageQualityIndicator({
  checks,
}: {
  checks: { label: string; ok: boolean }[];
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.qualityBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {checks.map((check) => (
        <View key={check.label} style={styles.qualityLine}>
          <Ionicons name={check.ok ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={check.ok ? '#16A34A' : theme.colors.textSoft} />
          <Text style={{ color: check.ok ? theme.colors.text : theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>
            {check.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function XimilarAnalysisStatus({
  state,
  error,
}: {
  state: 'idle' | 'processing' | 'complete' | 'failed';
  error?: string | null;
}) {
  const { theme } = useTheme();
  const steps = ['Checking image quality', 'Reviewing edges and corners', 'Reviewing surface', 'Reviewing centring', 'Preparing estimate'];
  return (
    <View style={[styles.analysisCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.analysisHeader}>
        <StackrCardActionIcon source={stackrIcons.protect} frameSize={42} artworkSize={34} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.analysisTitle, { color: theme.colors.text }]}>
            {state === 'complete' ? 'AI condition estimate ready' : state === 'failed' ? 'AI condition check paused' : 'AI-assisted condition check'}
          </Text>
          <Text style={[styles.analysisBody, { color: theme.colors.textSoft }]}>This is an estimate, not a professional grade.</Text>
        </View>
      </View>
      {state === 'failed' && error ? (
        <InlineRequirementMessage tone="warning" message={error} />
      ) : (
        <View style={styles.analysisSteps}>
          {steps.map((step, index) => {
            const complete = state === 'complete';
            const active = state === 'processing' && index <= 2;
            return (
              <View key={step} style={styles.analysisStep}>
                <Ionicons name={complete || active ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={complete || active ? theme.colors.primary : theme.colors.textSoft} />
                <Text style={{ color: complete || active ? theme.colors.text : theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>{step}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function ConditionEstimateCard({
  estimate,
  confidence,
  breakdown,
}: {
  estimate?: string | null;
  confidence?: string | null;
  breakdown?: { label: string; value: string }[];
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.estimateCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.estimateLabel, { color: theme.colors.textSoft }]}>Estimated visible condition</Text>
      <Text style={[styles.estimateValue, { color: theme.colors.text }]}>{estimate ?? 'Estimate unavailable'}</Text>
      {confidence ? <Text style={[styles.estimateConfidence, { color: theme.colors.primary }]}>{confidence}</Text> : null}
      {(breakdown ?? []).map((item) => (
        <View key={item.label} style={styles.estimateBreakdownLine}>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }}>{item.label}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, flex: 1, textAlign: 'right' }}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function VerificationStatusTimeline({
  items,
}: {
  items: { label: string; complete: boolean; current?: boolean }[];
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.timeline}>
      {items.map((item, index) => (
        <View key={item.label} style={styles.timelineRow}>
          <View style={styles.timelineMarkerWrap}>
            <View style={[styles.timelineMarker, { backgroundColor: item.complete ? theme.colors.primary : item.current ? theme.colors.secondary : theme.colors.surface, borderColor: item.complete || item.current ? 'transparent' : theme.colors.border }]}>
              {item.complete ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
            </View>
            {index < items.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} /> : null}
          </View>
          <Text style={{ color: item.complete || item.current ? theme.colors.text : theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: item.current ? '900' : '800', flex: 1 }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LabelPreview({
  verificationId,
  cardName,
  setName,
  number,
}: {
  verificationId: string;
  cardName: string;
  setName?: string | null;
  number?: string | null;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.labelPreview, { backgroundColor: '#FFFFFF', borderColor: theme.colors.border }]}>
      <View style={styles.labelTop}>
        <Text style={{ color: '#07145F', fontSize: 13, fontWeight: '900' }}>Stackr Gold Verification</Text>
        <Text style={{ color: '#7C5A10', fontSize: 10, fontWeight: '900' }}>PENDING AGS</Text>
      </View>
      <View style={styles.labelBody}>
        <View style={[styles.qrPending, { borderColor: '#E8E1FF' }]}>
          <Ionicons name="qr-code-outline" size={36} color="#6938F5" />
          <Text style={{ color: '#716BA8', fontSize: 8, fontWeight: '900', textAlign: 'center' }}>Secure QR</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#07145F', fontSize: 12, fontWeight: '900' }} numberOfLines={2}>{cardName}</Text>
          <Text style={{ color: '#36306F', fontSize: 10, marginTop: 3 }} numberOfLines={2}>
            {[setName, number ? `#${number}` : null].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: '#07145F', fontSize: 10, fontWeight: '900', marginTop: 8 }}>{verificationId}</Text>
        </View>
      </View>
      <Text style={{ color: '#716BA8', fontSize: 9, lineHeight: 12 }}>
        QR creation is completed by the Stackr verification backend when the submission is saved.
      </Text>
    </View>
  );
}

export function PrinterSelector({
  state,
  onStateChange,
}: {
  state: 'idle' | 'searching' | 'unavailable' | 'printed';
  onStateChange: (state: 'idle' | 'searching' | 'unavailable' | 'printed') => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.printerBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.printerTitle, { color: theme.colors.text }]}>Printer connection</Text>
      <Text style={[styles.printerBody, { color: theme.colors.textSoft }]}>
        Printing integration is prepared as a service boundary. Confirm printing only after the label prints clearly.
      </Text>
      <View style={styles.printerActions}>
        <TouchableOpacity onPress={() => onStateChange('searching')} style={[styles.miniButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }}>Search printers</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onStateChange('printed')} style={[styles.miniButton, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>Label printed clearly</Text>
        </TouchableOpacity>
      </View>
      {state !== 'idle' ? (
        <InlineRequirementMessage
          tone={state === 'printed' ? 'success' : state === 'unavailable' ? 'warning' : 'info'}
          message={state === 'printed' ? 'Print confirmed by seller.' : state === 'searching' ? 'Use the system print sheet when native printing is connected.' : 'Printer unavailable. Save or email the label instead.'}
        />
      ) : null}
    </View>
  );
}

export function ListingReviewSection({
  title,
  children,
  onEdit,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.reviewSection, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.reviewHeader}>
        <Text style={[styles.reviewTitle, { color: theme.colors.text }]}>{title}</Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} style={styles.reviewEdit} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '900' }}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function InlineRequirementMessage({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'warning' | 'error' | 'success';
}) {
  const { theme } = useTheme();
  const palette = {
    info: { bg: theme.colors.primary + '10', border: theme.colors.primary + '28', fg: theme.colors.primary, icon: 'information-circle-outline' as IconName },
    warning: { bg: '#FEF3C7', border: '#F59E0B', fg: '#92400E', icon: 'alert-circle-outline' as IconName },
    error: { bg: '#FEF2F2', border: '#FCA5A5', fg: '#B91C1C', icon: 'close-circle-outline' as IconName },
    success: { bg: '#ECFDF5', border: '#86EFAC', fg: '#047857', icon: 'checkmark-circle-outline' as IconName },
  }[tone];
  return (
    <View style={[styles.inlineMessage, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Ionicons name={palette.icon} size={16} color={palette.fg} />
      <Text style={{ flex: 1, color: palette.fg, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>{message}</Text>
    </View>
  );
}

export function MarketplaceListingPreview({
  imageUrl,
  title,
  subtitle,
  condition,
  tier,
  value,
  trustLabel,
  trustValue,
}: {
  imageUrl?: string | null;
  title: string;
  subtitle?: string | null;
  condition?: string | null;
  tier?: ListingProtectionTier;
  value?: number | null;
  trustLabel?: string;
  trustValue?: string | null;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.previewCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, theme.shadows.card]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.previewImage} resizeMode="contain" />
      ) : (
        <View style={[styles.previewImageFallback, { backgroundColor: theme.colors.surface }]}>
          <StackrCardActionIcon source={stackrIcons.sellCard} frameSize={64} artworkSize={52} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.previewTitle, { color: theme.colors.text }]} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={[styles.previewSubtitle, { color: theme.colors.textSoft }]} numberOfLines={2}>{subtitle}</Text> : null}
        <View style={styles.previewPillRow}>
          {condition ? <InfoPill label="Condition" value={condition} /> : null}
          {tier ? <InfoPill label="Protection" value={formatProtectionTier(tier)} /> : null}
          {!tier && trustLabel && trustValue ? <InfoPill label={trustLabel} value={trustValue} /> : null}
        </View>
        <Text style={[styles.previewPrice, { color: theme.colors.primary }]}>{formatCurrency(value)}</Text>
      </View>
    </View>
  );
}

export function PrimaryFooter({
  label,
  onPress,
  disabled,
  loading,
  missing,
  secondaryLabel,
  onSecondaryPress,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  missing?: MissingRequirement[];
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const firstMissing = missing?.[0]?.label;
  return (
    <View style={[styles.footer, compact ? styles.footerCompact : null, { backgroundColor: theme.colors.bg, borderColor: theme.colors.border }]}>
      {!compact && firstMissing ? <InlineRequirementMessage message={firstMissing} tone="warning" /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {secondaryLabel && onSecondaryPress ? (
          <TouchableOpacity onPress={onSecondaryPress} activeOpacity={0.82} style={[styles.footerSecondary, compact ? styles.footerButtonCompact : null, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled || loading}
          activeOpacity={0.86}
          style={[styles.footerPrimary, compact ? styles.footerButtonCompact : null, { opacity: disabled ? 0.58 : 1 }]}
        >
          <LinearGradient
            colors={theme.gradients.actionPrimary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <StackrButtonPattern tone="purple" compact />
          <View pointerEvents="none" style={styles.footerPrimaryHighlight} />
          <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900' }}>
            {loading ? 'Working...' : label}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
      {label}{required ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
    </Text>
  );
}

export function StackrTextInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  inputAccessoryViewID,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  spellCheck?: boolean;
  inputAccessoryViewID?: TextInputProps['inputAccessoryViewID'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  blurOnSubmit?: TextInputProps['blurOnSubmit'];
}) {
  const { theme } = useTheme();
  const resolvedAccessoryViewID = inputAccessoryViewID ?? (
    Platform.OS === 'ios' ? STACKR_LISTING_INPUT_ACCESSORY_ID : undefined
  );

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textSoft}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      inputAccessoryViewID={resolvedAccessoryViewID}
      returnKeyType={returnKeyType ?? (multiline ? 'default' : 'done')}
      onSubmitEditing={onSubmitEditing ?? Keyboard.dismiss}
      blurOnSubmit={blurOnSubmit ?? !multiline}
      style={[
        styles.input,
        {
          minHeight: multiline ? 96 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          color: theme.colors.text,
        },
      ]}
    />
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.infoPill, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 10, lineHeight: 13, fontWeight: '800' }}>{label}</Text>
      <Text
        style={{ color: theme.colors.text, fontSize: 12, lineHeight: 16, fontWeight: '900' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
      >
        {value}
      </Text>
    </View>
  );
}

export function ToggleCard({
  active,
  title,
  body,
  icon,
  source,
  onPress,
  compact = false,
}: {
  active: boolean;
  title: string;
  body: string;
  icon?: IconName;
  source?: ImageSourcePropType;
  onPress: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.toggleCard,
        compact ? styles.toggleCardCompact : null,
        {
          backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <View
        style={[
          source ? styles.toggleArtworkFrame : styles.toggleIcon,
          compact && source ? styles.toggleArtworkFrameCompact : null,
          compact && !source ? styles.toggleIconCompact : null,
          {
            backgroundColor: source ? 'transparent' : active ? theme.colors.primary : theme.colors.surface,
            borderColor: source ? (active ? theme.colors.primary + '28' : theme.colors.border) : 'transparent',
          },
        ]}
      >
        {source ? (
          <Image
            source={source}
            style={[styles.toggleArtworkImage, compact ? styles.toggleArtworkImageCompact : null]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : icon ? (
          <Ionicons name={icon} size={19} color={active ? '#FFFFFF' : theme.colors.primary} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={compact ? 1 : 2}
          style={{
            color: theme.colors.text,
            fontSize: compact ? 13.5 : 14,
            lineHeight: compact ? 17 : 18,
            fontWeight: '900',
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={compact ? 2 : 3}
          style={{
            color: theme.colors.textSoft,
            fontSize: compact ? 11.5 : 12,
            lineHeight: compact ? 15 : 16,
            marginTop: 2,
          }}
        >
          {body}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function PressableChecklistItem({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.checklistPressable}
    >
      <View style={[styles.checkBox, { backgroundColor: checked ? theme.colors.primary : theme.colors.card, borderColor: checked ? theme.colors.primary : theme.colors.border }]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
      </View>
      <Text style={{ flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerSubtitle: {
    marginTop: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 1,
  },
  progressStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressConnector: {
    flex: 1,
    height: 2,
    borderRadius: 999,
  },
  progressConnectorSpacer: {
    flex: 1,
    height: 2,
  },
  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  progressCircleText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  draftIndicator: {
    minHeight: 27,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  identificationTile: {
    borderRadius: 20,
    minHeight: 112,
    overflow: 'hidden',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  identificationIconFrame: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  identificationTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  identificationBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  matchCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 14,
  },
  matchImage: {
    width: 92,
    height: 128,
    borderRadius: 12,
  },
  matchImageFrame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchImageFallback: {
    width: 92,
    height: 128,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCopy: {
    flex: 1,
    minWidth: 0,
  },
  matchTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  matchMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  valuePills: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  infoPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minWidth: 84,
  },
  conditionGrid: {
    gap: 10,
  },
  conditionCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 13,
  },
  conditionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  conditionTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  conditionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    fontWeight: '700',
  },
  conditionSigns: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
    fontWeight: '700',
  },
  valueCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  valueCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  valueCardTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  valueEstimate: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  valueSupport: {
    fontSize: 12,
    lineHeight: 17,
  },
  valueRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineWarning: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
  },
  protectionReveal: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  protectionShield: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectionTierIcon: {
    width: 56,
    height: 56,
  },
  protectionTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  protectionMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  protectionReasonBox: {
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  protectionReasonTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  protectionReasonBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    fontWeight: '700',
  },
  requirementList: {
    alignSelf: 'stretch',
    gap: 7,
    marginTop: 2,
  },
  requirementLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  evidenceChecklist: {
    gap: 8,
  },
  evidenceRow: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  evidenceStatus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  evidenceInstruction: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  qualityBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  qualityLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  analysisCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  analysisTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  analysisBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  analysisSteps: {
    gap: 7,
  },
  analysisStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  estimateCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  estimateLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  estimateValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginTop: 2,
  },
  estimateConfidence: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  estimateBreakdownLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 9,
  },
  timeline: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 42,
    gap: 10,
  },
  timelineMarkerWrap: {
    width: 24,
    alignItems: 'center',
  },
  timelineMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
  },
  labelPreview: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    gap: 10,
  },
  labelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  labelBody: {
    flexDirection: 'row',
    gap: 12,
  },
  qrPending: {
    width: 78,
    height: 78,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  printerBox: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    gap: 9,
  },
  printerTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  printerBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  printerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  miniButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  reviewSection: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 9,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  reviewEdit: {
    minHeight: 32,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inlineMessage: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  previewCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 13,
  },
  previewImage: {
    width: 92,
    height: 128,
    borderRadius: 12,
  },
  previewImageFallback: {
    width: 92,
    height: 128,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  previewSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  previewPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  previewPrice: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    marginTop: 10,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  footerCompact: {
    paddingTop: 5,
    paddingBottom: 5,
    gap: 0,
  },
  footerPrimary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    shadowColor: '#6136F5',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  footerPrimaryHighlight: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  footerButtonCompact: {
    minHeight: 42,
    borderRadius: 14,
  },
  footerSecondary: {
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  toggleCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
  },
  toggleCardCompact: {
    minHeight: 74,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 10,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconCompact: {
    width: 36,
    height: 36,
    borderRadius: 13,
  },
  toggleIconImage: {
    width: 31,
    height: 31,
  },
  toggleArtworkFrame: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  toggleArtworkFrameCompact: {
    width: 50,
    height: 50,
    borderRadius: 16,
  },
  toggleArtworkImage: {
    width: 68,
    height: 68,
  },
  toggleArtworkImageCompact: {
    width: 48,
    height: 48,
  },
  checklistPressable: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
