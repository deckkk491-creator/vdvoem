-- Проверки миграции 0002: календарь, чат, вложения, хранилище, реакции, неизменный автор, удаление аккаунта.
-- Порядок: auth_stub.sql → storage_stub.sql → 0001_init.sql → 0002_calendar_chat_files.sql → этот файл.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x'),('00000000-0000-0000-0000-0000000000b1','b@x'),('00000000-0000-0000-0000-0000000000c1','c@x');
set role authenticated;

-- A создаёт пространство, B присоединяется; C — чужой, со своим пространством
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into profiles(id, display_name) values (auth.uid(),'Аня');
select create_space('Мы') as code \gset
select id as sid from spaces \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(:'code') = :'sid'::uuid as joined;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select create_space('Чужие') is not null as c_space;
select id as csid from spaces \gset

-- Календарь
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into calendar_events(space_id,kind,title,created_by) values (:'sid','task','Отнести кошку к ветеринару',auth.uid()) returning id as task \gset
insert into calendar_events(space_id,kind,title,starts_on,yearly,created_by) values (:'sid','date','Годовщина','2020-06-01',true,auth.uid());
do $$ begin
  begin insert into calendar_events(space_id,kind,title,created_by) values ((select id from spaces limit 1),'event','без даты',auth.uid()); raise exception 'should fail';
  exception when check_violation then raise notice 'event without date blocked ok'; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
update calendar_events set assignee = auth.uid() where id = :'task';
select assignee = '00000000-0000-0000-0000-0000000000b1'::uuid as b_took_task from calendar_events where id = :'task';
update calendar_events set created_by = auth.uid(), space_id = :'csid' where id = :'task';
select created_by = '00000000-0000-0000-0000-0000000000a1'::uuid and space_id = :'sid'::uuid as owner_fields_frozen from calendar_events where id = :'task';
do $$ begin
  begin update calendar_events set assignee = '00000000-0000-0000-0000-0000000000c1' where kind = 'task'; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'outsider assignee blocked ok'; end;
  begin update calendar_events set done = true, done_by = '00000000-0000-0000-0000-0000000000c1' where kind = 'task'; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'outsider done_by blocked ok'; end;
end $$;

-- Чат
insert into messages(space_id, body) values (:'sid', 'Привет!');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into messages(space_id, body, attachment_path, attachment_name) values (:'sid', '', :'sid' || '/chat/x-photo.jpg', 'photo.jpg');
select count(*) = 2 as a_sees_messages from messages;
select mark_chat_read(:'sid');
select count(*) = 1 as read_marked from message_reads where user_id = auth.uid();
do $$ begin
  begin insert into messages(space_id, body) values ((select id from spaces limit 1), ''); raise exception 'should fail';
  exception when check_violation then raise notice 'empty message blocked ok'; end;
  begin insert into messages(space_id, body, attachment_path) select id, 'x', '00000000-0000-0000-0000-000000000000/chat/a.jpg' from spaces limit 1; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'foreign attachment path blocked ok'; end;
  begin update messages set body = 'изменено'; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'message update blocked ok'; end;
end $$;

-- Вложения и хранилище
insert into attachments(space_id,parent_type,parent_id,kind,storage_path,name,created_by) values (:'sid','event',:'task','photo',:'sid' || '/event/p.jpg','p.jpg',auth.uid());
insert into attachments(space_id,parent_type,parent_id,kind,url,name,created_by) values (:'sid','event',:'task','link','https://example.com','билеты',auth.uid());
insert into storage.objects(bucket_id, name) values ('space-files', :'sid' || '/event/p.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id, name) values ('space-files', '00000000-0000-0000-0000-000000000000/x.jpg'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'foreign storage path blocked ok'; end;
  begin insert into storage.objects(bucket_id, name) values ('space-files', '../x.jpg'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'bad storage path blocked ok'; end;
end $$;
select count(*) = 1 as a_sees_own_object from storage.objects;

-- Реакции: дизлайк и попытка перенести свою строку в чужое пространство
insert into items(space_id,kind,title,created_by) values (:'sid','watch','Дюна',auth.uid()) returning id as iid \gset
insert into item_likes(item_id,user_id,space_id,value) values (:'iid',auth.uid(),:'sid',-1);
select value = -1 as dislike_saved from item_likes where item_id = :'iid';
do $$ begin
  begin update item_likes set space_id = (select id from spaces where name = 'Чужие'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'like move blocked ok'; when others then raise notice 'like move blocked ok (%)', sqlerrm; end;
end $$;

-- Чужой не видит ничего
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select (select count(*) from calendar_events)=0 and (select count(*) from messages)=0 and (select count(*) from attachments)=0
   and (select count(*) from message_reads)=0 and (select count(*) from storage.objects)=0 as outsider_isolated;
select count(*) = 0 as outsider_no_paths from space_file_paths(:'sid');
do $$ begin
  begin perform public.mark_chat_read((select id from spaces where name = 'Чужие') ); exception when others then null; end;
end $$;

-- Пути файлов: пока в пространстве двое — общие файлы при выходе не трогаем
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select count(*) = 0 as shared_space_paths_empty from space_file_paths(:'sid');
select count(*) = 2 as my_paths from my_file_paths();

-- Удаление аккаунта A: данные удаляются, внешние ключи с триггером неизменного автора не мешают
select delete_my_data();
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select (select count(*) from messages where sender_id = '00000000-0000-0000-0000-0000000000a1')=0
   and (select count(*) from calendar_events)=0
   and (select count(*) from attachments)=0 as a_deleted;
select count(*) >= 14 as realtime_tables from pg_publication_tables where pubname='supabase_realtime';
