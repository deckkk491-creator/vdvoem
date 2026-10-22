-- =====================================================================
--  Вдвоём — начальная схема базы данных (Supabase / PostgreSQL 15+)
--  Запускать целиком в Supabase Dashboard → SQL Editor → New query → Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Таблицы
-- ---------------------------------------------------------------------

-- Профиль пользователя (1:1 с auth.users)
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 40),
  avatar_emoji  text not null default '🙂' check (char_length(avatar_emoji) <= 16),
  avatar_color  text not null default '#E8603C' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  city          text not null default '' check (char_length(city) <= 60),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Пространство: пара или семья
create table if not exists public.spaces (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 60),
  invite_code      text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  city             text not null default '' check (char_length(city) <= 60),
  created_by       uuid references auth.users (id) on delete set null,
  rule222_enabled  boolean not null default false,
  rule222_start    date not null default current_date,
  created_at       timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id   uuid not null references public.spaces (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Универсальная таблица карточек для разделов:
--   watch    — Смотрим вместе
--   recipe   — Что приготовить
--   weekend  — Отдых на выходные
--   shopping — Покупки
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  kind        text not null check (kind in ('watch', 'recipe', 'weekend', 'shopping')),
  title       text not null check (char_length(title) between 1 and 200),
  note        text not null default '' check (char_length(note) <= 2000),
  url         text check (url is null or char_length(url) <= 2000),
  image_url   text check (image_url is null or char_length(image_url) <= 2000),
  -- watch: 'movie' | 'series'
  media_type  text check (media_type is null or media_type in ('movie', 'series')),
  -- watch: 'want' | 'watching' | 'watched'
  status      text check (status is null or status in ('want', 'watching', 'watched')),
  -- weekend: театр/кино/...; shopping: Продукты/Быт/... (свободный текст)
  category    text check (category is null or char_length(category) <= 40),
  tags        text[] not null default '{}',
  place       text check (place is null or char_length(place) <= 200),
  event_date  date,
  quantity    text check (quantity is null or char_length(quantity) <= 40),
  done        boolean not null default false,   -- shopping: куплено
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.item_likes (
  item_id     uuid not null references public.items (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  space_id    uuid not null references public.spaces (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- Копилка
create table if not exists public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 100),
  emoji          text not null default '🐷' check (char_length(emoji) <= 16),
  target_amount  numeric(14, 2) not null check (target_amount > 0),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.savings_contributions (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references public.savings_goals (id) on delete cascade,
  space_id        uuid not null references public.spaces (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  amount          numeric(14, 2) not null check (amount <> 0),
  note            text not null default '' check (char_length(note) <= 200),
  contributed_on  date not null default current_date,
  created_at      timestamptz not null default now()
);

-- Вишлисты
create table if not exists public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  url         text check (url is null or char_length(url) <= 2000),
  price       numeric(14, 2) check (price is null or price >= 0),
  occasion    text check (occasion is null or char_length(occasion) <= 40),
  note        text not null default '' check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

-- «Я подарю» — отдельная таблица, чтобы владелец вишлиста её не видел (RLS)
create table if not exists public.wishlist_claims (
  item_id     uuid primary key references public.wishlist_items (id) on delete cascade,
  space_id    uuid not null references public.spaces (id) on delete cascade,
  claimed_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Правило 2-2-2: журнал выполненных событий
create table if not exists public.rule_events (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  kind        text not null check (kind in ('date', 'place', 'country')),
  title       text not null check (char_length(title) between 1 and 200),
  note        text not null default '' check (char_length(note) <= 1000),
  done_on     date not null default current_date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Индексы
-- ---------------------------------------------------------------------
create index if not exists space_members_user_idx      on public.space_members (user_id);
create index if not exists items_space_kind_idx        on public.items (space_id, kind, created_at desc);
create index if not exists items_created_by_idx        on public.items (created_by);
create index if not exists item_likes_space_idx        on public.item_likes (space_id);
create index if not exists item_likes_user_idx         on public.item_likes (user_id);
create index if not exists savings_goals_space_idx     on public.savings_goals (space_id);
create index if not exists savings_contrib_goal_idx    on public.savings_contributions (goal_id);
create index if not exists savings_contrib_space_idx   on public.savings_contributions (space_id);
create index if not exists wishlist_items_space_idx    on public.wishlist_items (space_id, owner_id);
create index if not exists wishlist_claims_space_idx   on public.wishlist_claims (space_id);
create index if not exists wishlist_claims_user_idx    on public.wishlist_claims (claimed_by);
create index if not exists rule_events_space_idx       on public.rule_events (space_id, kind, done_on desc);

-- ---------------------------------------------------------------------
--  Вспомогательные функции (security definer — обходят RLS, чтобы
--  политики не рекурсировали сами в себя)
-- ---------------------------------------------------------------------
create or replace function public.is_space_member(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = auth.uid()
  );
$$;

create or replace function public.shares_space_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members a
    join public.space_members b on a.space_id = b.space_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.wishlist_owner(p_item uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.wishlist_items where id = p_item;
$$;

create or replace function public.goal_space(p_goal uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.savings_goals where id = p_goal;
$$;

create or replace function public.item_space(p_item uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.items where id = p_item;
$$;

create or replace function public.wishlist_space(p_item uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.wishlist_items where id = p_item;
$$;

-- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  RPC
-- ---------------------------------------------------------------------

-- Создать пространство → вернуть код приглашения
create or replace function public.create_space(p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text;
  v_space    uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- без 0/O/1/I
  v_city     text;
  i          int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Название пространства не может быть пустым' using errcode = '22023';
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.spaces where invite_code = v_code);
  end loop;

  select coalesce(city, '') into v_city from public.profiles where id = v_uid;

  insert into public.spaces (name, invite_code, created_by, city)
  values (left(trim(p_name), 60), v_code, v_uid, coalesce(v_city, ''))
  returning id into v_space;

  insert into public.space_members (space_id, user_id, role)
  values (v_space, v_uid, 'owner');

  return v_code;
end;
$$;

-- Присоединиться по коду → вернуть id пространства
create or replace function public.join_space(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_space  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_space
  from public.spaces
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));

  if v_space is null then
    raise exception 'Пространство с таким кодом не найдено' using errcode = 'P0002';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_space, v_uid, 'member')
  on conflict (space_id, user_id) do nothing;

  return v_space;
end;
$$;

-- Выйти из пространства (пустое пространство удаляется)
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
  delete from public.space_members   where space_id = p_space and user_id = v_uid;

  delete from public.spaces s
  where s.id = p_space
    and not exists (select 1 from public.space_members m where m.space_id = s.id);
end;
$$;

-- Удалить все данные пользователя (Apple 5.1.1(v)).
-- Сам auth-пользователь удаляется Edge Function `delete-account` через service role.
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
  delete from public.space_members         where user_id    = v_uid;

  -- Пространства, в которых никого не осталось
  delete from public.spaces s
  where not exists (select 1 from public.space_members m where m.space_id = s.id);

  delete from public.profiles where id = v_uid;
end;
$$;

revoke all on function public.create_space(text)  from public, anon;
revoke all on function public.join_space(text)    from public, anon;
revoke all on function public.leave_space(uuid)   from public, anon;
revoke all on function public.delete_my_data()    from public, anon;
grant execute on function public.create_space(text)  to authenticated;
grant execute on function public.join_space(text)    to authenticated;
grant execute on function public.leave_space(uuid)   to authenticated;
grant execute on function public.delete_my_data()    to authenticated, service_role;

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.spaces                enable row level security;
alter table public.space_members         enable row level security;
alter table public.items                 enable row level security;
alter table public.item_likes            enable row level security;
alter table public.savings_goals         enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.wishlist_items        enable row level security;
alter table public.wishlist_claims       enable row level security;
alter table public.rule_events           enable row level security;

-- profiles: видеть себя и тех, с кем делишь пространство; менять только себя
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_space_with(id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- spaces: создаются только через create_space(); участники читают и меняют настройки
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select to authenticated
  using (public.is_space_member(id));
drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces for update to authenticated
  using (public.is_space_member(id)) with check (public.is_space_member(id));

-- space_members: видеть состав своих пространств; вступление/выход — через RPC
drop policy if exists members_select on public.space_members;
create policy members_select on public.space_members for select to authenticated
  using (public.is_space_member(space_id));

-- items: всё в рамках своего пространства
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = auth.uid());
drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated
  using (public.is_space_member(space_id));

-- item_likes: видеть лайки своего пространства; ставить/снимать только свои
drop policy if exists likes_select on public.item_likes;
create policy likes_select on public.item_likes for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists likes_insert on public.item_likes;
create policy likes_insert on public.item_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_space_member(space_id)
    and public.item_space(item_id) = space_id
  );
drop policy if exists likes_delete on public.item_likes;
create policy likes_delete on public.item_likes for delete to authenticated
  using (user_id = auth.uid());

-- savings_goals
drop policy if exists goals_select on public.savings_goals;
create policy goals_select on public.savings_goals for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists goals_insert on public.savings_goals;
create policy goals_insert on public.savings_goals for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = auth.uid());
drop policy if exists goals_update on public.savings_goals;
create policy goals_update on public.savings_goals for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
drop policy if exists goals_delete on public.savings_goals;
create policy goals_delete on public.savings_goals for delete to authenticated
  using (public.is_space_member(space_id));

-- savings_contributions
drop policy if exists contrib_select on public.savings_contributions;
create policy contrib_select on public.savings_contributions for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists contrib_insert on public.savings_contributions;
create policy contrib_insert on public.savings_contributions for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and user_id = auth.uid()
    and public.goal_space(goal_id) = space_id
  );
drop policy if exists contrib_delete on public.savings_contributions;
create policy contrib_delete on public.savings_contributions for delete to authenticated
  using (public.is_space_member(space_id) and user_id = auth.uid());

-- wishlist_items: все участники видят; менять — только владелец
drop policy if exists wish_select on public.wishlist_items;
create policy wish_select on public.wishlist_items for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists wish_insert on public.wishlist_items;
create policy wish_insert on public.wishlist_items for insert to authenticated
  with check (owner_id = auth.uid() and public.is_space_member(space_id));
drop policy if exists wish_update on public.wishlist_items;
create policy wish_update on public.wishlist_items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_space_member(space_id));
drop policy if exists wish_delete on public.wishlist_items;
create policy wish_delete on public.wishlist_items for delete to authenticated
  using (owner_id = auth.uid());

-- wishlist_claims: секрет от владельца желания
drop policy if exists claims_select on public.wishlist_claims;
create policy claims_select on public.wishlist_claims for select to authenticated
  using (
    public.is_space_member(space_id)
    and public.wishlist_owner(item_id) is distinct from auth.uid()
  );
drop policy if exists claims_insert on public.wishlist_claims;
create policy claims_insert on public.wishlist_claims for insert to authenticated
  with check (
    claimed_by = auth.uid()
    and public.is_space_member(space_id)
    and public.wishlist_space(item_id) = space_id
    and public.wishlist_owner(item_id) <> auth.uid()
  );
drop policy if exists claims_delete on public.wishlist_claims;
create policy claims_delete on public.wishlist_claims for delete to authenticated
  using (claimed_by = auth.uid());

-- rule_events
drop policy if exists rule_select on public.rule_events;
create policy rule_select on public.rule_events for select to authenticated
  using (public.is_space_member(space_id));
drop policy if exists rule_insert on public.rule_events;
create policy rule_insert on public.rule_events for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = auth.uid());
drop policy if exists rule_delete on public.rule_events;
create policy rule_delete on public.rule_events for delete to authenticated
  using (public.is_space_member(space_id));

-- Привилегии на таблицы (в Supabase выдаются по умолчанию, дублируем явно)
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.spaces, public.space_members, public.items, public.item_likes,
  public.savings_goals, public.savings_contributions, public.wishlist_items,
  public.wishlist_claims, public.rule_events
to authenticated;
-- Настройки пространства: менять можно только эти колонки (не код приглашения и не автора)
revoke insert, update, delete on public.spaces from authenticated;
grant update (name, city, rule222_enabled, rule222_start) on public.spaces to authenticated;
-- Состав участников меняется только через RPC join_space / leave_space
revoke insert, update, delete on public.space_members from authenticated;

-- Анонимам — ничего
revoke all on
  public.profiles, public.spaces, public.space_members, public.items, public.item_likes,
  public.savings_goals, public.savings_contributions, public.wishlist_items,
  public.wishlist_claims, public.rule_events
from anon;

-- ---------------------------------------------------------------------
--  Realtime
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'spaces', 'space_members', 'items', 'item_likes', 'savings_goals',
    'savings_contributions', 'wishlist_items', 'wishlist_claims', 'rule_events', 'profiles'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
