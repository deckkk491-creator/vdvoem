-- 0007: новые аккаунты — только с российской почтой.
-- 149-ФЗ в ред. 406-ФЗ (с 01.01.2025) и ст. 13.55 КоАП (с 07.07.2026): владелец сайта или приложения
-- регистрирует и авторизует российских пользователей по российскому номеру телефона, через Госуслуги, ЕБС
-- или другую информационную систему, владелец которой — российское лицо. Иностранная почта (Gmail, iCloud,
-- Outlook…) таким способом не считается. Поэтому новый пользователь создаётся только с адресом российского
-- почтового сервиса (Яндекс, Почта Mail.ru, Рамблер) — вход по коду из письма или через Яндекс ID.
--
-- Уже созданные аккаунты не трогаем: закон обратной силы не имеет, их вход по-прежнему работает
-- (проверка срабатывает только при создании пользователя и при смене почты).
--
-- Исключения: таблица signup_allowed_emails (например, демо-аккаунты для ревьюера Apple)
-- и signup_allowed_domains (дополнительные российские домены, если понадобятся). Обе недоступны из приложения.
-- Список доменов по умолчанию продублирован в src/lib/ruEmail.ts — тест tests/ruEmail.test.mjs следит, чтобы они совпадали.
-- Можно запускать повторно.

create table if not exists public.signup_allowed_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '\s' and domain like '%.%'),
  note text
);

create table if not exists public.signup_allowed_emails (
  email text primary key check (email = lower(email) and email like '%@%'),
  note text
);

alter table public.signup_allowed_domains enable row level security;
alter table public.signup_allowed_emails enable row level security;
-- Политик нет и прав нет: из приложения эти таблицы не видны и не меняются
revoke all on public.signup_allowed_domains from anon, authenticated;
revoke all on public.signup_allowed_emails from anon, authenticated;

-- RU_EMAIL_DOMAINS: начало (список сверяется с src/lib/ruEmail.ts)
insert into public.signup_allowed_domains (domain, note) values
  ('yandex.ru', 'Яндекс Почта'),
  ('ya.ru', 'Яндекс Почта'),
  ('yandex.com', 'Яндекс Почта'),
  ('yandex.by', 'Яндекс Почта'),
  ('yandex.kz', 'Яндекс Почта'),
  ('narod.ru', 'Яндекс Почта'),
  ('mail.ru', 'Почта Mail.ru (VK)'),
  ('inbox.ru', 'Почта Mail.ru (VK)'),
  ('list.ru', 'Почта Mail.ru (VK)'),
  ('bk.ru', 'Почта Mail.ru (VK)'),
  ('internet.ru', 'Почта Mail.ru (VK)'),
  ('rambler.ru', 'Рамблер/почта'),
  ('lenta.ru', 'Рамблер/почта'),
  ('autorambler.ru', 'Рамблер/почта'),
  ('myrambler.ru', 'Рамблер/почта'),
  ('ro.ru', 'Рамблер/почта')
on conflict (domain) do nothing;
-- RU_EMAIL_DOMAINS: конец

create or replace function public.signup_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_email is not null and (
    exists (select 1 from public.signup_allowed_emails e where e.email = lower(trim(p_email)))
    or exists (
      select 1 from public.signup_allowed_domains d
      where d.domain = lower(split_part(trim(p_email), '@', 2))
    )
  );
$$;

revoke all on function public.signup_email_allowed(text) from public, anon, authenticated;

create or replace function public.enforce_ru_signup_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Аккаунты без почты (например, по телефону, если его подключат) проверку не проходят здесь —
  -- у них свой способ входа, разрешённый законом.
  if new.email is null or new.email = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = lower(new.email) then
    return new;
  end if;
  if not public.signup_email_allowed(new.email) then
    raise exception 'ru_email_required: новые аккаунты — только с российской почтой'
      using errcode = 'P0001',
            hint = 'Почта Яндекса, Mail.ru или Рамблера, либо вход через Яндекс ID';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_ru_signup_email on auth.users;
create trigger enforce_ru_signup_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_ru_signup_email();
