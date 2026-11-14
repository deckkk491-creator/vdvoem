/**
 * Российские почтовые сервисы, с которыми можно создать новый аккаунт.
 * Закон (149-ФЗ в ред. 406-ФЗ, ст. 13.55 КоАП) не разрешает регистрировать российских пользователей
 * через иностранные сервисы, в том числе иностранную почту. Решение принимает сервер (миграция 0007),
 * здесь список нужен только для подсказки на экране входа. Он должен совпадать со списком в
 * supabase/migrations/0007_ru_signup_policy.sql — это проверяет tests/ruEmail.test.mjs.
 *
 * Уже созданные аккаунты с любой почтой продолжают входить как раньше.
 */
export const RU_EMAIL_DOMAINS = [
  'yandex.ru',
  'ya.ru',
  'yandex.com',
  'yandex.by',
  'yandex.kz',
  'narod.ru',
  'mail.ru',
  'inbox.ru',
  'list.ru',
  'bk.ru',
  'internet.ru',
  'rambler.ru',
  'lenta.ru',
  'autorambler.ru',
  'myrambler.ru',
  'ro.ru',
] as const;

export function emailDomain(email: string): string {
  const at = email.trim().lastIndexOf('@');
  return at < 0 ? '' : email.trim().slice(at + 1).toLowerCase();
}

/** true — почта российского сервиса из списка (новый аккаунт с ней создать можно) */
export function isRuEmail(email: string): boolean {
  return (RU_EMAIL_DOMAINS as readonly string[]).includes(emailDomain(email));
}

export const RU_EMAIL_REQUIRED_TEXT =
  'Новый аккаунт можно создать с почтой Яндекса, Mail.ru или Рамблера — так требует закон. Если ты уже входил с этой почтой раньше, всё работает как прежде.';
