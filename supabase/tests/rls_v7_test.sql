-- Проверки миграции 0007: новые аккаунты — только с российской почтой.
-- Порядок: … → 0006 → rls_v6_test.sql → 0007 → этот файл.
\set ON_ERROR_STOP 1

-- Российские почты проходят (регистр и пробелы не мешают)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'Anya@Yandex.ru');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'borya@mail.ru');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c7', 'vika@rambler.ru');
select count(*) = 3 as ru_emails_created from auth.users where id in (
  '00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000c7');

-- Иностранная почта и похожий, но чужой домен не проходят
do $$ begin
  begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d7', 'dima@gmail.com'); raise exception 'should fail';
  exception when raise_exception then raise notice 'gmail signup blocked ok'; end;
  begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d7', 'dima@yandex.ru.evil.com'); raise exception 'should fail';
  exception when raise_exception then raise notice 'lookalike domain blocked ok'; end;
  begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d7', 'dima@mail.yandex.ru'); raise exception 'should fail';
  exception when raise_exception then raise notice 'subdomain blocked ok'; end;
end $$;
select not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000d7') as foreign_not_created;

-- Сменить почту на иностранную нельзя, на российскую можно
do $$ begin
  begin update auth.users set email = 'anya@icloud.com' where id = '00000000-0000-0000-0000-0000000000a7'; raise exception 'should fail';
  exception when raise_exception then raise notice 'email change to foreign blocked ok'; end;
end $$;
update auth.users set email = 'anya@ya.ru' where id = '00000000-0000-0000-0000-0000000000a7';
select email = 'anya@ya.ru' as email_change_ru_ok from auth.users where id = '00000000-0000-0000-0000-0000000000a7';

-- Старые аккаунты с иностранной почтой продолжают работать: обновление без смены почты проходит
select count(*) > 0 as old_foreign_accounts_exist from auth.users where email like '%@x';
update auth.users set email = email where email = 'a6@x';
select true as old_foreign_account_update_ok;

-- Исключения: отдельная почта и дополнительный домен
insert into public.signup_allowed_emails (email, note) values ('reviewer@apple-review.test', 'демо');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e7', 'Reviewer@apple-review.test');
select exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e7') as allowed_email_ok;
insert into public.signup_allowed_domains (domain, note) values ('example-ru.ru', 'тест');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'sasha@example-ru.ru');
select exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000f7') as allowed_domain_ok;

-- Приложение списки исключений не видит и не меняет
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b7', false);
do $$ begin
  begin perform 1 from public.signup_allowed_emails; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'allowlist read blocked ok'; end;
  begin insert into public.signup_allowed_domains (domain) values ('gmail.com'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'allowlist write blocked ok'; end;
  begin perform public.signup_email_allowed('x@gmail.com'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'allowlist function blocked ok'; end;
end $$;
reset role;

delete from auth.users where id in ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000b7',
  '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000f7');
delete from public.signup_allowed_emails where email = 'reviewer@apple-review.test';
delete from public.signup_allowed_domains where domain = 'example-ru.ru';
