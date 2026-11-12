# Вместе (Vmeste) — App Privacy (App Store Connect)

App Store Connect → your app → **App Privacy** → Get Started.

**Privacy Policy URL:** `https://deckkk491-creator.github.io/vdvoem/privacy-policy.html`

## Step 1. Data collection

**Do you or your third-party partners collect data from this app?** → **Yes, we collect data from this app.**

(Supabase counts as your service provider; data stored there is "collected".)

## Step 2. Data types — tick exactly these

| Category | Data type | Tick? | What it is in the app |
|---|---|---|---|
| Contact Info | **Email Address** | ✅ | Email-code sign-in |
| Contact Info | **Name** | ✅ | Profile name shown to space members |
| User Content | **Other User Content** | ✅ | Movies, recipes and links, weekend ideas/trips, savings goals/amounts, shopping list, wishlists, "I'll gift this" marks, likes/dislikes, 2-2-2 settings, calendar events/tasks/important dates, theme choice |
| User Content | **Emails or Text Messages** | ✅ | In-app chat messages between members of a space |
| User Content | **Photos or Videos** | ✅ | Photos the user attaches to dates, trips, events, wishes and chat (private storage, members only) |
| User Content | **Audio Data** | ✅ | Voice messages the user records in chat (private storage, members only) |
| User Content | **Other User Content** (files) | ✅ (same row as above) | Documents the user attaches (tickets, PDFs) |
| Identifiers | **User ID** | ✅ | Supabase account UUID that ties content to the user |
| Contact Info | Phone Number, Physical Address, Other Contact Info | — | not collected |
| Health & Fitness | — | — | not collected |
| Financial Info | Payment Info, Credit Info | — | not collected (no payments, no bank or card data) |
| Financial Info | Other Financial Info | App Functionality, linked to identity, not used for tracking | **collected since the Budget section (Nov 2026)**: income and expense amounts the user types in (may include salary) |
| Location | Precise / Coarse | — | not collected |
| Sensitive Info | — | — | not collected |
| Contacts | — | — | not collected (invite code is shared manually) |
| User Content | Gameplay, Customer Support | — | not collected |
| Browsing History, Search History | — | — | not collected |
| Identifiers | Device ID | — | not collected (no IDFA/IDFV sent) |
| Purchases | — | — | not collected |
| Usage Data | Product Interaction, Advertising Data, Other | — | not collected (no analytics) |
| Diagnostics | Crash Data, Performance Data, Other | — | not collected (no crash SDK) — **change if you add Sentry, Firebase Crashlytics, etc.** |
| Other Data | — | — | not collected |

Note on "Other Financial Info": Apple means things like salary or debts. The Budget section lets users record income (e.g. salary) and expenses, so tick **Other Financial Info** — App Functionality, linked to the user, no tracking. Savings goals stay under **Other User Content**.

## Step 3. For EACH ticked type, answer the same way

Applies to Email Address, Name, Other User Content, Emails or Text Messages, Photos or Videos, Audio Data and User ID.

| Question | Answer |
|---|---|
| How is this data used? | **App Functionality** only |
| (Third-Party Advertising, Developer's Advertising or Marketing, Analytics, Product Personalization, Other Purposes) | not ticked |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking purposes? | **No** |

## Resulting App Store label

- **Data Used to Track You:** none
- **Data Linked to You:** Contact Info (Email Address, Name), User Content (Emails or Text Messages, Photos or Videos, Audio Data, Other User Content), Identifiers (User ID)
- **Data Not Linked to You:** none

## Before you submit — check the build

- [ ] No analytics / crash-reporting SDKs. If added, add Diagnostics and/or Usage Data with the matching purposes.
- [ ] Supabase project region is in the EU (matches the privacy policy).
- [ ] Push notifications are local only (no APNs device token stored in Supabase). If you later store push tokens, tick **Identifiers → Device ID** (App Functionality, linked, no tracking).
- [ ] Recipe links: if the app fetches a page title/image through your own server or a Supabase Edge Function, that's still App Functionality — no extra data type needed unless you log browsing.
- [ ] In-app account deletion works end to end (Guideline 5.1.1(v)).

## Tracking

**Does this app track users?** → **No.** No IDFA, no data brokers, no ad SDKs. No App Tracking Transparency prompt.

## Privacy manifest (PrivacyInfo.xcprivacy)

- `NSPrivacyTracking` → `false`.
- `NSPrivacyCollectedDataTypes` → EmailAddress, Name, OtherUserContent, EmailsOrTextMessages, PhotosorVideos, AudioData, UserID; each `Linked = true`, `Tracking = false`, purpose `AppFunctionality`.
- Required Reason APIs: `NSPrivacyAccessedAPICategoryUserDefaults` → `CA92.1` (AsyncStorage / session storage).

Expo/React Native: set these under `ios.privacyManifests` in `app.json`.
