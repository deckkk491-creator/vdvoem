import type { RuleEvent, RuleKind } from './types';
import { parseDate } from './format';

export const RULE_META: Record<RuleKind, { title: string; short: string; emoji: string; hint: string }> = {
  date: {
    title: 'Свидание',
    short: 'каждые 2 недели',
    emoji: '🕯️',
    hint: 'Вечер только для вас двоих — без телефонов и бытовых разговоров.',
  },
  place: {
    title: 'Новое место',
    short: 'каждые 2 месяца',
    emoji: '🧭',
    hint: 'Выходные там, где вы ещё не бывали: в городе или неподалёку.',
  },
  country: {
    title: 'Новая страна',
    short: 'каждые 2 года',
    emoji: '✈️',
    hint: 'Большое путешествие туда, где вы ещё не были вместе.',
  },
};

export function addInterval(kind: RuleKind, from: Date, times = 1): Date {
  const d = new Date(from);
  if (kind === 'date') d.setDate(d.getDate() + 14 * times);
  else if (kind === 'place') d.setMonth(d.getMonth() + 2 * times);
  else d.setFullYear(d.getFullYear() + 2 * times);
  return d;
}

/**
 * Следующая дата: если событие уже отмечалось — последняя отметка + интервал,
 * иначе — ближайшая (сегодня или позже) точка сетки от стартовой даты.
 */
export function nextDue(kind: RuleKind, startISO: string, events: RuleEvent[]): { due: Date; last: Date | null } {
  const mine = events.filter((e) => e.kind === kind).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const last = mine[0] ? parseDate(mine[0].done_on) : null;
  if (last) return { due: addInterval(kind, last), last };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(startISO);
  let due = start;
  let i = 0;
  while (due < today && i < 2000) {
    i += 1;
    due = addInterval(kind, start, i);
  }
  return { due, last: null };
}

export function progressTo(kind: RuleKind, due: Date): number {
  const from = addInterval(kind, due, -1);
  const now = Date.now();
  const p = (now - from.getTime()) / (due.getTime() - from.getTime());
  return Math.max(0, Math.min(1, p));
}
