import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

const UnreadContext = createContext(0);

/**
 * Считает непрочитанные сообщения один раз на всё приложение
 * (раньше каждая шапка делала свои запросы на каждое событие чата).
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { space } = useSpace();
  const { userId } = useAuth();
  const [count, setCount] = useState(0);
  const req = useRef(0);
  const spaceId = space?.id ?? null;

  const load = useCallback(async () => {
    const id = ++req.current;
    if (!spaceId || !userId) {
      setCount(0);
      return;
    }
    const { data: read, error: readErr } = await supabase
      .from('message_reads')
      .select('last_read_at')
      .eq('space_id', spaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (id !== req.current || readErr) return;
    let q = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).neq('sender_id', userId);
    if (read?.last_read_at) q = q.gt('created_at', read.last_read_at as string);
    const { count: n, error } = await q;
    if (id !== req.current || error) return;
    setCount(n ?? 0);
  }, [spaceId, userId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['messages', 'message_reads'], load);

  return React.createElement(UnreadContext.Provider, { value: count }, children);
}

/** Сколько сообщений партнёра ещё не прочитано в текущем пространстве */
export function useUnreadCount(): number {
  return useContext(UnreadContext);
}

/** Отмечает чат прочитанным до текущего момента — по часам сервера */
export async function markChatRead(spaceId: string, _userId?: string): Promise<void> {
  const { error } = await supabase.rpc('mark_chat_read', { p_space: spaceId });
  if (error) throw error;
}
