import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { Entry, useCalendar } from '../../hooks/useCalendar';
import { todayISO } from '../../lib/format';
import { humanError } from '../../lib/supabase';
import type { CalendarEvent, CalendarKind } from '../../lib/types';
import { EntryDetailSheet } from './EntryDetailSheet';
import { EventSheet } from './EventSheet';

type Cal = ReturnType<typeof useCalendar>;
type Editing = { event: CalendarEvent | null; kind: CalendarKind; date: string | null };
type Picked = { type: 'event' | 'weekend'; id: string; date: string };

/** iOS не показывает новое окно, пока предыдущее не закрылось до конца */
const SHEET_SWAP_MS = 450;

/**
 * Карточка записи и форма редактирования для экранов календаря, событий и задач.
 * Нажатие на запись открывает карточку, а уже из неё — «Изменить».
 */
export function useCalendarSheets(cal: Cal, opts?: { onSaved?: () => void; spaceId?: string | null; fixedKind?: CalendarKind }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSwap = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    cancelSwap();
    setPicked(null);
    setEditing(null);
  }, [opts?.spaceId]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Карточка всегда показывает свежие данные: берём запись из списка по id
  const entry = useMemo<Entry | null>(() => {
    if (!picked) return null;
    if (picked.type === 'event') {
      const ev = cal.events.find((e) => e.id === picked.id);
      return ev ? { type: 'event', key: ev.id, date: picked.date, event: ev } : null;
    }
    const it = cal.weekend.find((w) => w.id === picked.id);
    return it ? { type: 'weekend', key: `w:${it.id}`, date: picked.date, item: it } : null;
  }, [picked, cal.events, cal.weekend]);

  // Запись удалили (в том числе на другом телефоне) — карточку закрываем
  useEffect(() => {
    if (picked && !entry && !cal.loading) setPicked(null);
  }, [picked, entry, cal.loading]);

  const openEntry = useCallback((e: Entry) => {
    cancelSwap();
    if (e.type === 'event') setPicked({ type: 'event', id: e.event.id, date: e.date });
    else setPicked({ type: 'weekend', id: e.item.id, date: e.date });
  }, []);

  const openEvent = useCallback((ev: CalendarEvent, date?: string | null) => {
    cancelSwap();
    setPicked({ type: 'event', id: ev.id, date: date ?? ev.starts_on ?? '' });
  }, []);

  const swapTo = (fn: () => void) => {
    setPicked(null);
    cancelSwap();
    timer.current = setTimeout(() => {
      timer.current = null;
      fn();
    }, SHEET_SWAP_MS);
  };

  const editEvent = useCallback((ev: CalendarEvent) => setEditing({ event: ev, kind: ev.kind, date: ev.starts_on }), []);
  const openNew = useCallback((kind: CalendarKind, date: string | null) => {
    cancelSwap();
    setEditing({ event: null, kind, date });
  }, []);

  const deleteEvent = useCallback(
    (ev: CalendarEvent) => {
      setPicked(null);
      cal.remove(ev).catch((e) => Alert.alert('Ошибка', humanError(e)));
    },
    [cal],
  );

  const sheets = (
    <>
      <EntryDetailSheet
        entry={entry}
        today={todayISO()}
        onClose={() => setPicked(null)}
        onEdit={(ev) => swapTo(() => editEvent(ev))}
        onDelete={deleteEvent}
        onTake={(ev) => cal.take(ev)}
        onRelease={(ev) => cal.release(ev)}
        onDone={(ev, d) => cal.setDone(ev, d)}
        onOpenWeekend={() => swapTo(() => router.push('/(tabs)/weekend'))}
      />
      <EventSheet
        visible={editing !== null}
        event={editing?.event ?? null}
        initialKind={editing?.kind}
        initialDate={editing?.date ?? null}
        fixedKind={opts?.fixedKind}
        onClose={() => setEditing(null)}
        save={cal.save}
        remove={cal.remove}
        onSaved={opts?.onSaved}
      />
    </>
  );

  return { openEntry, openEvent, editEvent, openNew, deleteEvent, sheets };
}
