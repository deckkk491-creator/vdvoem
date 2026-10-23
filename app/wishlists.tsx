import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, itemMenu, openLink } from '../src/components/ItemCard';
import { Avatar, useNameOf } from '../src/components/people';
import { Body, Button, Card, ChipGroup, EmptyState, ErrorNote, Fab, Input, Label, Loading, Row, Sheet } from '../src/components/ui';
import { hostOf, normalizeUrl, parseAmount, rub } from '../src/lib/format';
import { humanError, supabase } from '../src/lib/supabase';
import type { WishClaim, WishItem } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../src/providers/SpaceProvider';
import { sectionStyle, useTheme } from '../src/theme';

const OCCASIONS = ['ДР', 'Новый год', '14 февраля', '8 марта', '23 февраля', 'Годовщина', 'Просто так'] as const;

export default function Wishlists() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'wishlist');
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { space, members, people } = useSpace();
  const nameOf = useNameOf();
  const [owner, setOwner] = useState<string | null>(userId);
  const [items, setItems] = useState<WishItem[]>([]);
  const [claims, setClaims] = useState<WishClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishItem | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!space) return;
    const [w, cl] = await Promise.all([
      supabase.from('wishlist_items').select('*').eq('space_id', space.id).order('created_at', { ascending: false }),
      // RLS не вернёт «я подарю» по вашим собственным желаниям — сюрприз сохраняется
      supabase.from('wishlist_claims').select('*').eq('space_id', space.id),
    ]);
    if (w.error || cl.error) setError(humanError(w.error ?? cl.error));
    else setError(null);
    setItems(((w.data ?? []) as WishItem[]).map((x) => ({ ...x, price: x.price === null ? null : Number(x.price) })));
    setClaims((cl.data ?? []) as WishClaim[]);
    setLoading(false);
  }, [space]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['wishlist_items', 'wishlist_claims'], load);

  const isMine = owner === userId;
  const list = useMemo(() => items.filter((i) => i.owner_id === owner), [items, owner]);
  const claimOf = useCallback((id: string) => claims.find((x) => x.item_id === id), [claims]);

  async function toggleClaim(item: WishItem) {
    if (!userId || !space) return;
    const cl = claimOf(item.id);
    if (cl && cl.claimed_by !== userId) {
      Alert.alert('Уже занято', `Этот подарок уже выбрал(а) ${nameOf(cl.claimed_by)}.`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const res = cl
      ? await supabase.from('wishlist_claims').delete().eq('item_id', item.id)
      : await supabase.from('wishlist_claims').insert({ item_id: item.id, space_id: space.id, claimed_by: userId });
    if (res.error) Alert.alert('Ошибка', humanError(res.error));
    load();
  }

  async function removeItem(item: WishItem) {
    const { error: e } = await supabase.from('wishlist_items').delete().eq('id', item.id);
    if (e) Alert.alert('Ошибка', humanError(e));
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
          {members.map((m) => {
            const active = owner === m.user_id;
            const count = items.filter((i) => i.owner_id === m.user_id).length;
            return (
              <Pressable
                key={m.user_id}
                onPress={() => setOwner(m.user_id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  paddingLeft: 8,
                  paddingRight: 14,
                  borderRadius: 999,
                  backgroundColor: active ? st.bg : c.card,
                  borderWidth: 1.5,
                  borderColor: active ? st.fg : c.border,
                }}
              >
                <Avatar profile={people[m.user_id]} size={28} />
                <Text style={{ fontWeight: '700', color: active ? st.fg : c.text }}>
                  {m.user_id === userId ? 'Мой' : people[m.user_id]?.display_name || 'Участник'}
                </Text>
                <Text style={{ color: c.textFaint, fontSize: 12 }}>{count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isMine ? (
          <Card tint={c.bgAlt} style={{ marginBottom: 14, borderColor: 'transparent' }}>
            <Row gap={10}>
              <Text style={{ fontSize: 22 }}>🤫</Text>
              <Body muted style={{ flex: 1, fontSize: 13 }}>
                Это твой вишлист. Ты не увидишь, кто что собирается подарить, — пусть будет сюрприз.
              </Body>
            </Row>
          </Card>
        ) : (
          <Card tint={st.bg} style={{ marginBottom: 14, borderColor: 'transparent' }}>
            <Row gap={10}>
              <Text style={{ fontSize: 22 }}>🎁</Text>
              <Body style={{ flex: 1, fontSize: 13, color: c.text }}>
                Нажми «Я подарю», чтобы забронировать подарок. {nameOf(owner)} этого не увидит, а остальные — да.
              </Body>
            </Row>
          </Card>
        )}

        <ErrorNote text={error} />
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          isMine ? (
            <EmptyState
              emoji="🎁"
              title="Твой вишлист пуст"
              text="Добавь то, что хочется получить, — близким будет проще выбрать подарок."
              action="Добавить желание"
              onAction={() => setEditing('new')}
              color={st.fg}
            />
          ) : (
            <EmptyState emoji="🫙" title="Здесь пока пусто" text={`${nameOf(owner)} пока ничего не добавил(а) в вишлист. Можно намекнуть 😉`} />
          )
        ) : (
          list.map((item) => {
            const cl = isMine ? undefined : claimOf(item.id);
            const mineClaim = cl?.claimed_by === userId;
            return (
              <Card
                key={item.id}
                style={{ marginBottom: 12, opacity: cl && !mineClaim ? 0.6 : 1 }}
                onPress={isMine ? () => setEditing(item) : undefined}
                onLongPress={isMine ? () => itemMenu(item.title, () => setEditing(item), () => removeItem(item)) : undefined}
              >
                <Row style={{ alignItems: 'flex-start' }} gap={12}>
                  <View style={{ flex: 1 }}>
                    {item.occasion ? (
                      <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 6 }}>
                        <Badge label={item.occasion} color={st.fg} bg={st.bg} />
                      </Row>
                    ) : null}
                    <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, lineHeight: 23 }}>{item.title}</Text>
                    {item.price !== null ? <Text style={{ color: c.textMuted, marginTop: 2, fontWeight: '600' }}>{rub(item.price)}</Text> : null}
                    {item.note ? <Body muted style={{ fontSize: 14, marginTop: 4 }}>{item.note}</Body> : null}
                    {item.url ? (
                      <Pressable
                        onPress={() => openLink(item.url)}
                        hitSlop={10}
                        accessibilityRole="link"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
                      >
                        <Ionicons name="link-outline" size={15} color={st.fg} />
                        <Text style={{ color: st.fg, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                          {hostOf(item.url) || 'Ссылка'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Row>
                {!isMine ? (
                  <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
                    {cl ? (
                      <Row gap={6}>
                        <Avatar profile={people[cl.claimed_by]} size={20} />
                        <Text style={{ color: c.textMuted, fontSize: 13 }}>
                          {mineClaim ? 'Это даришь ты' : `Дарит ${nameOf(cl.claimed_by)}`}
                        </Text>
                      </Row>
                    ) : (
                      <View />
                    )}
                    {!cl || mineClaim ? (
                      <Button
                        title={mineClaim ? 'Отменить' : 'Я подарю'}
                        small
                        variant={mineClaim ? 'secondary' : 'primary'}
                        icon={mineClaim ? 'close' : 'gift-outline'}
                        color={st.fg}
                        onPress={() => toggleClaim(item)}
                      />
                    ) : null}
                  </Row>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
      {isMine && list.length > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} overTabBar={false} /> : null}
      <WishSheet
        item={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

function WishSheet({ item, visible, onClose, onSaved }: { item: WishItem | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'wishlist');
  const { userId } = useAuth();
  const { space } = useSpace();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [occasion, setOccasion] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setUrl(item?.url ?? '');
    setPrice(item?.price != null ? String(item.price) : '');
    setOccasion(item?.occasion ?? null);
    setNote(item?.note ?? '');
    setError(null);
  }, [visible, item]);

  async function save() {
    if (!space || !userId) return;
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    const p = price.trim() ? parseAmount(price) : null;
    if (price.trim() && (p === null || p < 0)) return setError('Цена должна быть числом');
    setBusy(true);
    const data = { title: title.trim(), url: link, price: p, occasion, note: note.trim() };
    const res = item
      ? await supabase.from('wishlist_items').update(data).eq('id', item.id)
      : await supabase.from('wishlist_items').insert({ ...data, space_id: space.id, owner_id: userId });
    setBusy(false);
    if (res.error) return setError(humanError(res.error));
    onSaved();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? 'Желание' : 'Новое желание'}
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Input label="Что хочется" value={title} onChangeText={setTitle} placeholder="Плёночный фотоаппарат" maxLength={200} />
      <Input label="Ссылка (необязательно)" value={url} onChangeText={setUrl} placeholder="Ozon, WB, сайт магазина…" autoCapitalize="none" keyboardType="url" />
      <Input label="Примерная цена, ₽" value={price} onChangeText={setPrice} placeholder="5 000" keyboardType="decimal-pad" />
      <Label>Повод</Label>
      <ChipGroup options={OCCASIONS} value={(occasion as (typeof OCCASIONS)[number]) ?? null} onChange={(v) => setOccasion(occasion === v ? null : v)} color={st.fg} />
      <Input label="Детали" value={note} onChangeText={setNote} placeholder="Размер, цвет, модель" multiline maxLength={1000} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
