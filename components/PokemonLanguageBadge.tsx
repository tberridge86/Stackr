import React, { useId } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

/** The card languages currently offered in Stackr's collector-facing UI. */
export type PokemonLanguageBadgeCode =
  | 'en' | 'ja' | 'fr' | 'de' | 'es' | 'it' | 'pt-br' | 'zh-cn' | 'zh-tw' | 'id' | 'th' | 'ko';

export type PokemonLanguageDescriptor = {
  code: PokemonLanguageBadgeCode;
  /** A friendly label for pickers and filters. */
  label: string;
  /** A concise label for chips where horizontal space is scarce. */
  compactLabel: string;
  /** The label written in the language represented by the card. */
  nativeLabel: string;
  /** Country identity represented by the artwork; English intentionally shows UK and US. */
  countryCode: string;
};

export const POKEMON_LANGUAGE_DESCRIPTORS: Readonly<Record<PokemonLanguageBadgeCode, PokemonLanguageDescriptor>> = {
  en: { code: 'en', label: 'English', compactLabel: 'EN', nativeLabel: 'English', countryCode: 'UK + US' },
  ja: { code: 'ja', label: 'Japanese', compactLabel: 'JP', nativeLabel: '日本語', countryCode: 'JP' },
  fr: { code: 'fr', label: 'French', compactLabel: 'FR', nativeLabel: 'Français', countryCode: 'FR' },
  de: { code: 'de', label: 'German', compactLabel: 'DE', nativeLabel: 'Deutsch', countryCode: 'DE' },
  es: { code: 'es', label: 'Spanish', compactLabel: 'ES', nativeLabel: 'Español', countryCode: 'ES' },
  it: { code: 'it', label: 'Italian', compactLabel: 'IT', nativeLabel: 'Italiano', countryCode: 'IT' },
  'pt-br': { code: 'pt-br', label: 'Portuguese (Brazil)', compactLabel: 'PT', nativeLabel: 'Português', countryCode: 'BR' },
  'zh-cn': { code: 'zh-cn', label: 'Simplified Chinese', compactLabel: '简', nativeLabel: '简体中文', countryCode: 'CN' },
  'zh-tw': { code: 'zh-tw', label: 'Traditional Chinese', compactLabel: '繁', nativeLabel: '繁體中文', countryCode: 'TW' },
  id: { code: 'id', label: 'Indonesian', compactLabel: 'ID', nativeLabel: 'Bahasa Indonesia', countryCode: 'ID' },
  th: { code: 'th', label: 'Thai', compactLabel: 'TH', nativeLabel: 'ไทย', countryCode: 'TH' },
  ko: { code: 'ko', label: 'Korean', compactLabel: 'KR', nativeLabel: '한국어', countryCode: 'KR' },
};

const languageAliases: Readonly<Record<string, PokemonLanguageBadgeCode>> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  english: 'en',
  'english-us': 'en',
  'english-uk': 'en',
  uk: 'en',
  us: 'en',
  ja: 'ja',
  jp: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  fr: 'fr',
  french: 'fr',
  de: 'de',
  german: 'de',
  es: 'es',
  spanish: 'es',
  it: 'it',
  italian: 'it',
  'pt-br': 'pt-br',
  pt_br: 'pt-br',
  portuguese: 'pt-br',
  brazilian: 'pt-br',
  'zh-cn': 'zh-cn',
  zh_cn: 'zh-cn',
  zhcn: 'zh-cn',
  'zh-hans': 'zh-cn',
  simplified: 'zh-cn',
  'simplified-chinese': 'zh-cn',
  'zh-tw': 'zh-tw',
  zh_tw: 'zh-tw',
  zhtw: 'zh-tw',
  'zh-hant': 'zh-tw',
  traditional: 'zh-tw',
  'traditional-chinese': 'zh-tw',
  id: 'id',
  indonesian: 'id',
  th: 'th',
  thai: 'th',
  ko: 'ko',
  kr: 'ko',
  korean: 'ko',
};

