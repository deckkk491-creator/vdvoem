import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, ItemCard, itemMenu } from '../../src/components/ItemCard';
import { SectionHeader, SortToggle } from '../../src/components/SectionHeader';
import { AttachmentEditor, AttachmentStrip, useAttachmentsFor } from '../../src/components/Attachments';
import { DateField } from '../../src/components/DateField';
import { Button, Chip, ChipGroup, EmptyState, ErrorNote, Fab, Input, Label, Loading, Row, Screen, Sheet } from '../../src/components/ui';
import { useLinkAutofill } from '../../src/hooks/useLinkAutofill';
import { useItems, useSorted, type SortMode } from '../../src/hooks/useItems';
import { commitAttachments, emptyDraft, type AttachmentDraft } from '../../src/lib/files';
import { formatDate, normalizeUrl, relativeDays, parseDate } from '../../src/lib/format';
import { openMapSearch } from '../../src/lib/maps';
import { humanError } from '../../src/lib/supabase';
import type { Attachment, ItemWithLikes } from '../../src/lib/types';
import { useAuth } from '../../src/providers/AuthProvider';
import { useSpace } from '../../src/providers/SpaceProvider';
import { CATEGORY_EMOJI, WEEKEND_CATEGORIES, type WeekendCategory } from '../../src/lib/categories';
import { radius, sectionStyle, useTheme } from '../../src/theme';

