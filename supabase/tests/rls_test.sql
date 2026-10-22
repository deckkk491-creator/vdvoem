-- Сценарий проверки RLS/RPC. Каждая строка «t» — пройденная проверка.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','a@x'),('00000000-0000-0000-0000-00000000000b','b@x'),('00000000-0000-0000-0000-00000000000c','c@x');
-- A
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into profiles(id, display_name, city) values (auth.uid(),'Аня','Москва');
select create_space('Мы') as code \gset
select :'code' ~ '^[A-Z0-9]{6}$' as code_ok;
select id as sid from spaces \gset
insert into items(space_id,kind,title,created_by) values (:'sid','watch','Дюна',auth.uid());
insert into wishlist_items(space_id,owner_id,title) values (:'sid',auth.uid(),'Книга');
-- B joins
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
insert into profiles(id, display_name) values (auth.uid(),'Боря');
select join_space(lower(:'code')) = :'sid'::uuid as joined;
select count(*) = 2 as b_sees_profiles from profiles;
select id as iid from items \gset
insert into item_likes(item_id,user_id,space_id) values (:'iid',auth.uid(),:'sid');
select id as wid from wishlist_items \gset
insert into wishlist_claims(item_id,space_id,claimed_by) values (:'wid',:'sid',auth.uid());
select count(*) = 1 as b_sees_claim from wishlist_claims;
insert into savings_goals(space_id,title,target_amount,created_by) values (:'sid','Отпуск',100000,auth.uid());
select id as gid from savings_goals \gset
insert into savings_contributions(goal_id,space_id,user_id,amount) values (:'gid',:'sid',auth.uid(),5000);
insert into rule_events(space_id,kind,title,created_by) values (:'sid','date','Кино',auth.uid());
-- A cannot see claim
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select count(*) = 0 as owner_hidden_claim from wishlist_claims;
select count(*) = 1 as a_sees_like from item_likes;
update spaces set rule222_enabled = true where id = :'sid';
-- C outsider
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select (select count(*) from items)=0 and (select count(*) from spaces)=0 and (select count(*) from profiles)=0 and (select count(*) from savings_contributions)=0 as outsider_isolated;
do $$ begin
  begin insert into items(space_id,kind,title,created_by) select id,'watch','x',auth.uid() from (select '00000000-0000-0000-0000-000000000000'::uuid id) s; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'outsider insert blocked ok'; when foreign_key_violation then raise notice 'outsider insert blocked ok (fk)'; end;
end $$;
-- A cannot claim own item
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
do $$ begin
  begin insert into wishlist_claims(item_id,space_id,claimed_by) select id, space_id, auth.uid() from wishlist_items limit 1; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'self-claim blocked ok'; when unique_violation then raise notice 'self-claim blocked (unique)'; end;
end $$;
-- B deletes data
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select delete_my_data();
reset role;
select (select count(*) from space_members)=1 and (select count(*) from wishlist_claims)=0 and (select count(*) from item_likes)=0 and (select count(*) from profiles)=1 as b_deleted;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select leave_space(:'sid');
reset role;
select count(*) = 0 as space_gone from spaces;
select count(*) as realtime_tables from pg_publication_tables where pubname='supabase_realtime';
-- column-level restriction
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select create_space('Снова') is not null as recreated;
update spaces set city = 'Тамбов', rule222_enabled = true;
do $$ begin
  begin update spaces set invite_code = 'AAAAAA'; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'invite_code update blocked ok'; end;
  begin insert into space_members(space_id,user_id) select id, '00000000-0000-0000-0000-00000000000c' from spaces; raise exception 'should fail';
  exception when insufficient_privilege then raise notice 'direct member insert blocked ok'; end;
end $$;
