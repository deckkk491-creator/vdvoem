# Вместе (Vmeste) — App Review notes

Paste the English block below into App Store Connect → version 1.0 → **App Review Information**.

## Sign-in information

The app signs in with a one-time code sent by email, so the reviewer can't receive the code to an inbox they don't own. Set up a **demo account** before submitting (see "How to prepare the demo account" below).

| Field in App Store Connect | Value |
|---|---|
| Sign-in required | **Yes** |
| User name | `[demo email, e.g. review@...]` |
| Password | `[fixed code for the demo account, e.g. 123456]` |

Contact: deckkk491-creator, deckkk491@gmail.com, phone: `[+7 XXX XXX-XX-XX]`

---

## Notes (paste as is, fill in the brackets)

```
Hello, and thank you for reviewing Vmeste («Вместе», Russian for "together").

Vmeste is a private shared space for a couple or a family: movies and series to watch together, recipes saved from links, weekend outing ideas, a shared savings jar, a shopping list by category and personal wishlists. Members add items and like each other's items.

SIGN-IN
The app uses passwordless email sign-in: the user enters an email and receives a one-time code.
For review we prepared a demo account with a fixed code:
- Email: [DEMO_EMAIL]
- Code: [DEMO_CODE]
Enter the email, tap "Get code", then enter the code above. No email inbox access is needed.

The demo account is already a member of a sample space ("[DEMO_SPACE_NAME]") with a second demo member, so all sections contain sample data.

INVITE-CODE FLOW
Spaces are private and invite-only. A member creates a space, the app shows an invite code, and the other person enters this code in the app to join.
To test joining, use the invite code: [DEMO_INVITE_CODE]
(Profile / Space → "Join with a code"). You can also create a new space and see its invite code.

FEATURES TO CHECK
- Add an item in any section (e.g. a movie) and like an item.
- Wishlists: open the other member's wishlist and tap "I'll gift this". This mark is hidden from the wishlist owner.
- Savings jar: a manual tracker only. The app does not process payments or connect to banks.
- 2-2-2 rule ("Us" tab → 2-2-2): date night every 2 weeks, a new place every 2 months, a new country every 2 years; the couple can change the rhythm (e.g. 1-2-3). When enabled, the app asks for notification permission and schedules LOCAL notifications. No remote push. Country ideas show landmark photos from Wikimedia Commons (free licences, author credited on each photo).
- Calendar tab: shared events, tasks ("I'll do it" to take a task) and important dates. Optional "Add to iPhone Calendar" switch writes events to a separate "Вместе" calendar on the device; calendar permission is asked only when the user turns it on.
- Chat (bubble icon at the top of every tab): private messages between members of the space, with photo and document attachments stored in private storage (signed URLs, members only).
- Photos: the photo library / camera permission is asked only when the user taps "Photo" to attach a picture.

ACCOUNT DELETION
Profile → "Delete account". This permanently deletes the account and the user's data from our database (Guideline 5.1.1(v)).

USER-GENERATED CONTENT
Content and chat messages are visible only to members of the same private space, who joined by an invite code they received from someone they know (typically a partner or family). There is no public feed and no way to find or message strangers. Any member can leave a space at any time (Settings → Leave space, or long-press a partner's chat message → "Выйти из пространства"), which immediately stops all contact; the same long-press menu offers "Пожаловаться" (Report), which emails the message to the developer (deckkk491@gmail.com) for review within 24 hours.

DATA
Data is stored in Supabase (EU region). No ads, no analytics, no tracking, no in-app purchases.

Contact: deckkk491@gmail.com
```

---

## How to prepare the demo account (Supabase)

Pick one option and test it from a clean install before submitting.

1. **App-side review login (recommended).** Create the demo user in Supabase Dashboard → Authentication → Users with a password. In the app, if the entered email equals the demo email, call `signInWithPassword` with the "code" the reviewer types instead of `verifyOtp`. Use a long random value rather than `123456`, keep the account limited to its own demo space, and give the value to Apple in the Password field.
2. **Supabase test OTP.** Supabase's built-in test OTPs (Authentication → Providers) are documented for phone sign-in; check whether your project supports a fixed code for email before relying on it.
3. **Fallback:** create a mailbox you control (e.g. a separate Gmail) and be ready to forward codes — not recommended, reviews often happen at night Moscow time.

Then:

- [ ] Create a sample space with a second demo user; fill every section with 3–5 neutral items (no real personal data).
- [ ] Generate a spare space and note its invite code for `[DEMO_INVITE_CODE]`.
- [ ] Make sure deleting the demo account during review won't break your setup — keep a script to recreate it, since reviewers often test deletion.

## Checklist before submitting

- [ ] Account deletion is easy to find (Profile/Settings) and actually deletes data.
- [ ] Notification permission is asked only when the user turns on the 2-2-2 rule, not at first launch.
- [ ] Calendar permission is asked only when the user turns on "Add to iPhone Calendar"; photo/camera permission only when attaching a photo.
- [ ] Chat: long-press → «Пожаловаться» works (opens mail to the developer).
- [ ] Recipe links open in Safari / SFSafariViewController.
- [ ] Privacy Policy URL is also linked inside the app (Settings/Profile).
- [ ] UGC (Guideline 1.2): even for private spaces, it helps to have a way to leave a space and remove a member. If there is none, say so honestly in the notes and stress that spaces are invite-only.
- [ ] Sign in with Apple is **not** required: the app offers only its own email sign-in, no third-party/social login (Guideline 4.8).
- [ ] No placeholder text or debug screens in the build.
