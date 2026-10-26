import type { RuleEvent, RuleKind, Space } from './types';
import { parseDate, plural } from './format';

/** Ритм правила: свидание раз в N недель, новое место раз в N месяцев, страна раз в N лет */
export type RuleRhythm = { date: number; place: number; country: number };

export const DEFAULT_RHYTHM: RuleRhythm = { date: 2, place: 2, country: 2 };

export const RHYTHM_LIMITS: Record<RuleKind, { min: number; max: number }> = {
  date: { min: 1, max: 12 },
  place: { min: 1, max: 24 },
  country: { min: 1, max: 10 },
};

/** Готовые варианты; 2-2-2 — рекомендация */
export const RHYTHM_PRESETS: { label: string; rhythm: RuleRhythm }[] = [
  { label: '1-1-1', rhythm: { date: 1, place: 1, country: 1 } },
  { label: '2-2-2', rhythm: { date: 2, place: 2, country: 2 } },
  { label: '3-3-3', rhythm: { date: 3, place: 3, country: 3 } },
  { label: '1-2-3', rhythm: { date: 1, place: 2, country: 3 } },
];

export function rhythmOf(space: Pick<Space, 'rule_date_weeks' | 'rule_place_months' | 'rule_country_years'> | null | undefined): RuleRhythm {
  return {
    date: space?.rule_date_weeks || DEFAULT_RHYTHM.date,
    place: space?.rule_place_months || DEFAULT_RHYTHM.place,
    country: space?.rule_country_years || DEFAULT_RHYTHM.country,
  };
}

export function rhythmLabel(r: RuleRhythm): string {
  return `${r.date}-${r.place}-${r.country}`;
}

export function isDefaultRhythm(r: RuleRhythm): boolean {
  return r.date === 2 && r.place === 2 && r.country === 2;
}

/** «каждые 2 недели», «каждую неделю», «каждые 5 лет» */
export function everyText(kind: RuleKind, n: number): string {
  if (kind === 'date') return n === 1 ? 'каждую неделю' : `каждые ${n} ${plural(n, 'неделю', 'недели', 'недель')}`;
  if (kind === 'place') return n === 1 ? 'каждый месяц' : `каждые ${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
  return n === 1 ? 'каждый год' : `каждые ${n} ${plural(n, 'год', 'года', 'лет')}`;
}

export const RULE_META: Record<RuleKind, { title: string; emoji: string; hint: string; unit: (n: number) => string }> = {
  date: {
    title: 'Свидание',
    emoji: '🕯️',
    hint: 'Вечер только для вас двоих — без телефонов и бытовых разговоров.',
    unit: (n) => plural(n, 'неделя', 'недели', 'недель'),
  },
  place: {
    title: 'Новое место',
    emoji: '🧭',
    hint: 'Выходные там, где вы ещё не бывали: в городе или неподалёку.',
    unit: (n) => plural(n, 'месяц', 'месяца', 'месяцев'),
  },
  country: {
    title: 'Новая страна',
    emoji: '✈️',
    hint: 'Большое путешествие туда, где вы ещё не были вместе.',
    unit: (n) => plural(n, 'год', 'года', 'лет'),
  },
};

export function addInterval(kind: RuleKind, from: Date, times = 1, rhythm: RuleRhythm = DEFAULT_RHYTHM): Date {
  const d = new Date(from);
  if (kind === 'date') {
    d.setDate(d.getDate() + 7 * rhythm.date * times);
    return d;
  }
  // 31 января + 1 месяц = 28/29 февраля, а не 3 марта
  const months = kind === 'place' ? rhythm.place * times : 12 * rhythm.country * times;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

/**
 * Следующая дата: если событие уже отмечалось — последняя отметка + интервал,
 * иначе — ближайшая (сегодня или позже) точка сетки от стартовой даты.
 */
export function nextDue(
  kind: RuleKind,
  startISO: string,
  events: RuleEvent[],
  rhythm: RuleRhythm = DEFAULT_RHYTHM,
): { due: Date; last: Date | null } {
  const mine = events.filter((e) => e.kind === kind).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const last = mine[0] ? parseDate(mine[0].done_on) : null;
  if (last) return { due: addInterval(kind, last, 1, rhythm), last };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(startISO);
  let due = start;
  let i = 0;
  while (due < today && i < 2000) {
    i += 1;
    due = addInterval(kind, start, i, rhythm);
  }
  return { due, last: null };
}

export function progressTo(kind: RuleKind, due: Date, rhythm: RuleRhythm = DEFAULT_RHYTHM): number {
  const from = addInterval(kind, due, -1, rhythm);
  const now = Date.now();
  const p = (now - from.getTime()) / (due.getTime() - from.getTime());
  return Math.max(0, Math.min(1, p));
}
