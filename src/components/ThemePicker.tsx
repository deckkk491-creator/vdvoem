import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { humanError } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import {
  ACCENT_KEYS,
  ACCENTS,
  BACKGROUNDS,
  SURFACE_KEYS,
  SURFACES,
  radius,
  useTheme,
  useThemePrefs,
  bgPhotoUri,
  type BackgroundKey,
  type ThemePrefs,
} from '../theme';
import { Label, Segmented } from './ui';

/** Личное оформление: цвет, тема, подложки и фон. У каждого участника — своё. */
export function ThemePicker() {
  const { c, dark } = useTheme();
  const { prefs, setPrefs } = useThemePrefs();
  const { saveProfile } = useAuth();

  /** Цвет и тема синхронизируются через профиль, остальное хранится на телефоне */
  const apply = (next: ThemePrefs) => {
    const prev = prefs;
    setPrefs(next); // сразу, без ожидания сети
    Haptics.selectionAsync().catch(() => undefined);
    if (next.accent === prev.accent && next.mode === prev.mode) return;
    saveProfile({ theme_accent: next.accent, theme_mode: next.mode }).catch((e) => {
      setPrefs(prev);
      Alert.alert('Не сохранилось', humanError(e));
    });
  };

  const setBackground = (background: BackgroundKey) => apply({ ...prefs, background });

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.accessPrivileges !== 'limited') {
        Alert.alert('Нет доступа к фото', 'Разреши доступ к фото для «Вдвоём» в настройках телефона.', [
          { text: 'Не сейчас', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => undefined) },
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled || !res.assets[0]) return;
      // Копируем в память приложения: временный файл из галереи система может удалить
      const dest = new File(Paths.document, `background-${Date.now()}.jpg`);
      new File(res.assets[0].uri).copy(dest);
      const old = prefs.bgPhoto;
      // Храним только имя файла: путь к папке приложения на iOS меняется после обновления
      apply({ ...prefs, background: 'photo', bgPhoto: dest.name });
      if (old) {
        try {
          new File(bgPhotoUri(old)).delete();
        } catch {
          // старый файл мог уже исчезнуть
        }
      }
    } catch (e) {
      Alert.alert('Не получилось поставить фото', e instanceof Error ? e.message : 'Попробуй другое фото');
    }
  };

  const tile = (key: string, title: string, active: boolean, onPress: () => void, content: React.ReactNode) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`Фон: ${title}`}
      style={{ alignItems: 'center', width: 72 }}
    >
      <View
        style={{
          width: 64,
          height: 100,
          borderRadius: radius.sm,
          overflow: 'hidden',
          borderWidth: 3,
          borderColor: active ? c.accent : c.border,
          backgroundColor: c.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {content}
        {active ? (
          <View style={{ position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={14} color={c.onAccent} />
          </View>
        ) : null}
      </View>
      <Text style={{ color: active ? c.text : c.textMuted, fontSize: 12, marginTop: 4, fontWeight: active ? '700' : '500' }} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );

  return (
    <View>
      {/* Цвет */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
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
              style={{ alignItems: 'center', width: 70 }}
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
              <Text
                style={{ color: active ? c.text : c.textMuted, fontSize: 12, marginTop: 4, fontWeight: active ? '700' : '500' }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {a.title}
              </Text>
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
        onChange={(m) => apply({ ...prefs, mode: m })}
      />

      {/* Подложки */}
      <Label style={{ marginTop: 20 }}>Подложки</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SURFACE_KEYS.map((k) => {
          const s = SURFACES[k];
          const sw = dark ? s.dark : s.light;
          const active = prefs.surface === k;
          return (
            <Pressable
              key={k}
              onPress={() => apply({ ...prefs, surface: k })}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Подложки: ${s.title}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 6,
                paddingRight: 12,
                height: 44,
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: active ? c.accent : c.border,
                backgroundColor: sw.bg,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: sw.card, borderWidth: 1, borderColor: sw.border, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sw.bgAlt }} />
              </View>
              <Text style={{ color: dark ? '#F6EBE1' : '#2B1D17', fontSize: 14, fontWeight: active ? '700' : '500' }}>{s.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Фон */}
      <Label style={{ marginTop: 20 }}>Фон</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
        {tile('none', 'Без фона', prefs.background === 'none', () => setBackground('none'), <Ionicons name="ban-outline" size={22} color={c.textFaint} />)}
        {tile(
          'photo',
          prefs.bgPhoto ? 'Моё фото' : 'Своё фото',
          prefs.background === 'photo',
          () => (prefs.bgPhoto && prefs.background !== 'photo' ? setBackground('photo') : pickPhoto()),
          prefs.bgPhoto ? (
            <Image source={{ uri: bgPhotoUri(prefs.bgPhoto) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={24} color={c.accent} />
          ),
        )}
        {BACKGROUNDS.map((b) =>
          tile(b.key, b.title, prefs.background === b.key, () => setBackground(b.key), <Image source={b.source} style={{ width: '100%', height: '100%' }} contentFit="cover" />),
        )}
      </ScrollView>
      {prefs.background === 'photo' ? (
        <Pressable onPress={pickPhoto} accessibilityRole="button" style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginTop: 4 }}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Выбрать другое фото</Text>
        </Pressable>
      ) : null}

      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 10 }}>
        Оформление личное: партнёр видит приложение в своих цветах. Подложки и фон хранятся на этом телефоне.
      </Text>
    </View>
  );
}
