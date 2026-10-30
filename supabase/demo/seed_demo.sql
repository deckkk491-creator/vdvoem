-- =====================================================================
--  Вместе — демо-данные для ревьюера Apple (см. store/review-notes.md).
--
--  Что делает: заполняет демо-пространство «Аня и Миша (демо)» примерами во всех
--  разделах и создаёт запасное пространство, в которое ревьюер может вступить по коду.
--  Запускать можно сколько угодно раз: демо-пространство каждый раз пересоздаётся
--  с нуля. Так же восстанавливаем демо, если ревьюер удалил аккаунт или всё поменял.
--
--  Как пользоваться (Supabase → SQL Editor, только проект «vdvoem»):
--   1. Authentication → Users → Add user → Create new user, отметьте «Auto Confirm User»:
--        • ревьюер: почта = значение EXPO_PUBLIC_DEMO_EMAIL, пароль = код доступа для Apple
--          (длинный случайный, не «123456»);
--        • партнёр: любая почта, к которой у вас есть доступ, пароль любой.
--   2. Впишите обе почты в начале блока ниже и нажмите Run.
--   3. Внизу появится таблица с кодом приглашения запасного пространства:
--      он нужен для строки [DEMO_INVITE_CODE] в store/review-notes.md.
--
--  Скрипт не трогает чужие данные: удаляются только пространства, созданные демо-ревьюером,
--  и демо-пространство партнёра. Требует миграции 0001–0004.
-- =====================================================================
do $$
declare
  v_reviewer_email text := 'demo-reviewer@example.com';  -- ← почта ревьюера (как в EXPO_PUBLIC_DEMO_EMAIL)
  v_partner_email  text := 'demo-partner@example.com';   -- ← почта партнёра

  c_main_name  constant text := 'Аня и Миша (демо)';
  c_spare_name constant text := 'Запасное пространство для проверки кода';

  v_a      uuid;  -- ревьюер («Аня»)
  v_b      uuid;  -- партнёр («Миша»)
  v_space  uuid;
  v_spare  uuid;
  v_goal   uuid;
  v_wish_a uuid;
  v_msg    uuid;
