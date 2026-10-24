import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

/** Сколько сообщений партнёра ещё не прочитано в текущем пространстве */
export function useUnreadCount(): number {
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
    const { data: read } = await supabase
      .from('message_reads')
      .select('last_read_at')
      .eq('space_id', spaceId)
      .eq('user_id', userId)
      .maybeSingle();
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
  return count;
}

/** Отмечает чат прочитанным до текущего момента */
export async function markChatRead(spaceId: string, userId: string): Promise<void> {
  await supabase
    .from('message_reads')
    .upsert({ space_id: spaceId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'space_id,user_id' });
}
