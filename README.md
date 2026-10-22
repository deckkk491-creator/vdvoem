# Вдвоём

Мобильное приложение для пары или семьи: общее пространство со списками, которые все участники видят в реальном времени.

- **Смотрим вместе.** Фильмы и сериалы на вечер, у каждого статус: хотим, смотрим, посмотрели.
- **Что приготовить.** Рецепты по ссылке с любого сайта или из соцсети. Название и фото подставляются сами, есть теги.
- **На выходные.** Идеи, куда сходить: театр, кино, ресторан, прогулка, выставка и так далее. Можно указать место и дату.
- **Копилка.** Общие цели в рублях, история взносов (кто, сколько, когда) и прогресс.
- **Покупки.** Общий список с категориями (можно добавить свои), количеством и отметкой «куплено».
- **Вишлисты.** У каждого участника свой список желаний. Остальные могут тайно нажать «Я подарю», и владелец этого не увидит.
- **Правило 2-2-2.** Включается по желанию. Каждые 2 недели свидание, каждые 2 месяца новое место, каждые 2 года новая страна. Приложение считает сроки, присылает напоминания, предлагает идеи и хранит историю.

Во всех разделах можно ставить ♥. Видно, кто добавил запись и кому она понравилась. Сортировка по лайкам или по новизне.

Технологии: Expo SDK 54, React Native, TypeScript, expo-router и Supabase (Postgres, RLS, Realtime, Edge Functions). Используются только библиотеки, которые работают в Expo Go.

---

## Структура

```
app/                    экраны (expo-router)
  (tabs)/               вкладки: watch, recipes, weekend, savings, shopping, us
  sign-in.tsx           вход по коду из письма
  onboarding.tsx        профиль и создание пространства или вход по коду
  wishlists.tsx         вишлисты
  rule222.tsx           правило 2-2-2 и генератор идей
  settings.tsx          настройки, приглашение, удаление аккаунта
  setup.tsx             экран «не настроен .env»
src/
  components/           UI-кит, карточки, аватары
  providers/            AuthProvider, SpaceProvider (realtime)
  hooks/useItems.ts     загрузка, лайки и CRUD для разделов
  lib/                  supabase, форматирование, уведомления, 2-2-2
  data/ideas.ts         30 идей свиданий, 30 мест, 26 стран
supabase/
  migrations/0001_init.sql        схема, RLS, RPC, realtime
  functions/link-preview/         Open Graph превью ссылок
  functions/delete-account/       полное удаление аккаунта
  tests/                          проверка миграции на обычном Postgres
scripts/make_icons.py   генерирует иконку и сплэш (Pillow)
```

---

## 1. Настройка Supabase (бесплатно)

