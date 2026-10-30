import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachmentEditor, AttachmentStrip, useAttachmentsFor } from '../src/components/Attachments';
import { Badge, itemMenu, openLink } from '../src/components/ItemCard';
import { Avatar, useNameOf } from '../src/components/people';
import { Body, Button, Card, ChipGroup, EmptyState, ErrorNote, Fab, Input, Label, Loading, pageStyle, Row, Sheet } from '../src/components/ui';
import { useLinkAutofill } from '../src/hooks/useLinkAutofill';
import { commitAttachments, deleteWithFiles, emptyDraft, loadAttachments, useSignedUrls, type AttachmentDraft } from '../src/lib/files';
import { hostOf, normalizeUrl, parseAmount, rub } from '../src/lib/format';
import { humanError, supabase } from '../src/lib/supabase';
import type { WishClaim, WishItem } from '../src/lib/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../src/providers/SpaceProvider';
import { radius, sectionStyle, useTheme } from '../src/theme';
import { AppBackground } from '../src/components/AppBackground';

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

  const req = useRef(0);
  const load = useCallback(async () => {
    if (!space) return;
    const id = ++req.current;
    const [w, cl] = await Promise.all([
      supabase.from('wishlist_items').select('*').eq('space_id', space.id).order('created_at', { ascending: false }),
      // RLS не вернёт «я подарю» по вашим собственным желаниям — сюрприз сохраняется
      supabase.from('wishlist_claims').select('*').eq('space_id', space.id),
    ]);
    if (id !== req.current) return;
    if (w.error || cl.error) {
      setError(humanError(w.error ?? cl.error));
      setLoading(false);
      return;
    }
    setError(null);
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

  // Свои фото желаний: первое — обложка карточки, остальные лентой
  const { byParent, reload: reloadPhotos } = useAttachmentsFor(useMemo(() => list.map((i) => i.id), [list]));
  const coverPaths = useMemo(() => list.map((i) => byParent[i.id]?.find((a) => a.kind === 'photo')?.storage_path ?? null), [list, byParent]);
  const coverUrls = useSignedUrls(coverPaths);

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
    try {
      await deleteWithFiles(item.id, () => supabase.from('wishlist_items').delete().eq('id', item.id));
    } catch (e) {
      Alert.alert('Ошибка', humanError(e));
    }
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <ScrollView contentContainerStyle={pageStyle(insets, insets.bottom + 120)}>
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
                  {(() => {
                    const photos = byParent[item.id]?.filter((a) => a.kind === 'photo') ?? [];
                    const cover = photos[0]?.storage_path ? coverUrls[photos[0].storage_path] : null;
                    const uri = cover ?? item.image_url;
                    return uri ? (
                      <Image
                        source={cover ? { uri, cacheKey: photos[0].storage_path! } : { uri }}
                        style={{ width: 88, height: 88, borderRadius: radius.sm, backgroundColor: c.bgAlt }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ width: 88, height: 88, borderRadius: radius.sm, backgroundColor: st.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 34 }}>🎁</Text>
                      </View>
                    );
                  })()}
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
                {(byParent[item.id]?.filter((a) => a.kind === 'photo').length ?? 0) > 1 ? (
                  <AttachmentStrip attachments={byParent[item.id]} size={64} />
                ) : null}
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
          reloadPhotos();
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
  const [image, setImage] = useState<string | null>(null);
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ссылка на товар → название, картинка и цена подтягиваются сами (только в пустые поля)
  const link = useLinkAutofill((p) => {
    if (p.title) setTitle((t) => t || p.title!.slice(0, 200));
    if (p.image) setImage((i) => i || p.image);
    if (p.price) setPrice((x) => x || String(p.price));
    if (p.description) setNote((n) => n || p.description!.slice(0, 1000));
  });

  useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setUrl(item?.url ?? '');
    setPrice(item?.price != null ? String(item.price) : '');
    setOccasion(item?.occasion ?? null);
    setNote(item?.note ?? '');
    setImage(item?.image_url ?? null);
    setDraft(emptyDraft());
    setError(null);
    link.reset(item?.url ?? null);
    if (item) {
      loadAttachments([item.id])
        .then((list) => setDraft((d) => ({ ...d, existing: list })))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item]);

  async function save() {
    if (!space || !userId) return;
    const normalized = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !normalized) return setError('Ссылка выглядит неправильно');
    const p = price.trim() ? parseAmount(price) : null;
    if (price.trim() && (p === null || p < 0)) return setError('Цена должна быть числом');
    setBusy(true);
    const data = { title: title.trim(), url: normalized, price: p, occasion, note: note.trim(), image_url: image };
    const res = item
      ? await supabase.from('wishlist_items').update(data).eq('id', item.id).select('id').single()
      : await supabase.from('wishlist_items').insert({ ...data, space_id: space.id, owner_id: userId }).select('id').single();
    if (res.error) {
      setBusy(false);
      return setError(humanError(res.error));
    }
    const id = (res.data as { id: string }).id;
    const problem = await commitAttachments(space.id, userId, 'wish', id, draft);
    setBusy(false);
    if (problem) Alert.alert('Фото', problem);
    onSaved();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? 'Желание' : 'Новое желание'}
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim() || link.fetching} color={st.fg} />}
    >
      <Label>Ссылка на товар (необязательно)</Label>
      <Row style={{ marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Input
            value={url}
            onChangeText={setUrl}
            onBlur={() => url.trim() && link.autofill(url)}
            onSubmitEditing={() => url.trim() && link.autofill(url)}
            placeholder="Ozon, WB, сайт магазина…"
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
        <Button
          title="Вставить"
          small
          variant="secondary"
          icon="clipboard-outline"
          onPress={async () => {
            const v = await link.paste();
            if (v) setUrl(v);
          }}
        />
      </Row>
      <View style={{ minHeight: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {link.fetching ? (
          <>
            <ActivityIndicator size="small" color={st.fg} />
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Читаем страницу… до 20 секунд</Text>
          </>
        ) : link.hint ? (
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{link.hint}</Text>
        ) : null}
      </View>
      {image ? (
        <View style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
          <Image source={{ uri: image }} style={{ width: 120, height: 120, borderRadius: radius.md, backgroundColor: c.bgAlt }} contentFit="cover" />
          <Pressable
            onPress={() => setImage(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Убрать картинку"
            style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      ) : null}
      <AttachmentEditor draft={draft} onChange={setDraft} color={st.fg} label="Фото" allowFiles={false} allowLinks={false} />
      <Input label="Что хочется" value={title} onChangeText={setTitle} placeholder="Плёночный фотоаппарат" maxLength={200} />
      <Input label="Примерная цена, ₽" value={price} onChangeText={setPrice} placeholder="5 000" keyboardType="decimal-pad" />
      <Label>Повод</Label>
      <ChipGroup options={OCCASIONS} value={(occasion as (typeof OCCASIONS)[number]) ?? null} onChange={(v) => setOccasion(occasion === v ? null : v)} color={st.fg} />
      <Input label="Детали" value={note} onChangeText={setNote} placeholder="Размер, цвет, модель" multiline maxLength={1000} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
