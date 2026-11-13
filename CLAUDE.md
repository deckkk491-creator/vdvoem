# Вместе — заметки для Claude

Общее пространство для пар и семей под iOS (App Store) и Android (Google Play, RuStore или APK). Владелец: deckkk491-creator.
- Название «Вместе» (раньше «Вдвоём», переименовано 26.10.2026). Технические имена не менялись: репозиторий, slug и схема `vdvoem`, Bundle ID `com.deckkk491.vdvoem`, проект Supabase `vdvoem`.

## Стек и сборка
- Expo SDK 58, expo-router 58, React Native 0.88, React 19.3, TypeScript 6 strict.
- Вкладки: Календарь, Кино, Еда, Выходные, Покупки, Мы. События, Задачи, Копилка, Вишлисты, Важные даты, 2-2-2, Бюджет и Рабочие дни — экраны из «Мы».
- Чата нет намеренно (удалён 12.11.2026, миграция 0006): переписка между пользователями делает сервис ОРИ по ст. 10.1 149-ФЗ с обязанностью хранить сообщения и метаданные. Не добавлять личные сообщения, комментарии и голосовые без отдельного решения владельца. Микрофон приложению не нужен: `expo-audio` убран, у `expo-image-picker` `microphonePermission: false`, CI проверяет, что `RECORD_AUDIO` и `NSMicrophoneUsageDescription` в сборку не попали.
- Нижняя панель своя (`src/components/TabBar.tsx`, подключена через `tabBar` в `app/(tabs)/_layout.tsx`): плавающая «таблетка», подсветка плавно переезжает к разделу, по панели можно вести пальцем. Состав и порядок разделов — `src/lib/tabPrefs.ts` (хранится на телефоне), редактор — Настройки → «Нижняя панель» (`TabBarEditor`), не больше 6 кнопок. «Мы» убрать нельзя; скрытые разделы открываются плитками из «Мы». На панель можно вынести и разделы из «Мы»: для каждого есть вкладка `app/(tabs)/tab-<имя>.tsx`, которая оборачивает тот же экран `app/<имя>.tsx` в `InTab` (`src/lib/inTab.tsx`): без «Назад», кнопка «+» над панелью, место внизу. Имена `tab-…` нужны, чтобы пути не совпали с `/budget` и т. п. Высота и отступ панели — `TAB_BAR_HEIGHT` и `tabBarOffset` в теме (их же использует кнопка «+»). Подписи на панели не растут с системным шрифтом: размер подобран под ширину кнопки.
- Подложки «Чёрные (OLED)» (`SURFACES.oled`): в тёмной теме фон `#000000`; при выборе включается тёмная тема.
- Выходные: записи с прошедшей датой или отметкой «сходили» уходят в фильтр «Прошедшее» в верхнем ряду (в базе ничего не меняется). Карточку можно смахнуть влево (`SwipeAction`): в прошедшее (ставит `done`) или обратно (только отмеченное вручную).
- Покупки: отмеченная позиция удаляется сама (через 4 с на своём телефоне, до 15 с — отмеченная партнёром); повторное нажатие до этого возвращает её. Кнопки «Очистить» больше нет.
- Бюджет (`app/budget.tsx`, таблица `budget_entries`): расходы и доходы по месяцам и категориям, только рубли; открывается из «Мы» и из меню «+». Рабочие дни (`app/workdays.tsx`, `useWorkDays`, таблица `work_days`): каждый отмечает свои, в сетке месяца (`MonthGrid`, `DayMark.bars`) — полоски цвета аватара.
- Кнопка «+» в календаре — меню (`FabMenu` в `ui.tsx`): событие, задача, важная дата, покупка (`QuickBuySheet`), расход или доход, рабочие дни.
- Напоминания о записях календаря: поля `remind_before` (дней до события, null — нет) и `remind_time`; расчёт — `src/lib/reminders.ts` (чистые функции, проверки `tests/reminders.test.mjs`), планирование локальных уведомлений — `syncEventReminders` в `notifications.ts`, запускает `CalendarEffects` (в корневом `_layout`). Уведомления локальные: приходят с телефона каждого участника, сервер ничего не шлёт; держим до 40 ближайших.
- Поздравление на весь экран: поле `celebrate` (`fireworks`/`confetti`), показывает `CalendarEffects` → `Celebration.tsx` при первом открытии в день события (отметка «показано» — на телефоне).
- Обучающий тур: `src/components/Tour.tsx` + `src/lib/tour.ts`, один раз после входа и из Настроек → «Показать обучение». Чтобы показать всем заново — поменять номер в ключе `vdvoem.tour.v1`.
- Акцент `sand` и подложки `coffee` — отдельные варианты (кнопку-сочетание «Песок и кофе» убрали по просьбе владельца). Акцент хранится в профиле: новый ключ акцента требует правки ограничения `profiles_theme_check` в миграции.
- Сканирование чеков в бюджете (`ReceiptScanner.tsx`, `expo-camera`): камера, скриншот (`scanFromURLAsync`) или ссылка из буфера; разбор QR-кода ФНС — `src/lib/receipt.ts` (`tests/receipt.test.mjs`). Из чека берутся только сумма, дата и время; список товаров требует платного сервиса ФНС — не делали. У `expo-camera` микрофон выключен (`microphonePermission: false`, `recordAudioAndroid: false`).
- Кино: переключатель «Всё / Фильмы / Сериалы» (поле `media_type`), новая запись получает тип открытого подраздела.
- Тексты нейтральные: приложением пользуются пара, семья или друзья — не писать «партнёр», «обоим», «вдвоём» (кроме идей правила 2-2-2). Следить за падежами в названиях разделов: «в разделах „Кино“, „Еда“».
- Нажатие на запись календаря всегда открывает карточку (`EntryDetailSheet`), редактирование — кнопкой «Изменить». Общая логика окон — `useCalendarSheets`.
- Бэкенд: Supabase (Postgres + RLS, вход по 6-значному коду или ссылке из письма, realtime).
- Демо-вход для ревьюера Apple: если задана `EXPO_PUBLIC_DEMO_EMAIL`, для этой одной почты `app/sign-in.tsx` вместо письма просит «Код доступа» и вызывает `signInWithPassword`. Пароль в приложении не хранится, он только в Supabase и в App Store Connect.
- Сборка только в облаке EAS: у владельца MacBook Air 2019, Xcode 26 на нём не ставится.
- Bundle ID и Android-пакет: `com.deckkk491.vdvoem`.
- Android: тот же код. Профили EAS: `preview` — APK, `production` — AAB, `production-apk` — APK для RuStore/раздачи. Календарь телефона (`deviceCalendarSupported`) работает только на iOS, разрешения на календарь для Android заблокированы в `app.json`. На Android: галерея без запроса доступа (системный выбор фото), «Сделать фото» из меню вложений, без «Apple Maps», окна-шторки и экраны сами обходят клавиатуру и системные панели (`Screen`, `Sheet` в `src/components/ui.tsx`). Всё про публикацию и проверку на телефоне — `store/google-play.md`.
- Тестовый APK без Expo и без Android Studio: GitHub → Actions → «Android APK (тестовая сборка)» → Run workflow (`android-apk.yml`, ~20 минут); файл — в закрытом черновике релиза. Для магазинов — EAS.
- `locales/ru.json`: у iOS и Android разные ключи (`ios.CFBundleDisplayName`, `android.app_name`). Ключи iOS в Android-строках ломают lint релизной сборки.
- iPhone Duo (складной, внутренний экран ≈ 669 × 951 pt, внешний ≈ 466 × 678 pt): сборки SDK 58 на образе EAS `latest` идут на iOS 27 SDK, окно меняет размер при складывании. Поэтому размер окна — только `useWindowDimensions` (не `Dimensions.get`), боковые отступы страниц учитывают `insets.left/right` (`Screen`, `pageStyle` в `src/components/ui.tsx`), ширина содержимого ≤ `MAX_CONTENT_WIDTH` (720). Нативные Stack-заголовки не трогаем. Нижняя панель своя: она учитывает `insets.left/right` и не шире 520 pt. Не проверено на устройстве. Подробности — `PROGRESS.md`.
- CI (`.github/workflows/ci.yml`): npm install, tsc, expo export ios и android, `expo prebuild --platform android` с проверкой манифеста, проверки логики сроков 2-2-2 (`tests/rule222.test.mjs`, запуск `npx tsx --test tests/rule222.test.mjs`). CI должен оставаться зелёным.

