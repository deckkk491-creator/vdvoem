-- =====================================================================
--  Вдвоём — миграция 0003: реакции на сообщения в чате и фото к желаниям.
--  Идемпотентна: можно запускать повторно. Требует 0001 и 0002.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Реакции в чате: одна реакция от человека на сообщение (как в Telegram)
-- ---------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages (id) on delete cascade,
  space_id    uuid not null references public.spaces (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_space_idx on public.message_reactions (space_id);

alter table public.message_reactions enable row level security;

-- Сообщение лежит в том же пространстве, что и реакция
create or replace function public.message_in_space(p_message uuid, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.messages where id = p_message and space_id = p_space);
$$;
revoke all on function public.message_in_space(uuid, uuid) from public, anon;
grant execute on function public.message_in_space(uuid, uuid) to authenticated;

drop policy if exists react_select on public.message_reactions;
create policy react_select on public.message_reactions for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists react_insert on public.message_reactions;
create policy react_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_space_member(space_id) and public.message_in_space(message_id, space_id));
drop policy if exists react_update on public.message_reactions;
create policy react_update on public.message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_space_member(space_id) and public.message_in_space(message_id, space_id));
drop policy if exists react_delete on public.message_reactions;
create policy react_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.message_reactions to authenticated;
revoke all on public.message_reactions from anon;

-- ---------------------------------------------------------------------
--  Фото к желаниям: вложения с parent_type = 'wish'.
--  Добавлять и убирать фото может только владелец желания.
-- ---------------------------------------------------------------------
alter table public.attachments drop constraint if exists attachments_parent_type_check;
alter table public.attachments add constraint attachments_parent_type_check
  check (parent_type in ('item', 'event', 'rule_event', 'wish'));

create or replace function public.owns_wish(p_wish uuid, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.wishlist_items where id = p_wish and space_id = p_space and owner_id = auth.uid());
$$;
revoke all on function public.owns_wish(uuid, uuid) from public, anon;
grant execute on function public.owns_wish(uuid, uuid) to authenticated;

-- Вложение к желанию: только parent_type = 'wish' и только от владельца.
-- Так фото нельзя «подложить» к чужому желанию под другим parent_type.
create or replace function public.wish_attachment_ok(p_parent uuid, p_type text, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.wishlist_items where id = p_parent)
      then p_type = 'wish' and exists (select 1 from public.wishlist_items where id = p_parent and space_id = p_space and owner_id = auth.uid())
    else p_type <> 'wish'
  end;
$$;
revoke all on function public.wish_attachment_ok(uuid, text, uuid) from public, anon;
grant execute on function public.wish_attachment_ok(uuid, text, uuid) to authenticated;

drop policy if exists att_insert on public.attachments;
create policy att_insert on public.attachments for insert to authenticated
  with check (
    public.is_space_member(space_id) and created_by = auth.uid()
    and (storage_path is null or public.try_uuid(split_part(storage_path, '/', 1)) = space_id)
    and public.wish_attachment_ok(parent_id, parent_type, space_id)
  );
drop policy if exists att_delete on public.attachments;
create policy att_delete on public.attachments for delete to authenticated
  using (public.is_space_member(space_id) and (parent_type <> 'wish' or public.owns_wish(parent_id, space_id)));

drop trigger if exists wishlist_drop_attachments on public.wishlist_items;
create trigger wishlist_drop_attachments after delete on public.wishlist_items
  for each row execute function public.drop_attachments_of();

-- ---------------------------------------------------------------------
--  Выход из пространства и удаление данных: убираем и реакции
-- ---------------------------------------------------------------------
create or replace function public.leave_space(p_space uuid)
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

  delete from public.wishlist_claims   where space_id = p_space and claimed_by = v_uid;
  delete from public.wishlist_items    where space_id = p_space and owner_id = v_uid;
  delete from public.item_likes        where space_id = p_space and user_id = v_uid;
  delete from public.message_reads     where space_id = p_space and user_id = v_uid;
  delete from public.message_reactions where space_id = p_space and user_id = v_uid;
  update public.calendar_events set assignee = null where space_id = p_space and assignee = v_uid;
  delete from public.space_members     where space_id = p_space and user_id = v_uid;

  delete from public.spaces s
  where s.id = p_space
    and not exists (select 1 from public.space_members m where m.space_id = s.id);
end;
$$;

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

  delete from public.wishlist_claims       where claimed_by = v_uid;
  delete from public.wishlist_items        where owner_id   = v_uid;
  delete from public.item_likes            where user_id    = v_uid;
  delete from public.items                 where created_by = v_uid;
  delete from public.savings_contributions where user_id    = v_uid;
  delete from public.savings_goals         where created_by = v_uid;
  delete from public.rule_events           where created_by = v_uid;
  delete from public.attachments           where created_by = v_uid;
  delete from public.message_reactions     where user_id    = v_uid;
  delete from public.messages              where sender_id  = v_uid;
  delete from public.message_reads         where user_id    = v_uid;
  delete from public.calendar_events       where created_by = v_uid;
  update public.calendar_events set assignee = null where assignee = v_uid;
  update public.calendar_events set done_by  = null where done_by  = v_uid;
  delete from public.space_members         where user_id    = v_uid;

  delete from public.spaces s
  where not exists (select 1 from public.space_members m where m.space_id = s.id);

  delete from public.profiles where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------
--  Realtime
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;
