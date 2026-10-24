import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { parseDate } from './format';
import type { CalendarEvent } from './types';

/*
 * Выгрузка в календарь iPhone — только в одну сторону (приложение → телефон).
 * Включается отдельно на каждом устройстве. События складываются в собственный
 * календарь «Вдвоём», поэтому его легко скрыть или удалить целиком.
 */

const ENABLED_KEY = 'vdvoem.deviceCalendar.enabled';
const CAL_ID_KEY = 'vdvoem.deviceCalendar.id';
const MAP_KEY = 'vdvoem.deviceCalendar.map';
const CAL_TITLE = 'Вдвоём';

/** space_id → (id события в приложении → id события в iPhone и отпечаток содержимого) */
type Mapping = Record<string, Record<string, { deviceId: string; hash: string }>>;

type Details = NonNullable<Parameters<typeof Calendar.createEventAsync>[1]>;

export type SyncResult = 'ok' | 'denied' | 'error';

/** Выгрузка поддерживается только на iOS (приложение выходит в App Store) */
export const deviceCalendarSupported = Platform.OS === 'ios';

export async function isExportEnabled(): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setExportEnabled(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(ENABLED_KEY, '1');
    else await AsyncStorage.removeItem(ENABLED_KEY);
  } catch {
    // не критично
  }
}

/** Запрашивает доступ к календарю. true — доступ есть. */
export async function requestCalendarAccess(): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function hasAccess(): Promise<boolean> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function readMap(): Promise<Mapping> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Mapping) : {};
  } catch {
    return {};
  }
}

async function writeMap(m: Mapping): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m));
  } catch {
    // не критично: при следующей синхронизации события могут продублироваться — лучше, чем падение
  }
}

/** Источники для нового календаря по порядку: по умолчанию, iCloud, «На iPhone» */
async function pickSources(calendars: Calendar.Calendar[]): Promise<Calendar.Source[]> {
  const out: Calendar.Source[] = [];
  const add = (src: Calendar.Source | null | undefined) => {
    if (src && !out.some((s) => s.id === src.id)) out.push(src);
  };
  try {
    const def = await Calendar.getDefaultCalendarAsync();
    add(def?.source);
  } catch {
    // календаря по умолчанию может не быть
  }
  for (const cal of calendars) {
    const src: Calendar.Source | undefined = cal.source;
    if (src && String(src.type) === 'caldav' && /icloud/i.test(src.name ?? '')) add(src);
  }
  for (const cal of calendars) {
    const src: Calendar.Source | undefined = cal.source;
    if (src && String(src.type) === 'local') add(src);
  }
  return out;
}

/**
 * Находит наш календарь или создаёт его (в том числе заново, если пользователь его удалил).
 * reset = true — календарь новый, сохранённые id событий больше не действительны.
 */
