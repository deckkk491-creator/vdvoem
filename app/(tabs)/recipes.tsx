import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';
import { Badge, ItemCard, itemMenu } from '../../src/components/ItemCard';
import { SectionHeader, SortToggle } from '../../src/components/SectionHeader';
import { Body, Button, Chip, EmptyState, ErrorNote, Fab, Input, Label, Loading, Row, Screen, Sheet } from '../../src/components/ui';
import { useItems, useSorted, type SortMode } from '../../src/hooks/useItems';
import { normalizeUrl } from '../../src/lib/format';
import { fetchLinkPreview } from '../../src/lib/linkPreview';
import { humanError } from '../../src/lib/supabase';
import type { ItemWithLikes } from '../../src/lib/types';
import { radius, sectionStyle, useTheme } from '../../src/theme';

const BASE_TAGS = ['завтрак', 'обед', 'ужин', 'десерт', 'выпечка', 'быстро', 'на праздник', 'суп', 'салат'];

export default function RecipesScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'recipe');
  const { items, loading, error, retry, add, update, remove, toggleLike } = useItems('recipe');
  const [sort, setSort] = useState<SortMode>('new');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemWithLikes | 'new' | null>(null);

  const sorted = useSorted(items, sort);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [items]);
  const visible = tag ? sorted.filter((i) => i.tags.includes(tag)) : sorted;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <SectionHeader
          title="Что приготовить"
          subtitle="Рецепты из любых сайтов и соцсетей"
          emoji={st.emoji}
          color={st.fg}
          right={items.length > 1 ? <SortToggle value={sort} onChange={setSort} /> : null}
        />
        {allTags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            <Chip label="Все" active={!tag} onPress={() => setTag(null)} color={st.fg} />
            {allTags.map((t) => (
              <Chip key={t} label={t} active={tag === t} onPress={() => setTag(tag === t ? null : t)} color={st.fg} />
            ))}
          </ScrollView>
        ) : null}
        <ErrorNote text={error} onRetry={retry} />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🍲"
            title="Книга рецептов пуста"
            text="Вставь ссылку на рецепт с любого сайта, из VK или YouTube — название и фото подтянутся сами."
            action="Добавить рецепт"
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
              badge={item.tags.length ? item.tags.map((t) => <Badge key={t} label={t} color={st.fg} bg={st.bg} />) : undefined}
            />
          ))
        )}
      </Screen>
      {items.length > 0 ? <Fab onPress={() => setEditing('new')} color={st.fg} /> : null}
      <RecipeSheet
        item={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        knownTags={allTags}
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

type RecipeData = { title: string; url: string | null; image_url: string | null; note: string; tags: string[] };

function RecipeSheet({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
  knownTags,
}: {
  item: ItemWithLikes | null;
  visible: boolean;
  onClose: () => void;
  onSave: (d: RecipeData) => Promise<void>;
  onDelete?: () => Promise<void>;
  knownTags: string[];
}) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'recipe');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setUrl(item?.url ?? '');
    setTitle(item?.title ?? '');
    setImage(item?.image_url ?? '');
    setNote(item?.note ?? '');
    setTags(item?.tags ?? []);
    setNewTag('');
    setHint(null);
    setError(null);
    lastFetched.current = item?.url ?? null;
  }, [visible, item]);

  async function autofill(raw: string) {
    const link = normalizeUrl(raw);
    if (!link || lastFetched.current === link) return;
    lastFetched.current = link;
    setFetching(true);
    setHint(null);
    const p = await fetchLinkPreview(link);
    setFetching(false);
    if (!p || (!p.title && !p.image)) {
      setHint('Не получилось прочитать страницу — впиши название вручную.');
      return;
    }
    if (p.title) setTitle((t) => t || p.title!);
    if (p.image) setImage((i) => i || p.image!);
    if (p.description) setNote((n) => n || p.description!.slice(0, 300));
    setHint(p.siteName ? `Подтянули данные с ${p.siteName} ✨` : 'Подтянули данные со страницы ✨');
  }

  async function pasteFromClipboard() {
    const text = (await Clipboard.getStringAsync()).trim();
    const match = text.match(/https?:\/\/\S+/);
    const value = match ? match[0] : text;
    if (!value) return;
    setUrl(value);
    autofill(value);
  }

  function toggleTag(t: string) {
    setTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  async function save() {
    const link = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !link) return setError('Ссылка выглядит неправильно');
    const img = image.trim() ? normalizeUrl(image) : null;
    setBusy(true);
    try {
      await onSave({ title: title.trim(), url: link, image_url: img, note: note.trim(), tags });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  const tagOptions = Array.from(new Set([...BASE_TAGS, ...knownTags, ...tags]));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? 'Рецепт' : 'Новый рецепт'}
      footer={<Button title={item ? 'Сохранить' : 'Добавить'} onPress={save} loading={busy} disabled={!title.trim() || fetching} color={st.fg} />}
    >
      <Label>Ссылка на рецепт</Label>
      <Row style={{ marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Input
            value={url}
            onChangeText={setUrl}
            onBlur={() => url.trim() && autofill(url)}
            onSubmitEditing={() => url.trim() && autofill(url)}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
        <Button title="Вставить" small variant="secondary" icon="clipboard-outline" onPress={pasteFromClipboard} />
      </Row>
      <View style={{ minHeight: 24, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {fetching ? (
          <>
            <ActivityIndicator size="small" color={st.fg} />
            <Body muted style={{ fontSize: 13 }}>Читаем страницу…</Body>
          </>
        ) : hint ? (
          <Body muted style={{ fontSize: 13 }}>{hint}</Body>
        ) : null}
      </View>
      {image ? (
        <Image source={{ uri: image }} style={{ width: '100%', height: 180, borderRadius: radius.md, backgroundColor: c.bgAlt, marginBottom: 12 }} />
      ) : null}
      <Input label="Название" value={title} onChangeText={setTitle} placeholder="Сырники как у бабушки" maxLength={200} />
      <Input label="Фото (ссылка на картинку)" value={image} onChangeText={setImage} placeholder="https://…/photo.jpg" autoCapitalize="none" keyboardType="url" />
      <Label>Теги</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {tagOptions.map((t) => (
          <Chip key={t} label={t} active={tags.includes(t)} onPress={() => toggleTag(t)} color={st.fg} small />
        ))}
      </View>
      <Row style={{ marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Input value={newTag} onChangeText={setNewTag} placeholder="Свой тег" maxLength={30} containerStyle={{ marginBottom: 0 }} />
        </View>
        <Button
          title="Добавить"
          small
          variant="secondary"
          disabled={!newTag.trim()}
          onPress={() => {
            const t = newTag.trim().toLowerCase();
            if (t && !tags.includes(t)) setTags([...tags, t]);
            setNewTag('');
          }}
        />
      </Row>
      <Input label="Заметка" value={note} onChangeText={setNote} placeholder="Ингредиенты, что заменить, на сколько порций…" multiline maxLength={2000} />
      <ErrorNote text={error} />
      {onDelete ? <Button title="Удалить" variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => setError(humanError(e)))} /> : null}
      <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 12, textAlign: 'center' }}>
        Совет: в соцсети нажми «Поделиться» → «Копировать ссылку», а здесь — «Вставить».
      </Text>
    </Sheet>
  );
}
