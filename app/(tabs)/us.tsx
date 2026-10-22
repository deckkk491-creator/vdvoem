import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Avatar } from '../../src/components/people';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Body, Card, Label, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/providers/AuthProvider';
import { useSpace } from '../../src/providers/SpaceProvider';
import { sectionStyle, useTheme, type SectionKey } from '../../src/theme';

export default function UsScreen() {
  const { c } = useTheme();
  const { userId } = useAuth();
  const { space, members, people } = useSpace();
  const st = sectionStyle(c, 'rule');

  const tiles: { key: SectionKey; title: string; text: string; href: '/wishlists' | '/rule222' | '/settings' }[] = [
    { key: 'wishlist', title: 'Вишлисты', text: 'Что подарить друг другу — и тайно забронировать подарок', href: '/wishlists' },
    {
      key: 'rule',
      title: 'Правило 2-2-2',
      text: space?.rule222_enabled ? 'Свидания, новые места и страны — по расписанию' : 'Выключено · включите, чтобы не забывать о свиданиях',
      href: '/rule222',
    },
  ];

  return (
    <Screen>
      <SectionHeader title="Мы" subtitle={space?.name} emoji="💛" color={st.fg} />
      <Card style={{ marginBottom: 16 }}>
        <Label>Участники · {members.length}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 }}>
          {members.map((m) => {
            const p = people[m.user_id];
            return (
              <View key={m.user_id} style={{ alignItems: 'center', width: 72 }}>
                <Avatar profile={p} size={52} />
                <Text style={{ marginTop: 6, color: c.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                  {m.user_id === userId ? 'Вы' : p?.display_name || '…'}
                </Text>
                {p?.city ? (
                  <Text style={{ color: c.textFaint, fontSize: 11 }} numberOfLines={1}>
                    {p.city}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <View style={{ alignItems: 'center', width: 72 }}>
            <View
              style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={24} color={c.textMuted} onPress={() => router.push('/settings')} />
            </View>
            <Text style={{ marginTop: 6, color: c.textMuted, fontSize: 13 }}>Пригласить</Text>
          </View>
        </View>
      </Card>

      {tiles.map((t) => {
        const s = sectionStyle(c, t.key);
        return (
          <Card key={t.key} onPress={() => router.push(t.href)} style={{ marginBottom: 12 }}>
            <Row gap={14}>
              <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 26 }}>{s.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{t.title}</Text>
                <Body muted style={{ fontSize: 14, marginTop: 2 }}>
                  {t.text}
                </Body>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textFaint} />
            </Row>
          </Card>
        );
      })}

      <Card onPress={() => router.push('/settings')} style={{ marginBottom: 12 }} tint={c.bgAlt}>
        <Row gap={14}>
          <Ionicons name="settings-outline" size={22} color={c.textMuted} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.text }}>Профиль и пространство</Text>
          <Ionicons name="chevron-forward" size={20} color={c.textFaint} />
        </Row>
      </Card>
    </Screen>
  );
}
