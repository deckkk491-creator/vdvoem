import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Badge, ItemCard, itemMenu } from '../../src/components/ItemCard';
import { SectionHeader, SortToggle } from '../../src/components/SectionHeader';
import { Button, ChipGroup, Chip, EmptyState, ErrorNote, Fab, Input, Label, Loading, Screen, Sheet } from '../../src/components/ui';
import { useItems, useSorted, type SortMode } from '../../src/hooks/useItems';
import { normalizeUrl } from '../../src/lib/format';
import { humanError } from '../../src/lib/supabase';
import type { ItemWithLikes, MediaType, WatchStatus } from '../../src/lib/types';
import { sectionStyle, useTheme } from '../../src/theme';

const STATUS_LABEL: Record<WatchStatus, string> = { want: 'Хотим', watching: 'Смотрим', watched: 'Посмотрели' };
const STATUS_NEXT: Record<WatchStatus, WatchStatus> = { want: 'watching', watching: 'watched', watched: 'want' };
const TYPE_LABEL: Record<MediaType, string> = { movie: 'Фильм', series: 'Сериал' };

export default function WatchScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'watch');
  const { items, loading, error, add, update, remove, toggleLike } = useItems('watch');
  const [sort, setSort] = useState<SortMode>('likes');
  const [filter, setFilter] = useState<WatchStatus | 'all'>('all');
  const [editing, setEditing] = useState<ItemWithLikes | 'new' | null>(null);

  const sorted = useSorted(items, sort);
  const visible = useMemo(() => (filter === 'all' ? sorted : sorted.filter((i) => (i.status ?? 'want') === filter)), [sorted, filter]);
  const counts = useMemo(() => {
    const r: Record<string, number> = { all: items.length, want: 0, watching: 0, watched: 0 };
    for (const i of items) r[i.status ?? 'want'] += 1;
    return r;
  }, [items]);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader
          title="Смотрим вместе"
          subtitle="Фильмы и сериалы на вечер"
          emoji={st.emoji}
          color={st.fg}
          right={items.length > 1 ? <SortToggle value={sort} onChange={setSort} /> : null}
        />
        {items.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            {(['all', 'want', 'watching', 'watched'] as const).map((f) => (
              <Chip
                key={f}
                label={`${f === 'all' ? 'Все' : STATUS_LABEL[f]} · ${counts[f]}`}
                active={filter === f}
                onPress={() => setFilter(f)}
                color={st.fg}
              />
            ))}
          </ScrollView>
        ) : null}
        <ErrorNote text={error} />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🍿"
            title="Пока пусто"
            text="Добавьте фильм или сериал, который давно хотели посмотреть. Партнёр поставит ♥, если тоже хочет."
            action="Добавить первый"
            onAction={() => setEditing('new')}
            color={st.fg}
          />
        ) : visible.length === 0 ? (
          <EmptyState emoji="🎞️" title="Здесь ничего" text="В этом статусе пока нет ни одного фильма." />
        ) : (
          visible.map((item) => {
            const status = item.status ?? 'want';
            return (
              <ItemCard
                key={item.id}
                item={item}
                accent={st.fg}
                onLike={() => toggleLike(item)}
                onPress={() => setEditing(item)}
                onLongPress={() => itemMenu(item.title, () => setEditing(item), () => remove(item.id).catch((e) => Alert.alert('Ошибка', humanError(e))))}
                badge={
                  <>
                    <Badge label={TYPE_LABEL[item.media_type ?? 'movie']} color={st.fg} bg={st.bg} />
                  </>
                }
                footerExtra={
                  <Pressable onPress={() => update(item.id, { status: STATUS_NEXT[status] }).catch(() => undefined)} hitSlop={6}>
                    <Badge
                      label={`${status === 'watched' ? '✓ ' : status === 'watching' ? '▶ ' : ''}${STATUS_LABEL[status]}`}
                      color={status === 'watched' ? c.sage : status === 'watching' ? c.honey : c.textMuted}
                      bg={status === 'watched' ? c.sageSoft : status === 'watching' ? c.honeySoft : c.bgAlt}
                    />
                  </Pressable>
                }
              />
            );
          })
        )}
      </Screen>
      {items.length > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} /> : null}
      <WatchSheet
        item={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSave={async (data) => {
          if (editing && editing !== 'new') await update(editing.id, data);
          else await add(data);
          setEditing(null);
        }}
        onDelete={editing && editing !== 'new' ? async () => { await remove(editing.id); setEditing(null); } : undefined}
      />
    </View>
  );
}

type WatchData = { title: string; media_type: MediaType; status: WatchStatus; url: string | null; note: string };

function WatchSheet({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
}: {
  item: ItemWithLikes | null;
  visible: boolean;
  onClose: () => void;
  onSave: (d: WatchData) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'watch');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MediaType>('movie');
  const [status, setStatus] = useState<WatchStatus>('want');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? '');
    setType(item?.media_type ?? 'movie');
    setStatus(item?.status ?? 'want');
    setUrl(item?.url ?? '');
    setNote(item?.note ?? '');
    setError(null);
  }, [visible, item]);

  async function save() {
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    setBusy(true);
    try {
      await onSave({ title: title.trim(), media_type: type, status, url: link, note: note.trim() });
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
      title={item ? 'Изменить' : 'Что посмотрим?'}
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Input label="Название" value={title} onChangeText={setTitle} placeholder="Например, «Дюна»" autoFocus={!item} maxLength={200} />
      <Label>Тип</Label>
      <ChipGroup options={['movie', 'series'] as const} labels={TYPE_LABEL} value={type} onChange={setType} color={st.fg} />
      <Label>Статус</Label>
      <ChipGroup options={['want', 'watching', 'watched'] as const} labels={STATUS_LABEL} value={status} onChange={setStatus} color={st.fg} />
      <Input label="Ссылка (необязательно)" value={url} onChangeText={setUrl} placeholder="Кинопоиск, трейлер…" autoCapitalize="none" keyboardType="url" />
      <Input label="Заметка" value={note} onChangeText={setNote} placeholder="Почему хочется посмотреть" multiline maxLength={2000} />
      <ErrorNote text={error} />
      {onDelete ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => setError(humanError(e)))} /> : null}
    </Sheet>
  );
}
