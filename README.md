# Вместе

Мобильное приложение для пары или семьи: общее пространство со списками, которые все участники видят в реальном времени.

- **Календарь.** Общие события, задачи («Я сделаю») и важные даты. По желанию события попадают в календарь iPhone (на Android этой функции пока нет).
- **Смотрим вместе.** Фильмы и сериалы на вечер, у каждого статус: хотим, смотрим, посмотрели.
- **Что приготовить.** Рецепты по ссылке с любого сайта или из соцсети. Название и фото подставляются сами, есть теги.
- **На выходные.** Идеи, куда сходить: театр, кино, ресторан, прогулка, выставка и так далее. Можно указать место и дату.
- **Копилка.** Общие цели в рублях, история взносов (кто, сколько, когда) и прогресс.
- **Покупки.** Общий список с категориями (можно добавить свои), количеством и отметкой «куплено».
- **Вишлисты.** У каждого участника свой список желаний. Остальные могут тайно нажать «Я подарю», и владелец этого не увидит.
- **Правило 2-2-2.** Включается по желанию. Каждые 2 недели свидание, каждые 2 месяца новое место, каждые 2 года новая страна. Приложение считает сроки, присылает напоминания, предлагает идеи и хранит историю.
- **Чат.** Сообщения, фото, документы и голосовые только для участников пространства. Можно пожаловаться на сообщение.

Во всех разделах можно ставить ♥. Видно, кто добавил запись и кому она понравилась. Сортировка по лайкам или по новизне. Пространством управляют в настройках: приглашение по коду (код можно сменить), список участников с кнопкой «Исключить», выход из пространства и удаление аккаунта.

Технологии: Expo SDK 58, React Native 0.88, TypeScript, expo-router и Supabase (Postgres, RLS, Realtime, Edge Functions). Используются только библиотеки, которые работают в Expo Go.

---

## Структура

```
app/                    экраны (expo-router)
  (tabs)/               вкладки: calendar, watch, recipes, weekend, shopping, us («Мы»)
  sign-in.tsx           вход по коду или ссылке из письма (и демо-вход для ревьюера)
  auth-callback.tsx     вход по ссылке из письма
  onboarding.tsx        профиль и создание пространства или вход по коду
  chat.tsx              чат пространства
  events.tsx, tasks.tsx, dates.tsx   события, задачи, важные даты (из вкладки «Мы»)
  savings.tsx           копилка
  wishlists.tsx         вишлисты
  rule222.tsx           правило 2-2-2 и генератор идей
  settings.tsx          настройки, приглашение, участники, удаление аккаунта
  setup.tsx             экран «не настроен .env»
src/
  components/           UI-кит, карточки, календарь, чат, аватары
  providers/            AuthProvider, SpaceProvider (realtime)
  hooks/                загрузка, лайки и CRUD для разделов, календарь, чат, реакции
  lib/                  supabase, вход по ссылке, файлы, уведомления, 2-2-2
  data/                 идеи для 2-2-2, фото блюд и мест
supabase/
  migrations/           0001 схема, RLS, RPC · 0002 календарь, чат, файлы · 0003 реакции, фото желаний · 0004 защита по итогам аудита
  functions/link-preview/         Open Graph превью ссылок
  functions/delete-account/       полное удаление аккаунта
  tests/                          проверки RLS на обычном Postgres (запускает CI)
  demo/seed_demo.sql              демо-данные для ревьюера Apple
store/                  тексты для App Store Connect и Google Play, App Privacy, заметки для ревью
docs/                   политика конфиденциальности и поддержка (GitHub Pages)
scripts/                иконка и сплэш (make_icons.py), сбор фото (fetch_photos.py)
```

---

## 1. Настройка Supabase (бесплатно)

