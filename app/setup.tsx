import React from 'react';
import { Text, View } from 'react-native';
import { Body, Card, Label, Screen, Spacer, Title } from '../src/components/ui';
import { useTheme } from '../src/theme';

const STEPS = [
  'Создайте бесплатный проект на supabase.com.',
  'Выполните файл supabase/migrations/0001_init.sql в SQL Editor.',
  'Скопируйте .env.example в .env и вставьте Project URL и anon key (Project Settings → API).',
  'Перезапустите сервер: npx expo start -c',
];

export default function Setup() {
  const { c } = useTheme();
  return (
    <Screen>
      <Spacer h={24} />
      <Text style={{ fontSize: 56 }}>🔧</Text>
      <Title style={{ marginTop: 12 }}>Почти готово</Title>
      <Body muted style={{ marginTop: 8 }}>
        Приложению «Вдвоём» нужен сервер Supabase, чтобы вы с партнёром видели одни и те же списки. Ключи ещё не указаны.
      </Body>
      <Spacer />
      <Card>
        <Label>Что сделать</Label>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.accent, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <Body style={{ flex: 1 }}>{s}</Body>
          </View>
        ))}
      </Card>
      <Spacer />
      <Card tint={c.bgAlt}>
        <Label>Переменные окружения</Label>
        <Text style={{ fontFamily: 'Menlo', fontSize: 13, color: c.text, lineHeight: 20 }}>
          EXPO_PUBLIC_SUPABASE_URL=…{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=…
        </Text>
        <Body muted style={{ marginTop: 10, fontSize: 13 }}>
          Для сборки в EAS добавьте их также в переменные окружения проекта на expo.dev. Подробности — в README.md.
        </Body>
      </Card>
    </Screen>
  );
}