## Где что лежит
- `supabase/migrations/0001_init.sql` — схема, RLS и RPC: `create_space`, `join_space`, `leave_space`, `delete_my_data`.
- `supabase/migrations/0002_calendar_chat_files.sql` — календарь/задачи/важные даты, чат (удалён в 0006), вложения, бакет `space-files`, дизлайки, ритм 2-2-2, личная тема, RPC `mark_chat_read`, `my_file_paths`, `space_file_paths`. Применена 24.10.2026.
- `supabase/migrations/0003_reactions_wish_photos.sql` — реакции в чате (удалены в 0006), фото к желаниям (вложения `parent_type='wish'`, только владелец). Применена 24.10.2026.
- `supabase/migrations/0004_security_hardening.sql` — по итогам аудита: заморозка владельцев/авторов, `done_by` только свой, `message_reads` только через RPC, вложения только к записям своего пространства, файлы чата/желаний удаляет только автор, коды приглашения 8 символов + лимит 10 попыток за 10 минут (`join_space` возвращает NULL на неверный код), `kick_member`, `rotate_invite_code`, удаление аккаунта обезличивает общие записи, а не удаляет их; `space_changes` — realtime об удалениях только для участников.
- `supabase/migrations/0005_budget_workdays_reminders.sql` — `budget_entries`, `work_days` (свои дни отмечает только сам участник), поля календаря `remind_before`/`remind_time`/`celebrate`, акцент `sand`; `remove_member_data` и `delete_my_data` учитывают новые таблицы. Только добавляет новое. Применена в Supabase 12.11.2026 (через SQL Editor в браузере пользователя). Клиент переживает отсутствие полей напоминаний (`useCalendar.save` повторяет запись без них), но бюджет и рабочие дни без миграции показывают ошибку.
- `supabase/migrations/0006_remove_chat.sql` — удаление чата: таблицы `messages`, `message_reads`, `message_reactions`, RPC `mark_chat_read`/`message_in_space`; `my_file_paths`, `space_file_paths`, `remove_member_data`, `delete_my_data` и политика удаления в хранилище переписаны без них. Файлы чата в бакете (`<space>/chat/`) миграция не трогает. Применена в Supabase 12.11.2026; в бакете остался 1 файл чата (0,1 МБ) — удалить вручную в Dashboard → Storage. Проверки — `rls_v6_test.sql`.
- CI job `database` прогоняет 0001–0005, `rls_v2…v5`, затем 0006 и `rls_v6_test.sql` на чистом Postgres (заглушки auth/storage). Локально в облачной сессии есть Postgres 16 (`/usr/lib/postgresql/16/bin`) — миграции и проверки можно прогнать до отправки.
- `supabase/tests/` — проверки RLS. Отметку «я подарю» владелец вишлиста не видит.
- `supabase/demo/seed_demo.sql` — демо-данные для ревьюера Apple (две почты вписываются в начале, повторный запуск пересоздаёт демо). CI прогоняет его на чистой базе.
- `supabase/functions/` — `link-preview` (Open Graph для рецептов) и `delete-account` (удаление пользователя через service role).
- `src/theme/index.ts` — единственный источник цветов. Контраст проверен на WCAG AA.
- `src/lib/supabase.ts` — `humanError` переводит ошибки сервера на русский.
- `src/data/ideas.ts` — идеи для правила 2-2-2 и визитки стран (`COUNTRY_CARDS`).
- `src/data/mealPhotos.json`, `ideaPhotos.json` — фото блюд и идей с Wikimedia Commons (свободные лицензии, автор подписан); собраны `scripts/fetch_photos.py` (Википедию из облака не видно — запускали в Chrome пользователя).
- `src/theme/index.ts` — также подложки (`SURFACES`) и фоны (`BACKGROUNDS`, картинки в `assets/backgrounds`); подложки и фон хранятся только на телефоне.
- `docs/` — GitHub Pages: политика, поддержка и удаление аккаунта (`delete-account.html`, нужна Google Play) — https://deckkk491-creator.github.io/vdvoem/.
- `store/` — тексты для App Store Connect, App Privacy, заметки для ревью; `google-play.md` — Android: сборка, анкеты Google Play, список проверок на телефоне.

