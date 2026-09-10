export type Theme = typeof lightTheme;

export const stackrSemanticColors = {
  appBackground: '#FAF9FC',
  surface: '#F2EFF7',
  elevatedSurface: '#FFFFFF',
  textPrimary: '#433650',
  textSecondary: '#5A5065',
  textMuted: '#696373',
  border: '#E4DEED',
  brand: '#6938F5',
  primaryAction: '#6938F5',
  selectedState: '#EEE7FF',
  positiveSurface: '#E7F4F1',
  featureSurface: '#F0EAFC',
  featureBorder: '#DACDF0',
  featureText: '#4B346B',
  success: '#087F73',
  warning: '#F59E0B',
  error: '#DC2626',
  information: '#2563EB',
  marketRise: '#087F73',
  marketFall: '#B91C1C',
  sellerIn: '#6938F5',
  sellerOut: '#F97316',
  bronzeProtection: '#B7791F',
  silverProtection: '#64748B',
  goldProtection: '#D97706',
} as const;

export const stackrRadii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const stackrSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const stackrShadows = {
  card: {
    shadowColor: '#6B528B',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  elevated: {
    shadowColor: '#6B528B',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
} as const;

export const stackrGradients = {
  actionLight: ['#FFFFFF', '#FAF9FC', '#F2EFF7'] as const,
  actionDark: ['#2B145C', '#4F22D8', '#6938F5'] as const,
  actionPrimary: ['#8B55FF', '#6938F5', '#5226D9'] as const,
} as const;

export const lightTheme = {
  dark: false,
  colors: {
    bg: '#FAF9FC',
    card: '#FFFFFF',
    // A light lilac surface keeps the screen bright; saturated purple carries
    // actions and selection rather than large dark panels.
    surface: '#F2EFF7',
    primary: '#6938F5',
    secondary: '#FFBE35',
    text: '#433650',
    textSoft: '#696373',
    border: '#E4DEED',
    semantic: stackrSemanticColors,
  },
  radii: stackrRadii,
  spacing: stackrSpacing,
  shadows: stackrShadows,
  gradients: {
    actionLight: stackrGradients.actionLight,
    actionDark: stackrGradients.actionDark,
    actionPrimary: stackrGradients.actionPrimary,
  },
};

// Legacy static export — screens migrated to useTheme() won't need this
export const theme = lightTheme;
