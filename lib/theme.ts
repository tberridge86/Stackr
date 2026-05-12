export type Theme = typeof lightTheme;

export const lightTheme = {
  dark: false,
  colors: {
    bg: '#FFFFFF',
    card: '#FFFFFF',
    // Purple-tinted surface for inputs, inner panels, chips
    surface: '#EDE8FF',
    primary: '#6C4BFF',
    secondary: '#FFC84D',
    text: '#1B2A4B',
    // Purple-tinted soft text
    textSoft: '#7970A9',
    // Purple-tinted borders
    border: '#DDD6FF',
  },
};

export const darkTheme = {
  dark: true,
  colors: {
    bg: '#0D0F1A',
    card: '#151829',
    surface: '#1C1F35',
    primary: '#7C5FFF',
    secondary: '#FFC84D',
    text: '#F0F2FF',
    textSoft: '#8B92B8',
    border: '#252840',
  },
};

// Legacy static export — screens migrated to useTheme() won't need this
export const theme = lightTheme;
