-- Проверки миграции 0006: чат удалён, удаление данных работает без него.
-- Порядок: auth_stub.sql → storage_stub.sql → 0001 … 0005 → rls_v2…v5 → 0006 → этот файл.
\set ON_ERROR_STOP 1

-- Таблиц и функций чата больше нет
select not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in ('messages', 'message_reads', 'message_reactions')) as chat_tables_gone;
select not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('mark_chat_read', 'message_in_space')) as chat_functions_gone;
select not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('messages', 'message_reads', 'message_reactions')) as chat_realtime_gone;

insert into auth.users values ('00000000-0000-0000-0000-0000000000a6','a6@x'),('00000000-0000-0000-0000-0000000000b6','b6@x');
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
insert into profiles(id, display_name) values (auth.uid(),'Аня');
select create_space('Без чата') as code \gset
select id as sid from spaces where name = 'Без чата' \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b6',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(:'code') = :'sid'::uuid as joined6;

-- B отмечает рабочий день и записывает расход, потом выходит из пространства: его рабочие дни уходят, расход остаётся
insert into work_days(space_id, user_id, day) values (:'sid', auth.uid(), current_date);
insert into budget_entries(space_id, kind, amount, category, created_by) values (:'sid', 'expense', 100, 'Продукты', auth.uid());
select leave_space(:'sid');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select count(*) = 0 as b_workdays_gone from work_days where space_id = :'sid';
select count(*) = 1 as b_expense_stays from budget_entries where space_id = :'sid';

-- Пути файлов считаются без таблиц чата
select count(*) >= 0 as my_file_paths_ok from my_file_paths();
select count(*) >= 0 as space_file_paths_ok from space_file_paths(:'sid');

-- Удаление аккаунта: пространство, где A одна, уходит целиком
select delete_my_data();
select not exists (select 1 from spaces where id = :'sid') as space_deleted;
select not exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000a6') as profile_deleted;

reset role;
