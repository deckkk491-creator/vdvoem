import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../src/theme';

// Сюда ведёт ссылка из письма. Сам вход делает useAuthDeepLinks в корневом layout,
// а Gate потом переводит на нужный экран — здесь просто показываем загрузку.
export default function AuthCallback() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} accessibilityLabel="Входим" />
    </View>
  );
}
