import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
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

  const load = useCallback(async () => {
    if (!space) return;
    const [{ data: rows, error: e1 }, { data: likes, error: e2 }] = await Promise.all([
      supabase.from('items').select('*').eq('space_id', space.id).eq('kind', kind).order('created_at', { ascending: false }),
      supabase.from('item_likes').select('item_id, user_id').eq('space_id', space.id),
    ]);
    if (e1 || e2) {
      setError((e1 ?? e2)!.message);
      setLoading(false);
      return;
    }
    const byItem = new Map<string, string[]>();
    for (const l of (likes ?? []) as { item_id: string; user_id: string }[]) {
      const arr = byItem.get(l.item_id) ?? [];
      arr.push(l.user_id);
      byItem.set(l.item_id, arr);
    }
    setItems(((rows ?? []) as Item[]).map((r) => ({ ...r, tags: r.tags ?? [], likes: byItem.get(r.id) ?? [] })));
    setError(null);
    setLoading(false);
  }, [space, kind]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useRealtimeRefetch(['items', 'item_likes'], load);

  const add = useCallback(
    async (input: NewItem) => {
      if (!space || !userId) throw new Error('Нет пространства');
      const { error: e } = await supabase.from('items').insert({ ...input, space_id: space.id, kind, created_by: userId });
      if (e) throw e;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await load();
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
      const { error: e } = await supabase.from('items').delete().eq('id', id);
      if (e) {
        await load();
        throw e;
      }
    },
    [load],
  );

  const toggleLike = useCallback(
    async (item: ItemWithLikes) => {
      if (!userId || !space) return;
      const liked = item.likes.includes(userId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setItems((list) =>
        list.map((i) =>
          i.id === item.id ? { ...i, likes: liked ? i.likes.filter((u) => u !== userId) : [...i.likes, userId] } : i,
        ),
      );
      const res = liked
        ? await supabase.from('item_likes').delete().eq('item_id', item.id).eq('user_id', userId)
        : await supabase.from('item_likes').insert({ item_id: item.id, user_id: userId, space_id: space.id });
      if (res.error) await load();
    },
    [userId, space, load],
  );

  return { items, loading, error, reload: load, add, update, remove, toggleLike };
}

export function sortItems(items: ItemWithLikes[], mode: SortMode): ItemWithLikes[] {
  const copy = [...items];
  if (mode === 'likes') {
    copy.sort((a, b) => b.likes.length - a.likes.length || b.created_at.localeCompare(a.created_at));
  } else {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return copy;
}

export function useSorted(items: ItemWithLikes[], mode: SortMode) {
  return useMemo(() => sortItems(items, mode), [items, mode]);
}
