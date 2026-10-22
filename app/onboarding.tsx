import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { ProfileForm } from '../src/components/ProfileForm';
import { Body, Button, Card, ErrorNote, Input, Label, Screen, Segmented, Spacer, Title } from '../src/components/ui';
import { humanError } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useSpace } from '../src/providers/SpaceProvider';
import { fonts, useTheme } from '../src/theme';

export default function Onboarding() {
  const { c } = useTheme();
  const { profile, signOut } = useAuth();
  const { space, createSpace, joinSpace } = useSpace();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const needProfile = !profile?.display_name;

  // Если пространство уже есть (например, вернулись на экран) и мы не показываем код — идём дальше
  useEffect(() => {
    if (!needProfile && space && !created && !busy) router.replace('/(tabs)/watch');
  }, [needProfile, space, created, busy]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const invite = await createSpace(name.trim() || `${profile?.display_name ?? 'Мы'} и компания`);
      setCreated(invite);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    setBusy(true);
    setError(null);
    try {
      await joinSpace(code.trim());
      router.replace('/(tabs)/watch');
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (needProfile) {
    return (
      <Screen>
        <Text style={{ color: c.accent, fontWeight: '700', marginBottom: 6 }}>Шаг 1 из 2</Text>
        <Title>Знакомимся</Title>
        <Body muted style={{ marginTop: 6, marginBottom: 20 }}>
          Так вас увидят партнёр и семья: в лайках, вишлистах и копилке.
        </Body>
        <ProfileForm submitTitle="Дальше" />
        <Spacer />
        <Button title="Выйти" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ color: c.accent, fontWeight: '700', marginBottom: 6 }}>Шаг 2 из 2</Text>
      <Title>Ваше пространство</Title>
      <Body muted style={{ marginTop: 6, marginBottom: 20 }}>
        Всё, что вы добавляете, живёт в общем пространстве. Создайте его и пригласите партнёра — или присоединитесь по коду.
      </Body>

      {created && space ? (
        <Card>
          <Label>Код приглашения</Label>
          <Text style={{ fontFamily: fonts.display, fontSize: 44, letterSpacing: 8, color: c.accent, fontWeight: '700', textAlign: 'center', marginVertical: 12 }}>
            {created}
          </Text>
          <Body muted style={{ textAlign: 'center' }}>
            Партнёр устанавливает «Вдвоём», входит по почте и вводит этот код. Его всегда можно найти в настройках.
          </Body>
          <Spacer />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Копировать"
              variant="secondary"
              icon="copy-outline"
              style={{ flex: 1 }}
              onPress={() => Clipboard.setStringAsync(created)}
            />
            <Button
              title="Отправить"
              icon="share-outline"
              style={{ flex: 1 }}
              onPress={() => Share.share({ message: `Присоединяйся ко мне во «Вдвоём»! Код пространства: ${created}` })}
            />
          </View>
          <Spacer h={10} />
          <Button title="Начать" icon="arrow-forward" onPress={() => router.replace('/(tabs)/watch')} />
        </Card>
      ) : (
        <>
          <Segmented
            options={[
              { value: 'create', label: 'Создать' },
              { value: 'join', label: 'У меня есть код' },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError(null);
            }}
          />
          <Spacer />
          {mode === 'create' ? (
            <>
              <Input label="Название" value={name} onChangeText={setName} placeholder="Например, «Аня и Миша» или «Семья Ивановых»" maxLength={60} />
              <ErrorNote text={error} />
              <Button title="Создать пространство" onPress={onCreate} loading={busy} icon="sparkles-outline" />
            </>
          ) : (
            <>
              <Input
                label="Код приглашения"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontFamily: fonts.display }}
              />
              <ErrorNote text={error} />
              <Button title="Присоединиться" onPress={onJoin} loading={busy} disabled={code.length !== 6} icon="people-outline" />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
