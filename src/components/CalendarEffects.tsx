import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { anniversaryLabel } from '../hooks/useCalendar';
import { todayISO } from '../lib/format';
import { syncEventReminders } from '../lib/notifications';
import { occursOn } from '../lib/reminders';
import { supabase } from '../lib/supabase';
import type { CalendarEvent } from '../lib/types';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';
import { CelebrationScreen } from './Celebration';

const SEEN_KEY = 'vdvoem.celebrated';

/**
 * Невидимый компонент календаря: держит напоминания о записях в актуальном состоянии
 * и показывает поздравление на весь экран при первом открытии приложения в день события.
 */
export function CalendarEffects() {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [loaded, setLoaded] = useState<{ spaceId: string; events: CalendarEvent[] } | null>(null);
  const [today, setToday] = useState(todayISO());
  /** id записи → день, когда поздравление уже показали */
  const [seen, setSeen] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) {
      setLoaded(null);
      return;
    }
    const { data, error } = await supabase.from('calendar_events').select('*').eq('space_id', spaceId);
    // при ошибке оставляем прежние напоминания
    if (error) return;
    setLoaded({ spaceId, events: (data ?? []) as CalendarEvent[] });
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefetch(['calendar_events'], load);

  // Приложение вернули на экран: мог наступить новый день
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(todayISO());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => setSeen(raw ? (JSON.parse(raw) as Record<string, string>) : {}))
      .catch(() => setSeen({}));
  }, []);

  const events = loaded && loaded.spaceId === spaceId ? loaded.events : null;

  useEffect(() => {
    if (!events) return;
    // небольшая пауза, чтобы серия правок не пересоздавала напоминания по многу раз
    const timer = setTimeout(() => syncEventReminders(events), 1200);
    return () => clearTimeout(timer);
  }, [events, today]);

  const party = useMemo(() => {
    if (!events || !seen) return null;
    return events.find((e) => e.celebrate && e.kind !== 'task' && occursOn(e, today) && seen[e.id] !== today) ?? null;
  }, [events, seen, today]);

  if (!party || !party.celebrate) return null;

  const close = () => {
    // записи прошлых дней из списка «показано» убираем
    const next: Record<string, string> = { [party.id]: today };
    for (const [id, day] of Object.entries(seen ?? {})) if (day === today) next[id] = day;
    setSeen(next);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  return (
    <CelebrationScreen
      kind={party.celebrate}
      emoji={party.emoji || (party.kind === 'date' ? '💞' : '🎉')}
      title={party.title}
      subtitle={anniversaryLabel(party, today, today)}
      onClose={close}
    />
  );
}
