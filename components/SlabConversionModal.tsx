import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import SlabStickerLabel, { SLAB_GRADING_COMPANIES, getSlabAccent } from './SlabStickerLabel';

export type SlabConversionPayload = {
  company: string;
  grade: string;
  certificationNumber?: string | null;
  estimatedValue?: number | null;
};

type Props = {
  visible: boolean;
  cardName: string;
  setName?: string | null;
  imageUri?: string | null;
  rawValue?: number | null;
  tradeWarning?: boolean;
  masterSetNote?: string | null;
  existingGradedCopy?: boolean;
  onCancel: () => void;
  onConfirm: (payload: SlabConversionPayload) => Promise<void> | void;
};

const COMPANIES = [...SLAB_GRADING_COMPANIES, 'Other'];
const GRADES = ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'];

const formatCurrency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `£${value.toFixed(2)}` : 'Value pending';

export default function SlabConversionModal({
  visible,
  cardName,
  setName,
  imageUri,
  rawValue,
  tradeWarning = false,
  masterSetNote,
  existingGradedCopy = false,
  onCancel,
  onConfirm,
}: Props) {
  const [company, setCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');
  const [certificationNumber, setCertificationNumber] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [stage, setStage] = useState<'form' | 'animating' | 'success'>('form');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const lift = useRef(new Animated.Value(0)).current;
  const slab = useRef(new Animated.Value(0)).current;
  const binder = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    if (!visible) return;
    setStage('form');
    setSubmitting(false);
    lift.setValue(0);
    slab.setValue(0);
    binder.setValue(0);
    success.setValue(0);
  }, [binder, lift, slab, success, visible]);

  const parsedEstimate = useMemo(() => {
    const value = Number(estimatedValue.replace(/[^\d.]/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [estimatedValue]);

  const delta = rawValue != null && parsedEstimate != null ? parsedEstimate - rawValue : null;

  const runAnimation = () =>
    new Promise<void>((resolve) => {
      setStage('animating');
      if (reduceMotion) {
        Animated.timing(success, { toValue: 1, duration: 220, useNativeDriver: true }).start(() => resolve());
        return;
      }

      Animated.sequence([
        Animated.parallel([
          Animated.spring(lift, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
          Animated.timing(slab, { toValue: 0.55, duration: 420, useNativeDriver: true }),
        ]),
        Animated.timing(slab, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(binder, { toValue: 1, duration: 560, useNativeDriver: true }),
          Animated.spring(lift, { toValue: 2, tension: 46, friction: 7, useNativeDriver: true }),
        ]),
        Animated.timing(success, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const handleConfirm = async () => {
    if (submitting) return;
    const finalGrade = grade.trim() || '10';
    setGrade(finalGrade);
    setSubmitting(true);
    await runAnimation();
    await onConfirm({
      company,
      grade: finalGrade,
      certificationNumber: certificationNumber.trim() || null,
      estimatedValue: parsedEstimate,
    });
    setStage('success');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <BlurView intensity={44} tint="light" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={stage === 'form' ? onCancel : undefined} />

        <View style={styles.sheet}>
          <TouchableOpacity onPress={onCancel} disabled={stage !== 'form'} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#4B22A2" />
          </TouchableOpacity>

          <Text style={styles.title}>Send to Slab Binder</Text>
          <Text style={styles.subtitle}>Add grading details, then Stackr will move one raw copy into your graded slab binder.</Text>

          {stage === 'form' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={styles.previewRow}>
                <View style={styles.cardPreview}>
                  {imageUri ? <Image source={{ uri: imageUri }} style={styles.cardImage} resizeMode="contain" /> : <Ionicons name="albums-outline" size={32} color="#4B22A2" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={2}>{cardName}</Text>
                  <Text style={styles.setName} numberOfLines={1}>{setName ?? 'Stackr collection'}</Text>
                  <Text style={styles.rawValue}>Raw value: {formatCurrency(rawValue)}</Text>
                </View>
              </View>

              {tradeWarning ? <Notice icon="swap-horizontal" text="This card is currently in trade flow. Converting it may affect its trade state." tone="amber" /> : null}
              {existingGradedCopy ? <Notice icon="shield-checkmark-outline" text="You already have this card slabbed. This will update/add the slab binder copy." /> : null}
              {masterSetNote ? <Notice icon="information-circle-outline" text={masterSetNote} /> : null}

              <FieldLabel>Grading company</FieldLabel>
              <View style={styles.pillWrap}>
                {COMPANIES.map((item) => <Pill key={item} label={item} active={company === item} activeColor={getSlabAccent(item)} onPress={() => setCompany(item)} />)}
              </View>

              <FieldLabel>Grade</FieldLabel>
              <View style={styles.pillWrap}>
                {GRADES.map((item) => <Pill key={item} label={item} active={grade.trim() === item} onPress={() => setGrade(item)} compact />)}
              </View>

              <TextInput
                value={grade}
                onChangeText={setGrade}
                placeholder="Type exact grade, e.g. GEM MINT 10"
                placeholderTextColor="#9186B8"
                autoCapitalize="characters"
                returnKeyType="done"
                style={[styles.input, { marginTop: 8 }]}
              />

              <FieldLabel>Certification number</FieldLabel>
              <TextInput
                value={certificationNumber}
                onChangeText={setCertificationNumber}
                placeholder="Optional"
                placeholderTextColor="#9186B8"
                style={styles.input}
              />

              <FieldLabel>Estimated graded value</FieldLabel>
              <TextInput
                value={estimatedValue}
                onChangeText={setEstimatedValue}
                placeholder="Optional, e.g. 185"
                placeholderTextColor="#9186B8"
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <TouchableOpacity onPress={handleConfirm} activeOpacity={0.88} style={styles.primaryWrap}>
                <LinearGradient colors={['#2B145C', '#4B22A2', '#7046D5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryText}>{submitting ? 'Slabbing...' : `Mark as ${company} ${grade.trim() || '10'}`}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <SlabTransformAnimation
              cardName={cardName}
              imageUri={imageUri}
              company={company}
              grade={grade.trim() || '10'}
              lift={lift}
              slab={slab}
              binder={binder}
              success={success}
              delta={delta}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function SlabTransformAnimation({
  cardName,
  imageUri,
  company,
  grade,
  lift,
  slab,
  binder,
  success,
  delta,
}: {
  cardName: string;
  imageUri?: string | null;
  company: string;
  grade: string;
  lift: Animated.Value;
  slab: Animated.Value;
  binder: Animated.Value;
  success: Animated.Value;
  delta: number | null;
}) {
  const cardTransform = {
    transform: [
      { translateY: lift.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -28, 96] }) },
      { translateX: lift.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, 70] }) },
      { rotate: lift.interpolate({ inputRange: [0, 1, 2], outputRange: ['0deg', '-3deg', '8deg'] }) },
      { scale: lift.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.05, 0.58] }) },
    ],
  };

  return (
    <View style={styles.animationStage}>
      <View style={styles.energyHalo} />
      <Animated.View style={[styles.slabCard, cardTransform]}>
        <Animated.View style={{ opacity: slab, marginBottom: 7 }}>
          <SlabStickerLabel
            company={company}
            grade={grade}
            cardName={cardName}
            size="animation"
            style={styles.slabLabel}
          />
        </Animated.View>
        <View style={styles.slabBody}>
          {imageUri ? <Image source={{ uri: imageUri }} resizeMode="contain" style={styles.slabImage} /> : <Text style={styles.slabFallback}>{cardName}</Text>}
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.slabGlass, { opacity: slab }]} />
      </Animated.View>

      <Animated.View style={[styles.binderDrop, { opacity: binder, transform: [{ scale: binder.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
        <LinearGradient colors={['#4E25D8', '#7448FF']} style={styles.binderCover}>
          <Ionicons name="book" size={26} color="#FFFFFF" />
          <Text style={styles.binderText}>Slab Binder</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[styles.successBlock, { opacity: success }]}>
        <Ionicons name="checkmark-circle" size={34} color="#19B985" />
        <Text style={styles.successTitle}>Added to Slab Binder</Text>
        <Text style={styles.successSub}>Value updated · Activity logged</Text>
        {delta != null ? (
          <Text style={[styles.delta, { color: delta >= 0 ? '#19B985' : '#EF6A5B' }]}>
            {delta >= 0 ? '+' : ''}£{delta.toFixed(2)} · Now tracked as {company} {grade}
          </Text>
        ) : null}
      </Animated.View>

      <Text style={styles.sparkOne}>✦</Text>
      <Text style={styles.sparkTwo}>✧</Text>
      <Text style={styles.sparkThree}>✦</Text>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Pill({ label, active, onPress, compact = false, activeColor = '#4B22A2' }: { label: string; active: boolean; onPress: () => void; compact?: boolean; activeColor?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.pill, compact && styles.pillCompact, active && styles.pillActive, active && { backgroundColor: activeColor, borderColor: activeColor, shadowColor: activeColor }]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Notice({ icon, text, tone = 'purple' }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'purple' | 'amber' }) {
  const amber = tone === 'amber';
  return (
    <View style={[styles.notice, amber && styles.noticeAmber]}>
      <Ionicons name={icon} size={16} color={amber ? '#C47A00' : '#4B22A2'} />
      <Text style={[styles.noticeText, amber && { color: '#8A5200' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 20, 55, 0.32)',
    padding: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88%',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8CBFF',
    padding: 18,
    shadowColor: '#3B1A88',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F4EFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    color: '#071A44',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    paddingRight: 52,
  },
  subtitle: {
    color: '#72669C',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#F8F5FF',
    borderWidth: 1,
    borderColor: '#DED1FF',
    padding: 12,
  },
  cardPreview: {
    width: 78,
    height: 108,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8CBFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardName: {
    color: '#071A44',
    fontSize: 18,
    fontWeight: '900',
  },
  setName: {
    color: '#72669C',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  rawValue: {
    color: '#4B22A2',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
    backgroundColor: '#F4EFFF',
    borderWidth: 1,
    borderColor: '#DED1FF',
  },
  noticeAmber: {
    backgroundColor: '#FFF7E7',
    borderColor: '#F6CF7A',
  },
  noticeText: {
    flex: 1,
    color: '#675995',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  fieldLabel: {
    color: '#071A44',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 8,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    minHeight: 38,
    borderRadius: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DED1FF',
  },
  pillCompact: {
    minWidth: 48,
    paddingHorizontal: 10,
  },
  pillActive: {
    backgroundColor: '#4B22A2',
    borderColor: '#4B22A2',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  pillText: {
    color: '#6D6592',
    fontSize: 13,
    fontWeight: '900',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  input: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DED1FF',
    color: '#071A44',
    fontWeight: '800',
    paddingHorizontal: 14,
  },
  primaryWrap: {
    marginTop: 18,
    borderRadius: 18,
    shadowColor: '#4B22A2',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  animationStage: {
    minHeight: 430,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
    overflow: 'hidden',
  },
  energyHalo: {
    position: 'absolute',
    top: 24,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(109,61,255,0.13)',
  },
  slabCard: {
    width: 156,
    height: 228,
    borderRadius: 18,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 2,
    borderColor: '#CFC0FF',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
  },
  slabLabel: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#DED1FF',
  },
  slabCompany: {
    color: '#4B22A2',
    fontSize: 14,
    fontWeight: '900',
  },
  slabGrade: {
    color: '#071A44',
    fontSize: 18,
    fontWeight: '900',
  },
  slabBody: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slabImage: {
    width: '100%',
    height: '100%',
  },
  slabFallback: {
    color: '#071A44',
    fontWeight: '900',
    textAlign: 'center',
    padding: 8,
  },
  slabGlass: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  binderDrop: {
    position: 'absolute',
    right: 28,
    bottom: 110,
  },
  binderCover: {
    width: 138,
    height: 92,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BDAAFF',
  },
  binderText: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginTop: 5,
  },
  successBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  successTitle: {
    color: '#071A44',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
  },
  successSub: {
    color: '#72669C',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  delta: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 8,
  },
  sparkOne: {
    position: 'absolute',
    left: 58,
    top: 62,
    color: '#F5B93F',
    fontSize: 24,
  },
  sparkTwo: {
    position: 'absolute',
    right: 82,
    top: 96,
    color: '#4B22A2',
    fontSize: 19,
  },
  sparkThree: {
    position: 'absolute',
    left: 38,
    bottom: 140,
    color: '#F5B93F',
    fontSize: 18,
  },
});
