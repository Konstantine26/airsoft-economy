export const colors = {
  bg: '#1c1c1c',
  card: '#262626',
  cardBorder: '#3a3a3a',
  cardSoft: '#161616',
  text: '#f2f2f2',
  textMuted: '#8f8f8f',
  textDim: '#6b6b6b',
  accent: '#4f7fe8',
  accentBorder: '#5c6cb8',
  accentSoft: 'rgba(79, 127, 232, 0.14)',
  accentSoftBorder: 'rgba(79, 127, 232, 0.6)',
  onAccent: '#131a2e',
  success: '#4fbe7a',
  danger: '#d1543f',
  crown: '#f5a623',
  overlay: 'rgba(0, 0, 0, 0.55)',
  overlayStrong: 'rgba(0, 0, 0, 0.85)',
  white10: 'rgba(255, 255, 255, 0.06)',
  white14: 'rgba(255, 255, 255, 0.14)',
  teamGradientStart: '#32447e',
  teamGradientEnd: '#212c52',
  teamGradientBorder: '#425790',
} as const;

export const radii = {
  sm: 8,
  md: 11,
  lg: 13,
  xl: 16,
  pill: 20,
  sheet: 20,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const font = {
  heading: 'Rajdhani_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const fontsToLoad = {
  Rajdhani_700Bold: require('@expo-google-fonts/rajdhani').Rajdhani_700Bold,
  Inter_400Regular: require('@expo-google-fonts/inter').Inter_400Regular,
  Inter_500Medium: require('@expo-google-fonts/inter').Inter_500Medium,
  Inter_600SemiBold: require('@expo-google-fonts/inter').Inter_600SemiBold,
  Inter_700Bold: require('@expo-google-fonts/inter').Inter_700Bold,
};
