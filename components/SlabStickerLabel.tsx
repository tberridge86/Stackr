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
  showcase: { title: 5.8, subtitle: 4.8, meta: 4.1, grade: 10.6, descriptor: 4.1 },
  grid: { title: 6.8, subtitle: 5.35, meta: 4.7, grade: 13, descriptor: 4.8 },
  modal: { title: 15.4, subtitle: 11.2, meta: 9.1, grade: 27.2, descriptor: 8.6 },
  animation: { title: 7, subtitle: 5.45, meta: 4.7, grade: 13.2, descriptor: 4.8 },
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
    details: { left: '7.5%', top: '15%', width: '43%', height: '58%' },
    grade: { right: '4.5%', top: '20%', width: '24%', height: '57%' },
    titleColor: '#111827',
    subtitleColor: '#374151',
    metaColor: '#4B5563',
    gradeColor: '#111827',
    descriptorColor: '#4B5563',
    textShadowColor: 'rgba(255,255,255,0.62)',
  },
  BGS: {
    details: { left: '31%', top: '17%', width: '35%', height: '58%' },
    grade: { right: '6%', top: '22%', width: '18%', height: '56%' },
    titleColor: '#432F12',
    subtitleColor: '#5C4217',
    metaColor: '#6B4D1B',
    gradeColor: '#2B210D',
    descriptorColor: '#6B4D1B',
    textShadowColor: 'rgba(255,248,220,0.64)',
  },
  CGC: {
    details: { left: '6%', top: '30%', width: '55%', height: '46%' },
    grade: { right: '5.5%', top: '29%', width: '19%', height: '52%' },
    titleColor: '#1F2937',
    subtitleColor: '#374151',
    metaColor: '#4B5563',
    gradeColor: '#F7E5AA',
    descriptorColor: '#F7E5AA',
    textShadowColor: 'rgba(255,255,255,0.52)',
  },
  ACE: {
    details: { left: '8%', top: '12%', width: '47%', height: '54%' },
    grade: { right: '5.5%', top: '14%', width: '24%', height: '52%' },
    titleColor: '#FFFFFF',
    subtitleColor: '#E5E7EB',
    metaColor: '#D1D5DB',
    gradeColor: '#D7B16E',
    descriptorColor: '#E5E7EB',
    textShadowColor: 'rgba(0,0,0,0.42)',
  },
  TAG: {
    details: { left: '7.5%', top: '25%', width: '39%', height: '49%' },
    grade: { right: '5.5%', top: '31%', width: '17%', height: '47%' },
    titleColor: '#FFFFFF',
    subtitleColor: '#F3F4F6',
    metaColor: '#D1D5DB',
    gradeColor: '#111827',
    descriptorColor: '#374151',
    textShadowColor: 'rgba(0,0,0,0.42)',
  },
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

const getTitleLineCount = (size: SlabStickerSize) => size === 'modal' ? 2 : 1;

const getDisplayGradeText = (grade?: string | null) => {
  const raw = String(grade ?? '').trim();
  if (!raw) return '10';
  const normalized = raw.replace(',', '.');
  const numericGrade = normalized.match(/\b(10|[1-9](?:\.\d{1,2})?)\b/);
  if (numericGrade?.[1]) return numericGrade[1];
  return raw.length > 5 ? raw.slice(0, 5).trim() : raw;
};

const getGradeFontSize = (baseSize: number, gradeText: string) => {
  if (gradeText.length >= 5) return baseSize * 0.64;
  if (gradeText.length >= 4) return baseSize * 0.74;
  if (gradeText.length >= 3) return baseSize * 0.88;
  return baseSize;
};

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
  const descriptor = getGraderGradeLabel(company, rawGradeText);
  const gradeFontSize = getGradeFontSize(sizes.grade, gradeText);
  const showDescriptor = Boolean(descriptor) && size === 'modal';

  if (!stickerKey) {
    return (
      <View style={[styles.fallback, { borderColor: getSlabAccent(company) }, style]}>
        <View style={[styles.fallbackBand, { backgroundColor: getSlabAccent(company) }]}>
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
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.48} style={[styles.fallbackGrade, { color: getSlabAccent(company), fontSize: gradeFontSize }]}>
          {gradeText}
        </Text>
      </View>
    );
  }

  const layout = STICKER_LAYOUTS[stickerKey];

  return (
    <ImageBackground
      source={STICKER_SOURCES[stickerKey]}
      resizeMode="stretch"
      style={[styles.sticker, style]}
      imageStyle={styles.stickerImage}
    >
      <View style={[styles.detailsBlock, layout.details]}>
        <Text
          numberOfLines={getTitleLineCount(size)}
          adjustsFontSizeToFit
          minimumFontScale={0.58}
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
      <View style={[styles.gradeBlock, layout.grade]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.44}
          style={[styles.gradeText, { color: layout.gradeColor, fontSize: gradeFontSize, lineHeight: gradeFontSize * 1.02 }]}
        >
          {gradeText}
        </Text>
        {showDescriptor ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={[styles.descriptorText, { color: layout.descriptorColor, fontSize: sizes.descriptor }]}
          >
            {descriptor}
          </Text>
        ) : null}
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
  gradeBlock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  gradeText: {
    width: '100%',
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  descriptorText: {
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 1,
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
  fallbackGrade: {
    width: '22%',
    fontWeight: '900',
    textAlign: 'center',
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
});
