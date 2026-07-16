export type Theme = typeof lightTheme;

export const stackrSemanticColors = {
  appBackground: '#FFFFFF',
  surface: '#F7F3FF',
  elevatedSurface: '#FFFFFF',
  textPrimary: '#07145F',
  textSecondary: '#36306F',
  textMuted: '#716BA8',
  border: '#E8E1FF',
  brand: '#6938F5',
  primaryAction: '#6938F5',
  selectedState: '#EEE7FF',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  information: '#2563EB',
  marketRise: '#15803D',
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
    shadowColor: '#1B2A4B',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  elevated: {
    shadowColor: '#6136F5',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
} as const;

export const stackrGradients = {
  actionLight: ['#FFFFFF', '#F9F6FF', '#F1ECFF'] as const,
  actionDark: ['#2B145C', '#4F22D8', '#6938F5'] as const,
  actionPrimary: ['#8B55FF', '#6938F5', '#5226D9'] as const,
} as const;

export const lightTheme = {
  dark: false,
  colors: {
    bg: '#FFFFFF',
    card: '#FFFFFF',
    // Purple-tinted surface for inputs, inner panels, chips
    surface: '#F7F3FF',
    primary: '#6938F5',
    secondary: '#FFBE35',
    text: '#07145F',
    // Purple-tinted soft text
    textSoft: '#716BA8',
    // Purple-tinted borders
    border: '#E8E1FF',
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
