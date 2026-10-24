import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { deleteWithFiles } from '../lib/files';
import { humanError, supabase } from '../lib/supabase';
import type { Item, ItemKind, ItemWithLikes } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

export type SortMode = 'likes' | 'new';

export type NewItem = Partial<Omit<Item, 'id' | 'space_id' | 'kind' | 'created_by' | 'created_at' | 'updated_at'>> & {
  title: string;
};

export function useItems(kind: ItemKind) {
  const { space } = useSpace();
  const { userId } = useAuth();
  const [items, setItems] = useState<ItemWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Номер последнего запроса: ответ от устаревшего запроса (например, после смены пространства) не применяем
  const requestId = useRef(0);
  const likeInFlight = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!space) {
      requestId.current += 1;
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    let rows: Item[] | null = null;
    let likes: { item_id: string; user_id: string; value: number | null }[] | null = null;
    let failure: unknown = null;
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('items').select('*').eq('space_id', space.id).eq('kind', kind).order('created_at', { ascending: false }),
        supabase.from('item_likes').select('item_id, user_id, value').eq('space_id', space.id),
      ]);
      failure = r1.error ?? r2.error;
      rows = (r1.data ?? []) as Item[];
      likes = (r2.data ?? []) as { item_id: string; user_id: string; value: number | null }[];
    } catch (e) {
      failure = e;
    }
    if (id !== requestId.current) return;
    if (failure || !rows || !likes) {
      setError(humanError(failure));
      setLoading(false);
      return;
    }
    const ups = new Map<string, string[]>();
    const downs = new Map<string, string[]>();
    for (const l of likes) {
      const map = (l.value ?? 1) < 0 ? downs : ups;
      const arr = map.get(l.item_id) ?? [];
      arr.push(l.user_id);
      map.set(l.item_id, arr);
    }
    setItems(rows.map((r) => ({ ...r, tags: r.tags ?? [], likes: ups.get(r.id) ?? [], dislikes: downs.get(r.id) ?? [] })));
    setError(null);
    setLoading(false);
  }, [space, kind]);

  // При смене пространства не показываем записи предыдущего
  const spaceId = space?.id ?? null;
  useEffect(() => {
    setItems([]);
    setError(null);
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    return load();
  }, [load]);

  useRealtimeRefetch(['items', 'item_likes'], load);

  const add = useCallback(
    async (input: NewItem) => {
      if (!space || !userId) throw new Error('Нет пространства');
      const { data, error: e } = await supabase
        .from('items')
        .insert({ ...input, space_id: space.id, kind, created_by: userId })
        .select('id')
        .single();
      if (e) throw e;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await load();
      return (data as { id: string }).id;
    },
    [space, userId, kind, load],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Item>) => {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const { error: e } = await supabase.from('items').update(patch).eq('id', id);
      if (e) {
        await load();
        throw e;
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      setItems((list) => list.filter((i) => i.id !== id));
      try {
        await deleteWithFiles(id, () => supabase.from('items').delete().eq('id', id));
      } catch (e) {
        await load();
        throw e;
      }
    },
    [load],
  );

  /** Реакция: 1 — нравится, -1 — не нравится. Повторное нажатие снимает реакцию. */
  const react = useCallback(
    async (item: ItemWithLikes, value: 1 | -1) => {
      if (!userId || !space) return;
      // защита от двойного нажатия: пока запрос по этой записи не завершился, новые нажатия игнорируем
      if (likeInFlight.current.has(item.id)) return;
      likeInFlight.current.add(item.id);
      const current: 0 | 1 | -1 = item.likes.includes(userId) ? 1 : item.dislikes.includes(userId) ? -1 : 0;
      const next: 0 | 1 | -1 = current === value ? 0 : value;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setItems((list) =>
        list.map((i) =>
          i.id === item.id
            ? {
                ...i,
                likes: next === 1 ? [...i.likes.filter((u) => u !== userId), userId] : i.likes.filter((u) => u !== userId),
                dislikes: next === -1 ? [...i.dislikes.filter((u) => u !== userId), userId] : i.dislikes.filter((u) => u !== userId),
              }
            : i,
        ),
      );
      try {
        const res =
          next === 0
            ? await supabase.from('item_likes').delete().eq('item_id', item.id).eq('user_id', userId)
            : await supabase
                .from('item_likes')
                .upsert({ item_id: item.id, user_id: userId, space_id: space.id, value: next }, { onConflict: 'item_id,user_id' });
        if (res.error) throw res.error;
      } catch (e) {
        await load();
        Alert.alert('Не получилось', humanError(e));
      } finally {
        likeInFlight.current.delete(item.id);
      }
    },
    [userId, space, load],
  );

  const toggleLike = useCallback((item: ItemWithLikes) => react(item, 1), [react]);
  const toggleDislike = useCallback((item: ItemWithLikes) => react(item, -1), [react]);

  return { items, loading, error, reload: load, retry, add, update, remove, toggleLike, toggleDislike };
}

export function sortItems(items: ItemWithLikes[], mode: SortMode): ItemWithLikes[] {
  const copy = [...items];
  if (mode === 'likes') {
    const score = (i: ItemWithLikes) => i.likes.length - i.dislikes.length;
    copy.sort((a, b) => score(b) - score(a) || b.created_at.localeCompare(a.created_at));
  } else {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return copy;
}

export function useSorted(items: ItemWithLikes[], mode: SortMode) {
  return useMemo(() => sortItems(items, mode), [items, mode]);
}