1. Зарегистрируйтесь на [supabase.com](https://supabase.com) и нажмите **New project**. Придумайте пароль базы и выберите ближайший регион (например, Frankfurt).
2. Создайте таблицы. Откройте **SQL Editor → New query**, вставьте всё содержимое файла `supabase/migrations/0001_init.sql` и нажмите **Run**. В ответ должно прийти `Success. No rows returned`. Повторный запуск ничего не сломает: скрипт идемпотентный.
3. Включите вход по коду:
   - **Authentication → Sign In / Providers → Email**: провайдер Email должен быть включён.
   - **Authentication → Emails → Templates → Magic Link**: замените текст письма, чтобы в нём был код, а не ссылка:
     ```html
     <h2>Код для входа во «Вдвоём»</h2>
     <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
     <p>Код действует 1 час. Если вы не запрашивали вход, просто проигнорируйте письмо.</p>
     ```
     Сделайте то же в шаблоне **Confirm signup**, потому что его получает новый пользователь при первом входе.
   - Убедитесь, что длина кода 6 символов (Authentication → Providers → Email → *Email OTP Length* = 6).
   - Встроенная почта Supabase отправляет всего несколько писем в час. Для реальных пользователей подключите свой SMTP (**Authentication → Emails → SMTP Settings**), например Яндекс 360, Mail.ru для бизнеса, Resend или Brevo.
4. Проверьте Realtime. Миграция сама добавляет таблицы в публикацию `supabase_realtime`. Это видно в **Database → Publications → supabase_realtime**.
5. Задеплойте Edge Functions. Нужен [Supabase CLI](https://supabase.com/docs/guides/cli). На Windows: `scoop install supabase`. На любой системе можно так: `npx supabase ...`.
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-проекта>      # ref есть в URL: https://<ref>.supabase.co
   npx supabase functions deploy link-preview
   npx supabase functions deploy delete-account
   ```
   Ключи `SUPABASE_URL`, `SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY` попадают в функции автоматически, добавлять секреты не нужно.
   Если `link-preview` не задеплоена, рецепты всё равно добавляются, только название придётся ввести вручную. Если не задеплоена `delete-account`, удаляются все данные пользователя, а сама учётная запись остаётся.
6. Скопируйте ключи. Откройте **Project Settings → API**, затем в корне проекта:
   ```bash
   cp .env.example .env
   ```
   и впишите в `.env` значения:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   EXPO_PUBLIC_PRIVACY_URL=https://<ваша-страница>/privacy
   ```
   Anon-ключ можно публиковать: доступ к данным ограничивают RLS-политики. **service_role** ключ в приложение никогда не кладите.

Если `.env` не заполнен, приложение не упадёт, а покажет экран с инструкцией.

## 2. Запуск в Expo Go

```bash
npm install
npx expo start
```

Отсканируйте QR-код камерой iPhone. На телефоне должно быть установлено приложение **Expo Go** из App Store.
Если компьютер и телефон в разных сетях: `npx expo start --tunnel`.

Как проверить вдвоём: войдите на телефоне, создайте пространство, а на втором устройстве (или в Expo Go у партнёра) войдите с другой почтой и введите код приглашения. Новые записи и лайки появляются у второго человека без обновления.

Напоминания правила 2-2-2 — локальные (`expo-notifications`), сервер для них не нужен. Они работают и в Expo Go, и в собранном приложении.

## 3. Сборка и публикация через EAS (без Mac)

1. Создайте аккаунт на [expo.dev](https://expo.dev) и оформите Apple Developer Program ($99 в год).
2. Выполните:
   ```bash
   npm install -g eas-cli
   eas login
   eas init                       # привяжет проект и запишет projectId в app.json
   ```
3. Передайте переменные окружения в EAS: `.env` в облачную сборку не попадает, он в `.gitignore`.
   ```bash
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production --environment preview --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment production --environment preview --visibility plaintext
   eas env:create --name EXPO_PUBLIC_PRIVACY_URL --value https://.../privacy --environment production --environment preview --visibility plaintext
   ```
4. Соберите приложение:
   ```bash
   eas build --platform ios --profile preview      # внутренняя установка по ссылке (нужно зарегистрировать UDID)
   eas build --platform ios --profile production   # для App Store / TestFlight
   ```
   EAS сам предложит войти в Apple-аккаунт и создаст сертификаты и профили. Mac для этого не нужен.
5. Отправьте сборку:
   ```bash
   eas submit --platform ios --latest
   ```
   Сборка появится в App Store Connect → TestFlight. Дальше заполните карточку приложения и отправьте на ревью.

Профили в `eas.json`:
- `development` — внутренняя сборка.
- `preview` — внутренняя установка по ссылке.
- `production` — для App Store, с автоувеличением номера сборки.

Во всех трёх стоит `ios.image: latest`.

### Требования App Store

- **Политика конфиденциальности.** В App Store Connect нужен публичный URL. Подойдёт страница на GitHub Pages, Notion или Telegraph. Опишите, что хранится (почта, имя, город, записи пространства), где хранится (Supabase), что данные не передаются третьим лицам и как их удалить. Тот же URL укажите в `EXPO_PUBLIC_PRIVACY_URL`, тогда в настройках приложения появится ссылка на него.
- **Удаление аккаунта в приложении (Guideline 5.1.1(v)).** Уже реализовано: **Настройки → Удалить аккаунт**. Кнопка вызывает Edge Function `delete-account`. Функция от имени пользователя запускает RPC `delete_my_data()` (удаляет профиль, записи, лайки, вишлист, взносы, членство и опустевшие пространства), а затем через service role удаляет запись в `auth.users`.
- **App Privacy («ярлык конфиденциальности»).** Укажите: *Contact Info → Email*, *User Content*. Данные привязаны к пользователю и не используются для трекинга.
- **Шифрование.** В `app.json` уже стоит `ITSAppUsesNonExemptEncryption: false`.
- **Данные для ревьюера.** Вход по коду из письма, поэтому в *App Review Information* дайте тестовую почту, к которой у ревьюера будет доступ, или объясните, как получить код.

---

## Как устроена безопасность

- Все данные принадлежат пространству. RLS разрешает читать и менять строки только участникам этого пространства (`is_space_member`).
- Пространство создаётся и пополняется участниками только через RPC: `create_space(name)` возвращает 6-значный код, `join_space(code)` добавляет участника. Код приглашения нельзя изменить через API.
- Отметки «Я подарю» хранятся в отдельной таблице `wishlist_claims`. Её SELECT-политика скрывает строки, если вы владелец желания, поэтому сюрприз не раскрывается даже при прямом запросе к API.
- Профили видны только тем, с кем у вас общее пространство.

Проверить миграцию локально на обычном PostgreSQL 15+:
```bash
createdb vdvoem_test
psql -d vdvoem_test -f supabase/tests/auth_stub.sql
psql -d vdvoem_test -f supabase/migrations/0001_init.sql
psql -d vdvoem_test -At -f supabase/tests/rls_test.sql   # все проверки должны вывести «t»
```

## Иконка

`python3 scripts/make_icons.py` заново генерирует `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` и `favicon.png`. Рисунок — два сердца, сторонних изображений нет.
