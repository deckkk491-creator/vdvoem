-- =====================================================================
--  Вдвоём — миграция 0002: календарь и задачи, важные даты, чат,
--  вложения (фото, файлы, ссылки), дизлайки, свой ритм 2-2-2, личная тема.
--  Идемпотентна: можно запускать повторно.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Вспомогательные функции
-- ---------------------------------------------------------------------
create or replace function public.is_member_of(p_space uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.space_members where space_id = p_space and user_id = p_user);
$$;

-- uuid из строки или null (для путей в хранилище)
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.is_member_of(uuid, uuid) from public, anon;
grant execute on function public.is_member_of(uuid, uuid) to authenticated;

-- Автора и пространство записи нельзя подменить при изменении:
-- от created_by зависит, чьи данные удаляются вместе с аккаунтом
create or replace function public.keep_owner_fields()
returns trigger
language plpgsql
as $$
begin
  new.space_id := old.space_id;
  -- обнулить можно (так делает внешний ключ при удалении аккаунта), подменить на другого — нет
  if new.created_by is not null then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
--  Существующие таблицы: новые колонки
-- ---------------------------------------------------------------------

-- Свой ритм правила 2-2-2 (по умолчанию 2 недели · 2 месяца · 2 года)
alter table public.spaces add column if not exists rule_date_weeks    smallint not null default 2;
alter table public.spaces add column if not exists rule_place_months  smallint not null default 2;
alter table public.spaces add column if not exists rule_country_years smallint not null default 2;
do $$ begin
  alter table public.spaces add constraint spaces_rule_ranges check (
    rule_date_weeks between 1 and 12 and rule_place_months between 1 and 24 and rule_country_years between 1 and 10
  );
exception when duplicate_object then null; end $$;
grant update (rule_date_weeks, rule_place_months, rule_country_years) on public.spaces to authenticated;

-- Личная тема оформления
alter table public.profiles add column if not exists theme_accent text not null default 'terracotta';
alter table public.profiles add column if not exists theme_mode   text not null default 'system';
do $$ begin
  alter table public.profiles add constraint profiles_theme_check check (
    theme_accent in ('terracotta', 'lavender', 'mint', 'ocean', 'berry', 'sun', 'graphite')
    and theme_mode in ('system', 'light', 'dark')
  );
exception when duplicate_object then null; end $$;

-- Вишлист: картинка товара (подтягивается по ссылке)
alter table public.wishlist_items add column if not exists image_url text;
do $$ begin
  alter table public.wishlist_items add constraint wishlist_image_len check (image_url is null or char_length(image_url) <= 2000);
exception when duplicate_object then null; end $$;

-- Поездки: дата окончания
alter table public.items add column if not exists end_date date;

-- Реакция: 1 — нравится, -1 — не нравится
alter table public.item_likes add column if not exists value smallint not null default 1;
do $$ begin
  alter table public.item_likes add constraint item_likes_value_check check (value in (1, -1));
exception when duplicate_object then null; end $$;
drop policy if exists likes_update on public.item_likes;
create policy likes_update on public.item_likes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_space_member(space_id) and public.item_space(item_id) = space_id);

-- Отметки 2-2-2 можно дополнять: впечатления, дата, название
drop policy if exists rule_update on public.rule_events;
create policy rule_update on public.rule_events for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- ---------------------------------------------------------------------
--  Календарь: события, задачи и важные даты
--    kind = 'event' — событие с датой (и временем по желанию)
--    kind = 'task'  — задача; дата необязательна; assignee — кто взялся (null — общая)
--    kind = 'date'  — важная дата (годовщина, день рождения), обычно повторяется каждый год
-- ---------------------------------------------------------------------
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  kind        text not null default 'event' check (kind in ('event', 'task', 'date')),
  title       text not null check (char_length(title) between 1 and 200),
  note        text not null default '' check (char_length(note) <= 2000),
  url         text check (url is null or char_length(url) <= 2000),
  emoji       text check (emoji is null or char_length(emoji) <= 16),
  starts_on   date,
  start_time  time,
  end_time    time,
  yearly      boolean not null default false,
  assignee    uuid references auth.users (id) on delete set null,
  done        boolean not null default false,
  done_by     uuid references auth.users (id) on delete set null,
  done_at     timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_date_required check (kind = 'task' or starts_on is not null)
);
create index if not exists calendar_space_date_idx on public.calendar_events (space_id, starts_on);
create index if not exists calendar_space_kind_idx on public.calendar_events (space_id, kind);

