import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { itemMenu } from '../../src/components/ItemCard';
import { Avatar, LikeButton } from '../../src/components/people';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Button, Card, Chip, EmptyState, ErrorNote, Input, Label, Loading, Screen, Sheet } from '../../src/components/ui';
import { useItems } from '../../src/hooks/useItems';
import { humanError } from '../../src/lib/supabase';
import type { ItemWithLikes } from '../../src/lib/types';
import { plural } from '../../src/lib/format';
import { useSpace } from '../../src/providers/SpaceProvider';
import { radius, sectionStyle, useTheme } from '../../src/theme';

const BASE_CATEGORIES = ['Продукты', 'Быт', 'Аптека', 'Другое'];
const CAT_EMOJI: Record<string, string> = { Продукты: '🥦', Быт: '🧽', Аптека: '💊', Другое: '📦' };

export default function ShoppingScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'shopping');
  const { people } = useSpace();
  const { items, loading, error, add, update, remove, toggleLike } = useItems('shopping');
  const [cat, setCat] = useState('Продукты');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [editing, setEditing] = useState<ItemWithLikes | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const categories = useMemo(() => {
    const s = new Set<string>(BASE_CATEGORIES);
    items.forEach((i) => i.category && s.add(i.category));
    extraCats.forEach((x) => s.add(x));
    return Array.from(s);
  }, [items, extraCats]);

  const groups = useMemo(() => {
    const map = new Map<string, ItemWithLikes[]>();
    for (const i of items) {
      const k = i.category || 'Другое';
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => Number(a.done) - Number(b.done) || b.created_at.localeCompare(a.created_at));
      map.set(k, list);
    }
    return categories.filter((k) => map.has(k)).map((k) => ({ cat: k, list: map.get(k)! }));
  }, [items, categories]);

  const boughtCount = items.filter((i) => i.done).length;

  async function quickAdd() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await add({ title: t, quantity: qty.trim() || null, category: cat, done: false });
      setTitle('');
      setQty('');
      inputRef.current?.focus();
    } catch (e) {
      Alert.alert('Не получилось', humanError(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleBought(i: ItemWithLikes) {
    Haptics.selectionAsync().catch(() => undefined);
    update(i.id, { done: !i.done }).catch(() => undefined);
  }

  function clearBought() {
    Alert.alert('Убрать купленное?', `${boughtCount} ${plural(boughtCount, 'позиция пропадёт', 'позиции пропадут', 'позиций пропадут')} из списка у всех.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () => items.filter((i) => i.done).forEach((i) => remove(i.id).catch(() => undefined)),
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader
          title="Покупки"
          subtitle={items.length ? `Осталось ${items.length - boughtCount} · куплено ${boughtCount}` : 'Общий список в магазин'}
          emoji={st.emoji}
          color={st.fg}
          right={boughtCount > 0 ? <Button title="Очистить" small variant="secondary" icon="checkmark-done" onPress={clearBought} /> : null}
        />

        <Card style={{ marginBottom: 18, padding: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              ref={inputRef}
              value={title}
              onChangeText={setTitle}
              placeholder="Что купить?"
              placeholderTextColor={c.textFaint}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={quickAdd}
              style={{ flex: 1, fontSize: 17, color: c.text, paddingVertical: 8, paddingHorizontal: 6 }}
              maxLength={200}
            />
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder="кол-во"
              placeholderTextColor={c.textFaint}
              style={{ width: 70, fontSize: 15, color: c.text, backgroundColor: c.bgAlt, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 8, textAlign: 'center' }}
              maxLength={40}
              onSubmitEditing={quickAdd}
            />
            <Pressable
              onPress={quickAdd}
              disabled={!title.trim() || busy}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Добавить в список"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: title.trim() ? st.fg : c.bgAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-up" size={22} color={title.trim() ? c.onAccent : c.textFaint} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }} keyboardShouldPersistTaps="handled">
            {categories.map((k) => (
              <Chip key={k} small label={`${CAT_EMOJI[k] ?? '🏷️'} ${k}`} active={cat === k} onPress={() => setCat(k)} color={st.fg} />
            ))}
            <Chip small label="+ Своя" onPress={() => setNewCatOpen(true)} />
          </ScrollView>
        </Card>

        <ErrorNote text={error} />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState emoji="🧺" title="Список пуст" text="Напиши, что купить, — партнёр сразу увидит, даже если он уже в магазине." />
        ) : (
          groups.map(({ cat: k, list }) => (
            <View key={k} style={{ marginBottom: 18 }}>
              <Label>
                {CAT_EMOJI[k] ?? '🏷️'} {k} · {list.filter((i) => !i.done).length}
              </Label>
              <Card style={{ padding: 0 }}>
                {list.map((i, idx) => (
                  <Pressable
                    key={i.id}
                    onPress={() => toggleBought(i)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: i.done }}
                    onLongPress={() =>
                      itemMenu(i.title, () => setEditing(i), () => remove(i.id).catch((e) => Alert.alert('Ошибка', humanError(e))))
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 52,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderColor: c.bgAlt,
                      backgroundColor: pressed ? c.cardPressed : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        borderWidth: 2,
                        borderColor: i.done ? c.sage : c.border,
                        backgroundColor: i.done ? c.sage : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {i.done ? <Ionicons name="checkmark" size={16} color={c.card} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          color: i.done ? c.textFaint : c.text,
                          textDecorationLine: i.done ? 'line-through' : 'none',
                          fontWeight: '500',
                        }}
                      >
                        {i.title}
                        {i.quantity ? <Text style={{ color: c.textMuted, fontWeight: '400' }}>  × {i.quantity}</Text> : null}
                      </Text>
                      {i.note ? <Text style={{ fontSize: 13, color: c.textMuted }} numberOfLines={1}>{i.note}</Text> : null}
                    </View>
                    <Avatar profile={i.created_by ? people[i.created_by] : null} size={22} />
                    {!i.done ? <LikeButton likes={i.likes} onPress={() => toggleLike(i)} /> : null}
                  </Pressable>
                ))}
              </Card>
            </View>
          ))
        )}
        {items.length > 0 ? (
          <Text style={{ textAlign: 'center', color: c.textFaint, fontSize: 12 }}>Нажми — куплено, удерживай — изменить</Text>
        ) : null}
      </Screen>

      <Sheet visible={newCatOpen} onClose={() => setNewCatOpen(false)} title="Своя категория"
        footer={
          <Button
            title="Добавить"
            color={st.fg}
            disabled={!newCat.trim()}
            onPress={() => {
              const k = newCat.trim();
              setExtraCats((x) => [...x, k]);
              setCat(k);
              setNewCat('');
              setNewCatOpen(false);
            }}
          />
        }
      >
        <Input label="Название" value={newCat} onChangeText={setNewCat} placeholder="Зоотовары, для дачи…" maxLength={40} autoFocus />
      </Sheet>

      <EditShopSheet item={editing} categories={categories} onClose={() => setEditing(null)} onSave={async (patch) => {
        if (!editing) return;
        await update(editing.id, patch);
        setEditing(null);
      }} />
    </View>
  );
}

function EditShopSheet({
  item,
  categories,
  onClose,
  onSave,
}: {
  item: ItemWithLikes | null;
  categories: string[];
  onClose: () => void;
  onSave: (p: { title: string; quantity: string | null; category: string; note: string }) => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'shopping');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('Продукты');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setQty(item.quantity ?? '');
    setCat(item.category ?? 'Другое');
    setNote(item.note);
    setError(null);
  }, [item]);

  return (
    <Sheet
      visible={!!item}
      onClose={onClose}
      title="Покупка"
      footer={
        <Button
          title="Сохранить"
          color={st.fg}
          disabled={!title.trim()}
          onPress={() => onSave({ title: title.trim(), quantity: qty.trim() || null, category: cat, note: note.trim() }).catch((e) => setError(humanError(e)))}
        />
      }
    >
      <Input label="Название" value={title} onChangeText={setTitle} maxLength={200} />
      <Input label="Количество" value={qty} onChangeText={setQty} placeholder="2 шт, 1 кг…" maxLength={40} />
      <Label>Категория</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {categories.map((k) => (
          <Chip key={k} label={`${CAT_EMOJI[k] ?? '🏷️'} ${k}`} active={cat === k} onPress={() => setCat(k)} color={st.fg} />
        ))}
      </View>
      <Input label="Заметка" value={note} onChangeText={setNote} placeholder="Марка, где купить" maxLength={2000} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
