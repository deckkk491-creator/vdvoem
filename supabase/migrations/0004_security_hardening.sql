-- =====================================================================
--  Вместе — миграция 0004: укрепление доступа по итогам аудита.
--  - служебные функции недоступны без входа; is_member_of отвечает только про свои пространства;
--  - нельзя подменить автора цели копилки, перенести цель или желание в другое пространство;
--  - «сделано» можно отметить только от своего имени; «прочитано» — только через mark_chat_read;
--  - вложение можно прикрепить только к записи своего пространства нужного типа;
--  - файлы чата и фото желаний в хранилище удаляет только их автор;
--  - удаление аккаунта не трогает общие записи партнёра (автор обнуляется);
--  - исключить участника и сменить код приглашения; лимит попыток входа по коду, коды из 8 символов;
--  - удаления сообщаются через таблицу space_changes (с фильтром по пространству),
--    а не DELETE-событиями realtime без фильтра.
--  Идемпотентна. Требует 0001–0003.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Служебные функции: без входа — нельзя
-- ---------------------------------------------------------------------
create or replace function public.is_member_of(p_space uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Про чужие пространства не отвечаем: спрашивающий сам должен быть участником
  select exists (select 1 from public.space_members where space_id = p_space and user_id = auth.uid())
     and exists (select 1 from public.space_members where space_id = p_space and user_id = p_user);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_space_member(uuid)', 'public.shares_space_with(uuid)', 'public.wishlist_owner(uuid)',
    'public.goal_space(uuid)', 'public.item_space(uuid)', 'public.wishlist_space(uuid)',
    'public.is_member_of(uuid, uuid)', 'public.message_in_space(uuid, uuid)', 'public.owns_wish(uuid, uuid)',
    'public.wish_attachment_ok(uuid, text, uuid)', 'public.my_file_paths()', 'public.space_file_paths(uuid)',
    'public.mark_chat_read(uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
--  Неизменные поля: цель копилки и желание не переносятся и не меняют автора
-- ---------------------------------------------------------------------
drop trigger if exists savings_goals_keep_owner on public.savings_goals;
create trigger savings_goals_keep_owner before update on public.savings_goals
  for each row execute function public.keep_owner_fields();

create or replace function public.keep_wish_fields()
returns trigger
language plpgsql
as $$
begin
  new.space_id := old.space_id;
  new.owner_id := old.owner_id;
  return new;
end;
$$;
drop trigger if exists wishlist_items_keep_owner on public.wishlist_items;
create trigger wishlist_items_keep_owner before update on public.wishlist_items
  for each row execute function public.keep_wish_fields();

-- Взнос нельзя перенести в другую цель или пространство и приписать другому
create or replace function public.keep_contribution_fields()
returns trigger
language plpgsql
as $$
begin
  new.space_id := old.space_id;
  new.goal_id := old.goal_id;
  if new.user_id is not null then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists contributions_keep_owner on public.savings_contributions;
create trigger contributions_keep_owner before update on public.savings_contributions
  for each row execute function public.keep_contribution_fields();

-- ---------------------------------------------------------------------
--  «Сделано» — только от своего имени
-- ---------------------------------------------------------------------
create or replace function public.guard_done_by()
returns trigger
language plpgsql
as $$
begin
  if new.done_by is not null and auth.uid() is not null and new.done_by <> auth.uid()
     and (tg_op = 'INSERT' or new.done_by is distinct from old.done_by) then
    raise exception 'Отметить задачу сделанной можно только от своего имени' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists calendar_guard_done_by on public.calendar_events;
create trigger calendar_guard_done_by before insert or update on public.calendar_events
  for each row execute function public.guard_done_by();

-- ---------------------------------------------------------------------
--  «Прочитано» — только через mark_chat_read (по часам сервера)
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.message_reads from authenticated;

-- ---------------------------------------------------------------------
--  Вложения: родитель должен существовать в этом же пространстве и быть нужного типа
-- ---------------------------------------------------------------------
create or replace function public.attachment_parent_ok(p_type text, p_parent uuid, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'item'       then exists (select 1 from public.items           where id = p_parent and space_id = p_space)
    when 'event'      then exists (select 1 from public.calendar_events where id = p_parent and space_id = p_space)
    when 'rule_event' then exists (select 1 from public.rule_events     where id = p_parent and space_id = p_space)
    when 'wish'       then exists (select 1 from public.wishlist_items  where id = p_parent and space_id = p_space and owner_id = auth.uid())
    else false
  end;
$$;
revoke all on function public.attachment_parent_ok(text, uuid, uuid) from public, anon;
grant execute on function public.attachment_parent_ok(text, uuid, uuid) to authenticated;

drop policy if exists att_insert on public.attachments;
create policy att_insert on public.attachments for insert to authenticated
  with check (
    public.is_space_member(space_id) and created_by = auth.uid()
    and (storage_path is null or public.try_uuid(split_part(storage_path, '/', 1)) = space_id)
    and public.attachment_parent_ok(parent_type, parent_id, space_id)
  );

-- ---------------------------------------------------------------------
--  Хранилище: файлы чата и фото желаний удаляет только автор
--  (остальные вложения общие — их удаляет тот, кто удаляет запись)
-- ---------------------------------------------------------------------
drop policy if exists space_files_delete on storage.objects;
create policy space_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'space-files'
    and public.is_space_member(public.try_uuid((storage.foldername(name))[1]))
    and (
      (storage.foldername(name))[2] is distinct from 'chat' and (storage.foldername(name))[2] is distinct from 'wish'
      or owner = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
--  Участники: исключить и сменить код приглашения
-- ---------------------------------------------------------------------
-- Кто может управлять пространством: владелец, а если владельца в нём уже нет — любой участник
create or replace function public.can_manage_space(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.space_members where space_id = p_space and user_id = auth.uid())
     and (
       exists (select 1 from public.space_members where space_id = p_space and user_id = auth.uid() and role = 'owner')
       or not exists (select 1 from public.space_members where space_id = p_space and role = 'owner')
     );
$$;
revoke all on function public.can_manage_space(uuid) from public, anon;
grant execute on function public.can_manage_space(uuid) to authenticated;

-- Убирает участника и его личное в пространстве (как выход). Без проверок — вызывается из RPC ниже.
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
  delete from public.message_reads     where space_id = p_space and user_id = p_user;
  delete from public.message_reactions where space_id = p_space and user_id = p_user;
  update public.calendar_events set assignee = null where space_id = p_space and assignee = p_user;
  delete from public.space_members     where space_id = p_space and user_id = p_user;
end;
$$;
revoke all on function public.remove_member_data(uuid, uuid) from public, anon, authenticated;

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
  perform public.remove_member_data(p_space, v_uid);
  delete from public.spaces s
  where s.id = p_space
    and not exists (select 1 from public.space_members m where m.space_id = s.id);
end;
$$;
revoke all on function public.leave_space(uuid) from public, anon;
grant execute on function public.leave_space(uuid) to authenticated;

create or replace function public.kick_member(p_space uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_user = auth.uid() then
    raise exception 'Чтобы уйти самому, выбери «Выйти из пространства»' using errcode = '22023';
  end if;
  if not public.can_manage_space(p_space) then
    raise exception 'Исключать участников может только создатель пространства' using errcode = '42501';
  end if;
  if not exists (select 1 from public.space_members where space_id = p_space and user_id = p_user) then
    return;
  end if;
  perform public.remove_member_data(p_space, p_user);
end;
$$;
revoke all on function public.kick_member(uuid, uuid) from public, anon;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- Коды приглашения: 6–10 символов (новые — 8)
alter table public.spaces drop constraint if exists spaces_invite_code_check;
do $$ begin
  alter table public.spaces add constraint spaces_invite_code_check check (invite_code ~ '^[A-Z0-9]{6,10}$');
exception when duplicate_object then null; end $$;

create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- без 0/O/1/I
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.spaces where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.new_invite_code() from public, anon, authenticated;

create or replace function public.create_space(p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_space uuid;
  v_city  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Название пространства не может быть пустым' using errcode = '22023';
  end if;
  v_code := public.new_invite_code();
  select coalesce(city, '') into v_city from public.profiles where id = v_uid;
  insert into public.spaces (name, invite_code, created_by, city)
  values (left(trim(p_name), 60), v_code, v_uid, coalesce(v_city, ''))
  returning id into v_space;
  insert into public.space_members (space_id, user_id, role) values (v_space, v_uid, 'owner');
  return v_code;
end;
$$;
revoke all on function public.create_space(text) from public, anon;
grant execute on function public.create_space(text) to authenticated;

create or replace function public.rotate_invite_code(p_space uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.can_manage_space(p_space) then
    raise exception 'Менять код может только создатель пространства' using errcode = '42501';
  end if;
  v_code := public.new_invite_code();
  update public.spaces set invite_code = v_code where id = p_space;
  return v_code;
end;
$$;
revoke all on function public.rotate_invite_code(uuid) from public, anon;
grant execute on function public.rotate_invite_code(uuid) to authenticated;

-- Попытки входа по коду: не больше 10 за 10 минут
create table if not exists public.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists join_attempts_user_idx on public.join_attempts (user_id, at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Неверный код возвращает null (а не ошибку), чтобы попытка сохранилась для лимита
create or replace function public.join_space(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_space uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.join_attempts where user_id = v_uid and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Слишком много попыток. Подожди 10 минут и попробуй снова' using errcode = '54000';
  end if;

  select id into v_space
  from public.spaces
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));

  if v_space is null then
    insert into public.join_attempts (user_id) values (v_uid);
    delete from public.join_attempts where at < now() - interval '1 day';
    return null;
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_space, v_uid, 'member')
  on conflict (space_id, user_id) do nothing;
  return v_space;
end;
$$;
revoke all on function public.join_space(text) from public, anon;
grant execute on function public.join_space(text) to authenticated;

-- ---------------------------------------------------------------------
--  Удаление аккаунта: общие записи партнёра остаются (автор обнуляется)
-- ---------------------------------------------------------------------
-- Пространства, где пользователь один (их удаляем целиком)
create or replace function public.my_solo_spaces()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.space_id from public.space_members m
  where m.user_id = auth.uid()
    and not exists (select 1 from public.space_members o where o.space_id = m.space_id and o.user_id <> auth.uid());
$$;
revoke all on function public.my_solo_spaces() from public, anon;
grant execute on function public.my_solo_spaces() to authenticated;

-- Файлы, которые исчезнут вместе с аккаунтом: всё из пространств, где он один,
-- вложения его сообщений в чате и фото его желаний. Общие вложения остаются партнёру.
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
  )
  union
  select msg.attachment_path from public.messages msg
  where msg.attachment_path is not null
    and (msg.sender_id = auth.uid() or msg.space_id in (select public.my_solo_spaces()));
$$;
revoke all on function public.my_file_paths() from public, anon;
grant execute on function public.my_file_paths() to authenticated;

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

  -- 2. Личное: вишлист, отметки «подарю», лайки, реакции, сообщения, «прочитано»
  delete from public.wishlist_claims   where claimed_by = v_uid;
  delete from public.wishlist_items    where owner_id   = v_uid;
  delete from public.item_likes        where user_id    = v_uid;
  delete from public.message_reactions where user_id    = v_uid;
  delete from public.messages          where sender_id  = v_uid;
  delete from public.message_reads     where user_id    = v_uid;

  -- 3. Общее с партнёром остаётся, но без автора
  update public.items                 set created_by = null where created_by = v_uid;
  update public.savings_goals         set created_by = null where created_by = v_uid;
  update public.savings_contributions set user_id    = null where user_id    = v_uid;
  update public.rule_events           set created_by = null where created_by = v_uid;
  update public.calendar_events       set created_by = null where created_by = v_uid;
  update public.calendar_events       set assignee   = null where assignee   = v_uid;
  update public.calendar_events       set done_by    = null where done_by    = v_uid;
  update public.attachments           set created_by = null where created_by = v_uid;

  -- 4. Участие и профиль
  delete from public.space_members where user_id = v_uid;
  delete from public.spaces s where not exists (select 1 from public.space_members m where m.space_id = s.id);
  delete from public.profiles where id = v_uid;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated, service_role;

-- ---------------------------------------------------------------------
--  Удаления → space_changes (realtime с фильтром по пространству)
-- ---------------------------------------------------------------------
create table if not exists public.space_changes (
  space_id   uuid not null,
  tbl        text not null,
  changed_at timestamptz not null default now(),
  primary key (space_id, tbl)
);
alter table public.space_changes enable row level security;
drop policy if exists changes_select on public.space_changes;
create policy changes_select on public.space_changes for select to authenticated
  using (public.is_space_member(space_id));
revoke all on public.space_changes from anon;
revoke insert, update, delete on public.space_changes from authenticated;
grant select on public.space_changes to authenticated;

create or replace function public.note_deletes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.space_changes (space_id, tbl, changed_at)
  select distinct o.space_id, tg_table_name, now() from old_rows o where o.space_id is not null
  on conflict (space_id, tbl) do update set changed_at = excluded.changed_at;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  -- wishlist_claims намеренно нет: владелец желания не должен узнавать, что подарок «освободили»
  foreach t in array array['items', 'item_likes', 'savings_goals', 'savings_contributions', 'wishlist_items',
                           'rule_events', 'calendar_events', 'messages', 'attachments', 'message_reactions',
                           'space_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_note_deletes', t);
    execute format(
      'create trigger %I after delete on public.%I referencing old table as old_rows for each statement execute function public.note_deletes()',
      t || '_note_deletes', t);
  end loop;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_changes'
  ) then
    alter publication supabase_realtime add table public.space_changes;
  end if;
end;
$$;
