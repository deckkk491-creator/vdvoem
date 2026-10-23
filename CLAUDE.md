# Вдвоём — заметки для Claude

Общее пространство для пар и семей под iOS (App Store). Владелец: deckkk491-creator.

## Стек и сборка
- Expo SDK 54, expo-router 6, React Native 0.81, TypeScript strict.
- Бэкенд: Supabase (Postgres + RLS, вход по 6-значному коду из письма, realtime).
- Сборка только в облаке EAS: у владельца MacBook Air 2019, Xcode 26 на нём не ставится.
- Bundle ID: `com.deckkk491.vdvoem`.
- CI (`.github/workflows/ci.yml`): npm install, tsc, expo export ios. CI должен оставаться зелёным.

## Где что лежит
- `supabase/migrations/0001_init.sql` — схема, RLS и RPC: `create_space`, `join_space`, `leave_space`, `delete_my_data`.
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

## Следующие шаги
1. Создать проект на supabase.com (регион EU, как сказано в политике), выполнить миграцию, включить вход по коду, задеплоить обе функции. Подробно — в README.
2. Заполнить `.env` и проверить в Expo Go вдвоём на двух телефонах.
3. Подключить свой SMTP: встроенная почта Supabase отправляет всего несколько писем в час.
4. Сделать демо-аккаунт для ревьюера Apple и заполнить `store/review-notes.md`.
5. Известное ограничение: если правило 2-2-2 переключили на другом устройстве, напоминания здесь обновятся только после перезагрузки пространства.
