// Проверки списка российских почт для регистрации.
// Запуск: npx tsx --test tests/ruEmail.test.mjs   (в CI это делает шаг «Logic tests»)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RU_EMAIL_DOMAINS, emailDomain, isRuEmail } from '../src/lib/ruEmail.ts';

test('список в приложении совпадает со списком в миграции 0007', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0007_ru_signup_policy.sql', import.meta.url), 'utf8');
  const block = sql.split('RU_EMAIL_DOMAINS: начало')[1].split('RU_EMAIL_DOMAINS: конец')[0];
  const fromSql = [...block.matchAll(/\('([a-z0-9.-]+)',/g)].map((m) => m[1]);
  assert.deepEqual([...fromSql].sort(), [...RU_EMAIL_DOMAINS].sort());
});

test('российские почты', () => {
  for (const e of ['anya@yandex.ru', ' Borya@Mail.RU ', 'vika@ya.ru', 'g@rambler.ru', 'x@bk.ru']) assert.equal(isRuEmail(e), true, e);
});

test('иностранные и похожие адреса', () => {
  for (const e of ['a@gmail.com', 'a@icloud.com', 'a@outlook.com', 'a@yandex.ru.evil.com', 'a@mail.yandex.ru', 'yandex.ru', '']) {
    assert.equal(isRuEmail(e), false, e);
  }
});

test('домен берётся после последней @', () => {
  assert.equal(emailDomain('"a@b"@Yandex.Ru'), 'yandex.ru');
});
