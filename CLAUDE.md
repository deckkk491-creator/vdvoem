# Вместе — заметки для Claude

Общее пространство для пар и семей под iOS (App Store) и Android (Google Play, RuStore или APK). Владелец: deckkk491-creator.
- Название «Вместе» (раньше «Вдвоём», переименовано 26.10.2026). Технические имена не менялись: репозиторий, slug и схема `vdvoem`, Bundle ID `com.deckkk491.vdvoem`, проект Supabase `vdvoem`.

## Стек и сборка
- Expo SDK 58, expo-router 58, React Native 0.88, React 19.3, TypeScript 6 strict.
- Вкладки: Календарь, Кино, Еда, Выходные, Покупки, Мы. События, Задачи, Копилка, Вишлисты, Важные даты, 2-2-2 и Чат — экраны из «Мы»; чат также кнопкой в шапке.
- Нажатие на запись календаря всегда открывает карточку (`EntryDetailSheet`), редактирование — кнопкой «Изменить». Общая логика окон — `useCalendarSheets`.
- Бэкенд: Supabase (Postgres + RLS, вход по 6-значному коду или ссылке из письма, realtime).
- Демо-вход для ревьюера Apple: если задана `EXPO_PUBLIC_DEMO_EMAIL`, для этой одной почты `app/sign-in.tsx` вместо письма просит «Код доступа» и вызывает `signInWithPassword`. Пароль в приложении не хранится, он только в Supabase и в App Store Connect.
- Сборка только в облаке EAS: у владельца MacBook Air 2019, Xcode 26 на нём не ставится.
- Bundle ID и Android-пакет: `com.deckkk491.vdvoem`.
- Android: тот же код. Профили EAS: `preview` — APK, `production` — AAB, `production-apk` — APK для RuStore/раздачи. Календарь телефона (`deviceCalendarSupported`) работает только на iOS, разрешения на календарь для Android заблокированы в `app.json`. На Android: галерея без запроса доступа (системный выбор фото), «Сделать фото» из меню вложений, без «Apple Maps», окна-шторки и экраны сами обходят клавиатуру и системные панели (`Screen`, `Sheet` в `src/components/ui.tsx`). Всё про публикацию и проверку на телефоне — `store/google-play.md`.
- CI (`.github/workflows/ci.yml`): npm install, tsc, expo export ios и android, `expo prebuild --platform android` с проверкой манифеста. CI должен оставаться зелёным.

## Где что лежит
- `supabase/migrations/0001_init.sql` — схема, RLS и RPC: `create_space`, `join_space`, `leave_space`, `delete_my_data`.
- `supabase/migrations/0002_calendar_chat_files.sql` — календарь/задачи/важные даты, чат, вложения, бакет `space-files`, дизлайки, ритм 2-2-2, личная тема, RPC `mark_chat_read`, `my_file_paths`, `space_file_paths`. Применена 24.10.2026.
- `supabase/migrations/0003_reactions_wish_photos.sql` — реакции в чате (`message_reactions`, одна на человека), фото к желаниям (вложения `parent_type='wish'`, только владелец). Применена 24.10.2026.
- `supabase/migrations/0004_security_hardening.sql` — по итогам аудита: заморозка владельцев/авторов, `done_by` только свой, `message_reads` только через RPC, вложения только к записям своего пространства, файлы чата/желаний удаляет только автор, коды приглашения 8 символов + лимит 10 попыток за 10 минут (`join_space` возвращает NULL на неверный код), `kick_member`, `rotate_invite_code`, удаление аккаунта обезличивает общие записи, а не удаляет их; `space_changes` — realtime об удалениях только для участников.
- CI job `database` прогоняет 0001–0004 и `supabase/tests/rls_v2_test.sql`, `rls_v3_test.sql`, `rls_v4_test.sql` на чистом Postgres (заглушки auth/storage).
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

## Состояние на 28.10.2026
- `audit-fixes` влита в `main`. Миграция 0004 применена в Supabase, новая link-preview задеплоена (28.10.2026, через Chrome пользователя).
- Чат: очередь неотправленных сообщений переживает смену пространства (сбрасывается при смене аккаунта или если пространство пропало).
- Подробности и план — `PROGRESS.md`. Разбор перспектив: https://claude.ai/artifact/PDKHfaUnDwC9zWJrBRpSPp
- Apple Developer аккаунт ещё не оплачен.

## Следующие шаги
1. Проверить в Expo Go вдвоём на двух телефонах (участники, исключение, смена кода, вход по ссылке, вишлист с маркетплейсов, голосовые).
2. Демо-аккаунт для ревьюера Apple: код и `store/review-notes.md` готовы, остаётся создать пользователей в Supabase, запустить `supabase/demo/seed_demo.sql`, задать `EXPO_PUBLIC_DEMO_EMAIL` в EAS и заполнить поля в App Store Connect.
3. Проверить на двух телефонах: включить 2-2-2 на одном, свернуть и развернуть «Вместе» на другом — напоминания должны появиться.
4. Android: собрать `preview` (APK) и пройти список из `store/google-play.md`, раздел 5. На настоящем Android приложение ещё не запускалось.