export default function WeekendScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'weekend');
  const { space } = useSpace();
  const { userId } = useAuth();
  const { items, loading, error, retry, add, update, remove, toggleLike, toggleDislike } = useItems('weekend');
  const [sort, setSort] = useState<SortMode>('likes');
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemWithLikes | 'new' | null>(null);

  const sorted = useSorted(items, sort);
  const { byParent } = useAttachmentsFor(items.map((i) => i.id));
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
        <ErrorNote text={error} onRetry={retry} />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🌿"
            title="Планов пока нет"
            text="Сохраняй сюда спектакли, выставки, рестораны и прогулки — а потом выбирайте вместе по лайкам."
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
              onDislike={() => toggleDislike(item)}
              onPress={() => setEditing(item)}
              extra={<AttachmentStrip attachments={byParent[item.id]} size={64} />}
              onLongPress={() => itemMenu(item.title, () => setEditing(item), () => remove(item.id).catch((e) => Alert.alert('Ошибка', humanError(e))))}
              badge={
                <>
                  {item.category ? (
                    <Badge label={`${CATEGORY_EMOJI[item.category as WeekendCategory] ?? '✨'} ${item.category}`} color={st.fg} bg={st.bg} />
                  ) : null}
                  {item.event_date ? (
                    <Badge
                      label={`📅 ${formatDate(item.event_date)}${item.end_date && item.end_date !== item.event_date ? ` — ${formatDate(item.end_date)}` : ''}`}
                      color={c.textMuted}
                      bg={c.bgAlt}
                    />
                  ) : null}
                  {item.done ? <Badge label="✓ Сходили" color={c.sage} bg={c.sageSoft} /> : null}
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
        existing={editing && editing !== 'new' ? byParent[editing.id] ?? [] : []}
        onClose={() => setEditing(null)}
        onSave={async (d, draft) => {
          const id = editing && editing !== 'new' ? (await update(editing.id, d), editing.id) : await add(d);
          const problem = space && userId ? await commitAttachments(space.id, userId, 'item', id, draft) : null;
          setEditing(null);
          if (problem) Alert.alert('Сохранили, но…', problem);
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
  end_date: string | null;
  url: string | null;
  image_url: string | null;
  note: string;
  done: boolean;
};

function WeekendSheet({
  item,
  visible,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  item: ItemWithLikes | null;
  visible: boolean;
  existing: Attachment[];
  onClose: () => void;
  onSave: (d: WeekendData, draft: AttachmentDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'weekend');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WeekendCategory>('прогулка');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [multiDay, setMultiDay] = useState(false);
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ссылка на афишу/билеты → подтягиваем название, картинку и описание (только в пустые поля)
  const link = useLinkAutofill((p) => {
    if (p.title) setTitle((t) => t || p.title!.slice(0, 200));
    if (p.image) setImage((i) => i || p.image);
    if (p.description) setNote((n) => n || p.description!.slice(0, 400));
  });

  React.useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setCategory(((item?.category as WeekendCategory) ?? 'прогулка') as WeekendCategory);
    setPlace(item?.place ?? '');
    setDate(item?.event_date ?? null);
    setEndDate(item?.end_date ?? null);
    setMultiDay(!!item?.end_date && item.end_date !== item.event_date);
    setUrl(item?.url ?? '');
    setImage(item?.image_url ?? null);
    setNote(item?.note ?? '');
    setDone(item?.done ?? false);
    setDraft(emptyDraft(existing));
    setError(null);
    link.reset(item?.url ?? null);
    // existing намеренно не в зависимостях: черновик вложений не сбрасываем, пока форма открыта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item]);

  async function save() {
    const normalized = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !normalized) return setError('Ссылка выглядит неправильно');
    const end = multiDay && date ? endDate : null;
    if (end && date && end < date) return setError('Дата окончания раньше даты начала');
    setBusy(true);
    try {
      await onSave(
        { title: title.trim(), category, place: place.trim() || null, event_date: date, end_date: end, url: normalized, image_url: image, note: note.trim(), done },
        draft,
      );
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
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim() || link.fetching} color={st.fg} />}
    >
      <Label>Ссылка (афиша, билеты, место)</Label>
      <Row style={{ marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Input
            value={url}
            onChangeText={setUrl}
            onBlur={() => url.trim() && link.autofill(url)}
            onSubmitEditing={() => url.trim() && link.autofill(url)}
            placeholder="https://…"
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
        <View style={{ marginBottom: 12 }}>
          <Image source={{ uri: image }} style={{ width: '100%', height: 160, borderRadius: radius.md, backgroundColor: c.bgAlt }} contentFit="cover" />
          <Pressable
            onPress={() => setImage(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Убрать картинку"
            style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}
      <Input label="Что делаем" value={title} onChangeText={setTitle} placeholder="Спектакль «Мастер и Маргарита»" maxLength={200} />
      <Label>Категория</Label>
      <ChipGroup
        options={WEEKEND_CATEGORIES}
        labels={Object.fromEntries(WEEKEND_CATEGORIES.map((k) => [k, `${CATEGORY_EMOJI[k]} ${k}`])) as Record<WeekendCategory, string>}
        value={category}
        onChange={setCategory}
        color={st.fg}
      />
      <Input label="Место" value={place} onChangeText={setPlace} placeholder="Театр, адрес или парк" maxLength={200} />
      <DateField label="Дата (необязательно)" value={date} onChange={setDate} optional />
      {date ? (
        <View style={{ marginTop: -4, marginBottom: 12 }}>
          <Chip label={multiDay ? '✓ Несколько дней' : 'Несколько дней (поездка)'} active={multiDay} onPress={() => setMultiDay(!multiDay)} color={st.fg} small />
        </View>
      ) : null}
      {date && multiDay ? <DateField label="До какого числа" value={endDate} onChange={setEndDate} optional /> : null}
      <Input label="Заметка" value={note} onChangeText={setNote} multiline placeholder="Детали, цена, с кем пойти" maxLength={2000} />
      <AttachmentEditor draft={draft} onChange={setDraft} color={st.fg} label="Билеты, брони, фото" />
      {item ? <Chip label={done ? '✓ Сходили' : 'Отметить: сходили'} active={done} onPress={() => setDone(!done)} color={c.sage} /> : null}
      <View style={{ height: 12 }} />
      <ErrorNote text={error} />
      {onDelete ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => setError(humanError(e)))} /> : null}
      <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 12, textAlign: 'center' }}>
        Совет: на сайте афиши нажми «Поделиться» → «Копировать ссылку», а здесь — «Вставить».
      </Text>
    </Sheet>
  );
}
