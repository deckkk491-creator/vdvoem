-- Проверки миграции 0004: укрепление доступа по итогам аудита.
-- Порядок: auth_stub.sql → storage_stub.sql → 0001 → 0002 → 0003 → 0004 → этот файл.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a4','a4@x'),('00000000-0000-0000-0000-0000000000b4','b4@x'),('00000000-0000-0000-0000-0000000000c4','c4@x');
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
insert into profiles(id, display_name) values (auth.uid(),'Аня');
select create_space('Аудит') as code \gset
select length(:'code') = 8 as code_8_chars;
select id as sid from spaces where name = 'Аудит' \gset
select set_config('test.sid', :'sid', false) is not null as sid_set;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(:'code') = :'sid'::uuid as joined4;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c4',false);
select create_space('Чужие4') is not null as c4_space;
select id as csid from spaces where name = 'Чужие4' \gset
select set_config('test.csid', :'csid', false) is not null as csid_set;

-- Чужой не узнаёт, кто состоит в пространстве
select public.is_member_of(:'sid', '00000000-0000-0000-0000-0000000000a4') = false as outsider_no_oracle;
-- Неверный код: null и попытка учтена; после 10 неудач — блок
select join_space('ZZZZZZZZ') is null as wrong_code_null;
do $$ declare i int; begin
  for i in 1..9 loop perform public.join_space('ZZZZZZZZ'); end loop;
  begin perform public.join_space('ZZZZZZZZ'); raise exception 'should fail';
  exception when sqlstate '54000' then raise notice 'join rate limit blocked ok'; end;
end $$;

-- A: цель копилки; B вносит и пытается присвоить цель
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
insert into savings_goals(space_id, title, target_amount, created_by) values (:'sid', 'Отпуск', 100000, auth.uid()) returning id as gid \gset
insert into wishlist_items(space_id, owner_id, title) values (:'sid', auth.uid(), 'Наушники') returning id as wid \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
insert into savings_contributions(goal_id, space_id, user_id, amount) values (:'gid', :'sid', auth.uid(), 5000);
update savings_goals set created_by = auth.uid(), space_id = current_setting('test.csid')::uuid where id = :'gid';
select created_by = '00000000-0000-0000-0000-0000000000a4'::uuid and space_id = :'sid'::uuid as goal_owner_frozen from savings_goals where id = :'gid';

-- «Сделано» от чужого имени
insert into calendar_events(space_id, kind, title, created_by) values (:'sid', 'task', 'Купить корм', auth.uid()) returning id as tid \gset
select set_config('test.tid', :'tid', false) is not null as tid_set;
do $$ begin
  begin update calendar_events set done = true, done_by = '00000000-0000-0000-0000-0000000000a4' where id = current_setting('test.tid')::uuid; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'done_by spoof blocked ok'; end;
end $$;
update calendar_events set done = true, done_by = auth.uid(), done_at = now() where id = :'tid';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
update calendar_events set title = 'Купить корм коту' where id = :'tid';
select done_by = '00000000-0000-0000-0000-0000000000b4'::uuid as partner_done_kept from calendar_events where id = :'tid';

-- «Прочитано» напрямую — нельзя, только через mark_chat_read
do $$ begin
  begin insert into message_reads(space_id, user_id, last_read_at) values (current_setting('test.sid')::uuid, auth.uid(), '2099-01-01'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'read spoof blocked ok'; end;
end $$;
select mark_chat_read(:'sid');
select count(*) = 1 as mark_read_ok from message_reads where user_id = auth.uid() and space_id = :'sid';

-- Вложение к записи чужого пространства
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c4',false);
insert into items(space_id, kind, title, created_by) values (:'csid', 'weekend', 'Чужая идея', auth.uid()) returning id as citem \gset
select set_config('test.citem', :'citem', false) is not null as citem_set;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
do $$ begin
  begin insert into attachments(space_id, parent_type, parent_id, kind, url, created_by)
    values (current_setting('test.sid')::uuid, 'item', current_setting('test.citem')::uuid, 'link', 'https://x.ru', auth.uid()); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'foreign parent attachment blocked ok'; end;
end $$;

-- Хранилище: файл чата A не удаляет B, общий файл события — может
insert into storage.objects(bucket_id, name) values ('space-files', :'sid' || '/chat/a-voice.m4a');
insert into storage.objects(bucket_id, name) values ('space-files', :'sid' || '/event/a-ticket.jpg');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
delete from storage.objects where name = :'sid' || '/chat/a-voice.m4a';
delete from storage.objects where name = :'sid' || '/event/a-ticket.jpg';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select (select count(*) from storage.objects where name = :'sid' || '/chat/a-voice.m4a') = 1
   and (select count(*) from storage.objects where name = :'sid' || '/event/a-ticket.jpg') = 0 as storage_delete_rules;

-- Удаления видны через space_changes только участникам
delete from savings_contributions where goal_id = :'gid';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
delete from savings_contributions where goal_id = :'gid';
select count(*) = 1 as member_sees_change from space_changes where space_id = :'sid' and tbl = 'savings_contributions';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c4',false);
select count(*) = 0 as outsider_no_changes from space_changes where space_id = :'sid';
do $$ begin
  begin insert into space_changes(space_id, tbl) values (current_setting('test.sid')::uuid, 'x'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'space_changes write blocked ok'; end;
end $$;

-- Смена кода и исключение: участник B не может, создатель A — может
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
insert into savings_contributions(goal_id, space_id, user_id, amount) values (:'gid', :'sid', auth.uid(), 7000);
do $$ begin
  begin perform public.rotate_invite_code(current_setting('test.sid')::uuid); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'member rotate blocked ok'; end;
  begin perform public.kick_member(current_setting('test.sid')::uuid, '00000000-0000-0000-0000-0000000000a4'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'member kick blocked ok'; end;
end $$;

-- Удаление аккаунта A: цель остаётся без автора, взнос B на месте
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select length(rotate_invite_code(:'sid')) = 8 as owner_rotated;
select delete_my_data();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
select (select count(*) from savings_goals where id = :'gid' and created_by is null) = 1
   and (select count(*) from savings_contributions where goal_id = :'gid') = 1
   and (select count(*) from wishlist_items where id = :'wid') = 0 as shared_kept_after_delete;

-- Создателя больше нет — управлять может B: C входит по коду, B его исключает
select invite_code as code2 from spaces where id = :'sid' \gset
reset role;
delete from join_attempts;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c4',false);
select join_space(:'code2') = :'sid'::uuid as c_joined;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b4',false);
select kick_member(:'sid', '00000000-0000-0000-0000-0000000000c4');
select count(*) = 1 as only_b_left from space_members where space_id = :'sid';
reset role;
select count(*) >= 15 as realtime_tables4 from pg_publication_tables where pubname='supabase_realtime';
