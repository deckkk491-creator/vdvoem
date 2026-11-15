import { parseDate, plural, sameDayInYear } from './format';
import type { CalendarEvent } from './types';

/** Варианты «Когда напомнить»: за сколько дней до события (null — не напоминать) */
export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Не напоминать' },
  { value: 0, label: 'В этот день' },
  { value: 1, label: 'За 1 день' },
  { value: 2, label: 'За 2 дня' },
  { value: 3, label: 'За 3 дня' },
  { value: 7, label: 'За неделю' },
];

export const DEFAULT_REMIND_TIME = '09:00';

/** Сколько напоминаний держим запланированными на телефоне (у iOS общий предел — 64) */
export const MAX_EVENT_REMINDERS = 40;

export type Remindable = Pick<CalendarEvent, 'id' | 'kind' | 'title' | 'emoji' | 'starts_on' | 'yearly' | 'done' | 'remind_before' | 'remind_time'>;

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/**
 * Ближайший момент после `now`, когда нужно напомнить о записи, и день события, к которому он относится.
 * Ежегодные записи напоминают каждый год; у выполненных задач и прошедших разовых событий напоминаний нет.
 */
export function nextReminder(ev: Omit<Remindable, 'id' | 'title' | 'emoji'>, now: Date): { at: Date; occ: string } | null {
  if (ev.remind_before === null || ev.remind_before === undefined || !ev.starts_on) return null;
  if (ev.kind === 'task' && ev.done) return null;
  const [h, m] = (ev.remind_time || DEFAULT_REMIND_TIME).split(':').map(Number);
  const start = ev.starts_on.slice(0, 10);
  const firstYear = Math.max(now.getFullYear(), Number(start.slice(0, 4)));
  // Напоминание «за неделю» о дате в начале января приходится на прошлый год, поэтому смотрим на три года
  const occs = ev.yearly ? [0, 1, 2].map((i) => sameDayInYear(start, firstYear + i)) : [start];
  for (const occ of occs) {
    const d = parseDate(occ);
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ev.remind_before, h || 0, m || 0, 0, 0);
    if (at.getTime() > now.getTime()) return { at, occ };
  }
  return null;
}

/** «Сегодня», «Завтра — 14 ноября», «Через 3 дня — 14 ноября» */
export function reminderBody(before: number, occ: string): string {
  const d = parseDate(occ);
  const date = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (before <= 0) return `Сегодня, ${date}`;
  if (before === 1) return `Завтра, ${date}`;
  return `Через ${before} ${plural(before, 'день', 'дня', 'дней')} — ${date}`;
}

/** «10 ноября в 09:00» */
export function reminderWhenLabel(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const year = at.getFullYear() === new Date().getFullYear() ? '' : ` ${at.getFullYear()}`;
  return `${at.getDate()} ${MONTHS_GEN[at.getMonth()]}${year} в ${hh}:${mm}`;
}

export type PlannedReminder = { id: string; title: string; body: string; at: Date };

/** Что запланировать на телефоне: ближайшие напоминания, не больше `limit` */
export function planReminders(events: Remindable[], now: Date, limit = MAX_EVENT_REMINDERS): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const ev of events) {
    const next = nextReminder(ev, now);
    if (!next) continue;
    out.push({ id: ev.id, title: `${ev.emoji || '📅'} ${ev.title}`, body: reminderBody(ev.remind_before ?? 0, next.occ), at: next.at });
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.slice(0, limit);
}

/** Наступает ли запись сегодня (для ежегодных — в любой год начиная с исходного) */
export function occursOn(ev: Pick<CalendarEvent, 'starts_on' | 'yearly'>, today: string): boolean {
  if (!ev.starts_on) return false;
  const start = ev.starts_on.slice(0, 10);
  if (!ev.yearly) return start === today;
  return start <= today && sameDayInYear(start, Number(today.slice(0, 4))) === today;
}
