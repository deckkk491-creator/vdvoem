/*
 * Реакции на сообщения чата (как в Telegram): у каждого — одна реакция на сообщение.
 * Нажать ту же реакцию ещё раз — убрать её, другую — заменить.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { humanError, supabase } from '../lib/supabase';
import type { MessageReaction } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch } from '../providers/SpaceProvider';

/** Быстрые реакции в панели над сообщением */
export const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😍', '😢', '😮', '🙏'];
/** Все реакции (по кнопке «ещё») */
export const MORE_REACTIONS = [
  '❤️', '😂', '👍', '🔥', '😍', '😢', '😮', '🙏',
  '🥰', '😘', '🤗', '😁', '🤣', '😅', '😊', '😇',
  '🤔', '😴', '🥺', '😡', '🤯', '🥳', '👏', '🤝',
  '💯', '🎉', '💔', '👎', '🤡', '🫡', '👀', '🍾',
];

/** Сводка реакций одного сообщения: эмодзи, сколько, кто, есть ли моя */
export type ReactionSummary = { emoji: string; count: number; users: string[]; mine: boolean };

const CHUNK = 100;

export function useReactions(spaceId: string | null, messageIds: string[]) {
  const { userId } = useAuth();
  const [rows, setRows] = useState<MessageReaction[]>([]);
  const req = useRef(0);
  const key = useMemo(() => [...messageIds].sort().join(','), [messageIds]);

  const load = useCallback(async () => {
    const id = ++req.current;
    const ids = key ? key.split(',') : [];
    if (!spaceId || !ids.length) {
      setRows([]);
      return;
    }
    try {
      const parts: MessageReaction[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('message_id, space_id, user_id, emoji, created_at')
          .eq('space_id', spaceId)
          .in('message_id', ids.slice(i, i + CHUNK));
        if (error) throw error;
        parts.push(...((data ?? []) as MessageReaction[]));
      }
      if (id === req.current) setRows(parts);
    } catch {
      // реакции не критичны: оставляем прежние
    }
  }, [spaceId, key]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['message_reactions'], load);

  const byMessage = useMemo(() => {
    const out: Record<string, ReactionSummary[]> = {};
    const groups: Record<string, Record<string, ReactionSummary>> = {};
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const r of sorted) {
      const g = (groups[r.message_id] ??= {});
      const s = (g[r.emoji] ??= { emoji: r.emoji, count: 0, users: [], mine: false });
      s.count += 1;
      s.users.push(r.user_id);
      if (r.user_id === userId) s.mine = true;
    }
    for (const [mid, g] of Object.entries(groups)) out[mid] = Object.values(g);
    return out;
  }, [rows, userId]);

  const myReaction = useCallback(
    (messageId: string) => rows.find((r) => r.message_id === messageId && r.user_id === userId)?.emoji ?? null,
    [rows, userId],
  );

  /** Поставить, заменить или убрать (если та же) свою реакцию */
  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!spaceId || !userId) return;
      const prev = rows;
      const mine = prev.find((r) => r.message_id === messageId && r.user_id === userId);
      const removing = mine?.emoji === emoji;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === userId));
      setRows(removing ? rest : [...rest, { message_id: messageId, space_id: spaceId, user_id: userId, emoji, created_at: mine?.created_at ?? new Date().toISOString() }]);
      try {
        if (removing) {
          const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('message_reactions')
            .upsert({ message_id: messageId, space_id: spaceId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' });
          if (error) throw error;
        }
      } catch (e) {
        setRows(prev);
        Alert.alert('Реакция не сохранилась', humanError(e));
      }
    },
    [rows, spaceId, userId],
  );

  return { byMessage, myReaction, react };
}
