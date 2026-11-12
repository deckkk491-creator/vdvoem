// Проверки расчёта напоминаний о событиях и важных датах.
// Запуск: npx tsx --test tests/reminders.test.mjs   (в CI это делает шаг «Logic tests»)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextReminder, occursOn, planReminders, reminderBody } from '../src/lib/reminders.ts';

const ev = (o) => ({ id: 'e1', kind: 'event', title: 'Кино', emoji: null, starts_on: '2026-11-20', yearly: false, done: false, remind_before: 1, remind_time: '09:00:00', ...o });
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const stamp = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

test('за день до события в заданное время', () => {
  const r = nextReminder(ev({}), at(2026, 11, 12, 10));
  assert.equal(stamp(r.at), '2026-11-19 9:0');
  assert.equal(r.occ, '2026-11-20');
});

test('«не напоминать» и запись без даты — напоминания нет', () => {
  assert.equal(nextReminder(ev({ remind_before: null }), at(2026, 11, 12)), null);
  assert.equal(nextReminder(ev({ kind: 'task', starts_on: null }), at(2026, 11, 12)), null);
});

test('время напоминания уже прошло — разовое событие молчит', () => {
  assert.equal(nextReminder(ev({}), at(2026, 11, 19, 9, 1)), null);
  assert.equal(nextReminder(ev({ remind_before: 0 }), at(2026, 11, 20, 8, 59)) !== null, true);
});

test('выполненная задача не напоминает', () => {
  assert.equal(nextReminder(ev({ kind: 'task', done: true }), at(2026, 11, 12)), null);
});

test('ежегодная дата: в этом году прошла — напомним в следующем', () => {
  const r = nextReminder(ev({ kind: 'date', yearly: true, starts_on: '2020-03-05', remind_before: 3, remind_time: '10:30' }), at(2026, 11, 12));
  assert.equal(stamp(r.at), '2027-3-2 10:30');
  assert.equal(r.occ, '2027-03-05');
});

test('ежегодная дата в начале января, напоминание за неделю — в декабре', () => {
  const e = ev({ kind: 'date', yearly: true, starts_on: '2019-01-03', remind_before: 7 });
  assert.equal(stamp(nextReminder(e, at(2026, 12, 20)).at), '2026-12-27 9:0');
  assert.equal(stamp(nextReminder(e, at(2026, 12, 28)).at), '2027-12-27 9:0');
});

test('29 февраля в невисокосный год — 28 февраля', () => {
  const r = nextReminder(ev({ kind: 'date', yearly: true, starts_on: '2024-02-29', remind_before: 0 }), at(2027, 1, 1));
  assert.equal(stamp(r.at), '2027-2-28 9:0');
});

test('ежегодная дата из будущего не напоминает раньше своего первого года', () => {
  const r = nextReminder(ev({ kind: 'date', yearly: true, starts_on: '2028-06-01', remind_before: 1 }), at(2026, 11, 12));
  assert.equal(stamp(r.at), '2028-5-31 9:0');
});

test('план: по времени и не больше предела', () => {
  const list = [ev({ id: 'b', starts_on: '2026-12-01' }), ev({ id: 'a', starts_on: '2026-11-15' }), ev({ id: 'c', remind_before: null })];
  const plan = planReminders(list, at(2026, 11, 12));
  assert.deepEqual(plan.map((p) => p.id), ['a', 'b']);
  assert.equal(planReminders(list, at(2026, 11, 12), 1).length, 1);
  assert.equal(plan[0].title, '📅 Кино');
});

test('текст напоминания', () => {
  assert.equal(reminderBody(0, '2026-11-20'), 'Сегодня, 20 ноября');
  assert.equal(reminderBody(1, '2026-11-20'), 'Завтра, 20 ноября');
  assert.equal(reminderBody(3, '2026-11-20'), 'Через 3 дня — 20 ноября');
  assert.equal(reminderBody(7, '2026-11-20'), 'Через 7 дней — 20 ноября');
});

test('occursOn: разовые и ежегодные', () => {
  assert.equal(occursOn({ starts_on: '2026-11-12', yearly: false }, '2026-11-12'), true);
  assert.equal(occursOn({ starts_on: '2020-11-12', yearly: false }, '2026-11-12'), false);
  assert.equal(occursOn({ starts_on: '2020-11-12', yearly: true }, '2026-11-12'), true);
  assert.equal(occursOn({ starts_on: '2028-11-12', yearly: true }, '2026-11-12'), false);
  assert.equal(occursOn({ starts_on: '2024-02-29', yearly: true }, '2027-02-28'), true);
});