begin
  if v_reviewer_email = 'demo-reviewer@example.com' or v_partner_email = 'demo-partner@example.com' then
    raise exception 'Впишите настоящие почты ревьюера и партнёра в начале скрипта (см. комментарий сверху)';
  end if;

  select id into v_a from auth.users where lower(email) = lower(trim(v_reviewer_email));
  select id into v_b from auth.users where lower(email) = lower(trim(v_partner_email));
  if v_a is null then raise exception 'Пользователь % не найден: создайте его в Authentication → Users', v_reviewer_email; end if;
  if v_b is null then raise exception 'Пользователь % не найден: создайте его в Authentication → Users', v_partner_email; end if;
  if v_a = v_b then raise exception 'Почты ревьюера и партнёра должны быть разными'; end if;

  -- Чистим прошлые демо-данные. Пространства удаляются каскадом вместе с записями.
  -- Если ревьюер вступил в запасное пространство, возвращаем его в исходное состояние,
  -- иначе код нельзя было бы проверить второй раз.
  -- (Если ревьюер удалил аккаунт, у его пространства created_by обнуляется, поэтому ищем и по участию партнёра.)
  delete from public.spaces where created_by = v_a;
  delete from public.spaces s
  where s.name = c_main_name
    and (s.created_by = v_b or exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = v_b));
  select id into v_spare from public.spaces where created_by = v_b and name = c_spare_name;
  if v_spare is not null then
    delete from public.space_members where space_id = v_spare and user_id <> v_b;
  end if;

  -- Профили
  insert into public.profiles (id, display_name, avatar_emoji, avatar_color, city)
  values (v_a, 'Аня', '🦊', '#E0623A', 'Москва'),
         (v_b, 'Миша', '🐻', '#3B6E8F', 'Москва')
  on conflict (id) do update
    set display_name = excluded.display_name, avatar_emoji = excluded.avatar_emoji,
        avatar_color = excluded.avatar_color, city = excluded.city;

  -- Основное демо-пространство
  insert into public.spaces (name, invite_code, city, created_by, rule222_enabled, rule222_start)
  values (c_main_name, public.new_invite_code(), 'Москва', v_a, true, current_date - 20)
  returning id into v_space;
  insert into public.space_members (space_id, user_id, role)
  values (v_space, v_a, 'owner'), (v_space, v_b, 'member');

  -- Смотрим вместе
  insert into public.items (space_id, kind, title, note, media_type, status, created_by, created_at) values
    (v_space, 'watch', 'Дюна: Часть вторая',     'Посмотреть на большом экране',  'movie',  'want',     v_a, now() - interval '6 days'),
    (v_space, 'watch', 'Очень странные дела',    'Досмотрели до третьего сезона', 'series', 'watching', v_b, now() - interval '5 days'),
    (v_space, 'watch', 'Паразиты',               'Обсудили за ужином',            'movie',  'watched',  v_a, now() - interval '4 days'),
    (v_space, 'watch', 'Шерлок',                 'Начать с первого сезона',       'series', 'want',     v_b, now() - interval '3 days');

  -- Что приготовить
  insert into public.items (space_id, kind, title, note, tags, created_by, created_at) values
    (v_space, 'recipe', 'Сырники как у бабушки', 'Творог 5%, без ванили',        array['завтрак','быстро'],  v_a, now() - interval '6 days'),
    (v_space, 'recipe', 'Борщ',                  'Со сметаной и чесноком',        array['обед','суп'],        v_b, now() - interval '4 days'),
    (v_space, 'recipe', 'Шарлотка с яблоками',   'К воскресному чаю',             array['десерт','выпечка'],  v_a, now() - interval '2 days');

  -- На выходные
  insert into public.items (space_id, kind, title, note, category, place, event_date, created_by, created_at) values
    (v_space, 'weekend', 'Спектакль «Мастер и Маргарита»', 'Взять билеты заранее',     'театр',    'Драматический театр',  current_date + 9,  v_a, now() - interval '5 days'),
    (v_space, 'weekend', 'Прогулка в парке',               'Взять термос с чаем',      'прогулка', 'Парк Горького',        current_date + 2,  v_b, now() - interval '3 days'),
    (v_space, 'weekend', 'Выставка импрессионистов',       'Лучше в будний вечер',     'выставка', 'Городской музей',      current_date + 16, v_a, now() - interval '2 days'),
    (v_space, 'weekend', 'Ужин в новом ресторане',         'Столик на двоих на 19:00', 'ресторан', null,                   null,              v_b, now() - interval '1 day');

  -- Покупки
  insert into public.items (space_id, kind, title, category, quantity, done, created_by, created_at) values
    (v_space, 'shopping', 'Молоко',              'Продукты', '2 л',       false, v_a, now() - interval '1 day'),
    (v_space, 'shopping', 'Хлеб',                'Продукты', '1 шт',      true,  v_b, now() - interval '1 day'),
    (v_space, 'shopping', 'Яблоки',              'Продукты', '1 кг',      false, v_a, now() - interval '1 day'),
    (v_space, 'shopping', 'Бумажные полотенца',  'Быт',      '2 рулона',  false, v_b, now() - interval '20 hours'),
    (v_space, 'shopping', 'Пластырь',            'Аптека',   '1 упаковка', false, v_a, now() - interval '18 hours');

  -- Миша лайкает записи Ани. Свои лайки ревьюер ставит сам.
  insert into public.item_likes (item_id, user_id, space_id, value)
  select i.id, v_b, v_space, 1
  from public.items i
  where i.space_id = v_space and i.created_by = v_a and i.kind in ('watch', 'recipe', 'weekend');

  -- Копилка
  insert into public.savings_goals (space_id, title, emoji, target_amount, created_by)
  values (v_space, 'Отпуск в Грузии', '🏔️', 150000, v_a)
  returning id into v_goal;
  insert into public.savings_contributions (goal_id, space_id, user_id, amount, note, contributed_on) values
    (v_goal, v_space, v_a, 20000, 'Премия',      current_date - 30),
    (v_goal, v_space, v_b, 15000, 'Кэшбэк',      current_date - 18),
    (v_goal, v_space, v_a, 10000, '',            current_date - 7);

  -- Вишлисты. Желание Миши свободно: ревьюер может нажать «Я подарю».
  -- Желание Ани «занято» Мишей, Аня этого не видит.
  insert into public.wishlist_items (space_id, owner_id, title, price, occasion, note)
  values (v_space, v_a, 'Беспроводные наушники', 8990, 'День рождения', 'Чёрные, с шумоподавлением')
  returning id into v_wish_a;
  insert into public.wishlist_items (space_id, owner_id, title, price, occasion, note) values
    (v_space, v_b, 'Набор для чая',            1800, 'Просто так', 'Улун и пуэр'),
    (v_space, v_b, 'Книга «Маленький принц»',   650, 'Просто так', 'В твёрдой обложке');
  insert into public.wishlist_claims (item_id, space_id, claimed_by) values (v_wish_a, v_space, v_b);

  -- Календарь: событие, две задачи, важная дата
  insert into public.calendar_events (space_id, kind, title, note, emoji, starts_on, start_time, end_time, assignee, created_by) values
    (v_space, 'event', 'Ужин у родителей',          'Принести торт',      '🍲', current_date + 3, '19:00', '22:00', null, v_a),
    (v_space, 'task',  'Купить билеты в театр',      '',                  '🎟️', null,             null,    null,    null, v_b),
    (v_space, 'task',  'Записаться к стоматологу',   'Выбрать удобный день', '🦷', null,           null,    null,    v_b,  v_a);
  insert into public.calendar_events (space_id, kind, title, note, emoji, starts_on, yearly, created_by)
  values (v_space, 'date', 'Годовщина', 'Куда-нибудь сходить вдвоём', '💞', date '2023-06-14', true, v_a);

  -- Правило 2-2-2: одно свидание, одно место, одна страна в истории
  insert into public.rule_events (space_id, kind, title, note, done_on, created_by) values
    (v_space, 'date',    'Ужин в грузинском ресторане', 'Хинкали и хачапури', current_date - 12,  v_a),
    (v_space, 'place',   'Прогулка по Коломенскому',    '',                    current_date - 40,  v_b),
    (v_space, 'country', 'Грузия, Тбилиси',             'Поездка на выходные', current_date - 400, v_a);

  -- Чат
  insert into public.messages (space_id, sender_id, body, created_at) values
    (v_space, v_b, 'Привет! Я добавил борщ в рецепты, посмотри 🙂',          now() - interval '3 hours'),
    (v_space, v_a, 'Класс! В субботу приготовим, а сегодня возьмём хлеб.',    now() - interval '2 hours 30 minutes'),
    (v_space, v_b, 'Договорились. И не забудь про билеты в театр.',           now() - interval '2 hours')
  ;
  insert into public.messages (space_id, sender_id, body, created_at)
  values (v_space, v_a, 'Помню, куплю на этой неделе 🎭', now() - interval '1 hour 40 minutes')
  returning id into v_msg;
  insert into public.message_reactions (message_id, space_id, user_id, emoji) values (v_msg, v_space, v_b, '👍');

  -- Запасное пространство: создаётся один раз, чтобы код в заметках для ревьюера не менялся
  if v_spare is null then
    insert into public.spaces (name, invite_code, city, created_by)
    values (c_spare_name, public.new_invite_code(), 'Москва', v_b)
    returning id into v_spare;
    insert into public.space_members (space_id, user_id, role) values (v_spare, v_b, 'owner');
  end if;
end;
$$;

-- Результат: код запасного пространства (для [DEMO_INVITE_CODE]) и код основного
select name as "Пространство", invite_code as "Код приглашения"
from public.spaces
where name in ('Запасное пространство для проверки кода', 'Аня и Миша (демо)')
order by name;