1. Зарегистрируйтесь на [supabase.com](https://supabase.com) и нажмите **New project**. Придумайте пароль базы и выберите ближайший регион (например, Frankfurt).
2. Создайте таблицы. Откройте **SQL Editor → New query** и по очереди, по одному файлу, запустите (**Run**) всё содержимое `supabase/migrations/0001_init.sql`, `0002_calendar_chat_files.sql`, `0003_reactions_wish_photos.sql` и `0004_security_hardening.sql`. В ответ должно прийти `Success. No rows returned`. Порядок важен. Повторный запуск ничего не сломает: скрипты идемпотентные.
3. Включите вход по коду и по ссылке:
   - **Authentication → Sign In / Providers → Email**: провайдер Email должен быть включён.
   - **Authentication → Emails → Templates → Magic Link**: в письме должны быть и код, и ссылка:
     ```html
     <h2>Вход в «Вместе»</h2>
     <p>Код для входа:</p>
     <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
     <p>Или откройте ссылку на этом телефоне: <a href="{{ .ConfirmationURL }}">Войти</a></p>
     <p>Код действует 1 час. Если вы не запрашивали вход, просто проигнорируйте письмо.</p>
     ```
     Сделайте то же в шаблоне **Confirm signup**, потому что его получает новый пользователь при первом входе.
   - Убедитесь, что длина кода 6 символов (Authentication → Providers → Email → *Email OTP Length* = 6). Это код входа из письма. Код приглашения в пространство — другой, он из 8 символов.
   - **Authentication → URL Configuration:** Site URL `vdvoem://auth-callback`, в Redirect URLs добавьте `vdvoem://**`. Для проверки в Expo Go временно нужен ещё `exp://**`, перед релизом его удалите. Приложение принимает из ссылки только одноразовый `code` (PKCE).
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
   Проверка пользователя выполняется внутри самих функций, поэтому у обеих выключен *Verify JWT* (так задано в `supabase/config.toml`; при деплое через Dashboard выключите его вручную).
   Если `link-preview` не задеплоена, рецепты всё равно добавляются, только название придётся ввести вручную. Если не задеплоена `delete-account`, удаляются данные пользователя, а сама учётная запись остаётся.
6. Скопируйте ключи. Откройте **Project Settings → API**, затем в корне проекта:
   ```bash
   cp .env.example .env
   ```
   и впишите в `.env` значения:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   # необязательно, по умолчанию — https://deckkk491-creator.github.io/vdvoem/privacy-policy.html
   EXPO_PUBLIC_PRIVACY_URL=https://<ваша-страница>/privacy
   # необязательно: почта демо-аккаунта для ревьюера Apple (см. store/review-notes.md)
   EXPO_PUBLIC_DEMO_EMAIL=review@example.com
   ```
   Anon-ключ можно публиковать: доступ к данным ограничивают RLS-политики. **service_role** ключ в приложение никогда не кладите.

Если `.env` не заполнен, приложение не упадёт, а покажет экран с инструкцией.

## 2. Запуск в Expo Go

```bash
npm install
npx expo start
```

Отсканируйте QR-код: на iPhone — камерой, на Android — из самого приложения **Expo Go** (оно ставится из App Store или Google Play).
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
   # демо-вход для ревьюера Apple, нужен до сборки для App Store (см. store/review-notes.md)
   eas env:create --name EXPO_PUBLIC_DEMO_EMAIL --value <демо-почта> --environment production --environment preview --visibility plaintext
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
- `development` — внутренняя сборка (на Android — APK).
- `preview` — внутренняя установка по ссылке (на Android — APK).
- `production` — для App Store (iOS) и Google Play (Android, файл `.aab`), с автоувеличением номера сборки.
- `production-apk` — то же, что `production`, но Android-сборка в виде APK (для RuStore или раздачи файлом).

На iOS во всех трёх основных профилях стоит `ios.image: latest`.

### Требования App Store

- **Политика конфиденциальности.** В App Store Connect нужен публичный URL. Готовые страницы лежат в `docs/` и публикуются через GitHub Pages (Settings → Pages → Branch `main`, папка `/docs`): https://deckkk491-creator.github.io/vdvoem/privacy-policy.html и https://deckkk491-creator.github.io/vdvoem/support.html. Приложение по умолчанию ссылается на эту политику; другой URL можно задать в `EXPO_PUBLIC_PRIVACY_URL`.
- **Удаление аккаунта в приложении (Guideline 5.1.1(v)).** Уже реализовано: **Настройки → Удалить аккаунт**. Кнопка вызывает Edge Function `delete-account`. Функция от имени пользователя запускает RPC `delete_my_data()`, а затем через service role удаляет файлы в хранилище и запись в `auth.users`. RPC удаляет профиль, сообщения, реакции, лайки, вишлист, отметки «Я подарю» и членство, а пространства, где человек был один, удаляются целиком. Общие записи (фильмы, рецепты, события, копилки), которые остаются у партнёра, теряют автора, но не пропадают.
- **App Privacy («ярлык конфиденциальности»).** Укажите: *Contact Info → Email*, *User Content*. Данные привязаны к пользователю и не используются для трекинга.
- **Шифрование.** В `app.json` уже стоит `ITSAppUsesNonExemptEncryption: false`.
- **Данные для ревьюера.** Обычный вход идёт по коду из письма, а ревьюер письмо не получит. Для него в приложении есть демо-вход по коду доступа (только для одной почты из `EXPO_PUBLIC_DEMO_EMAIL`), а `supabase/demo/seed_demo.sql` наполняет демо-пространство примерами. Что куда вписать — в `store/review-notes.md`, раздел «Как подготовить демо-аккаунт».

### Android

Приложение собирается и под Android (пакет `com.deckkk491.vdvoem`), код общий. Сборка тоже идёт в облаке EAS и не требует Android Studio:
```bash
eas build --platform android --profile preview      # APK: поставить на свои телефоны
eas build --platform android --profile production   # AAB для Google Play
```
Без аккаунта Expo тестовый APK собирается на GitHub: **Actions → «Android APK (тестовая сборка)» → Run workflow** (~20 минут), файл появится в закрытом черновике релиза на вкладке Releases. Подпись у него тестовая, для магазинов нужны сборки EAS.

Ключ подписи EAS создаст сам при первой сборке; сохраните его копию (`eas credentials -p android`). Что на Android сделано иначе, как заполнить Google Play и что проверить на телефоне — в `store/google-play.md`. Страница удаления аккаунта, которую требует Google Play: https://deckkk491-creator.github.io/vdvoem/delete-account.html.

---

## Как устроена безопасность

- Все данные принадлежат пространству. RLS разрешает читать и менять строки только участникам этого пространства (`is_space_member`).
- Пространство создаётся и пополняется участниками только через RPC: `create_space(name)` возвращает код приглашения из 8 символов, `join_space(code)` добавляет участника. Код нельзя изменить через API напрямую: владелец меняет его вызовом `rotate_invite_code` (кнопка «Сменить код»), старый код сразу перестаёт работать. На подбор кода действует лимит: 10 попыток за 10 минут.
- Владелец пространства может исключить участника (`kick_member`). Любой участник может выйти сам.
- Отметки «Я подарю» хранятся в отдельной таблице `wishlist_claims`. Её SELECT-политика скрывает строки, если вы владелец желания, поэтому сюрприз не раскрывается даже при прямом запросе к API.
- Профили видны только тем, с кем у вас общее пространство.
- Вход по ссылке из письма принимает только одноразовый `code` (PKCE), а при смене аккаунта приложение просит подтверждение.
- Удаления сообщаются участникам через таблицу `space_changes` с фильтром по пространству, а не через общие DELETE-события realtime.

Проверить базу локально на обычном PostgreSQL 15+ (те же шаги, что в CI, задача `database`):
```bash
createdb vdvoem_test
export PGDATABASE=vdvoem_test
psql -f supabase/tests/auth_stub.sql
psql -f supabase/tests/storage_stub.sql
for m in supabase/migrations/000{1,2,3,4}_*.sql; do psql -v ON_ERROR_STOP=1 -f "$m"; done
for t in v2 v3 v4; do psql -At -f supabase/tests/rls_${t}_test.sql; done   # все проверки должны вывести «t», ни одной «f»
```

## Иконка

`python3 scripts/make_icons.py` заново генерирует `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` и `favicon.png`. Рисунок — два сердца, сторонних изображений нет.
