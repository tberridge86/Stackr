import { Platform, type TextStyle } from 'react-native';

export const stackrFonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

export const typeScale = {
  display: {
    fontFamily: stackrFonts.extraBold,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
  heroValue: {
    fontFamily: stackrFonts.extraBold,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
  pageTitle: {
    fontFamily: stackrFonts.bold,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  sectionTitle: {
    fontFamily: stackrFonts.bold,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  sectionTitleCompact: {
    fontFamily: stackrFonts.bold,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  cardTitle: {
    fontFamily: stackrFonts.semiBold,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  body: {
    fontFamily: stackrFonts.medium,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  support: {
    fontFamily: stackrFonts.regular,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: stackrFonts.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.25,
  },
  micro: {
    fontFamily: stackrFonts.medium,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500' as const,
    letterSpacing: 0.35,
  },
  buttonPrimary: {
    fontFamily: stackrFonts.bold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  buttonSecondary: {
    fontFamily: stackrFonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  numericStrong: {
    fontFamily: stackrFonts.bold,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  numericHero: {
    fontFamily: stackrFonts.extraBold,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
} as const;

export type TypeScaleKey = keyof typeof typeScale;

export const tabularNumberStyle = Platform.select({
  ios: { fontVariant: ['tabular-nums'] as any },
  default: {},
}) ?? {};

export const numericTextStyle = {
  ...tabularNumberStyle,
  fontFamily: stackrFonts.bold,
  fontWeight: '700' as const,
  letterSpacing: 0,
} satisfies TextStyle;

function normalizeWeight(weight: TextStyle['fontWeight'], fontSize = 14): TextStyle['fontWeight'] {
  if (weight == null) return '500';
  if (weight === 'bold') return '700';
  if (weight === 'normal') return '400';
  const value = typeof weight === 'number' ? weight : Number.parseInt(String(weight), 10);
  if (!Number.isFinite(value)) return weight;
  if (value >= 850) {
    if (fontSize >= 28) return '800';
    if (fontSize >= 16) return '700';
    return '600';
  }
  if (value >= 750) return fontSize >= 28 ? '800' : '700';
  if (value >= 650) return '700';
  if (value >= 550) return '600';
  if (value >= 450) return '500';
  return '400';
}

export function fontFamilyForWeight(weight?: TextStyle['fontWeight']) {
  const normalized = normalizeWeight(weight);
  if (normalized === '800') return stackrFonts.extraBold;
  if (normalized === '700') return stackrFonts.bold;
  if (normalized === '600') return stackrFonts.semiBold;
  if (normalized === '400') return stackrFonts.regular;
  return stackrFonts.medium;
}

export function lineHeightForFontSize(fontSize: number) {
  if (fontSize >= 36) return Math.round(fontSize * 1.1);
  if (fontSize >= 24) return Math.round(fontSize * 1.18);
  if (fontSize >= 18) return Math.round(fontSize * 1.25);
  if (fontSize <= 11) return Math.round(fontSize * 1.32);
  return Math.round(fontSize * 1.42);
}

export function resolveTypographyStyle(
  style?: TextStyle | null,
  variant?: TypeScaleKey,
  numeric = false
): TextStyle {
  const variantStyle = variant ? typeScale[variant] : defaultTextStyle;
  const fontSize = Number(style?.fontSize ?? variantStyle.fontSize ?? defaultTextStyle.fontSize);
  const fontWeight = normalizeWeight(style?.fontWeight ?? variantStyle.fontWeight ?? defaultTextStyle.fontWeight, fontSize);
  const lineHeight = style?.lineHeight ?? variantStyle.lineHeight ?? lineHeightForFontSize(fontSize);

  return {
    ...variantStyle,
    ...(numeric ? numericTextStyle : null),
    fontFamily: style?.fontFamily ?? (numeric ? fontFamilyForWeight(style?.fontWeight ?? '700') : fontFamilyForWeight(fontWeight)),
    fontWeight,
    fontSize,
    lineHeight,
    letterSpacing: style?.letterSpacing ?? variantStyle.letterSpacing ?? 0,
  };
}

export const defaultTextStyle = {
  fontFamily: stackrFonts.medium,
  fontSize: 14,
  lineHeight: 21,
  fontWeight: '500' as const,
  letterSpacing: 0,
} satisfies TextStyle;
