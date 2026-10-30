// Проверки расчёта сроков правила 2-2-2 (свидание, новое место, страна).
// Запуск: npx tsx --test tests/rule222.test.mjs   (в CI это делает шаг «Logic tests»)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDate, toISODate } from '../src/lib/format.ts';
import { addInterval, DEFAULT_RHYTHM, everyText, nextDue, progressTo, rhythmOf } from '../src/lib/rule222.ts';

const iso = (d) => toISODate(d);
const day = (s) => parseDate(s);
const ev = (kind, done_on) => ({ id: `${kind}-${done_on}`, kind, done_on });

/** Сегодня плюс n дней (локальная полночь) */
function inDays(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

test('свидание: интервал в неделях, по умолчанию 2 недели', () => {
  assert.equal(iso(addInterval('date', day('2026-10-01'))), '2026-10-15');
  assert.equal(iso(addInterval('date', day('2026-10-01'), 1, { ...DEFAULT_RHYTHM, date: 1 })), '2026-10-08');
  assert.equal(iso(addInterval('date', day('2026-10-01'), 3)), '2026-11-12');
});

test('свидание: шаг назад возвращает предыдущую точку', () => {
  assert.equal(iso(addInterval('date', day('2026-10-15'), -1)), '2026-10-01');
});

test('новое место: конец месяца не «перескакивает» в следующий', () => {
  // 31 января + 2 месяца — 31 марта; 31 декабря + 2 месяца — конец февраля, а не 3 марта
  assert.equal(iso(addInterval('place', day('2026-01-31'))), '2026-03-31');
  assert.equal(iso(addInterval('place', day('2026-12-31'))), '2027-02-28');
  assert.equal(iso(addInterval('place', day('2027-12-31'))), '2028-02-29');
  assert.equal(iso(addInterval('place', day('2026-12-30'), 1, { ...DEFAULT_RHYTHM, place: 1 })), '2027-01-30');
  assert.equal(iso(addInterval('place', day('2027-01-31'), 1, { ...DEFAULT_RHYTHM, place: 1 })), '2027-02-28');
});

test('страна: интервал в годах, 29 февраля переходит на 28 февраля', () => {
  assert.equal(iso(addInterval('country', day('2026-10-30'))), '2028-10-30');
  assert.equal(iso(addInterval('country', day('2024-02-29'), 1, { ...DEFAULT_RHYTHM, country: 1 })), '2025-02-28');
  assert.equal(iso(addInterval('country', day('2024-02-29'), 1, { ...DEFAULT_RHYTHM, country: 4 })), '2028-02-29');
});

test('ближайший срок после отметки — отметка плюс интервал, берётся самая свежая', () => {
  const events = [ev('date', '2026-09-01'), ev('date', '2026-10-01'), ev('date', '2026-09-15')];
  const { due, last } = nextDue('date', '2026-01-01', events);
  assert.equal(iso(last), '2026-10-01');
  assert.equal(iso(due), '2026-10-15');
});

test('отметки других видов срок не сдвигают', () => {
  const events = [ev('place', '2026-10-20'), ev('country', '2026-10-25')];
  const { due, last } = nextDue('date', '2030-01-01', events);
  assert.equal(last, null);
  assert.equal(iso(due), '2030-01-01');
});

test('без отметок срок — ближайшая точка сетки от стартовой даты, сегодня или позже', () => {
  // старт 20 дней назад, шаг 14 дней: точки −20, −6, +8 → ближайшая будущая +8
  const { due, last } = nextDue('date', iso(inDays(-20)), []);
  assert.equal(last, null);
  assert.equal(iso(due), iso(inDays(8)));
});

test('срок, который выпадает на сегодня, остаётся сегодняшним', () => {
  // старт 14 дней назад: точки −14, 0 → срок сегодня
  const { due } = nextDue('date', iso(inDays(-14)), []);
  assert.equal(iso(due), iso(inDays(0)));
});

test('старт в будущем — срок равен старту', () => {
  const { due } = nextDue('place', iso(inDays(30)), []);
  assert.equal(iso(due), iso(inDays(30)));
});

test('свой ритм учитывается: 1-1-1 и 3-3-3', () => {
  assert.equal(iso(nextDue('date', '2026-01-01', [ev('date', '2026-10-01')], { date: 1, place: 1, country: 1 }).due), '2026-10-08');
  assert.equal(iso(nextDue('date', '2026-01-01', [ev('date', '2026-10-01')], { date: 3, place: 3, country: 3 }).due), '2026-10-22');
  assert.equal(iso(nextDue('place', '2026-01-01', [ev('place', '2026-10-01')], { date: 3, place: 3, country: 3 }).due), '2027-01-01');
});

test('ритм пространства: пустые значения заменяются на 2-2-2', () => {
  assert.deepEqual(rhythmOf(null), { date: 2, place: 2, country: 2 });
  assert.deepEqual(rhythmOf({ rule_date_weeks: 0, rule_place_months: null, rule_country_years: undefined }), { date: 2, place: 2, country: 2 });
  assert.deepEqual(rhythmOf({ rule_date_weeks: 1, rule_place_months: 2, rule_country_years: 3 }), { date: 1, place: 2, country: 3 });
});

test('прогресс всегда от 0 до 1', () => {
  for (const offset of [-400, -10, 0, 5, 400]) {
    const p = progressTo('date', inDays(offset));
    assert.ok(p >= 0 && p <= 1, `offset ${offset}: ${p}`);
  }
  assert.equal(progressTo('date', inDays(-100)), 1);
  assert.equal(progressTo('date', inDays(100)), 0);
});

test('подписи ритма склоняются по-русски', () => {
  assert.equal(everyText('date', 1), 'каждую неделю');
  assert.equal(everyText('date', 2), 'каждые 2 недели');
  assert.equal(everyText('date', 5), 'каждые 5 недель');
  assert.equal(everyText('place', 1), 'каждый месяц');
  assert.equal(everyText('place', 3), 'каждые 3 месяца');
  assert.equal(everyText('place', 12), 'каждые 12 месяцев');
  assert.equal(everyText('country', 1), 'каждый год');
  assert.equal(everyText('country', 2), 'каждые 2 года');
  assert.equal(everyText('country', 5), 'каждые 5 лет');
});
