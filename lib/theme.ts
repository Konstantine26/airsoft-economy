import type { TextStyle } from 'react-native';

// Field-first dark palette: graphite with a slight cool bias instead of
// neutral grey. Three text levels are deliberately far apart (≈16:1, 8:1,
// 4.3:1 on `bg`) so secondary text survives direct sunlight.
export const colors = {
  bg: '#111315',
  card: '#1A1D20',
  cardBorder: '#30353A',
  cardSoft: '#15181A',
  surface2: '#23272B',
  text: '#F2F4F3',
  textMuted: '#A7AEAA',
  textDim: '#737A77',
  accent: '#5B8CF5',
  accentBorder: '#4A74D6',
  accentSoft: 'rgba(91, 140, 245, 0.16)',
  accentSoftBorder: 'rgba(91, 140, 245, 0.6)',
  onAccent: '#0A1224',
  // Reserved for "a game is live right now" -- don't reuse it for generic
  // warnings, or the in-game state stops being recognisable at a glance.
  live: '#F3A838',
  liveSoft: 'rgba(243, 168, 56, 0.15)',
  onLive: '#221400',
  success: '#45C27F',
  successSoft: 'rgba(69, 194, 127, 0.15)',
  onSuccess: '#07170E',
  danger: '#EE5A45',
  dangerSoft: 'rgba(238, 90, 69, 0.15)',
  crown: '#f5a623',
  toast: '#2C3136',
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayStrong: 'rgba(0, 0, 0, 0.85)',
  white10: 'rgba(255, 255, 255, 0.06)',
  white14: 'rgba(255, 255, 255, 0.14)',
  teamGradientStart: '#2F4278',
  teamGradientEnd: '#1C2540',
  teamGradientBorder: '#3F5591',
} as const;

// In-game screens can switch between the regular dark palette and "Солнце",
// a light high-contrast one for direct sunlight (see lib/sunMode.ts). Only
// screens that read from `useSunMode().palette` follow the switch.
export type GamePalette = {
  bg: string;
  card: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  live: string;
  liveSoft: string;
  onLive: string;
  success: string;
  successSoft: string;
  danger: string;
};

export const gamePalettes: { dark: GamePalette; sun: GamePalette } = {
  dark: {
    bg: colors.bg,
    card: colors.card,
    surface2: colors.surface2,
    border: colors.cardBorder,
    text: colors.text,
    textMuted: colors.textMuted,
    textDim: colors.textDim,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    onAccent: colors.onAccent,
    live: colors.live,
    liveSoft: colors.liveSoft,
    onLive: colors.onLive,
    success: colors.success,
    successSoft: colors.successSoft,
    danger: colors.danger,
  },
  sun: {
    bg: '#F3F4F1',
    card: '#FFFFFF',
    surface2: '#E6E9E5',
    border: '#B9BFBA',
    text: '#0B0D0E',
    textMuted: '#3A4245',
    textDim: '#5C6466',
    accent: '#1F4FC4',
    accentSoft: 'rgba(31, 79, 196, 0.12)',
    onAccent: '#FFFFFF',
    live: '#B86A00',
    liveSoft: 'rgba(184, 106, 0, 0.12)',
    onLive: '#FFFFFF',
    success: '#137A45',
    successSoft: 'rgba(19, 122, 69, 0.12)',
    danger: '#C23A26',
  },
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 16,
  pill: 999,
  sheet: 22,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Touch targets. 44 is the floor for anything tappable (iOS HIG; Android
// asks for 48dp), and players use the app in gloves.
export const sizes = {
  hitMin: 44,
  buttonSm: 36,
  button: 48,
  buttonLg: 52,
  listRow: 56,
  listRowTwoLine: 64,
  avatarRow: 36,
} as const;

export const motion = {
  fast: 120,
  base: 220,
  hold: 900,
  pressScale: 0.97,
} as const;

// Rajdhani has no Cyrillic glyphs (latin/devanagari only), so Russian text
// set in it silently falls back to the system font. Keep it for digits and
// Latin only -- balances, participant numbers, timers -- and set every
// Cyrillic heading in Inter.
export const font = {
  heading: 'Inter_700Bold',
  numeric: 'Rajdhani_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  // Numbers only (see `font.numeric`).
  display: { fontFamily: font.numeric, fontSize: 40, lineHeight: 44, fontVariant: tabular },
  number: { fontFamily: font.numeric, fontSize: 24, lineHeight: 28, fontVariant: tabular },
  title1: { fontFamily: font.heading, fontSize: 26, lineHeight: 32 },
  title2: { fontFamily: font.heading, fontSize: 20, lineHeight: 26 },
  headline: { fontFamily: font.bodySemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20 },
  subhead: { fontFamily: font.body, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 16 },
  label: { fontFamily: font.bodySemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export const fontsToLoad = {
  Rajdhani_700Bold: require('@expo-google-fonts/rajdhani').Rajdhani_700Bold,
  Inter_400Regular: require('@expo-google-fonts/inter').Inter_400Regular,
  Inter_500Medium: require('@expo-google-fonts/inter').Inter_500Medium,
  Inter_600SemiBold: require('@expo-google-fonts/inter').Inter_600SemiBold,
  Inter_700Bold: require('@expo-google-fonts/inter').Inter_700Bold,
};
