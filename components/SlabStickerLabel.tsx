import React from 'react';
import {
  ImageBackground,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import {
  formatGraderShortName,
  getGraderGradeLabel,
  getSupportedSlabGraderLabels,
  normalizeGraderKey,
} from '../lib/graderRegistry';

export const SLAB_GRADING_COMPANIES = [...getSupportedSlabGraderLabels()];
export const SLAB_GRADE_SHORTCUTS = ['10', '9.5', '9', '8', '7'];

type SlabStickerKey = 'PSA' | 'CGC' | 'BGS' | 'ACE' | 'TAG';
type SlabStickerSize = 'showcase' | 'grid' | 'modal' | 'animation';
type StickerLineStyle = ViewStyle & {
  backgroundColor?: string;
  borderRadius?: number;
  paddingHorizontal?: number;
};

type Props = {
  company?: string | null;
  grade?: string | null;
  cardName?: string | null;
  setName?: string | null;
  number?: string | number | null;
  size?: SlabStickerSize;
  style?: StyleProp<ViewStyle>;
};

const STICKER_SOURCES: Record<SlabStickerKey, ImageSourcePropType> = {
  PSA: require('../assets/rev2/09-grading-master-set/slab-stickers/PSA.png') as ImageSourcePropType,
  CGC: require('../assets/rev2/09-grading-master-set/slab-stickers/CGC.png') as ImageSourcePropType,
  BGS: require('../assets/rev2/09-grading-master-set/slab-stickers/beckett.png') as ImageSourcePropType,
  ACE: require('../assets/rev2/09-grading-master-set/slab-stickers/Ace.png') as ImageSourcePropType,
  TAG: require('../assets/rev2/09-grading-master-set/slab-stickers/TAG.png') as ImageSourcePropType,
};

const TEXT_SIZES = {
  showcase: { title: 5.55, subtitle: 4.55, meta: 4.0, grade: 10.2, descriptor: 3.9 },
  grid: { title: 6.45, subtitle: 5.1, meta: 4.45, grade: 12.5, descriptor: 4.55 },
  modal: { title: 13.8, subtitle: 10.2, meta: 8.5, grade: 24.6, descriptor: 8.1 },
  animation: { title: 6.65, subtitle: 5.15, meta: 4.45, grade: 12.7, descriptor: 4.55 },
};

const TAG_GRADE_NUMBER_OFFSET: Record<SlabStickerSize, number> = {
  showcase: 1.5,
  grid: 2,
  modal: 5,
  animation: 2,
};

const BGS_LINE_LAYOUTS: {
  title: ViewStyle;
  subtitle: ViewStyle;
  meta: ViewStyle;
} = {
  title: { left: '29.35%', top: '19.2%', width: '44.4%', height: '18.6%' },
  subtitle: { left: '29.35%', top: '33.2%', width: '34.8%', height: '18.2%' },
  meta: { left: '29.35%', top: '66.4%', width: '10.8%', height: '14.6%' },
};

const STICKER_LINE_LAYOUTS: Partial<Record<SlabStickerKey, {
  title: StickerLineStyle;
  subtitle: StickerLineStyle;
  meta?: StickerLineStyle;
}>> = {
  PSA: {
    title: { left: '7.55%', top: '28.5%', width: '40.5%', height: '9.9%', backgroundColor: '#F5F5F5', borderRadius: 2, paddingHorizontal: 2 },
    subtitle: { left: '7.55%', top: '42.55%', width: '40.5%', height: '9.5%', backgroundColor: '#F5F5F5', borderRadius: 2, paddingHorizontal: 2 },
    meta: { left: '7.55%', top: '56.65%', width: '18.25%', height: '8.7%', backgroundColor: '#F5F5F5', borderRadius: 2, paddingHorizontal: 2 },
  },
  CGC: {
    title: { left: '5.3%', top: '34.2%', width: '55.2%', height: '14%', backgroundColor: '#EFE1B7', borderRadius: 2, paddingHorizontal: 3 },
    subtitle: { left: '5.3%', top: '49.5%', width: '45.5%', height: '12.5%', backgroundColor: '#EFE1B7', borderRadius: 2, paddingHorizontal: 3 },
    meta: { left: '5.3%', top: '64.1%', width: '20.5%', height: '10%', backgroundColor: '#EFE1B7', borderRadius: 2, paddingHorizontal: 3 },
  },
  TAG: {
    title: { left: '6.2%', top: '34.8%', width: '39.8%', height: '13.2%', backgroundColor: '#050505', borderRadius: 2, paddingHorizontal: 2 },
    subtitle: { left: '6.2%', top: '49.5%', width: '33.5%', height: '11.6%', backgroundColor: '#050505', borderRadius: 2, paddingHorizontal: 2 },
    meta: { left: '6.2%', top: '63.4%', width: '24.2%', height: '10.5%', backgroundColor: '#050505', borderRadius: 2, paddingHorizontal: 2 },
  },
};

const STICKER_LAYOUTS: Record<SlabStickerKey, {
  details: ViewStyle;
  grade: ViewStyle;
  titleColor: string;
  subtitleColor: string;
  metaColor: string;
  gradeColor: string;
  descriptorColor: string;
  textShadowColor?: string;
}> = {
  PSA: {
    details: { left: '7.55%', top: '28.5%', width: '40.5%', height: '37%' },
    grade: { right: '7.7%', top: '25.2%', width: '15.5%', height: '45.8%' },
    titleColor: '#111827',
    subtitleColor: '#374151',
    metaColor: '#4B5563',
    gradeColor: '#111827',
    descriptorColor: '#4B5563',
    textShadowColor: 'rgba(255,255,255,0.62)',
  },
  BGS: {
    details: { left: '28.6%', top: '22.75%', width: '28.2%', height: '24.75%' },
    grade: { left: '75.7%', top: '22.8%', width: '13%', height: '56.5%' },
    titleColor: '#432F12',
    subtitleColor: '#5C4217',
    metaColor: '#6B4D1B',
    gradeColor: '#2B210D',
    descriptorColor: '#6B4D1B',
    textShadowColor: 'rgba(255,248,220,0.64)',
  },
  CGC: {
    details: { left: '5.3%', top: '34.2%', width: '55.2%', height: '40%' },
    grade: { right: '6.6%', top: '29.5%', width: '15.5%', height: '57%' },
    titleColor: '#1F2937',
    subtitleColor: '#374151',
    metaColor: '#4B5563',
    gradeColor: '#F7E5AA',
    descriptorColor: '#F7E5AA',
    textShadowColor: 'rgba(255,255,255,0.52)',
  },
  ACE: {
    details: { left: '8%', top: '14%', width: '47%', height: '44%' },
    grade: { right: '7.4%', top: '15%', width: '16.5%', height: '45%' },
    titleColor: '#FFFFFF',
    subtitleColor: '#E5E7EB',
    metaColor: '#D1D5DB',
    gradeColor: '#D7B16E',
    descriptorColor: '#E5E7EB',
    textShadowColor: 'rgba(0,0,0,0.42)',
  },
  TAG: {
    details: { left: '6.2%', top: '34.8%', width: '39.8%', height: '39%' },
    grade: { right: '6.4%', top: '30.5%', width: '10.3%', height: '48%' },
    titleColor: '#FFFFFF',
    subtitleColor: '#F3F4F6',
    metaColor: '#D1D5DB',
    gradeColor: '#111827',
    descriptorColor: '#374151',
    textShadowColor: 'rgba(0,0,0,0.42)',
  },
};

const PSA_GRADE_CLEAR_ZONE: ViewStyle = {
  right: '7.45%',
  top: '25.2%',
  width: '15.9%',
  height: '45.8%',
};

const TAG_DETAILS_CLEAR_ZONE: ViewStyle = {
  left: '6%',
  top: '34.4%',
  width: '40.4%',
  height: '40.5%',
};

export const normalizeSlabCompany = (company?: string | null): SlabStickerKey | null => {
  const key = normalizeGraderKey(company);
  if (!key) return String(company ?? '').trim() ? null : 'PSA';
  if (key === 'AGS' || key === 'GETGRADED') return null;
  return key;
};

export const formatSlabCompanyLabel = (company?: string | null): string => {
  const raw = String(company ?? '').trim();
  return formatGraderShortName(raw) || raw || 'PSA';
};

export const getSlabAccent = (company?: string | null): string => {
  const registryKey = normalizeGraderKey(company);
  if (registryKey === 'AGS') return '#0EA5A4';
  if (registryKey === 'GETGRADED') return '#7C3AED';
  const key = normalizeSlabCompany(company);
  if (key === 'PSA') return '#DC2626';
  if (key === 'CGC') return '#2563EB';
  if (key === 'BGS') return '#B8862B';
  if (key === 'ACE') return '#D7B16E';
  if (key === 'TAG') return '#111827';
  return '#334155';
};

const formatCardNumber = (number?: string | number | null) => {
  const value = String(number ?? '').trim();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
};

const getDisplayGradeText = (grade?: string | null) => {
  const raw = String(grade ?? '').trim();
  if (!raw) return '10';
  const normalized = raw.replace(',', '.');
  const numericGrade = normalized.match(/\b(10|[1-9](?:\.\d{1,2})?)\b/);
  if (numericGrade?.[1]) return numericGrade[1];
  return raw.length > 5 ? raw.slice(0, 5).trim() : raw;
};

const getResolvedDescriptor = (company?: string | null, grade?: string | null) => {
  const raw = String(grade ?? '').trim();
  const registered = getGraderGradeLabel(company, raw);
  if (registered && registered !== 'GRADED') return registered;

  const normalized = raw.toUpperCase().replace(/[^A-Z0-9.]+/g, ' ').trim();
  if (/\bBLACK\s*LABEL\b/.test(normalized)) return 'BLACK LABEL';
  if (/\bPRISTINE\b/.test(normalized)) return 'PRISTINE';
  if (/\bGEM\s*MINT\b|\bGM\b/.test(normalized)) return 'GEM MINT';
  if (/\bNEAR\s*MINT\b|\bNM\b/.test(normalized)) return 'NEAR MINT';
  if (/\bMINT\b/.test(normalized)) return 'MINT';
  return '';
};

const getCompactDescriptor = (descriptor: string, size: SlabStickerSize) => {
  if (!descriptor) return '';
  if (size === 'modal') return descriptor;
  if (descriptor === 'GEM MINT') return 'GM';
  if (descriptor === 'BLACK LABEL') return 'BLACK';
  if (descriptor === 'NEAR MINT') return 'NM';
  if (descriptor === 'PRISTINE') return 'PRIS';
  if (descriptor.length <= 6) return descriptor;
  return descriptor
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 4);
};

