import { Platform, useColorScheme } from 'react-native';

export type Palette = {
  bg: string;
  bgAlt: string;
  card: string;
  cardPressed: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  plum: string;
  plumSoft: string;
  honey: string;
  honeySoft: string;
  sage: string;
  sageSoft: string;
  sky: string;
  skySoft: string;
  danger: string;
  dangerSoft: string;
  heart: string;
  shadow: string;
};

const light: Palette = {
  bg: '#FBF4EC',
  bgAlt: '#F5EADF',
  card: '#FFFCF8',
  cardPressed: '#F7EFE6',
  border: '#EADBCB',
  text: '#2B1D17',
  textMuted: '#7D685C',
  textFaint: '#B09D90',
  accent: '#E0623A',
  accentSoft: '#FBE1D5',
  onAccent: '#FFFFFF',
  plum: '#7A3F5C',
  plumSoft: '#F1DDE6',
  honey: '#C98618',
  honeySoft: '#FBEBCB',
  sage: '#4F7A55',
  sageSoft: '#DDEBD9',
  sky: '#3B6E8F',
  skySoft: '#DAE8F1',
  danger: '#C2412D',
  dangerSoft: '#F8DCD5',
  heart: '#E5484D',
  shadow: 'rgba(80, 40, 20, 0.10)',
};

const dark: Palette = {
  bg: '#17110E',
  bgAlt: '#1E1612',
  card: '#241B16',
  cardPressed: '#2D221C',
  border: '#3A2D25',
  text: '#F6EBE1',
  textMuted: '#B7A293',
  textFaint: '#7A6759',
  accent: '#F07A52',
  accentSoft: '#3D2219',
  onAccent: '#1A0F0A',
  plum: '#D29AB6',
  plumSoft: '#3A2330',
  honey: '#F2B45C',
  honeySoft: '#3A2C16',
  sage: '#9CC79F',
  sageSoft: '#22311F',
  sky: '#8DBAD6',
  skySoft: '#1C2B35',
  danger: '#F08A78',
  dangerSoft: '#3D1E18',
  heart: '#FF6B6F',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  rounded: Platform.select({ ios: 'System', default: undefined }),
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export type Theme = { c: Palette; dark: boolean };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, dark: isDark };
}

export type SectionKey = 'watch' | 'recipe' | 'weekend' | 'shopping' | 'savings' | 'wishlist' | 'rule';

/** Цвет и эмодзи каждого раздела — у каждого свой характер */
export function sectionStyle(c: Palette, key: SectionKey): { fg: string; bg: string; emoji: string } {
  switch (key) {
    case 'watch':
      return { fg: c.plum, bg: c.plumSoft, emoji: '🍿' };
    case 'recipe':
      return { fg: c.accent, bg: c.accentSoft, emoji: '🍲' };
    case 'weekend':
      return { fg: c.sage, bg: c.sageSoft, emoji: '🌿' };
    case 'shopping':
      return { fg: c.honey, bg: c.honeySoft, emoji: '🧺' };
    case 'savings':
      return { fg: c.sky, bg: c.skySoft, emoji: '🐷' };
    case 'wishlist':
      return { fg: c.plum, bg: c.plumSoft, emoji: '🎁' };
    case 'rule':
      return { fg: c.accent, bg: c.accentSoft, emoji: '✨' };
  }
}
