import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Badge, ItemCard, itemMenu } from '../../src/components/ItemCard';
import { SectionHeader, SortToggle } from '../../src/components/SectionHeader';
import { Button, Chip, ChipGroup, EmptyState, ErrorNote, Fab, Input, Label, Loading, Screen, Sheet } from '../../src/components/ui';
import { useItems, useSorted, type SortMode } from '../../src/hooks/useItems';
import { formatDate, isoToRu, normalizeDateInput, normalizeUrl, relativeDays, parseDate } from '../../src/lib/format';
import { openMapSearch } from '../../src/lib/maps';
import { humanError } from '../../src/lib/supabase';
import type { ItemWithLikes } from '../../src/lib/types';
import { useSpace } from '../../src/providers/SpaceProvider';
import { CATEGORY_EMOJI, WEEKEND_CATEGORIES, type WeekendCategory } from '../../src/lib/categories';
import { sectionStyle, useTheme } from '../../src/theme';

export default function WeekendScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'weekend');
  const { space } = useSpace();
  const { items, loading, error, add, update, remove, toggleLike } = useItems('weekend');
  const [sort, setSort] = useState<SortMode>('likes');
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemWithLikes | 'new' | null>(null);

  const sorted = useSorted(items, sort);
  const visible = useMemo(() => (cat ? sorted.filter((i) => i.category === cat) : sorted), [sorted, cat]);
  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return items
      .filter((i) => i.event_date && parseDate(i.event_date) >= today && !i.done)
      .sort((a, b) => a.event_date!.localeCompare(b.event_date!))[0];
  }, [items]);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader
          title="На выходные"
          subtitle="Идеи, куда сходить вместе"
          emoji={st.emoji}
          color={st.fg}
          right={items.length > 1 ? <SortToggle value={sort} onChange={setSort} /> : null}
        />
        {upcoming ? (
          <View style={{ backgroundColor: st.bg, borderRadius: 18, padding: 14, marginBottom: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 30 }}>{CATEGORY_EMOJI[(upcoming.category as WeekendCategory) ?? 'другое'] ?? '✨'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: st.fg, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Ближайшее · {relativeDays(parseDate(upcoming.event_date!))}
              </Text>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                {upcoming.title}
              </Text>
            </View>
          </View>
        ) : null}
        {items.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            <Chip label="Все" active={!cat} onPress={() => setCat(null)} color={st.fg} />
            {WEEKEND_CATEGORIES.filter((k) => items.some((i) => i.category === k)).map((k) => (
              <Chip key={k} label={`${CATEGORY_EMOJI[k]} ${k}`} active={cat === k} onPress={() => setCat(cat === k ? null : k)} color={st.fg} />
            ))}
          </ScrollView>
        ) : null}
        <ErrorNote text={error} />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🌿"
            title="Планов пока нет"
            text="Сохраняйте сюда спектакли, выставки, рестораны и прогулки — потом выберете вместе по лайкам."
            action="Добавить идею"
            onAction={() => setEditing('new')}
            color={st.fg}
          />
        ) : (
          visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              accent={st.fg}
              onLike={() => toggleLike(item)}
              onPress={() => setEditing(item)}
              onLongPress={() => itemMenu(item.title, () => setEditing(item), () => remove(item.id).catch((e) => Alert.alert('Ошибка', humanError(e))))}
              badge={
                <>
                  {item.category ? (
                    <Badge label={`${CATEGORY_EMOJI[item.category as WeekendCategory] ?? '✨'} ${item.category}`} color={st.fg} bg={st.bg} />
                  ) : null}
                  {item.event_date ? <Badge label={`📅 ${formatDate(item.event_date)}`} color={c.textMuted} bg={c.bgAlt} /> : null}
                  {item.done ? <Badge label="✓ были" color={c.sage} bg={c.sageSoft} /> : null}
                </>
              }
              meta={
                item.place ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="location-outline" size={14} color={c.textMuted} />
                    <Text
                      style={{ fontSize: 14, color: c.textMuted, textDecorationLine: 'underline' }}
                      onPress={() => openMapSearch(`${item.place} ${space?.city ?? ''}`)}
                      numberOfLines={1}
                    >
                      {item.place}
                    </Text>
                  </View>
                ) : null
              }
            />
          ))
        )}
      </Screen>
      {items.length > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} /> : null}
      <WeekendSheet
        item={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSave={async (d) => {
          if (editing && editing !== 'new') await update(editing.id, d);
          else await add(d);
          setEditing(null);
        }}
        onDelete={editing && editing !== 'new' ? async () => { await remove(editing.id); setEditing(null); } : undefined}
      />
    </View>
  );
}

type WeekendData = {
  title: string;
  category: string;
  place: string | null;
  event_date: string | null;
  url: string | null;
  note: string;
  done: boolean;
};

function WeekendSheet({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
}: {
  item: ItemWithLikes | null;
  visible: boolean;
  onClose: () => void;
  onSave: (d: WeekendData) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'weekend');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WeekendCategory>('прогулка');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setCategory(((item?.category as WeekendCategory) ?? 'прогулка') as WeekendCategory);
    setPlace(item?.place ?? '');
    setDate(isoToRu(item?.event_date));
    setUrl(item?.url ?? '');
    setNote(item?.note ?? '');
    setDone(item?.done ?? false);
    setError(null);
  }, [visible, item]);

  async function save() {
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    const d = date.trim() ? normalizeDateInput(date) : null;
    if (date.trim() && !d) return setError('Дата в формате ДД.ММ.ГГГГ');
    setBusy(true);
    try {
      await onSave({ title: title.trim(), category, place: place.trim() || null, event_date: d, url: link, note: note.trim(), done });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? 'Идея' : 'Новая идея'}
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Input label="Что" value={title} onChangeText={setTitle} placeholder="Спектакль «Мастер и Маргарита»" maxLength={200} />
      <Label>Категория</Label>
      <ChipGroup
        options={WEEKEND_CATEGORIES}
        labels={Object.fromEntries(WEEKEND_CATEGORIES.map((k) => [k, `${CATEGORY_EMOJI[k]} ${k}`])) as Record<WeekendCategory, string>}
        value={category}
        onChange={setCategory}
        color={st.fg}
      />
      <Input label="Место" value={place} onChangeText={setPlace} placeholder="Театр, адрес или парк" maxLength={200} />
      <Input label="Дата" value={date} onChangeText={setDate} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} />
      <Input label="Ссылка" value={url} onChangeText={setUrl} placeholder="Билеты, афиша…" autoCapitalize="none" keyboardType="url" />
      <Input label="Заметка" value={note} onChangeText={setNote} multiline placeholder="Детали, цена, с кем пойти" maxLength={2000} />
      {item ? (
        <Chip label={done ? '✓ Уже сходили' : 'Отметить: сходили'} active={done} onPress={() => setDone(!done)} color={c.sage} />
      ) : null}
      <View style={{ height: 12 }} />
      <ErrorNote text={error} />
      {onDelete ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => setError(humanError(e)))} /> : null}
    </Sheet>
  );
}
