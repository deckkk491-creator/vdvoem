# Вместе (Vmeste) — App Review notes

Paste the English block below into App Store Connect → version 1.0 → **App Review Information**.
Подготовка демо-аккаунта — в разделе «Как подготовить демо-аккаунт» ниже; без неё заполнять поля рано.

## Sign-in information

Обычные пользователи входят по одноразовому коду из письма, а ревьюер не может получить письмо. Для него есть **демо-аккаунт**: вместо кода из письма приложение принимает код доступа (пароль), но только для одной демо-почты.

| Field in App Store Connect | Value |
|---|---|
| Sign-in required | **Yes** |
| User name | `[DEMO_EMAIL]` — демо-почта, она же `EXPO_PUBLIC_DEMO_EMAIL` |
| Password | `[DEMO_ACCESS_CODE]` — длинный случайный код доступа, **не** `123456` |

Contact: deckkk491-creator, deckkk491@gmail.com, phone: `[+7 XXX XXX-XX-XX]`

---

## Notes (paste as is, fill in the brackets)

```
Hello, and thank you for reviewing Vmeste («Вместе», Russian for "together"). The app's interface is in Russian; button names are given below in Russian with an English gloss.

Vmeste is a private shared space for a couple or a family: movies and series to watch together, recipes saved from links, weekend outing ideas, a shared calendar with tasks, a shared savings jar, a shopping list by category and personal wishlists. Members add items and like each other's items.

SIGN-IN
Regular users sign in without a password: they enter an email and receive a one-time code or link by email. Because a reviewer cannot receive that email, we prepared a demo account:
- Email: [DEMO_EMAIL]
- Access code: [DEMO_ACCESS_CODE]
On the first screen enter the email and tap «Получить письмо» (Get email). No email is sent for this account. On the next screen type the access code into «Код доступа» (Access code) and tap «Войти» (Sign in).

The demo account is already a member of a sample space, «Аня и Миша (демо)», together with a second demo member, so all sections contain sample data (the tabs «Календарь», «Кино», «Еда», «Выходные», «Покупки» and «Мы»).

INVITE-CODE FLOW
Spaces are private and invite-only. A member creates a space, the app shows an invite code, and the other person enters this code in the app to join.
To test joining, use this invite code: [DEMO_INVITE_CODE]
Path: «Мы» tab → «Настройки» (Settings) → «Добавить ещё пространство» (Add another space) → enter the code → «Присоединиться» (Join). You can also create a new space there and see its invite code. The code of the current space can be replaced in Settings with «Сменить код» (Change code); the old code stops working immediately.

FEATURES TO CHECK
- Add an item in any section (for example a movie) and like an item.
- Wishlists («Мы» tab → «Вишлисты»): open the other member's wishlist and tap «Я подарю» (I'll gift this). This mark is hidden from the wishlist owner.
- Savings jar («Копилка»): a manual tracker only. The app does not process payments or connect to banks.
- 2-2-2 rule («Мы» tab → «Правило 2-2-2»): date night every 2 weeks, a new place every 2 months, a new country every 2 years; the couple can change the rhythm. When enabled, the app asks for notification permission and schedules LOCAL notifications. No remote push. Country ideas show landmark photos from Wikimedia Commons (free licences, author credited on each photo).
- «Календарь» tab: shared events, tasks («Я сделаю», I'll do it, to take a task) and important dates. The optional switch «Добавлять в календарь iPhone» (Add to iPhone Calendar) writes events to a separate «Вместе» calendar on the device; calendar permission is asked only when the user turns it on.
- Chat (bubble icon at the top of every tab): private messages between members of the space, with photo and document attachments stored in private storage (signed URLs, members only).
- Photos: the photo library / camera permission is asked only when the user attaches a picture («Фото из галереи» / «Сделать фото»).

ACCOUNT DELETION
«Мы» tab → «Настройки» (Settings) → «Удалить аккаунт» (Delete account) → confirm. This permanently deletes the account, profile, messages, likes, wishlist and uploaded files of the user (Guideline 5.1.1(v)). Shared entries that the user added to a space (movies, recipes, events, savings) stay for the remaining member without the user's name.

USER-GENERATED CONTENT
Content and chat messages are visible only to members of the same private space, who joined by an invite code they received from someone they know (typically a partner or family). There is no public feed and no way to find or message strangers. Safeguards:
- Any member can leave a space at any time («Настройки» → «Выйти из пространства», or long-press a message in the chat → «Выйти из пространства»), which immediately stops all contact.
- The space owner can remove a member («Настройки» → «Участники» → «Исключить») and can change the invite code.
- Long-pressing a partner's chat message offers «Пожаловаться» (Report), which emails the message to the developer (deckkk491@gmail.com) for review within 24 hours.

DATA
Data is stored in Supabase (EU region). No ads, no analytics, no tracking, no in-app purchases.

Contact: deckkk491@gmail.com
```

