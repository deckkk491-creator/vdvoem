# Вместе — заметки для Claude

Общее пространство для пар и семей под iOS (App Store). Владелец: deckkk491-creator.
- Название «Вместе» (раньше «Вдвоём», переименовано 26.10.2026). Технические имена не менялись: репозиторий, slug и схема `vdvoem`, Bundle ID `com.deckkk491.vdvoem`, проект Supabase `vdvoem`.

## Стек и сборка
- Expo SDK 58, expo-router 58, React Native 0.88, React 19.3, TypeScript 6 strict.
- Вкладки: Календарь, Кино, Еда, Выходные, Покупки, Мы. События, Задачи, Копилка, Вишлисты, Важные даты, 2-2-2 и Чат — экраны из «Мы»; чат также кнопкой в шапке.
- Нажатие на запись календаря всегда открывает карточку (`EntryDetailSheet`), редактирование — кнопкой «Изменить». Общая логика окон — `useCalendarSheets`.
- Бэкенд: Supabase (Postgres + RLS, вход по 6-значному коду из письма, realtime).
- Сборка только в облаке EAS: у владельца MacBook Air 2019, Xcode 26 на нём не ставится.
- Bundle ID: `com.deckkk491.vdvoem`.
- CI (`.github/workflows/ci.yml`): npm install, tsc, expo export ios. CI должен оставаться зелёным.

## Где что лежит
- `supabase/migrations/0001_init.sql` — схема, RLS и RPC: `create_space`, `join_space`, `leave_space`, `delete_my_data`.
- `supabase/migrations/0002_calendar_chat_files.sql` — календарь/задачи/важные даты, чат, вложения, бакет `space-files`, дизлайки, ритм 2-2-2, личная тема, RPC `mark_chat_read`, `my_file_paths`, `space_file_paths`. Применена 24.10.2026.
- `supabase/migrations/0003_reactions_wish_photos.sql` — реакции в чате (`message_reactions`, одна на человека), фото к желаниям (вложения `parent_type='wish'`, только владелец). Применена 24.10.2026.
- `supabase/migrations/0004_security_hardening.sql` — по итогам аудита: заморозка владельцев/авторов, `done_by` только свой, `message_reads` только через RPC, вложения только к записям своего пространства, файлы чата/желаний удаляет только автор, коды приглашения 8 символов + лимит 10 попыток за 10 минут (`join_space` возвращает NULL на неверный код), `kick_member`, `rotate_invite_code`, удаление аккаунта обезличивает общие записи, а не удаляет их; `space_changes` — realtime об удалениях только для участников.
- CI job `database` прогоняет 0001–0004 и `supabase/tests/rls_v2_test.sql`, `rls_v3_test.sql`, `rls_v4_test.sql` на чистом Postgres (заглушки auth/storage).
- `supabase/tests/` — проверки RLS. Отметку «я подарю» владелец вишлиста не видит.
- `supabase/functions/` — `link-preview` (Open Graph для рецептов) и `delete-account` (удаление пользователя через service role).
- `src/theme/index.ts` — единственный источник цветов. Контраст проверен на WCAG AA.
- `src/lib/supabase.ts` — `humanError` переводит ошибки сервера на русский.
- `src/data/ideas.ts` — идеи для правила 2-2-2 и визитки стран (`COUNTRY_CARDS`).
- `src/data/mealPhotos.json`, `ideaPhotos.json` — фото блюд и идей с Wikimedia Commons (свободные лицензии, автор подписан); собраны `scripts/fetch_photos.py` (Википедию из облака не видно — запускали в Chrome пользователя).
- `src/theme/index.ts` — также подложки (`SURFACES`) и фоны (`BACKGROUNDS`, картинки в `assets/backgrounds`); подложки и фон хранятся только на телефоне.
- `docs/` — GitHub Pages: политика и поддержка (https://deckkk491-creator.github.io/vdvoem/).
- `store/` — тексты для App Store Connect, App Privacy, заметки для ревью.

## Правила
- Тексты в приложении на русском, обращение на «ты».
- Коммиты от имени deckkk491-creator <deckkk491@gmail.com>.

## Supabase (настроено)
- Проект `vdvoem` (ref lsdejadmrwuxiavgficc), регион West EU (Ирландия). Ключи прописаны по умолчанию в `src/lib/env.ts`.
- Обе функции задеплоены (последний раз 24.10.2026 через Dashboard → Edge Functions → Code), Verify JWT выключен (проверка внутри функций). link-preview отдаёт и цену; delete-account удаляет и файлы из хранилища.
- Почта: свой SMTP через Яндекс (d3ckkk@yandex.ru, пароль приложения), лимит 30 писем в час. Шаблоны «Magic link» и «Confirm sign up» на русском, в них и код `{{ .Token }}`, и ссылка.
- Вход работает и по коду, и по ссылке. Клиент в режиме PKCE: из ссылки принимается только `code` (готовые токены в ссылке игнорируются). Site URL `vdvoem://auth-callback`, redirect URLs `vdvoem://**` (и `exp://**` — только на время тестов в Expo Go, перед релизом убрать).
- link-preview: редиректы вручную с перепроверкой, DNS-проверка на частные адреса, только порты 80/443. Скрытый WebView (`PageReader`) не открывает локальную сеть.

## Состояние на 26.10.2026
- Ветка `audit-fixes` (исправления аудита + переименование в «Вместе»): CI зелёный, в `main` ещё НЕ влита.
- Миграция 0004 в Supabase ещё НЕ применена, новая link-preview НЕ задеплоена. Без 0004 в клиенте не работают realtime удалений (`space_changes`), «Исключить» и «Сменить код».
- Подробности и план — `PROGRESS.md`. Разбор перспектив: https://claude.ai/artifact/PDKHfaUnDwC9zWJrBRpSPp
- Apple Developer аккаунт ещё не оплачен.

## Следующие шаги
1. Пользователь входит в Supabase в своём Chrome → применить `0004_security_hardening.sql` в SQL Editor, обновить код `link-preview` (Edge Functions → Code), проверить.
2. Влить `audit-fixes` в `main`.
3. Проверить в Expo Go вдвоём на двух телефонах (участники, исключение, смена кода, вход по ссылке, вишлист с маркетплейсов, голосовые).
4. Сделать демо-аккаунт для ревьюера Apple и заполнить `store/review-notes.md`.
5. Проверить на двух телефонах: включить 2-2-2 на одном, свернуть и развернуть «Вместе» на другом — напоминания должны появиться.
