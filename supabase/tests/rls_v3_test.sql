-- Проверки миграции 0003: реакции в чате и фото к желаниям.
-- Порядок: auth_stub.sql → storage_stub.sql → 0001 → 0002 → 0003 → этот файл.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a3','a3@x'),('00000000-0000-0000-0000-0000000000b3','b3@x'),('00000000-0000-0000-0000-0000000000c3','c3@x');
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
insert into profiles(id, display_name) values (auth.uid(),'Аня');
select create_space('Реакции') as code \gset
select id as sid from spaces where name = 'Реакции' \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(:'code') = :'sid'::uuid as joined3;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c3',false);
select create_space('Чужие3') is not null as c3_space;
select id as csid from spaces where name = 'Чужие3' \gset
insert into messages(space_id, body) values (:'csid', 'чужое') returning id as cmid \gset

-- A пишет, B ставит реакцию и меняет её
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
insert into messages(space_id, body) values (:'sid', 'Во сколько будешь?') returning id as mid \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',false);
insert into message_reactions(message_id, space_id, emoji) values (:'mid', :'sid', '❤️');
insert into message_reactions(message_id, space_id, emoji) values (:'mid', :'sid', '😂')
  on conflict (message_id, user_id) do update set emoji = excluded.emoji;
select emoji = '😂' as reaction_changed from message_reactions where message_id = :'mid' and user_id = auth.uid();
do $$ begin
  begin insert into message_reactions(message_id, space_id, emoji, user_id) values ((select id from messages where body = 'Во сколько будешь?'), (select space_id from messages where body = 'Во сколько будешь?'), '👍', '00000000-0000-0000-0000-0000000000a3'); raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'reaction as other user blocked ok'; end;
end $$;
-- Реакция на сообщение из другого пространства под видом своего пространства
select set_config('test.cmid', :'cmid', false) is not null as cmid_set;
select set_config('test.sid', :'sid', false) is not null as sid_set;
do $$ begin
  begin
    insert into message_reactions(message_id, space_id, emoji)
      values (current_setting('test.cmid')::uuid, current_setting('test.sid')::uuid, '🤡');
    raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'foreign message reaction blocked ok'; end;
end $$;

-- A видит реакцию B, но не может её удалить
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select count(*) = 1 as a_sees_reaction from message_reactions where message_id = :'mid';
delete from message_reactions where message_id = :'mid';
select count(*) = 1 as a_cannot_delete_others from message_reactions where message_id = :'mid';
insert into message_reactions(message_id, space_id, emoji) values (:'mid', :'sid', '🔥');
select count(*) = 2 as two_reactions from message_reactions where message_id = :'mid';

-- Чужой не видит реакций
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c3',false);
select count(*) = 0 as outsider_no_reactions from message_reactions;

-- Фото желания: добавляет только владелец
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
insert into wishlist_items(space_id, owner_id, title) values (:'sid', auth.uid(), 'Плёночный фотоаппарат') returning id as wid \gset
insert into attachments(space_id, parent_type, parent_id, kind, storage_path, created_by)
  values (:'sid', 'wish', :'wid', 'photo', :'sid' || '/wish/1.jpg', auth.uid());
select count(*) = 1 as wish_photo_added from attachments where parent_id = :'wid';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',false);
select count(*) = 1 as partner_sees_wish_photo from attachments where parent_id = :'wid';
do $$ begin
  begin insert into attachments(space_id, parent_type, parent_id, kind, storage_path, created_by)
    select space_id, 'wish', id, 'photo', space_id || '/wish/2.jpg', auth.uid() from wishlist_items where title = 'Плёночный фотоаппарат';
    raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'partner wish photo blocked ok'; end;
end $$;
delete from attachments where parent_id = :'wid';
select count(*) = 1 as partner_cannot_delete_wish_photo from attachments where parent_id = :'wid';

-- Удаление сообщения убирает реакции; удаление желания — его вложения
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
delete from wishlist_items where id = :'wid';
select count(*) = 0 as wish_attachments_dropped from attachments where parent_id = :'wid';
delete from messages where id = :'mid';
select count(*) = 0 as reactions_dropped from message_reactions where message_id = :'mid';

-- Выход из пространства убирает свои реакции
insert into messages(space_id, body) values (:'sid', 'ещё') returning id as mid2 \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',false);
insert into message_reactions(message_id, space_id, emoji) values (:'mid2', :'sid', '👍');
select leave_space(:'sid');
reset role;
select count(*) = 0 as leave_drops_reactions from message_reactions where user_id = '00000000-0000-0000-0000-0000000000b3';
select count(*) = 1 as reactions_realtime from pg_publication_tables where pubname='supabase_realtime' and tablename = 'message_reactions';