---

## Как подготовить демо-аккаунт

Всё делается один раз; повторять нужно только пункт 4, если ревьюер удалит аккаунт.

1. **Придумайте почту и код доступа.** Почта может быть любой, письма на неё не уходят (например, `review@вашдомен`). Код доступа: 20+ случайных символов (менеджер паролей), нигде больше не используйте.
2. **Создайте двух пользователей** в Supabase: *Authentication → Users → Add user → Create new user*, отметьте *Auto Confirm User*.
   - ревьюер: почта из п. 1 и код доступа как пароль;
   - партнёр: любая почта, к которой у вас есть доступ, пароль любой.
3. **Заполните пространство.** В SQL Editor откройте `supabase/demo/seed_demo.sql`, впишите две почты в начале и нажмите **Run**. Внизу появится таблица: код у строки «Запасное пространство для проверки кода» подставьте вместо `[DEMO_INVITE_CODE]`. Скрипт можно запускать повторно: демо-пространство пересоздаётся, а код запасного остаётся прежним.
4. **Если ревьюер удалил аккаунт.** Создайте пользователя заново (п. 2, та же почта и тот же код доступа) и снова запустите скрипт.
5. **Включите демо-вход в сборке.** Переменная окружения с демо-почтой должна быть задана до сборки:
   ```bash
   eas env:create --name EXPO_PUBLIC_DEMO_EMAIL --value <демо-почта> --environment production --environment preview --visibility plaintext
   ```
   Для проверки в Expo Go добавьте строку `EXPO_PUBLIC_DEMO_EMAIL=<демо-почта>` в `.env`. Без этой переменной демо-входа в приложении нет. Сама почта попадает в сборку и видна, а код доступа нигде в приложении не хранится: он только в Supabase и в App Store Connect.
6. **Заполните App Store Connect:** поля *User name* и *Password* из таблицы выше и блок Notes с подставленными `[DEMO_EMAIL]`, `[DEMO_ACCESS_CODE]`, `[DEMO_INVITE_CODE]`, `[+7 XXX XXX-XX-XX]`.
7. **После одобрения** можно убрать переменную из следующих сборок и удалить демо-пользователей: тогда демо-вход исчезнет.

Проверка перед отправкой: поставьте сборку через TestFlight на чистый телефон, войдите демо-почтой и кодом доступа, убедитесь, что во всех вкладках есть данные, затем вступите в запасное пространство по коду.

## Checklist before submitting

- [ ] Demo login works from a clean TestFlight install (email + access code, no email needed) and every tab shows sample data.
- [ ] The demo invite code from the seed script is in the Notes and the join flow works with it.
- [ ] Account deletion is easy to find («Мы» → «Настройки» → «Удалить аккаунт») and actually deletes data.
- [ ] Notification permission is asked only when the user turns on the 2-2-2 rule, not at first launch.
- [ ] Calendar permission is asked only when the user turns on «Добавлять в календарь iPhone»; photo/camera permission only when attaching a photo.
- [ ] Chat: long-press → «Пожаловаться» works (opens mail to the developer).
- [ ] Recipe links open in Safari / SFSafariViewController.
- [ ] Privacy Policy URL is also linked inside the app (Settings/Profile).
- [ ] UGC (Guideline 1.2): leaving a space, removing a member and reporting a message are all in place and listed in the Notes.
- [ ] Sign in with Apple is **not** required: the app offers only its own email sign-in, no third-party/social login (Guideline 4.8).
- [ ] `exp://**` removed from Redirect URLs in Supabase before release.
- [ ] No placeholder text or debug screens in the build.
