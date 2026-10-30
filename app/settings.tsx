import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileForm } from '../src/components/ProfileForm';
import { ThemePicker } from '../src/components/ThemePicker';
import { Body, Button, Card, ErrorNote, Input, Label, pageStyle, Row, Sheet } from '../src/components/ui';
import { PRIVACY_URL } from '../src/lib/env';
import { humanError, supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useSpace } from '../src/providers/SpaceProvider';
import { fonts, useTheme } from '../src/theme';

export default function Settings() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { email, signOut, userId } = useAuth();
  const { space, spaces, members, people, selectSpace, updateSpace, leaveSpace, createSpace, joinSpace, kickMember, rotateInviteCode } = useSpace();
  const myRole = members.find((m) => m.user_id === userId)?.role;
  const canManage = myRole === 'owner' || (!!members.length && !members.some((m) => m.role === 'owner'));
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
            // если пространств не осталось, Gate сам откроет онбординг; иначе остаёмся здесь с другим пространством
            await leaveSpace();
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
        // Учётную запись не удалили — данные не трогаем, чтобы не остаться «наполовину удалённым»
        Alert.alert('Не получилось удалить аккаунт', 'Сервер сейчас недоступен. Проверь интернет и попробуй позже — или напиши нам на deckkk491@gmail.com.');
        return;
      }
      Alert.alert('Аккаунт удалён', 'Спасибо, что были с нами 🤍');
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
      'Безвозвратно удалятся твой профиль, сообщения, лайки, вишлист и учётная запись. Общие записи (фильмы, рецепты, события, копилки) останутся у партнёра — без твоего имени. Отменить это нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить навсегда', style: 'destructive', onPress: deleteAccount },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={pageStyle(insets, insets.bottom + 40)} keyboardShouldPersistTaps="handled">
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
              onPress={() => Share.share({ message: `Присоединяйся ко мне в «Вместе»! Код пространства: ${space.invite_code}` })}
            />
          </Row>
          {canManage ? (
            <Button
              title="Сменить код"
              small
              variant="ghost"
              icon="refresh"
              style={{ alignSelf: 'center', marginTop: 6 }}
              onPress={() =>
                Alert.alert('Сменить код приглашения?', 'Старый код перестанет работать. Те, кто уже в пространстве, останутся.', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Сменить', onPress: () => rotateInviteCode().catch((e) => Alert.alert('Не получилось', humanError(e))) },
                ])
              }
            />
          ) : null}
        </Card>
      ) : null}

      {space && members.length > 1 ? (
        <>
          <Label>Участники</Label>
          <Card style={{ marginBottom: 16 }}>
            {members.map((m, i) => {
              const p = people[m.user_id];
              const me = m.user_id === userId;
              const name = (p?.display_name || 'Без имени') + (me ? ' (ты)' : '');
              return (
                <View
                  key={m.user_id}
                  style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderColor: c.border }}
                >
                  <Text style={{ fontSize: 20 }}>{p?.avatar_emoji || '🙂'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 16 }} numberOfLines={1}>{name}</Text>
                    {m.role === 'owner' ? <Text style={{ color: c.textMuted, fontSize: 13 }}>создатель</Text> : null}
                  </View>
                  {canManage && !me ? (
                    <Button
                      title="Исключить"
                      small
                      variant="ghost"
                      color={c.danger}
                      onPress={() =>
                        Alert.alert(`Исключить ${p?.display_name || 'участника'}?`, 'Он перестанет видеть пространство. Его вишлист и лайки здесь удалятся, общие записи останутся.', [
                          { text: 'Отмена', style: 'cancel' },
                          { text: 'Исключить', style: 'destructive', onPress: () => kickMember(m.user_id).catch((e) => Alert.alert('Не получилось', humanError(e))) },
                        ])
                      }
                    />
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
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

      <Label>Оформление</Label>
      <Card style={{ marginBottom: 16 }}>
        <ThemePicker />
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
          Удалит профиль, сообщения, вишлист и учётную запись. Общие записи останутся у партнёра без твоего имени.
        </Body>
      </Card>

      <Text style={{ textAlign: 'center', color: c.textFaint, fontSize: 12 }}>«Вместе» · сделано с теплом</Text>

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
        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
        placeholder="ABCD2345"
        autoCapitalize="characters"
      />
      <Button title="Присоединиться" small variant="secondary" onPress={() => run(() => joinSpace(code))} disabled={code.length < 6} loading={busy} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
