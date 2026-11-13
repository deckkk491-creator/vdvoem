// Проверки разбора QR-кода кассового чека.
// Запуск: npx tsx --test tests/receipt.test.mjs   (в CI это делает шаг «Logic tests»)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReceipt } from '../src/lib/receipt.ts';

test('обычный QR-код бумажного чека', () => {
  assert.deepEqual(parseReceipt('t=20261112T1830&s=1234.50&fn=7380440700000000&i=12345&fp=1234567890&n=1'), {
    amount: 1234.5,
    date: '2026-11-12',
    time: '18:30',
    kind: 'expense',
  });
});

test('время с секундами и целая сумма', () => {
  const r = parseReceipt('t=20260105T093015&s=499&fn=1&i=2&fp=3&n=1');
  assert.equal(r.amount, 499);
  assert.equal(r.date, '2026-01-05');
  assert.equal(r.time, '09:30');
});

test('возврат покупки — доход', () => {
  assert.equal(parseReceipt('t=20261112T1830&s=100.00&fn=1&i=2&fp=3&n=2').kind, 'income');
});

test('без признака расчёта считаем покупкой', () => {
  assert.equal(parseReceipt('t=20261112T1830&s=100.00&fn=1&i=2&fp=3').kind, 'expense');
});

test('ссылка из электронного чека, в том числе закодированная', () => {
  assert.equal(parseReceipt('https://check.ofd.ru/rec/x?t=20261112T1830&s=250.10&fn=1&i=2&fp=3&n=1').amount, 250.1);
  assert.equal(parseReceipt('https://lk.platformaofd.ru/web/noauth/cheque?t%3D20261112T1830%26s%3D77.00%26fn%3D1%26n%3D1').amount, 77);
});

test('параметры в другом порядке и в тексте письма', () => {
  const r = parseReceipt('Ваш чек: fn=1 i=2 s=10.00 t=20261112T0800 n=1');
  assert.equal(r.amount, 10);
  assert.equal(r.time, '08:00');
});

test('не чек — null', () => {
  assert.equal(parseReceipt(''), null);
  assert.equal(parseReceipt('https://example.com'), null);
  assert.equal(parseReceipt('t=20261112T1830'), null);
  assert.equal(parseReceipt('t=2026-11-12&s=10'), null);
  assert.equal(parseReceipt('t=20261312T1830&s=10'), null);
  assert.equal(parseReceipt('t=20261112T1830&s=0'), null);
  assert.equal(parseReceipt('t=20261112T1830&s=abc'), null);
});