async function ensureCalendar(color: string): Promise<{ id: string; reset: boolean }> {
  const stored = await AsyncStorage.getItem(CAL_ID_KEY).catch(() => null);
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (stored && calendars.some((cal) => cal.id === stored && cal.allowsModifications !== false)) return { id: stored, reset: false };

  let lastError: unknown = new Error('no calendar source');
  for (const source of await pickSources(calendars)) {
    try {
      const id = await Calendar.createCalendarAsync({
        title: CAL_TITLE,
        color,
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: source.id,
        source,
        name: 'vdvoem',
        ownerAccount: 'personal',
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
      await AsyncStorage.setItem(CAL_ID_KEY, id).catch(() => undefined);
      return { id, reset: true };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function exportable(ev: CalendarEvent): boolean {
  if (!ev.starts_on) return false;
  return ev.kind === 'event' || ev.kind === 'date' || ev.kind === 'task';
}

function atTime(iso: string, time: string): Date {
  const d = parseDate(iso);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function toDetails(ev: CalendarEvent): Details {
  const day = ev.starts_on as string;
  const base = ev.emoji ? `${ev.emoji} ${ev.title}` : ev.title;
  const title = ev.kind === 'task' ? `${ev.done ? '✓' : '☐'} ${base}` : base;
  const notes = [ev.note.trim(), ev.url ?? '', 'Из приложения «Вдвоём»'].filter(Boolean).join('\n\n');

  // На весь день: важные даты, задачи и события без времени
  if (ev.kind !== 'event' || !ev.start_time) {
    const start = parseDate(day);
    const end = parseDate(day);
    end.setHours(23, 59, 0, 0);
    return {
      title,
      notes,
      allDay: true,
      startDate: start,
      endDate: end,
      recurrenceRule: ev.kind === 'date' && ev.yearly ? { frequency: Calendar.Frequency.YEARLY } : null,
    };
  }
  const start = atTime(day, ev.start_time);
  let end = ev.end_time ? atTime(day, ev.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title,
    notes,
    allDay: false,
    startDate: start,
    endDate: end,
    recurrenceRule: ev.yearly ? { frequency: Calendar.Frequency.YEARLY } : null,
  };
}

function hashOf(ev: CalendarEvent): string {
  return JSON.stringify([ev.kind, ev.title, ev.emoji, ev.note, ev.url, ev.starts_on, ev.start_time, ev.end_time, ev.yearly, ev.done]);
}

async function safeDelete(deviceId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(deviceId, { futureEvents: true });
  } catch {
    // уже удалено пользователем
  }
}

// Синхронизации выполняются строго по очереди
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Приводит календарь «Вдвоём» на телефоне к списку событий пространства:
 * создаёт новые, обновляет изменённые, удаляет пропавшие. Никогда не бросает исключений.
 */
export function syncDeviceCalendar(spaceId: string, events: CalendarEvent[], color: string): Promise<SyncResult> {
  return serialize(async (): Promise<SyncResult> => {
    if (!deviceCalendarSupported) return 'error';
    try {
      if (!(await hasAccess())) return 'denied';
      const cal = await ensureCalendar(color);
      const all: Mapping = cal.reset ? {} : await readMap();
      const map = { ...(all[spaceId] ?? {}) };
      const wanted = new Map(events.filter(exportable).map((e): [string, CalendarEvent] => [e.id, e]));
      let failed = false;
      try {
        for (const ev of wanted.values()) {
          const hash = hashOf(ev);
          const existing = map[ev.id];
          if (existing && existing.hash === hash) continue;
          const details = toDetails(ev);
          try {
            if (existing) {
              try {
                await Calendar.updateEventAsync(existing.deviceId, details, { futureEvents: true });
                map[ev.id] = { deviceId: existing.deviceId, hash };
                continue;
              } catch {
                // событие удалили на телефоне или сменился тип повтора — пересоздаём
                await safeDelete(existing.deviceId);
                delete map[ev.id];
              }
            }
            const deviceId = await Calendar.createEventAsync(cal.id, details);
            map[ev.id] = { deviceId, hash };
          } catch (e) {
            failed = true;
            console.warn('deviceCalendar: event', e);
          }
        }
        for (const id of Object.keys(map)) {
          if (wanted.has(id)) continue;
          await safeDelete(map[id].deviceId);
          delete map[id];
        }
      } finally {
        all[spaceId] = map;
        await writeMap(all);
      }
      return failed ? 'error' : 'ok';
    } catch (e) {
      console.warn('deviceCalendar: sync', e);
      return 'error';
    }
  });
}

/** Удаляет календарь «Вдвоём» с телефона вместе со всеми выгруженными событиями */
export function removeExportedEvents(): Promise<boolean> {
  return serialize(async () => {
    try {
      const id = await AsyncStorage.getItem(CAL_ID_KEY).catch(() => null);
      if (id && (await hasAccess())) {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        if (calendars.some((c) => c.id === id)) await Calendar.deleteCalendarAsync(id);
      }
      await AsyncStorage.multiRemove([CAL_ID_KEY, MAP_KEY]).catch(() => undefined);
      return true;
    } catch (e) {
      console.warn('deviceCalendar: remove', e);
      return false;
    }
  });
}
