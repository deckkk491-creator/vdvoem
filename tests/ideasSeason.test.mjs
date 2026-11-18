// Сезонность идей правила 2-2-2. Запуск: npx tsx --test tests/ideasSeason.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATE_IDEAS, PLACE_IDEAS, inSeason } from '../src/data/ideas.ts';

const titles = (list, month) => list.filter((i) => inSeason(i, new Date(2026, month - 1, 15))).map((i) => i.title);

test('в ноябре нет велосипедов, пикников, сапов и купания', () => {
  const nov = [...titles(DATE_IDEAS, 11), ...titles(PLACE_IDEAS, 11)];
  for (const t of ['Велопрогулка', 'Пикник в парке', 'Сапы или байдарки', 'Озеро или река за городом', 'Кино под открытым небом']) {
    assert.ok(!nov.includes(t), t);
  }
  assert.ok(nov.includes('Каток'));
});

test('летом нет катка и горнолыжного склона, зато есть велосипеды', () => {
  const jul = [...titles(DATE_IDEAS, 7), ...titles(PLACE_IDEAS, 7)];
  assert.ok(!jul.includes('Каток'));
  assert.ok(!jul.includes('Горнолыжный склон'));
  assert.ok(jul.includes('Велопрогулка'));
});

test('в любой месяц выбирать есть из чего', () => {
  for (let m = 1; m <= 12; m++) {
    assert.ok(titles(DATE_IDEAS, m).length >= 20, `свидания, месяц ${m}`);
    assert.ok(titles(PLACE_IDEAS, m).length >= 20, `места, месяц ${m}`);
  }
});