## Правила
- Тексты в приложении на русском, обращение на «ты».
- Коммиты от имени deckkk491-creator <deckkk491@gmail.com>.

## Supabase (настроено)
- Проект `vdvoem` (ref lsdejadmrwuxiavgficc), регион West EU (Ирландия). Ключи прописаны по умолчанию в `src/lib/env.ts`.
- Обе функции задеплоены (link-preview — 28.10.2026, delete-account — 24.10.2026 через Dashboard → Edge Functions → Code), Verify JWT выключен (проверка внутри функций). link-preview отдаёт и цену; delete-account удаляет и файлы из хранилища.
- Почта: свой SMTP через Яндекс (логин и пароль приложения — только в настройках Supabase, в репозиторий не записывать), лимит 30 писем в час. Шаблоны «Magic link» и «Confirm sign up» на русском, в них и код `{{ .Token }}`, и ссылка.
- Вход работает и по коду, и по ссылке. Клиент в режиме PKCE: из ссылки принимается только `code` (готовые токены в ссылке игнорируются). Site URL `vdvoem://auth-callback`, redirect URLs `vdvoem://**` (и `exp://**` — только на время тестов в Expo Go, перед релизом убрать).
- link-preview: редиректы вручную с перепроверкой, DNS-проверка на частные адреса, только порты 80/443. Скрытый WebView (`PageReader`) не открывает локальную сеть.

