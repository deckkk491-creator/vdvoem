import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { humanError } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { ACCENT_KEYS, ACCENTS, useTheme, useThemePrefs, type AccentKey, type ThemeMode } from '../theme';
import { Segmented } from './ui';

/** Личное оформление: цвет и светлая/тёмная тема. У каждого участника — своё. */
export function ThemePicker() {
  const { c, dark } = useTheme();
  const { prefs, setPrefs } = useThemePrefs();
  const { saveProfile } = useAuth();

  const apply = (next: { accent: AccentKey; mode: ThemeMode }) => {
    const prev = prefs;
    setPrefs(next); // сразу, без ожидания сети
    Haptics.selectionAsync().catch(() => undefined);
    saveProfile({ theme_accent: next.accent, theme_mode: next.mode }).catch((e) => {
      setPrefs(prev);
      Alert.alert('Не сохранилось', humanError(e));
    });
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        {ACCENT_KEYS.map((k) => {
          const a = ACCENTS[k];
          const sw = dark ? a.dark : a.light;
          const active = prefs.accent === k;
          return (
            <Pressable
              key={k}
              onPress={() => apply({ ...prefs, accent: k })}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Цвет: ${a.title}`}
              style={{ alignItems: 'center', width: 64 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: sw.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: active ? c.text : 'transparent',
                }}
              >
                {active ? <Ionicons name="checkmark" size={22} color={sw.onAccent} /> : null}
              </View>
              <Text style={{ color: active ? c.text : c.textMuted, fontSize: 12, marginTop: 4, fontWeight: active ? '700' : '500' }}>{a.title}</Text>
            </Pressable>
          );
        })}
      </View>
      <Segmented
        options={[
          { value: 'system', label: 'Как в системе' },
          { value: 'light', label: '☀️ Светлая' },
          { value: 'dark', label: '🌙 Тёмная' },
        ]}
        value={prefs.mode}
        onChange={(m) => apply({ ...prefs, mode: m as ThemeMode })}
      />
      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 10 }}>Оформление личное: партнёр видит приложение в своих цветах.</Text>
    </View>
  );
}
