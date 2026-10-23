import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileForm } from '../src/components/ProfileForm';
import { Body, Button, Card, ErrorNote, Input, Label, Row, Sheet } from '../src/components/ui';
import { PRIVACY_URL } from '../src/lib/env';
import { humanError, supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useSpace } from '../src/providers/SpaceProvider';
import { fonts, useTheme } from '../src/theme';

export default function Settings() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { email, signOut } = useAuth();
  const { space, spaces, selectSpace, updateSpace, leaveSpace, createSpace, joinSpace } = useSpace();
  const [profileOpen, setProfileOpen] = useState(false);
  const [spaceName, setSpaceName] = useState(space?.name ?? '');
  const [spaceCity, setSpaceCity] = useState(space?.city ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSpaceName(space?.name ?? '');
    setSpaceCity(space?.city ?? '');
  }, [space?.id, space?.name, space?.city]);

  async function saveSpace() {
    setError(null);
    try {
      await updateSpace({ name: spaceName.trim() || space?.name, city: spaceCity.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(humanError(e));
    }
  }

  function confirmLeave() {
    Alert.alert('Выйти из пространства?', 'Твои лайки и вишлист в этом пространстве будут удалены. Если ты последний участник, пространство удалится целиком.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveSpace();
            router.replace('/onboarding');
          } catch (e) {
            Alert.alert('Ошибка', humanError(e));
          }
        },
      },
    ]);
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke('delete-account', { body: {} });
      if (fnErr) {
        // Если функция не задеплоена — хотя бы удаляем все данные
        const { error: rpcErr } = await supabase.rpc('delete_my_data');
        if (rpcErr) throw rpcErr;
        Alert.alert(
          'Данные удалены',
          'Все твои данные удалены. Учётную запись не получилось удалить автоматически — мы удалим её вручную. Напиши нам, если нужно быстрее.',
        );
      } else {
        Alert.alert('Аккаунт удалён', 'Спасибо, что были с нами 🤍');
      }
      await signOut();
    } catch (e) {
      Alert.alert('Не получилось', humanError(e));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Удалить аккаунт?',
      'Безвозвратно удалятся твой профиль, добавленные тобой записи, лайки, вишлист, взносы в копилку и сама учётная запись. Отменить это нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить навсегда', style: 'destructive', onPress: deleteAccount },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      {space ? (
        <Card style={{ marginBottom: 16 }}>
          <Label>Код приглашения</Label>
          <Text style={{ fontFamily: fonts.display, fontSize: 38, letterSpacing: 8, color: c.accent, fontWeight: '700', textAlign: 'center', marginVertical: 8 }}>
            {space.invite_code}
          </Text>
          <Body muted style={{ textAlign: 'center', fontSize: 13 }}>
            Пусть партнёр или родные введут этот код после входа в приложение.
          </Body>
          <Row style={{ marginTop: 14 }}>
            <Button title="Копировать" small variant="secondary" icon="copy-outline" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(space.invite_code)} />
            <Button
              title="Отправить"
              small
              icon="share-outline"
              style={{ flex: 1 }}
              onPress={() => Share.share({ message: `Присоединяйся ко мне во «Вдвоём»! Код пространства: ${space.invite_code}` })}
            />
          </Row>
        </Card>
      ) : null}

      <Label>Пространство</Label>
      <Card style={{ marginBottom: 16 }}>
        <Input label="Название" value={spaceName} onChangeText={setSpaceName} maxLength={60} />
        <Input label="Город (для идей правила 2-2-2)" value={spaceCity} onChangeText={setSpaceCity} placeholder="Москва" maxLength={60} />
        <ErrorNote text={error} />
        <Button title={saved ? 'Сохранено ✓' : 'Сохранить'} small onPress={saveSpace} style={{ alignSelf: 'flex-start' }} />
        {spaces.length > 1 ? (
          <View style={{ marginTop: 16 }}>
            <Label>Мои пространства</Label>
            {spaces.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => selectSpace(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: s.id === space?.id }}
                style={{ minHeight: 44, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ color: c.text, fontWeight: s.id === space?.id ? '700' : '400' }}>{s.name}</Text>
                {s.id === space?.id ? <Text style={{ color: c.accent }}>●</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button title="Добавить ещё пространство" small variant="ghost" icon="add" onPress={() => setAddOpen(true)} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
      </Card>

      <Label>Профиль</Label>
      <Card style={{ marginBottom: 16 }}>
        <Body muted style={{ fontSize: 14 }}>{email}</Body>
        <Row style={{ marginTop: 12 }}>
          <Button title="Изменить профиль" small variant="secondary" icon="person-outline" onPress={() => setProfileOpen(true)} />
          <Button title="Выйти из аккаунта" small variant="ghost" icon="log-out-outline" onPress={() => signOut()} />
        </Row>
      </Card>

      <Label>О приложении</Label>
      <Card style={{ marginBottom: 16 }}>
        <Button
          title="Политика конфиденциальности"
          small
          variant="ghost"
          icon="document-text-outline"
          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => Alert.alert('Не получилось открыть ссылку', PRIVACY_URL))}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>

      <Label style={{ color: c.danger }}>Осторожно</Label>
      <Card style={{ marginBottom: 16 }}>
        {space ? (
          <>
            <Button title="Выйти из пространства" small variant="ghost" color={c.danger} icon="exit-outline" onPress={confirmLeave} style={{ alignSelf: 'flex-start' }} />
            <View style={{ height: 8 }} />
          </>
        ) : null}
        <Button title="Удалить аккаунт" small variant="danger" icon="trash-outline" loading={deleting} onPress={confirmDeleteAccount} style={{ alignSelf: 'flex-start' }} />
        <Body muted style={{ fontSize: 13, marginTop: 8 }}>
          Удалит профиль, твои записи и учётную запись без возможности восстановления.
        </Body>
      </Card>

      <Text style={{ textAlign: 'center', color: c.textFaint, fontSize: 12 }}>«Вдвоём» · сделано с теплом</Text>

      <Sheet visible={profileOpen} onClose={() => setProfileOpen(false)} title="Профиль">
        <ProfileForm onDone={() => setProfileOpen(false)} />
      </Sheet>
      <AddSpaceSheet visible={addOpen} onClose={() => setAddOpen(false)} createSpace={createSpace} joinSpace={joinSpace} />
    </ScrollView>
  );
}

function AddSpaceSheet({
  visible,
  onClose,
  createSpace,
  joinSpace,
}: {
  visible: boolean;
  onClose: () => void;
  createSpace: (n: string) => Promise<string>;
  joinSpace: (c: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setName('');
      setCode('');
      onClose();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Ещё одно пространство">
      <Input label="Создать новое" value={name} onChangeText={setName} placeholder="Например, «Родители»" maxLength={60} />
      <Button title="Создать" small onPress={() => run(() => createSpace(name.trim()))} disabled={!name.trim()} loading={busy} />
      <View style={{ height: 24 }} />
      <Input
        label="Или присоединиться по коду"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="ABC234"
        autoCapitalize="characters"
      />
      <Button title="Присоединиться" small variant="secondary" onPress={() => run(() => joinSpace(code))} disabled={code.length !== 6} loading={busy} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
