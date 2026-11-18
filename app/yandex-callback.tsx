import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../src/theme';

// Сюда возвращается вход через Яндекс ID (на Android приложение открывается по ссылке).
// Сам вход доводит signInWithYandex (src/lib/yandexAuth.ts),
// а Gate потом переводит на нужный экран — здесь просто показываем загрузку.
export default function YandexCallback() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} accessibilityLabel="Входим" />
    </View>
  );
}
