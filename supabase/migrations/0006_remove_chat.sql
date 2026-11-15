-- 0006: удаление чата.
-- Переписка между пользователями делает сервис «организатором распространения информации» (ст. 10.1 149-ФЗ)
-- с обязанностью хранить сообщения и метаданные и выдавать их по запросу. Чат убран, чтобы приложение
-- переписку не хранило вовсе. Удаляются таблицы сообщений, отметок «прочитано» и реакций вместе с данными.
-- Файлы чата в бакете space-files (папка <space>/chat/) миграция не трогает — их удаляют из Dashboard → Storage.
-- Можно запускать повторно.

-- Таблицы уходят из публикации realtime сами, триггеры note_deletes и политики удаляются вместе с таблицами
drop table if exists public.message_reactions;
drop table if exists public.message_reads;
drop table if exists public.messages;
drop function if exists public.mark_chat_read(uuid);
drop function if exists public.message_in_space(uuid, uuid);

-- ---------------------------------------------------------------------
--  Пути файлов для удаления аккаунта/пространства: без сообщений
-- ---------------------------------------------------------------------
create or replace function public.my_file_paths()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select a.storage_path from public.attachments a
  where a.storage_path is not null and (
    a.space_id in (select public.my_solo_spaces())
    or (a.parent_type = 'wish' and exists (select 1 from public.wishlist_items w where w.id = a.parent_id and w.owner_id = auth.uid()))
  );
$$;
revoke all on function public.my_file_paths() from public, anon;
grant execute on function public.my_file_paths() to authenticated;

create or replace function public.space_file_paths(p_space uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with ok as (
    select 1 where public.is_space_member(p_space)
      and not exists (select 1 from public.space_members where space_id = p_space and user_id <> auth.uid())
  )
  select storage_path from public.attachments where space_id = p_space and storage_path is not null and exists (select 1 from ok);
$$;
revoke all on function public.space_file_paths(uuid) from public, anon;
grant execute on function public.space_file_paths(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  Хранилище: фото желаний по-прежнему удаляет только автор, папки chat больше нет
-- ---------------------------------------------------------------------
drop policy if exists space_files_delete on storage.objects;
create policy space_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'space-files'
    and public.is_space_member(public.try_uuid((storage.foldername(name))[1]))
    and ((storage.foldername(name))[2] is distinct from 'wish' or owner = auth.uid())
  );

-- ---------------------------------------------------------------------
--  Выход из пространства и удаление аккаунта: без таблиц чата
-- ---------------------------------------------------------------------
create or replace function public.remove_member_data(p_space uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.wishlist_claims   where space_id = p_space and claimed_by = p_user;
  delete from public.wishlist_items    where space_id = p_space and owner_id = p_user;
  delete from public.item_likes        where space_id = p_space and user_id = p_user;
  delete from public.work_days         where space_id = p_space and user_id = p_user;
  update public.calendar_events set assignee = null where space_id = p_space and assignee = p_user;
  delete from public.space_members     where space_id = p_space and user_id = p_user;
end;
$$;
revoke all on function public.remove_member_data(uuid, uuid) from public, anon, authenticated;

create or replace function public.delete_my_data()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 1. Пространства, где он один, — целиком (каскадом уходит всё содержимое)
  delete from public.spaces where id in (select public.my_solo_spaces());

  -- 2. Личное: вишлист, отметки «подарю», лайки, рабочие дни
  delete from public.wishlist_claims   where claimed_by = v_uid;
  delete from public.wishlist_items    where owner_id   = v_uid;
  delete from public.item_likes        where user_id    = v_uid;
  delete from public.work_days         where user_id    = v_uid;

  -- 3. Общее с партнёром остаётся, но без автора
  update public.items                 set created_by = null where created_by = v_uid;
  update public.savings_goals         set created_by = null where created_by = v_uid;
  update public.savings_contributions set user_id    = null where user_id    = v_uid;
  update public.rule_events           set created_by = null where created_by = v_uid;
  update public.calendar_events       set created_by = null where created_by = v_uid;
  update public.calendar_events       set assignee   = null where assignee   = v_uid;
  update public.calendar_events       set done_by    = null where done_by    = v_uid;
  update public.attachments           set created_by = null where created_by = v_uid;
  update public.budget_entries        set created_by = null where created_by = v_uid;

  -- 4. Участие и профиль
  delete from public.space_members where user_id = v_uid;
  delete from public.spaces s where not exists (select 1 from public.space_members m where m.space_id = s.id);
  delete from public.profiles where id = v_uid;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated, service_role;
