import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BACKGROUNDS, bgPhotoUri, useTheme, useThemePrefs } from '../theme';

/**
 * Фон экрана из личного оформления: готовая картинка или своё фото.
 * Ставится первым ребёнком в корневой View экрана (у неё фон c.bg).
 * Поверх — полупрозрачная заливка цветом фона, чтобы текст оставался читаемым.
 */
export function AppBackground() {
  const { c, dark } = useTheme();
  const { prefs } = useThemePrefs();
  if (prefs.background === 'none') return null;
  const preset = BACKGROUNDS.find((b) => b.key === prefs.background);
  const source = prefs.background === 'photo' ? (prefs.bgPhoto ? { uri: bgPhotoUri(prefs.bgPhoto) } : null) : preset?.source;
  if (!source) return null;
  // Фото и картинки «не в тон» теме затемняем или осветляем сильнее
  const tone = preset?.tone ?? 'photo';
  const veil = tone === 'photo' ? (dark ? 0.55 : 0.5) : (tone === 'dark') === dark ? 0.25 : 0.72;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: veil }]} />
    </View>
  );
}

/** Есть ли сейчас фоновая картинка (тогда прокрутка и списки должны быть прозрачными) */
export function useHasBackground(): boolean {
  const { prefs } = useThemePrefs();
  return prefs.background !== 'none' && (prefs.background !== 'photo' || !!prefs.bgPhoto);
}
