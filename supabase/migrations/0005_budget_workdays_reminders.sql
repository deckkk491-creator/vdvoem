-- 0005: бюджет, рабочие дни, напоминания и поздравления в календаре, песочный цвет темы.
-- Только добавляет новое: старые версии приложения продолжают работать. Можно запускать повторно.

-- ---------------------------------------------------------------------
--  Календарь: когда напомнить и поздравление на весь экран
--    remind_before — за сколько дней напомнить (0 — в этот день), null — не напоминать
--    remind_time   — во сколько прислать уведомление
--    celebrate     — поздравление при первом открытии приложения в день события
-- ---------------------------------------------------------------------
alter table public.calendar_events add column if not exists remind_before smallint;
alter table public.calendar_events add column if not exists remind_time   time not null default '09:00';
alter table public.calendar_events add column if not exists celebrate     text;
do $$ begin
  alter table public.calendar_events add constraint calendar_remind_check check (remind_before is null or remind_before between 0 and 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.calendar_events add constraint calendar_celebrate_check check (celebrate is null or celebrate in ('fireworks', 'confetti'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
--  Личная тема: песочный цвет
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (
  theme_accent in ('terracotta', 'lavender', 'mint', 'ocean', 'berry', 'sun', 'graphite', 'sand')
  and theme_mode in ('system', 'light', 'dark')
);

-- ---------------------------------------------------------------------
--  Бюджет: расходы и доходы пространства
-- ---------------------------------------------------------------------
create table if not exists public.budget_entries (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  amount      numeric(12, 2) not null check (amount > 0 and amount < 1000000000),
  category    text not null check (char_length(category) between 1 and 40),
  note        text not null default '' check (char_length(note) <= 500),
  spent_on    date not null default current_date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists budget_space_date_idx on public.budget_entries (space_id, spent_on);

drop trigger if exists budget_touch on public.budget_entries;
create trigger budget_touch before update on public.budget_entries
  for each row execute function public.touch_updated_at();
drop trigger if exists budget_keep_owner on public.budget_entries;
create trigger budget_keep_owner before update on public.budget_entries
  for each row execute function public.keep_owner_fields();

alter table public.budget_entries enable row level security;
drop policy if exists budget_select on public.budget_entries;
create policy budget_select on public.budget_entries for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists budget_insert on public.budget_entries;
create policy budget_insert on public.budget_entries for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = auth.uid());
drop policy if exists budget_update on public.budget_entries;
create policy budget_update on public.budget_entries for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
drop policy if exists budget_delete on public.budget_entries;
create policy budget_delete on public.budget_entries for delete to authenticated
  using (public.is_space_member(space_id));

-- ---------------------------------------------------------------------
--  Рабочие дни: каждый отмечает свои, остальные участники их видят
-- ---------------------------------------------------------------------
create table if not exists public.work_days (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id, day)
);
create index if not exists work_days_space_day_idx on public.work_days (space_id, day);

alter table public.work_days enable row level security;
drop policy if exists work_days_select on public.work_days;
create policy work_days_select on public.work_days for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists work_days_insert on public.work_days;
create policy work_days_insert on public.work_days for insert to authenticated
  with check (public.is_space_member(space_id) and user_id = auth.uid());
drop policy if exists work_days_delete on public.work_days;
create policy work_days_delete on public.work_days for delete to authenticated
  using (public.is_space_member(space_id) and user_id = auth.uid());

grant select, insert, update, delete on public.budget_entries to authenticated;
grant select, insert, delete on public.work_days to authenticated;
revoke all on public.budget_entries, public.work_days from anon;

-- ---------------------------------------------------------------------
--  Выход из пространства и удаление аккаунта: учитываем новые таблицы
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
  delete from public.message_reads     where space_id = p_space and user_id = p_user;
  delete from public.message_reactions where space_id = p_space and user_id = p_user;
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

  -- 2. Личное: вишлист, отметки «подарю», лайки, реакции, сообщения, «прочитано», рабочие дни
  delete from public.wishlist_claims   where claimed_by = v_uid;
  delete from public.wishlist_items    where owner_id   = v_uid;
  delete from public.item_likes        where user_id    = v_uid;
  delete from public.message_reactions where user_id    = v_uid;
  delete from public.messages          where sender_id  = v_uid;
  delete from public.message_reads     where user_id    = v_uid;
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

-- ---------------------------------------------------------------------
--  Realtime: изменения и удаления
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['budget_entries', 'work_days'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_note_deletes', t);
    execute format(
      'create trigger %I after delete on public.%I referencing old table as old_rows for each statement execute function public.note_deletes()',
      t || '_note_deletes', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