## Состояние на 12.11.2026
- Ветки `polish-tabbar-oled` (PR #7) и `budget-workdays-reminders` (PR #8, поверх #7) ждут проверки тестового APK на телефоне, потом слияние в `main` (сначала #7, затем #8). Миграции 0005 и 0006 применены. Тестовый APK с этими ветками — `android-test-7`.

## Состояние на 28.10.2026
- `audit-fixes` влита в `main`. Миграция 0004 применена в Supabase, новая link-preview задеплоена (28.10.2026, через Chrome пользователя).
- Подробности и план — `PROGRESS.md`. Разбор перспектив: https://claude.ai/artifact/PDKHfaUnDwC9zWJrBRpSPp
- Apple Developer аккаунт ещё не оплачен.

## Следующие шаги
1. Проверить в Expo Go вдвоём на двух телефонах (участники, исключение, смена кода, вход по ссылке, вишлист с маркетплейсов).
2. Демо-аккаунт для ревьюера Apple: код и `store/review-notes.md` готовы, остаётся создать пользователей в Supabase, запустить `supabase/demo/seed_demo.sql`, задать `EXPO_PUBLIC_DEMO_EMAIL` в EAS и заполнить поля в App Store Connect.
3. Проверить на двух телефонах: включить 2-2-2 на одном, свернуть и развернуть «Вместе» на другом — напоминания должны появиться.
4. iPhone Duo: после оплаты Apple Developer собрать TestFlight-сборку и проверить на настоящем Duo (или у знакомого с Mac и Xcode 27.1): складывание и раскладывание, «рейка» с кнопками, отступы, фото, формы с клавиатурой.
5. Android: поставить тестовый APK (`android-test-3`, он же отправлен в чат) и пройти список из `store/google-play.md`, раздел 5. На настоящем Android приложение ещё не запускалось. Черновик релиза `android-test-1` (без микрофона) удалить.
