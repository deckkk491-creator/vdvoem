# Вдвоём — заметки для Claude

Общее пространство для пар и семей под iOS (App Store). Владелец: deckkk491-creator.

## Стек и сборка
- Expo SDK 58, expo-router 58, React Native 0.88, React 19.3, TypeScript 6 strict.
- Вкладки: Календарь, Кино, Еда, Выходные, Покупки, Мы. Копилка, Вишлисты, Важные даты, 2-2-2 и Чат — экраны из «Мы»; чат также кнопкой в шапке.
- Бэкенд: Supabase (Postgres + RLS, вход по 6-значному коду из письма, realtime).
- Сборка только в облаке EAS: у владельца MacBook Air 2019, Xcode 26 на нём не ставится.
- Bundle ID: `com.deckkk491.vdvoem`.
- CI (`.github/workflows/ci.yml`): npm install, tsc, expo export ios. CI должен оставаться зелёным.

## Где что лежит
- `supabase/migrations/0001_init.sql` — схема, RLS и RPC: `create_space`, `join_space`, `leave_space`, `delete_my_data`.
- `supabase/migrations/0002_calendar_chat_files.sql` — календарь/задачи/важные даты, чат, вложения, бакет `space-files`, дизлайки, ритм 2-2-2, личная тема, RPC `mark_chat_read`, `my_file_paths`, `space_file_paths`. Применена 24.10.2026.
- CI job `database` прогоняет 0001+0002 и `supabase/tests/rls_v2_test.sql` на чистом Postgres (заглушки auth/storage).
- `supabase/tests/` — проверки RLS. Отметку «я подарю» владелец вишлиста не видит.
- `supabase/functions/` — `link-preview` (Open Graph для рецептов) и `delete-account` (удаление пользователя через service role).
- `src/theme/index.ts` — единственный источник цветов. Контраст проверен на WCAG AA.
- `src/lib/supabase.ts` — `humanError` переводит ошибки сервера на русский.
- `src/data/ideas.ts` — идеи для правила 2-2-2.
- `docs/` — GitHub Pages: политика и поддержка (https://deckkk491-creator.github.io/vdvoem/).
- `store/` — тексты для App Store Connect, App Privacy, заметки для ревью.

## Правила
- Тексты в приложении на русском, обращение на «ты».
- Коммиты от имени deckkk491-creator <deckkk491@gmail.com>.

## Supabase (настроено)
- Проект `vdvoem` (ref lsdejadmrwuxiavgficc), регион West EU (Ирландия). Ключи прописаны по умолчанию в `src/lib/env.ts`.
- Обе функции задеплоены (последний раз 24.10.2026 через Dashboard → Edge Functions → Code), Verify JWT выключен (проверка внутри функций). link-preview отдаёт и цену; delete-account удаляет и файлы из хранилища.
- Почта: свой SMTP через Яндекс (d3ckkk@yandex.ru, пароль приложения), лимит 30 писем в час. Шаблоны «Magic link» и «Confirm sign up» на русском, в них и код `{{ .Token }}`, и ссылка.
- Вход работает и по коду, и по ссылке. Site URL `vdvoem://auth-callback`, redirect URLs `vdvoem://**` и `exp://**`.

## Следующие шаги
1. Проверить в Expo Go вдвоём на двух телефонах.
2. Сделать демо-аккаунт для ревьюера Apple и заполнить `store/review-notes.md`.
3. Проверить на двух телефонах: включить 2-2-2 на одном, свернуть и развернуть «Вдвоём» на другом — напоминания должны появиться. При возврате из фона и переподключении realtime `SpaceProvider` перечитывает пространство и все таблицы.
