import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays } from './useCalendar';
import { todayISO } from '../lib/format';
import { humanError, supabase } from '../lib/supabase';
import type { WorkDay } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

/** Сколько дней назад ещё показываем отмеченные рабочие дни */
const HISTORY_DAYS = 400;

/**
 * Рабочие дни участников пространства. Каждый отмечает только свои,
 * остальные видят их в календаре полоской цвета аватара.
 */
export function useWorkDays() {
  const { space } = useSpace();
  const { userId } = useAuth();
  const spaceId = space?.id ?? null;
  const [rows, setRows] = useState<WorkDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!spaceId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: e } = await supabase
      .from('work_days')
      .select('space_id, user_id, day')
      .eq('space_id', spaceId)
      .gte('day', addDays(todayISO(), -HISTORY_DAYS))
      .limit(5000);
    if (id !== requestId.current) return;
    setLoading(false);
    if (e) {
      setError(humanError(e));
      return;
    }
    setError(null);
    setRows((data ?? []) as WorkDay[]);
  }, [spaceId]);

  useEffect(() => {
    setRows([]);
    setLoading(true);
    load();
  }, [load]);
  useRealtimeRefetch(['work_days'], load);

  /** По дням: кто работает */
  const byDay = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.day] ??= []).push(r.user_id);
    return out;
  }, [rows]);

  const mine = useMemo(() => new Set(rows.filter((r) => r.user_id === userId).map((r) => r.day)), [rows, userId]);

  /** Отмечает или снимает свои рабочие дни. Экран меняется сразу, при ошибке — откат. */
  const setDays = useCallback(
    async (days: string[], on: boolean) => {
      if (!spaceId || !userId || !days.length) return;
      const set = new Set(days);
      setRows((list) => {
        const rest = list.filter((r) => !(r.user_id === userId && set.has(r.day)));
        return on ? [...rest, ...days.map((day) => ({ space_id: spaceId, user_id: userId, day }))] : rest;
      });
      const res = on
        ? await supabase.from('work_days').upsert(
            days.map((day) => ({ space_id: spaceId, user_id: userId, day })),
            { onConflict: 'space_id,user_id,day', ignoreDuplicates: true },
          )
        : await supabase.from('work_days').delete().eq('space_id', spaceId).eq('user_id', userId).in('day', days);
      if (res.error) {
        await load();
        throw res.error;
      }
    },
    [spaceId, userId, load],
  );

  return { rows, byDay, mine, loading, error, reload: load, setDays };
}
