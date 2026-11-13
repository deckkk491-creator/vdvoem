-- Проверки миграции 0005: бюджет, рабочие дни, напоминания и поздравления, песочный цвет.
-- Порядок: auth_stub.sql → storage_stub.sql → 0001 → 0002 → 0003 → 0004 → 0005 → этот файл.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a5','a5@x'),('00000000-0000-0000-0000-0000000000b5','b5@x'),('00000000-0000-0000-0000-0000000000c5','c5@x');
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
insert into profiles(id, display_name) values (auth.uid(),'Аня');
select create_space('Бюджет') as code \gset
select id as sid from spaces where name = 'Бюджет' \gset
select set_config('test.sid5', :'sid', false) is not null as sid5_set;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b5',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(:'code') = :'sid'::uuid as joined5;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c5',false);
insert into profiles(id, display_name) values (auth.uid(),'Вася');
select create_space('Чужие5') is not null as c5_space;

-- Песочный цвет темы разрешён, выдуманный — нет
update profiles set theme_accent = 'sand' where id = auth.uid();
select theme_accent = 'sand' as sand_accent_ok from profiles where id = auth.uid();
do $$ begin
  begin update profiles set theme_accent = 'neon' where id = auth.uid(); raise exception 'should fail';
  exception when check_violation then raise notice 'unknown accent blocked ok'; end;
end $$;

-- Бюджет: A записывает расход, B видит и правит, автор не подменяется
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
insert into budget_entries(space_id, kind, amount, category, created_by) values (:'sid', 'expense', 1250.50, 'Продукты', auth.uid()) returning id as bid \gset
select set_config('test.bid', :'bid', false) is not null as bid_set;
do $$ begin
  begin insert into budget_entries(space_id, kind, amount, category, created_by) values (current_setting('test.sid5')::uuid, 'expense', 0, 'Продукты', auth.uid()); raise exception 'should fail';
  exception when check_violation then raise notice 'zero amount blocked ok'; end;
end $$;
do $$ begin
  begin insert into budget_entries(space_id, kind, amount, category, created_by) values (current_setting('test.sid5')::uuid, 'income', 100, 'Зарплата', '00000000-0000-0000-0000-0000000000b5'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'budget author spoof blocked ok'; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b5',false);
select count(*) = 1 as partner_sees_budget from budget_entries where space_id = :'sid';
update budget_entries set amount = 1300, created_by = auth.uid() where id = :'bid';
select amount = 1300 and created_by = '00000000-0000-0000-0000-0000000000a5'::uuid as budget_edit_keeps_author from budget_entries where id = :'bid';

-- Чужой не видит и не пишет
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c5',false);
select count(*) = 0 as outsider_no_budget from budget_entries where space_id = :'sid';
do $$ begin
  begin insert into budget_entries(space_id, kind, amount, category, created_by) values (current_setting('test.sid5')::uuid, 'expense', 10, 'Другое', auth.uid()); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'outsider budget insert blocked ok'; end;
end $$;
delete from budget_entries where id = :'bid';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select count(*) = 1 as outsider_cannot_delete_budget from budget_entries where id = :'bid';

-- Рабочие дни: свои отмечаю, чужие — нет; партнёр видит, но удалить не может
insert into work_days(space_id, user_id, day) values (:'sid', auth.uid(), '2026-11-16'), (:'sid', auth.uid(), '2026-11-17');
do $$ begin
  begin insert into work_days(space_id, user_id, day) values (current_setting('test.sid5')::uuid, '00000000-0000-0000-0000-0000000000b5', '2026-11-18'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'work day for partner blocked ok'; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b5',false);
select count(*) = 2 as partner_sees_work_days from work_days where space_id = :'sid';
delete from work_days where space_id = :'sid' and day = '2026-11-16';
select count(*) = 2 as partner_cannot_delete_work_days from work_days where space_id = :'sid';
insert into work_days(space_id, day) values (:'sid', '2026-11-16');
select count(*) = 1 as default_user_is_me from work_days where space_id = :'sid' and user_id = auth.uid();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c5',false);
select count(*) = 0 as outsider_no_work_days from work_days where space_id = :'sid';

-- Календарь: напоминание и поздравление
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
insert into calendar_events(space_id, kind, title, starts_on, yearly, remind_before, remind_time, celebrate, created_by)
  values (:'sid', 'date', 'Годовщина', '2020-11-20', true, 1, '10:30', 'confetti', auth.uid()) returning id as eid \gset
select remind_before = 1 and remind_time = '10:30'::time and celebrate = 'confetti' as reminder_saved from calendar_events where id = :'eid';
insert into calendar_events(space_id, kind, title, starts_on, created_by) values (:'sid', 'event', 'Кино', '2026-11-21', auth.uid()) returning id as eid2 \gset
select remind_before is null and remind_time = '09:00'::time and celebrate is null as reminder_defaults from calendar_events where id = :'eid2';
do $$ begin
  begin update calendar_events set remind_before = 99 where space_id = current_setting('test.sid5')::uuid; raise exception 'should fail';
  exception when check_violation then raise notice 'remind range blocked ok'; end;
end $$;
do $$ begin
  begin update calendar_events set celebrate = 'lasers' where space_id = current_setting('test.sid5')::uuid; raise exception 'should fail';
  exception when check_violation then raise notice 'celebrate kind blocked ok'; end;
end $$;

-- Удаления видны участникам через space_changes
delete from work_days where space_id = :'sid' and user_id = auth.uid() and day = '2026-11-17';
select count(*) = 1 as work_days_delete_noted from space_changes where space_id = :'sid' and tbl = 'work_days';

-- B выходит: его рабочие дни пропадают, бюджет остаётся
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b5',false);
insert into budget_entries(space_id, kind, amount, category, created_by) values (:'sid', 'income', 50000, 'Зарплата', auth.uid());
select leave_space(:'sid');
reset role;
select count(*) = 0 as leaver_work_days_gone from work_days where space_id = :'sid' and user_id = '00000000-0000-0000-0000-0000000000b5';
select count(*) = 2 as budget_stays_after_leave from budget_entries where space_id = :'sid';

-- A удаляет аккаунт: он один в пространстве — уходит всё
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select delete_my_data();
reset role;
select count(*) = 0 as budget_gone_with_space from budget_entries where space_id = :'sid';