const getGradeFontSize = (baseSize: number, gradeText: string, hasDescriptor: boolean) => {
  const descriptorScale = hasDescriptor ? 0.82 : 1;
  if (gradeText.length >= 5) return baseSize * 0.58;
  if (gradeText.length >= 4) return baseSize * 0.68 * descriptorScale;
  if (gradeText.length >= 3) return baseSize * 0.82 * descriptorScale;
  return baseSize * descriptorScale;
};

function StickerTextLine({
  text,
  layout,
  color,
  fontSize,
  lineHeight,
  textShadowColor,
  minimumFontScale,
}: {
  text: string;
  layout: StickerLineStyle;
  color: string;
  fontSize: number;
  lineHeight: number;
  textShadowColor?: string;
  minimumFontScale: number;
}) {
  return (
    <View style={[styles.labelLineBlock, layout]}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
        ellipsizeMode="tail"
        style={[
          styles.stickerText,
          styles.labelLineText,
          {
            color,
            fontSize,
            lineHeight,
            textShadowColor,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export default function SlabStickerLabel({
  company,
  grade,
  cardName,
  setName,
  number,
  size = 'grid',
  style,
}: Props) {
  const stickerKey = normalizeSlabCompany(company);
  const rawGradeText = String(grade ?? '').trim() || '10';
  const gradeText = getDisplayGradeText(grade);
  const title = String(cardName ?? '').trim() || 'Graded card';
  const cleanSetName = String(setName ?? '').trim();
  const numberLabel = formatCardNumber(number);
  const compactLabel = size !== 'modal';
  const subtitle = compactLabel
    ? [cleanSetName, numberLabel].filter(Boolean).join(' - ') || formatSlabCompanyLabel(company)
    : cleanSetName || numberLabel || formatSlabCompanyLabel(company);
  const meta = compactLabel ? '' : cleanSetName && numberLabel ? numberLabel : '';
  const sizes = TEXT_SIZES[size];
  const cleanDescriptor = getResolvedDescriptor(company, rawGradeText);
  const useCompactDescriptor = size !== 'modal' || stickerKey === 'TAG';
  const descriptorLabel = getCompactDescriptor(cleanDescriptor, useCompactDescriptor ? 'grid' : size);
  const showDescriptor = Boolean(descriptorLabel);
  const gradeFontSize = getGradeFontSize(sizes.grade, gradeText, showDescriptor && stickerKey !== 'TAG');
  const descriptorFontSize = size === 'modal' ? sizes.descriptor : Math.max(3.8, sizes.descriptor * 0.86);

  if (!stickerKey) {
    const accent = getSlabAccent(company);
    const fallbackDescriptor = getCompactDescriptor(cleanDescriptor, 'grid');
    const hasFallbackDescriptor = Boolean(fallbackDescriptor);
    return (
      <View style={[styles.fallback, { borderColor: accent }, style]}>
        <View style={[styles.fallbackBand, { backgroundColor: accent }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.fallbackCompany}>
            {String(company ?? 'Graded').trim() || 'Graded'}
          </Text>
        </View>
        <View style={styles.fallbackDetails}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.fallbackTitle, { fontSize: sizes.title }]}>
            {title}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.fallbackSubtitle, { fontSize: sizes.subtitle }]}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.fallbackGradeBox}>
          {hasFallbackDescriptor ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.42}
              style={[styles.fallbackGradeDescriptor, { color: accent }]}
            >
              {fallbackDescriptor}
            </Text>
          ) : null}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.42} style={[styles.fallbackGrade, { color: accent, fontSize: gradeFontSize }]}>
            {gradeText}
          </Text>
        </View>
      </View>
    );
  }

  const layout = STICKER_LAYOUTS[stickerKey];
  const isPsaSticker = stickerKey === 'PSA';
  const isBgsSticker = stickerKey === 'BGS';
  const isCgcSticker = stickerKey === 'CGC';
  const isAceSticker = stickerKey === 'ACE';
  const isTagSticker = stickerKey === 'TAG';
  const tagGradeNumberOffset = TAG_GRADE_NUMBER_OFFSET[size];
  const lineLayouts = STICKER_LINE_LAYOUTS[stickerKey];

  return (
    <ImageBackground
      source={STICKER_SOURCES[stickerKey]}
      resizeMode="stretch"
      style={[styles.sticker, style]}
      imageStyle={styles.stickerImage}
    >
      {isPsaSticker ? (
        <>
          <View pointerEvents="none" style={[styles.psaGradeClearZone, PSA_GRADE_CLEAR_ZONE]} />
        </>
      ) : null}
      {isTagSticker ? <View pointerEvents="none" style={[styles.tagDetailsClearZone, TAG_DETAILS_CLEAR_ZONE]} /> : null}
      {isBgsSticker ? (
        <>
          <View style={[styles.bgsLineBlock, BGS_LINE_LAYOUTS.title]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={size === 'modal' ? 0.42 : 0.56}
              ellipsizeMode="tail"
              style={[
                styles.stickerText,
                styles.bgsLineText,
                {
                  color: layout.titleColor,
                  fontSize: sizes.title,
                  lineHeight: sizes.title * 1.05,
                  textShadowColor: layout.textShadowColor,
                },
              ]}
            >
              {title}
            </Text>
          </View>
          <View style={[styles.bgsLineBlock, BGS_LINE_LAYOUTS.subtitle]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.56}
              ellipsizeMode="tail"
              style={[
                styles.stickerText,
                styles.bgsLineText,
                {
                  color: layout.subtitleColor,
                  fontSize: sizes.subtitle,
                  lineHeight: sizes.subtitle * 1.08,
                  textShadowColor: layout.textShadowColor,
                },
              ]}
            >
              {subtitle}
            </Text>
          </View>
          {meta ? (
            <View style={[styles.bgsLineBlock, BGS_LINE_LAYOUTS.meta]}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.58}
                ellipsizeMode="tail"
                style={[
                  styles.stickerText,
                  styles.bgsLineText,
                  {
                    color: layout.metaColor,
                    fontSize: sizes.meta,
                    lineHeight: sizes.meta * 1.08,
                    textShadowColor: layout.textShadowColor,
                  },
                ]}
              >
                {meta}
              </Text>
            </View>
          ) : null}
        </>
      ) : lineLayouts ? (
        <>
          <StickerTextLine
            text={title}
            layout={lineLayouts.title}
            color={layout.titleColor}
            fontSize={sizes.title}
            lineHeight={sizes.title * 1.05}
            textShadowColor={layout.textShadowColor}
            minimumFontScale={size === 'modal' ? 0.34 : 0.48}
          />
          <StickerTextLine
            text={subtitle}
            layout={lineLayouts.subtitle}
            color={layout.subtitleColor}
            fontSize={sizes.subtitle}
            lineHeight={sizes.subtitle * 1.08}
            textShadowColor={layout.textShadowColor}
            minimumFontScale={0.5}
          />
          {meta && lineLayouts.meta ? (
            <StickerTextLine
              text={meta}
              layout={lineLayouts.meta}
              color={layout.metaColor}
              fontSize={sizes.meta}
              lineHeight={sizes.meta * 1.08}
              textShadowColor={layout.textShadowColor}
              minimumFontScale={0.56}
            />
          ) : null}
        </>
      ) : (
        <View style={[styles.detailsBlock, layout.details]}>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={size === 'modal' ? 0.34 : 0.52}
            ellipsizeMode="tail"
            style={[
              styles.stickerText,
              {
                color: layout.titleColor,
                fontSize: sizes.title,
                lineHeight: sizes.title * 1.1,
                textShadowColor: layout.textShadowColor,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.58}
            ellipsizeMode="tail"
            style={[
              styles.stickerText,
              {
                color: layout.subtitleColor,
                fontSize: sizes.subtitle,
                lineHeight: sizes.subtitle * 1.12,
                textShadowColor: layout.textShadowColor,
              },
            ]}
          >
            {subtitle}
          </Text>
          {meta ? (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.64}
              ellipsizeMode="tail"
              style={[
                styles.stickerText,
                {
                  color: layout.metaColor,
                  fontSize: sizes.meta,
                  lineHeight: sizes.meta * 1.16,
                  textShadowColor: layout.textShadowColor,
                },
              ]}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={[
          styles.gradeBlock,
          layout.grade,
          isPsaSticker && styles.psaGradeBlock,
          isCgcSticker && styles.cgcGradeBlock,
          isAceSticker && styles.aceGradeBlock,
          isBgsSticker && styles.bgsGradeBlock,
          isTagSticker && styles.tagGradeBlock,
        ]}
      >
        {isTagSticker ? (
          <>
            {showDescriptor ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={[
                  styles.tagGradeDescriptorText,
                  {
                    color: layout.descriptorColor,
                    fontSize: descriptorFontSize,
                    lineHeight: descriptorFontSize * 1.02,
                  },
                ]}
              >
                {descriptorLabel}
              </Text>
            ) : null}
            <View
              pointerEvents="none"
              style={[
                styles.tagGradeNumberLayer,
                { transform: [{ translateY: tagGradeNumberOffset }] },
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.36}
                style={[
                  styles.gradeText,
                  styles.tagGradeText,
                  {
                    color: layout.gradeColor,
                    fontSize: gradeFontSize,
                    lineHeight: gradeFontSize * 1.02,
                  },
                ]}
              >
                {gradeText}
              </Text>
            </View>
          </>
        ) : showDescriptor ? (
          <View style={[styles.gradeStack, isBgsSticker && styles.bgsGradeStack]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.48}
              style={[
              styles.gradeDescriptorText,
                isBgsSticker && styles.bgsGradeDescriptorText,
                isPsaSticker && styles.psaGradeDescriptorText,
                {
                  color: layout.descriptorColor,
                  fontSize: isBgsSticker ? descriptorFontSize * 0.96 : descriptorFontSize,
                  lineHeight: descriptorFontSize * 1.04,
                },
              ]}
            >
              {descriptorLabel}
            </Text>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.42}
              style={[
                styles.gradeText,
                isBgsSticker && styles.bgsGradeText,
                isPsaSticker && styles.psaGradeText,
                {
                  color: layout.gradeColor,
                  fontSize: isBgsSticker ? gradeFontSize * 1.06 : gradeFontSize,
                  lineHeight: gradeFontSize * 1.02,
                },
              ]}
            >
              {gradeText}
            </Text>
          </View>
        ) : (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.44}
            style={[
              styles.gradeText,
              isBgsSticker && styles.bgsGradeText,
              isPsaSticker && styles.psaGradeText,
              { color: layout.gradeColor, fontSize: isBgsSticker ? gradeFontSize * 1.06 : gradeFontSize, lineHeight: gradeFontSize * 1.02 },
            ]}
          >
            {gradeText}
          </Text>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  sticker: {
    width: '100%',
    overflow: 'hidden',
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  psaClearZone: {
    position: 'absolute',
    backgroundColor: '#F7F7F7',
    borderRadius: 2,
  },
  psaGradeClearZone: {
    position: 'absolute',
    backgroundColor: '#F8F8F8',
    borderRadius: 3,
  },
  tagDetailsClearZone: {
    position: 'absolute',
    backgroundColor: '#050505',
    borderRadius: 2,
  },
  labelLineBlock: {
    position: 'absolute',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 3,
    elevation: 3,
  },
  labelLineText: {
    width: '100%',
    textAlign: 'left',
  },
  detailsBlock: {
    position: 'absolute',
    justifyContent: 'center',
    paddingRight: 3,
    paddingLeft: 1,
    paddingVertical: 1,
    overflow: 'hidden',
    gap: 1,
  },
  stickerText: {
    fontWeight: '900',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
    includeFontPadding: false,
  },
  bgsLineBlock: {
    position: 'absolute',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingHorizontal: 1,
    zIndex: 6,
    elevation: 6,
  },
  bgsLineText: {
    width: '100%',
    textAlign: 'left',
    color: '#211A10',
    textShadowColor: 'rgba(255,255,255,0.82)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.05,
  },
  gradeBlock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  psaGradeBlock: {
    backgroundColor: '#F8F8F8',
    borderRadius: 2,
  },
  cgcGradeBlock: {
    borderRadius: 12,
  },
  aceGradeBlock: {
    borderRadius: 3,
  },
  tagGradeBlock: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bgsGradeBlock: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    zIndex: 6,
    elevation: 6,
  },
  tagGradeNumberLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    width: '100%',
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tagGradeText: {
    textAlign: 'center',
  },
  gradeStack: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgsGradeStack: {
    gap: 0,
    zIndex: 4,
    elevation: 4,
  },
  gradeDescriptorText: {
    width: '100%',
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  bgsGradeDescriptorText: {
    textAlign: 'center',
    color: '#211A10',
    textShadowColor: 'rgba(255,255,255,0.72)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0.7,
  },
  bgsGradeText: {
    textAlign: 'center',
    color: '#211A10',
    textShadowColor: 'rgba(255,255,255,0.72)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0.7,
  },
  psaGradeDescriptorText: {
    color: '#4B5563',
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0.7,
  },
  psaGradeText: {
    color: '#111827',
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0.7,
  },
  tagGradeDescriptorText: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    zIndex: 1,
    width: '100%',
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  fallback: {
    width: '100%',
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  fallbackBand: {
    width: '24%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fallbackCompany: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  fallbackDetails: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 0,
  },
  fallbackTitle: {
    color: '#0F172A',
    fontWeight: '900',
  },
  fallbackSubtitle: {
    color: '#64748B',
    fontWeight: '800',
    marginTop: 1,
  },
  fallbackGradeBox: {
    width: '23%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  fallbackGradeDescriptor: {
    width: '100%',
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  fallbackGrade: {
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
