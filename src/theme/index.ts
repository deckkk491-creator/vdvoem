import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

/*
 * Все цвета приложения — только отсюда.
 * Пары «текст на фоне» проверены на контраст WCAG AA (≥ 4.5:1 для текста,
 * ≥ 3:1 для иконок и крупного текста): белый на accent/honey/sage/sky/plum/danger,
 * цвет раздела на его *Soft-фоне, textMuted на bg/bgAlt/card.
 * textFaint тоже проходит AA на bg/card, но по смыслу — только для вторичных подписей.
 */
const light: Palette = {
  bg: '#FBF4EC',
  bgAlt: '#F5EADF',
  card: '#FFFCF8',
  cardPressed: '#F7EFE6',
  border: '#EADBCB',
  text: '#2B1D17',
  textMuted: '#735F52',
  textFaint: '#806B5D',
  accent: '#B04620',
  accentSoft: '#FBE1D5',
  onAccent: '#FFFFFF',
  plum: '#7A3F5C',
  plumSoft: '#F1DDE6',
  honey: '#93600E',
  honeySoft: '#FBEBCB',
  sage: '#3F6B45',
  sageSoft: '#DDEBD9',
  sky: '#3B6E8F',
  skySoft: '#E3EEF5',
  danger: '#A93A27',
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
  textFaint: '#9A8473',
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
/** Минимальный размер области нажатия (Apple HIG — 44 pt) */
export const TAP = 44;
/** Высота нижнего таб-бара без системного отступа */
export const TAB_BAR_HEIGHT = 58;

export type Theme = { c: Palette; dark: boolean };

/* ------------------------- Личная тема оформления ------------------------- */

export type AccentKey = 'terracotta' | 'lavender' | 'mint' | 'ocean' | 'berry' | 'sun' | 'graphite';
export type ThemeMode = 'system' | 'light' | 'dark';

type AccentSet = { accent: string; accentSoft: string; onAccent: string };

/*
 * Акцентные цвета. Пары проверены на WCAG AA: onAccent на accent ≥ 4.5:1,
 * accent на accentSoft ≥ 4.5:1 (в светлой теме — белый текст на насыщенном цвете,
 * в тёмной — тёмный текст на светлом).
 */
export const ACCENTS: Record<AccentKey, { title: string; light: AccentSet; dark: AccentSet }> = {
  terracotta: {
    title: 'Терракота',
    light: { accent: '#B04620', accentSoft: '#FBE1D5', onAccent: '#FFFFFF' },
    dark: { accent: '#F07A52', accentSoft: '#3D2219', onAccent: '#1A0F0A' },
  },
  lavender: {
    title: 'Лаванда',
    light: { accent: '#6B4FA8', accentSoft: '#ECE5F7', onAccent: '#FFFFFF' },
    dark: { accent: '#B9A2EE', accentSoft: '#2C2340', onAccent: '#160F24' },
  },
  mint: {
    title: 'Мята',
    light: { accent: '#2F7466', accentSoft: '#D9EFEA', onAccent: '#FFFFFF' },
    dark: { accent: '#7FD1BE', accentSoft: '#1B302B', onAccent: '#0B1A16' },
  },
  ocean: {
    title: 'Океан',
    light: { accent: '#2D6394', accentSoft: '#DEEAF6', onAccent: '#FFFFFF' },
    dark: { accent: '#8EBEEA', accentSoft: '#1A2938', onAccent: '#0A1420' },
  },
  berry: {
    title: 'Ягода',
    light: { accent: '#A3305C', accentSoft: '#F8DCE7', onAccent: '#FFFFFF' },
    dark: { accent: '#F08BB1', accentSoft: '#3B1C28', onAccent: '#1F0A12' },
  },
  sun: {
    title: 'Солнце',
    light: { accent: '#8A5A00', accentSoft: '#FBEBC8', onAccent: '#FFFFFF' },
    dark: { accent: '#F2B84B', accentSoft: '#3A2C12', onAccent: '#1E1503' },
  },
  graphite: {
    title: 'Графит',
    light: { accent: '#3F4652', accentSoft: '#E4E6EA', onAccent: '#FFFFFF' },
    dark: { accent: '#C3CAD6', accentSoft: '#262A31', onAccent: '#12151A' },
  },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

/* ------------------------- Цвет подложек ------------------------- */

export type SurfaceKey = 'warm' | 'neutral' | 'cool' | 'rose' | 'sage' | 'lilac';
type SurfaceSet = Pick<Palette, 'bg' | 'bgAlt' | 'card' | 'cardPressed' | 'border'>;

/*
 * Подложки: фон экрана, карточки и поля. Яркость как у тёплых по умолчанию,
 * поэтому текст сохраняет контраст WCAG AA (проверено скриптом, как и для тёплых).
 */
export const SURFACES: Record<SurfaceKey, { title: string; light: SurfaceSet; dark: SurfaceSet }> = {
  warm: {
    title: 'Тёплые',
    light: { bg: '#FBF4EC', bgAlt: '#F5EADF', card: '#FFFCF8', cardPressed: '#F7EFE6', border: '#EADBCB' },
    dark: { bg: '#17110E', bgAlt: '#1E1612', card: '#241B16', cardPressed: '#2D221C', border: '#3A2D25' },
  },
  neutral: {
    title: 'Нейтральные',
    light: { bg: '#F5F5F4', bgAlt: '#ECEBE9', card: '#FFFFFF', cardPressed: '#F2F1EF', border: '#E0DEDA' },
    dark: { bg: '#121212', bgAlt: '#1A1A1A', card: '#222222', cardPressed: '#2A2A2A', border: '#343434' },
  },
  cool: {
    title: 'Прохладные',
    light: { bg: '#F1F5F9', bgAlt: '#E6ECF2', card: '#FBFDFF', cardPressed: '#EEF3F8', border: '#D6E0EA' },
    dark: { bg: '#0E141B', bgAlt: '#141C25', card: '#1B2530', cardPressed: '#222E3B', border: '#2D3B4A' },
  },
  rose: {
    title: 'Пудровые',
    light: { bg: '#FBF1F3', bgAlt: '#F4E4E8', card: '#FFFAFB', cardPressed: '#F7ECEF', border: '#EBD3DA' },
    dark: { bg: '#1A1014', bgAlt: '#22151B', card: '#2A1B22', cardPressed: '#33222A', border: '#432D37' },
  },
  sage: {
    title: 'Оливковые',
    light: { bg: '#F3F5EE', bgAlt: '#E8ECE0', card: '#FCFDF9', cardPressed: '#EFF2E8', border: '#DADFCC' },
    dark: { bg: '#12150F', bgAlt: '#181C14', card: '#20251B', cardPressed: '#282E22', border: '#353C2D' },
  },
  lilac: {
    title: 'Сиреневые',
    light: { bg: '#F5F2FA', bgAlt: '#EBE6F3', card: '#FDFBFF', cardPressed: '#F1EDF7', border: '#DDD5EA' },
    dark: { bg: '#141119', bgAlt: '#1B1722', card: '#231E2C', cardPressed: '#2B2536', border: '#392F47' },
  },
};
export const SURFACE_KEYS = Object.keys(SURFACES) as SurfaceKey[];

/* ------------------------- Фон экранов ------------------------- */

export type BackgroundKey = 'none' | 'sunrise' | 'sea' | 'forest' | 'lavender' | 'night' | 'hearts' | 'paper' | 'photo';

/** Готовые фоны. tone — светлая или тёмная картинка: под неё подбирается затемнение */
export const BACKGROUNDS: { key: Exclude<BackgroundKey, 'none' | 'photo'>; title: string; tone: 'light' | 'dark'; source: number }[] = [
  { key: 'sunrise', title: 'Рассвет', tone: 'light', source: require('../../assets/backgrounds/sunrise.jpg') },
  { key: 'sea', title: 'Море', tone: 'light', source: require('../../assets/backgrounds/sea.jpg') },
  { key: 'forest', title: 'Лес', tone: 'light', source: require('../../assets/backgrounds/forest.jpg') },
  { key: 'lavender', title: 'Лаванда', tone: 'light', source: require('../../assets/backgrounds/lavender.jpg') },
  { key: 'night', title: 'Ночь', tone: 'dark', source: require('../../assets/backgrounds/night.jpg') },
  { key: 'hearts', title: 'Сердечки', tone: 'light', source: require('../../assets/backgrounds/hearts.jpg') },
  { key: 'paper', title: 'Бумага', tone: 'light', source: require('../../assets/backgrounds/paper.jpg') },
];

/** Полный путь к своему фото на фон. Хранится имя файла в папке документов приложения. */
export function bgPhotoUri(nameOrUri: string): string {
  const name = nameOrUri.split('/').pop() || nameOrUri;
  return new File(Paths.document, name).uri;
}

function isSurface(v: unknown): v is SurfaceKey {
  return typeof v === 'string' && v in SURFACES;
}
function isBackground(v: unknown): v is BackgroundKey {
  return v === 'none' || v === 'photo' || BACKGROUNDS.some((b) => b.key === v);
}

export type ThemePrefs = {
  accent: AccentKey;
  mode: ThemeMode;
  /** Цвет подложек (хранится на телефоне) */
  surface: SurfaceKey;
  /** Фон экранов (хранится на телефоне) */
  background: BackgroundKey;
  /** Своё фото на фон: файл в памяти приложения */
  bgPhoto: string | null;
};
const DEFAULT_PREFS: ThemePrefs = { accent: 'terracotta', mode: 'system', surface: 'warm', background: 'none', bgPhoto: null };
const PREFS_KEY = 'vdvoem.theme';

type ThemeCtx = { prefs: ThemePrefs; setPrefs: (p: ThemePrefs) => void };
const ThemeContext = createContext<ThemeCtx | null>(null);

function isAccent(v: unknown): v is AccentKey {
  return typeof v === 'string' && v in ACCENTS;
}
function isMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Держит личную тему пользователя. Источник правды — профиль на сервере
 * (`remote`), локальная копия нужна, чтобы при запуске не мигал цвет по умолчанию.
 */
export function ThemeProvider({ remote, children }: { remote?: { accent?: string | null; mode?: string | null } | null; children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<ThemePrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<ThemePrefs>;
        setPrefsState((cur) => ({
          accent: isAccent(p.accent) ? p.accent : cur.accent,
          mode: isMode(p.mode) ? p.mode : cur.mode,
          surface: isSurface(p.surface) ? p.surface : 'warm',
          background: isBackground(p.background) && (p.background !== 'photo' || !!p.bgPhoto) ? p.background : 'none',
          bgPhoto: typeof p.bgPhoto === 'string' ? p.bgPhoto : null,
        }));
      })
      .catch(() => undefined);
  }, []);

  const rAccent = remote?.accent;
  const rMode = remote?.mode;
  useEffect(() => {
    if (!isAccent(rAccent) || !isMode(rMode)) return;
    // С сервера приходят только цвет и тема; подложки и фон — настройки этого телефона
    setPrefsState((cur) => {
      const next = { ...cur, accent: rAccent, mode: rMode };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, [rAccent, rMode]);

  const value = useMemo<ThemeCtx>(
    () => ({
      prefs,
      setPrefs: (p) => {
        setPrefsState(p);
        AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)).catch(() => undefined);
      },
    }),
    [prefs],
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useThemePrefs(): ThemeCtx {
  return useContext(ThemeContext) ?? { prefs: DEFAULT_PREFS, setPrefs: () => undefined };
}

export function buildTheme(prefs: ThemePrefs, systemDark: boolean): Theme {
  const isDark = prefs.mode === 'system' ? systemDark : prefs.mode === 'dark';
  const base = isDark ? dark : light;
  const a = ACCENTS[prefs.accent] ?? ACCENTS.terracotta;
  const sf = SURFACES[prefs.surface] ?? SURFACES.warm;
  return { c: { ...base, ...(isDark ? sf.dark : sf.light), ...(isDark ? a.dark : a.light) }, dark: isDark };
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { prefs } = useThemePrefs();
  return useMemo(() => buildTheme(prefs, scheme === 'dark'), [prefs, scheme]);
}

export type SectionKey = 'watch' | 'recipe' | 'weekend' | 'shopping' | 'savings' | 'wishlist' | 'rule' | 'calendar' | 'chat' | 'dates' | 'events' | 'tasks';

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
    case 'calendar':
      return { fg: c.sky, bg: c.skySoft, emoji: '📅' };
    case 'chat':
      return { fg: c.sage, bg: c.sageSoft, emoji: '💬' };
    case 'dates':
      return { fg: c.plum, bg: c.plumSoft, emoji: '💞' };
    case 'events':
      return { fg: c.sky, bg: c.skySoft, emoji: '📌' };
    case 'tasks':
      return { fg: c.honey, bg: c.honeySoft, emoji: '✅' };
  }
}