export function getPokemonLanguageDescriptor(language?: string | null): PokemonLanguageDescriptor | undefined {
  const normalized = String(language ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const code = languageAliases[normalized];
  return code ? POKEMON_LANGUAGE_DESCRIPTORS[code] : undefined;
}

export type PokemonLanguageFlagIconProps = {
  language: PokemonLanguageBadgeCode;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Hides the icon from assistive technology when a parent already describes it. */
  decorative?: boolean;
};

/** A deterministic SVG flag icon, avoiding platform-specific emoji rendering. */
export function PokemonLanguageFlagIcon({
  language,
  size = 20,
  style,
  accessibilityLabel,
  decorative = false,
}: PokemonLanguageFlagIconProps) {
  const descriptor = POKEMON_LANGUAGE_DESCRIPTORS[language];

  if (language === 'en') {
    // UK is deliberately foregrounded, with two thirds of the US edition flag exposed behind it.
    const rearOffset = size * (2 / 3);
    return (
      <View
        accessible={!decorative}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? 'English editions — United Kingdom and United States flags'}
        style={[styles.englishFlagStack, { width: size + rearOffset, height: size }, style]}
      >
        <CircularFlag country="US" size={size} style={{ position: 'absolute', left: rearOffset, top: 0 }} />
        <CircularFlag country="UK" size={size} style={{ position: 'absolute', left: 0, top: 0 }} />
      </View>
    );
  }

  return (
    <View
      accessible={!decorative}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${descriptor.countryCode} flag`}
      style={[{ width: size, height: size }, style]}
    >
      <CircularFlag country={getFlagCountry(language)} size={size} />
    </View>
  );
}

type FlagCountry = 'UK' | 'US' | 'JP' | 'FR' | 'DE' | 'ES' | 'IT' | 'BR' | 'CN' | 'TW' | 'ID' | 'TH' | 'KR';

function getFlagCountry(language: Exclude<PokemonLanguageBadgeCode, 'en'>): FlagCountry {
  const countries: Record<Exclude<PokemonLanguageBadgeCode, 'en'>, FlagCountry> = {
    ja: 'JP',
    fr: 'FR',
    de: 'DE',
    es: 'ES',
    it: 'IT',
    'pt-br': 'BR',
    'zh-cn': 'CN',
    'zh-tw': 'TW',
    id: 'ID',
    th: 'TH',
    ko: 'KR',
  };
  return countries[language];
}

function CircularFlag({ country, size, style }: { country: FlagCountry; size: number; style?: StyleProp<ViewStyle> }) {
  const clipId = `pokemon-language-flag-${useId().replace(/:/g, '')}`;
  return (
    <View style={[styles.iconContainer, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <G clipPath={`url(#${clipId})`}><FlagArtwork country={country} /></G>
        <Circle cx="16" cy="16" r="15.25" fill="none" stroke="rgba(21, 19, 29, 0.20)" />
        <Defs><ClipPath id={clipId}><Circle cx="16" cy="16" r="16" /></ClipPath></Defs>
      </Svg>
    </View>
  );
}

function FlagArtwork({ country }: { country: FlagCountry }) {
  if (country === 'US') {
    return (
      <>
        <Rect width="32" height="32" fill="#B22234" />
        {[2.46, 7.38, 12.31, 17.23, 22.15, 27.08].map((y) => (
          <Rect key={y} y={y} width="32" height="2.46" fill="#FFFFFF" />
        ))}
        <Rect width="14" height="17.23" fill="#3C3B6E" />
        {[3.2, 7, 10.8].flatMap((y) => [4, 8, 12].map((x) => (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#FFFFFF" />
        )))}
      </>
    );
  }

  if (country === 'UK') {
    return (
      <>
        <Rect width="32" height="32" fill="#012169" />
        <Path d="M0 2.9 2.9 0 32 29.1V32h-2.9L0 2.9zm32 0L29.1 0 0 29.1V32h2.9L32 2.9z" fill="#FFFFFF" />
        <Path d="M0 5.2 5.2 0h3.2L0 8.4V5.2zm32 0L26.8 0h-3.2L32 8.4V5.2zM0 26.8 5.2 32h3.2L0 23.6v3.2zm32 0L26.8 32h-3.2l8.4-8.4v3.2z" fill="#C8102E" />
        <Rect x="12" width="8" height="32" fill="#FFFFFF" /><Rect y="12" width="32" height="8" fill="#FFFFFF" />
        <Rect x="13.5" width="5" height="32" fill="#C8102E" /><Rect y="13.5" width="32" height="5" fill="#C8102E" />
      </>
    );
  }

  if (country === 'JP') {
    return <><Rect width="32" height="32" fill="#FFFFFF" /><Circle cx="16" cy="16" r="8.25" fill="#BC002D" /></>;
  }

  if (country === 'FR' || country === 'IT') {
    const outer = country === 'FR' ? '#002395' : '#009246';
    const inner = country === 'FR' ? '#ED2939' : '#CE2B37';
    return <><Rect width="10.67" height="32" fill={outer} /><Rect x="10.67" width="10.67" height="32" fill="#FFFFFF" /><Rect x="21.33" width="10.67" height="32" fill={inner} /></>;
  }

  if (country === 'DE') return <><Rect width="32" height="10.67" fill="#000000" /><Rect y="10.67" width="32" height="10.67" fill="#DD0000" /><Rect y="21.33" width="32" height="10.67" fill="#FFCE00" /></>;
  if (country === 'ES') return <><Rect width="32" height="8" fill="#AA151B" /><Rect y="8" width="32" height="16" fill="#F1BF00" /><Rect y="24" width="32" height="8" fill="#AA151B" /><Circle cx="9" cy="16" r="2.2" fill="#AA151B" /></>;
  if (country === 'BR') return <><Rect width="32" height="32" fill="#009C3B" /><Path d="M16 3 29 16 16 29 3 16z" fill="#FFDF00" /><Circle cx="16" cy="16" r="5.6" fill="#002776" /></>;

  if (country === 'CN') {
    return (
      <>
        <Rect width="32" height="32" fill="#DE2910" />
        <Path d="M8.3 4.6l1.2 3.6 3.8.03-3.08 2.25 1.16 3.62L8.3 11.88 5.2 14.1l1.18-3.62L3.3 8.23l3.8-.03z" fill="#FFDE00" />
        <Circle cx="15.25" cy="6.55" r="1.08" fill="#FFDE00" />
        <Circle cx="17.25" cy="9.2" r="1.08" fill="#FFDE00" />
        <Circle cx="16.9" cy="12.45" r="1.08" fill="#FFDE00" />
        <Circle cx="14.35" cy="14.7" r="1.08" fill="#FFDE00" />
      </>
    );
  }

  if (country === 'ID') return <><Rect width="32" height="16" fill="#CE1126" /><Rect y="16" width="32" height="16" fill="#FFFFFF" /></>;
  if (country === 'TH') return <><Rect width="32" height="5.3" fill="#A51931" /><Rect y="5.3" width="32" height="5.3" fill="#FFFFFF" /><Rect y="10.6" width="32" height="10.8" fill="#2D2A4A" /><Rect y="21.4" width="32" height="5.3" fill="#FFFFFF" /><Rect y="26.7" width="32" height="5.3" fill="#A51931" /></>;
  if (country === 'KR') return <><Rect width="32" height="32" fill="#FFFFFF" /><Circle cx="16" cy="16" r="6" fill="#CD2E3A" /><Path d="M16 10a6 6 0 0 0 0 12 3 3 0 1 0 0-6 3 3 0 1 1 0-6z" fill="#0047A0" /><Path d="m5 9 4-4m-2 6 4-4M23 25l4-4m-2 6 4-4" stroke="#111111" strokeWidth="1.5" /></>;

  return (
    <>
      <Rect width="32" height="32" fill="#DE2910" />
      <Rect width="16" height="16" fill="#000095" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * Math.PI) / 6;
        const x = 8 + Math.cos(angle) * 4.7;
        const y = 8 + Math.sin(angle) * 4.7;
        return <Circle key={index} cx={x} cy={y} r="1.05" fill="#FFFFFF" />;
      })}
      <Circle cx="8" cy="8" r="3.25" fill="#FFFFFF" />
    </>
  );
}