drop trigger if exists calendar_touch on public.calendar_events;
create trigger calendar_touch before update on public.calendar_events
  for each row execute function public.touch_updated_at();
drop trigger if exists calendar_keep_owner on public.calendar_events;
create trigger calendar_keep_owner before update on public.calendar_events
  for each row execute function public.keep_owner_fields();
drop trigger if exists items_keep_owner on public.items;
create trigger items_keep_owner before update on public.items
  for each row execute function public.keep_owner_fields();
drop trigger if exists rule_events_keep_owner on public.rule_events;
create trigger rule_events_keep_owner before update on public.rule_events
  for each row execute function public.keep_owner_fields();

alter table public.calendar_events enable row level security;
drop policy if exists cal_select on public.calendar_events;
create policy cal_select on public.calendar_events for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists cal_insert on public.calendar_events;
create policy cal_insert on public.calendar_events for insert to authenticated
  with check (
    public.is_space_member(space_id) and created_by = auth.uid()
    and (assignee is null or public.is_member_of(space_id, assignee))
    and (done_by is null or public.is_member_of(space_id, done_by))
  );
drop policy if exists cal_update on public.calendar_events;
create policy cal_update on public.calendar_events for update to authenticated
  using (public.is_space_member(space_id))
  with check (
    public.is_space_member(space_id)
    and (assignee is null or public.is_member_of(space_id, assignee))
    and (done_by is null or public.is_member_of(space_id, done_by))
  );
drop policy if exists cal_delete on public.calendar_events;
create policy cal_delete on public.calendar_events for delete to authenticated
  using (public.is_space_member(space_id));

-- ---------------------------------------------------------------------
--  Чат
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces (id) on delete cascade,
  sender_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body             text not null default '' check (char_length(body) <= 4000),
  attachment_path  text check (attachment_path is null or char_length(attachment_path) <= 500),
  attachment_name  text check (attachment_name is null or char_length(attachment_name) <= 200),
  attachment_mime  text check (attachment_mime is null or char_length(attachment_mime) <= 120),
  attachment_size  integer,
  image_width      integer,
  image_height     integer,
  created_at       timestamptz not null default now(),
  constraint message_not_empty check (char_length(trim(body)) > 0 or attachment_path is not null)
);
create index if not exists messages_space_time_idx on public.messages (space_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id);

alter table public.messages enable row level security;
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and public.is_space_member(space_id)
    and (attachment_path is null or public.try_uuid(split_part(attachment_path, '/', 1)) = space_id)
  );
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- До какого момента каждый прочитал чат
create table if not exists public.message_reads (
  space_id      uuid not null references public.spaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);
alter table public.message_reads enable row level security;
drop policy if exists reads_select on public.message_reads;
create policy reads_select on public.message_reads for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists reads_insert on public.message_reads;
create policy reads_insert on public.message_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_space_member(space_id));
drop policy if exists reads_update on public.message_reads;
create policy reads_update on public.message_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_space_member(space_id));

-- ---------------------------------------------------------------------
--  Вложения: фото и файлы в хранилище, ссылки
--    parent_type: 'item' (Выходные и др.), 'event' (календарь), 'rule_event' (свидания и поездки)
-- ---------------------------------------------------------------------
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces (id) on delete cascade,
  parent_type   text not null check (parent_type in ('item', 'event', 'rule_event')),
  parent_id     uuid not null,
  kind          text not null check (kind in ('photo', 'file', 'link')),
  storage_path  text check (storage_path is null or char_length(storage_path) <= 500),
  url           text check (url is null or char_length(url) <= 2000),
  name          text not null default '' check (char_length(name) <= 200),
  mime          text check (mime is null or char_length(mime) <= 120),
  size          integer,
  width         integer,
  height        integer,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint attachment_target check (
    (kind = 'link' and url is not null) or (kind <> 'link' and storage_path is not null)
  )
);
create index if not exists attachments_parent_idx on public.attachments (parent_id);
create index if not exists attachments_space_idx on public.attachments (space_id, parent_type);

alter table public.attachments enable row level security;
drop policy if exists att_select on public.attachments;
create policy att_select on public.attachments for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists att_insert on public.attachments;
create policy att_insert on public.attachments for insert to authenticated
  with check (
    public.is_space_member(space_id) and created_by = auth.uid()
    and (storage_path is null or public.try_uuid(split_part(storage_path, '/', 1)) = space_id)
  );
