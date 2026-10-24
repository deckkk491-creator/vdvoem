import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { removeAttachmentFilesOf } from '../lib/files';
import { parseDate, plural, toISODate } from '../lib/format';
import { humanError, supabase } from '../lib/supabase';
import type { CalendarEvent, CalendarKind, Item } from '../lib/types';
import { useAuth } from '../providers/AuthProvider';
import { useRealtimeRefetch, useSpace } from '../providers/SpaceProvider';

/** Что можно задать в форме события / задачи / важной даты */
export type EventInput = {
  kind: CalendarKind;
  title: string;
  note: string;
  url: string | null;
  emoji: string | null;
  starts_on: string | null;
  start_time: string | null;
  end_time: string | null;
  yearly: boolean;
  assignee: string | null;
};

/** Идея из «Выходных» с датой — в календаре только для чтения */
export type WeekendEntry = Pick<Item, 'id' | 'title' | 'event_date' | 'end_date' | 'category' | 'done'>;

/** Запись в конкретный день календаря */
export type Entry =
  | { type: 'event'; key: string; date: string; event: CalendarEvent }
  | { type: 'weekend'; key: string; date: string; item: WeekendEntry };

export function useCalendar() {
  const { space } = useSpace();
  const { userId } = useAuth();
  const spaceId = space?.id ?? null;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weekend, setWeekend] = useState<WeekendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Для какого пространства данные успешно загружены (синхронизация с iPhone — только по полным данным) */
  const [loadedSpace, setLoadedSpace] = useState<string | null>(null);

  // Номер последнего запроса: ответ от устаревшего запроса (например, после смены пространства) не применяем
  const requestId = useRef(0);
  // Задачи, по которым запрос ещё не завершился: повторные нажатия игнорируем
  const inFlight = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!spaceId) {
      requestId.current += 1;
      setEvents([]);
      setWeekend([]);
      setLoadedSpace(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    let rows: CalendarEvent[] | null = null;
    let items: WeekendEntry[] | null = null;
    let failure: unknown = null;
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('calendar_events').select('*').eq('space_id', spaceId).order('starts_on', { ascending: true, nullsFirst: false }),
        supabase
          .from('items')
          .select('id, title, event_date, end_date, category, done')
          .eq('space_id', spaceId)
          .eq('kind', 'weekend')
          .not('event_date', 'is', null),
      ]);
      failure = r1.error ?? r2.error;
      rows = (r1.data ?? []) as CalendarEvent[];
      items = (r2.data ?? []) as WeekendEntry[];
    } catch (e) {
      failure = e;
    }
    if (id !== requestId.current) return;
    if (failure || !rows || !items) {
      setError(humanError(failure));
      setLoading(false);
      return;
    }
    setEvents(rows);
    setWeekend(items);
    setLoadedSpace(spaceId);
    setError(null);
    setLoading(false);
  }, [spaceId]);

  // При смене пространства не показываем записи предыдущего
  useEffect(() => {
    setEvents([]);
    setWeekend([]);
    setError(null);
    setLoadedSpace(null);
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

  useRealtimeRefetch(['calendar_events', 'items'], load);

  /** Создаёт или обновляет запись. Возвращает её id (нужен для вложений). */
  const save = useCallback(
    async (input: EventInput, id?: string): Promise<string> => {
      if (!spaceId || !userId) throw new Error('Нет пространства');
      if (id) {
        const { error: e } = await supabase.from('calendar_events').update(input).eq('id', id);
        if (e) throw e;
        await load();
        return id;
      }
      const { data, error: e } = await supabase
        .from('calendar_events')
        .insert({ ...input, space_id: spaceId, created_by: userId })
        .select('id')
        .single();
      if (e) throw e;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await load();
      return (data as { id: string }).id;
    },
    [spaceId, userId, load],
  );

  const remove = useCallback(
    async (ev: CalendarEvent) => {
      // Сначала файлы: записи о вложениях база удалит триггером вместе с событием
      await removeAttachmentFilesOf(ev.id);
      setEvents((list) => list.filter((e) => e.id !== ev.id));
      const { error: e } = await supabase.from('calendar_events').delete().eq('id', ev.id);
      if (e) {
        await load();
        throw e;
      }
    },
    [load],
  );

  /** Оптимистичное изменение задачи с откатом при ошибке */
  const patchTask = useCallback(async (ev: CalendarEvent, patch: Partial<CalendarEvent>) => {
    if (inFlight.current.has(ev.id)) return;
    inFlight.current.add(ev.id);
    const prev = ev;
    setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, ...patch } : e)));
    try {
      const { error: e } = await supabase.from('calendar_events').update(patch).eq('id', ev.id);
      if (e) throw e;
    } catch (e) {
      setEvents((list) => list.map((x) => (x.id === ev.id ? prev : x)));
      Alert.alert('Не получилось', humanError(e));
    } finally {
      inFlight.current.delete(ev.id);
    }
  }, []);

  const take = useCallback(
    (ev: CalendarEvent) => {
      if (!userId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      return patchTask(ev, { assignee: userId });
    },
    [userId, patchTask],
  );

  const release = useCallback((ev: CalendarEvent) => patchTask(ev, { assignee: null }), [patchTask]);

  const setDone = useCallback(
    (ev: CalendarEvent, done: boolean) => {
      if (!userId) return;
      if (done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      return patchTask(ev, {
        done,
        done_by: done ? userId : null,
        done_at: done ? new Date().toISOString() : null,
      });
    },
    [userId, patchTask],
  );

  return { events, weekend, loading, error, loadedSpace, reload: load, retry, save, remove, take, release, setDone };
}

/* ------------------------- Даты ------------------------- */

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Разница в днях между двумя датами 'YYYY-MM-DD' (b − a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Та же дата в другом году; 29 февраля в невисокосный год — 28 февраля */
export function sameDayInYear(iso: string, year: number): string {
  const m = Number(iso.slice(5, 7));
  let d = Number(iso.slice(8, 10));
  if (m === 2 && d === 29 && !isLeap(year)) d = 28;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Ближайший день, когда запись наступает (для ежегодных — в этом или следующем году) */
export function nextOccurrence(ev: CalendarEvent, today: string): string | null {
  if (!ev.starts_on) return null;
  if (!ev.yearly) return ev.starts_on;
  const year = Number(today.slice(0, 4));
  const first = Number(ev.starts_on.slice(0, 4));
  let occ = sameDayInYear(ev.starts_on, Math.max(year, first));
  if (occ < today) occ = sameDayInYear(ev.starts_on, Math.max(year, first) + 1);
  return occ;
}

/** «5-я годовщина» / «исполнится 30» для ежегодной даты, если известен исходный год */
export function anniversaryLabel(ev: CalendarEvent, occ: string, today: string): string | null {
  if (!ev.yearly || !ev.starts_on) return null;
  const n = Number(occ.slice(0, 4)) - Number(ev.starts_on.slice(0, 4));
  if (n <= 0) return null;
  const birthday = /рожд|день\s*р\.?(\s|$)|(^|\s)др(\s|$)/i.test(ev.title);
  if (birthday) {
    if (occ === today) return `исполняется ${n}`;
    if (occ < today) return `исполнилось ${n}`;
    return `исполнится ${n}`;
  }
  return `${n}-я годовщина`;
}

/** «сегодня!», «завтра», «через 12 дней», «3 дня назад» */
export function daysUntilLabel(occ: string, today: string): string {
  const n = daysBetween(today, occ);
  if (n === 0) return 'сегодня!';
  if (n === 1) return 'завтра';
  if (n > 0) return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  const p = -n;
  return `${p} ${plural(p, 'день', 'дня', 'дней')} назад`;
}

/** 'HH:MM:SS' → 'HH:MM' */
export function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null;
}

export function timeLabel(ev: CalendarEvent): string {
  const s = hhmm(ev.start_time);
  const e = hhmm(ev.end_time);
  if (!s) return 'Весь день';
  return e ? `${s}–${e}` : s;
}

// Порядок внутри дня: важные даты, выходные, события на весь день, по времени, задачи
function entryRank(e: Entry): number {
  if (e.type === 'weekend') return 1;
  if (e.event.kind === 'date') return 0;
  if (e.event.kind === 'task') return 4;
  return e.event.start_time ? 3 : 2;
}

function compareEntries(a: Entry, b: Entry): number {
  const r = entryRank(a) - entryRank(b);
  if (r) return r;
  if (a.type === 'event' && b.type === 'event') {
    const t = (a.event.start_time ?? '').localeCompare(b.event.start_time ?? '');
    if (t) return t;
    return a.event.title.localeCompare(b.event.title, 'ru');
  }
  const ta = a.type === 'event' ? a.event.title : a.item.title;
  const tb = b.type === 'event' ? b.event.title : b.item.title;
  return ta.localeCompare(tb, 'ru');
}

/** Максимальная длина поездки из «Выходных», которую раскладываем по дням */
const MAX_SPAN_DAYS = 62;

/**
 * Раскладывает записи по дням в диапазоне [from, to] (включительно, 'YYYY-MM-DD').
 * Ежегодные записи повторяются (начиная с исходного года), поездки из «Выходных» занимают все свои дни.
 */
export function expandEntries(events: CalendarEvent[], weekend: WeekendEntry[], from: string, to: string): Record<string, Entry[]> {
  const out: Record<string, Entry[]> = {};
  const push = (e: Entry) => {
    (out[e.date] ??= []).push(e);
  };
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  for (const ev of events) {
    if (!ev.starts_on) continue;
    if (ev.yearly) {
      for (let y = y1; y <= y2; y++) {
        const occ = sameDayInYear(ev.starts_on, y);
        if (occ >= ev.starts_on && occ >= from && occ <= to) push({ type: 'event', key: `${ev.id}:${occ}`, date: occ, event: ev });
      }
    } else if (ev.starts_on >= from && ev.starts_on <= to) {
      push({ type: 'event', key: ev.id, date: ev.starts_on, event: ev });
    }
  }
  for (const it of weekend) {
    if (!it.event_date) continue;
    const start = it.event_date.slice(0, 10);
    const endRaw = it.end_date ? it.end_date.slice(0, 10) : start;
    const end = endRaw >= start ? endRaw : start;
    if (end < from || start > to) continue;
    let d = start < from ? from : start;
    for (let i = 0; i < MAX_SPAN_DAYS && d <= end && d <= to; i++) {
      push({ type: 'weekend', key: `w:${it.id}:${d}`, date: d, item: it });
      d = addDays(d, 1);
    }
  }
  for (const k of Object.keys(out)) out[k].sort(compareEntries);
  return out;
}