export type PokemonLanguageBadgeProps = {
  language: PokemonLanguageBadgeCode;
  /** `full` includes descriptive text; `compact` uses the short label. */
  variant?: 'full' | 'compact';
  size?: number;
  showNativeLabel?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Allows the shared badge label to remain legible on dark or coloured surfaces. */
  textColor?: string;
  textStyle?: StyleProp<TextStyle>;
};

export function PokemonLanguageBadge({
  language,
  variant = 'full',
  size = 20,
  showNativeLabel = false,
  style,
  textColor,
  textStyle,
}: PokemonLanguageBadgeProps) {
  const descriptor = POKEMON_LANGUAGE_DESCRIPTORS[language];
  const label = showNativeLabel
    ? `${descriptor.label} · ${descriptor.nativeLabel}`
    : variant === 'compact'
      ? descriptor.compactLabel
      : descriptor.label;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={descriptor.label}
      style={[styles.badge, variant === 'compact' && styles.compactBadge, style]}
    >
      <PokemonLanguageFlagIcon language={language} size={size} decorative />
      <Text style={[styles.badgeText, variant === 'compact' && styles.compactBadgeText, textColor ? { color: textColor } : null, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: { overflow: 'hidden' },
  englishFlagStack: { overflow: 'visible' },
  badge: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  compactBadge: { gap: 4 },
  badgeText: { color: '#282334', fontSize: 13, fontWeight: '700' },
  compactBadgeText: { fontSize: 11, letterSpacing: 0.3 },
});