drop policy if exists att_delete on public.attachments;
create policy att_delete on public.attachments for delete to authenticated
  using (public.is_space_member(space_id));

-- Удаляем записи вложений вместе с родителем (файлы в хранилище удаляет приложение)
create or replace function public.drop_attachments_of()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.attachments where parent_id = old.id;
  return old;
end;
$$;
drop trigger if exists items_drop_attachments on public.items;
create trigger items_drop_attachments after delete on public.items
  for each row execute function public.drop_attachments_of();
drop trigger if exists calendar_drop_attachments on public.calendar_events;
create trigger calendar_drop_attachments after delete on public.calendar_events
  for each row execute function public.drop_attachments_of();
drop trigger if exists rule_events_drop_attachments on public.rule_events;
create trigger rule_events_drop_attachments after delete on public.rule_events
  for each row execute function public.drop_attachments_of();

-- ---------------------------------------------------------------------
--  Хранилище файлов: приватный бакет, путь «<space_id>/…»
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('space-files', 'space-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists space_files_select on storage.objects;
create policy space_files_select on storage.objects for select to authenticated
  using (bucket_id = 'space-files' and public.is_space_member(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists space_files_insert on storage.objects;
create policy space_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'space-files' and public.is_space_member(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists space_files_delete on storage.objects;
create policy space_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'space-files' and public.is_space_member(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
--  Привилегии
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.calendar_events, public.messages, public.message_reads, public.attachments to authenticated;
revoke update on public.messages from authenticated;
revoke all on public.calendar_events, public.messages, public.message_reads, public.attachments from anon;

-- ---------------------------------------------------------------------
--  Пути файлов пользователя (для удаления аккаунта) и обновлённые RPC
-- ---------------------------------------------------------------------
-- Все файлы, которые исчезнут вместе с аккаунтом: свои вложения, вложения на своих записях,
-- свои вложения в чате и всё содержимое пространств, где пользователь — единственный участник
create or replace function public.my_file_paths()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with solo as (
    select m.space_id from public.space_members m
    where m.user_id = auth.uid()
      and not exists (select 1 from public.space_members o where o.space_id = m.space_id and o.user_id <> auth.uid())
  )
  select a.storage_path from public.attachments a
  where a.storage_path is not null and (
    a.created_by = auth.uid()
    or a.space_id in (select space_id from solo)
    or exists (select 1 from public.items i where i.id = a.parent_id and i.created_by = auth.uid())
    or exists (select 1 from public.calendar_events e where e.id = a.parent_id and e.created_by = auth.uid())
    or exists (select 1 from public.rule_events r where r.id = a.parent_id and r.created_by = auth.uid())
  )
  union
  select msg.attachment_path from public.messages msg
  where msg.attachment_path is not null and (msg.sender_id = auth.uid() or msg.space_id in (select space_id from solo));
$$;
revoke all on function public.my_file_paths() from public, anon;
grant execute on function public.my_file_paths() to authenticated;

-- Файлы пространства, если вызывающий — его единственный участник (при его выходе пространство удалится).
-- Если в пространстве есть кто-то ещё, возвращает пустой список: общие файлы трогать нельзя.
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
  select storage_path from public.attachments where space_id = p_space and storage_path is not null and exists (select 1 from ok)
  union
  select attachment_path from public.messages where space_id = p_space and attachment_path is not null and exists (select 1 from ok);
$$;
revoke all on function public.space_file_paths(uuid) from public, anon;
grant execute on function public.space_file_paths(uuid) to authenticated;

-- Отметка «прочитано» по часам сервера (часы телефонов могут спешить или отставать)
create or replace function public.mark_chat_read(p_space uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_space_member(p_space) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into public.message_reads (space_id, user_id, last_read_at)
  values (p_space, auth.uid(), now())
  on conflict (space_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke all on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

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

  delete from public.wishlist_claims where space_id = p_space and claimed_by = v_uid;
  delete from public.wishlist_items  where space_id = p_space and owner_id = v_uid;
  delete from public.item_likes      where space_id = p_space and user_id = v_uid;
  delete from public.message_reads   where space_id = p_space and user_id = v_uid;
  update public.calendar_events set assignee = null where space_id = p_space and assignee = v_uid;
  delete from public.space_members   where space_id = p_space and user_id = v_uid;

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
declare
  t text;
begin
  foreach t in array array['calendar_events', 'messages', 'message_reads', 'attachments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
