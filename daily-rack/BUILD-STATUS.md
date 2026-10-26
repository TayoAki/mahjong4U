# Build status

Status date: October 25, 2026. Feature IDs follow [`docs/handoff/04-delivery/BUILD-BACKLOG.csv`](docs/handoff/04-delivery/BUILD-BACKLOG.csv).

**Summary:** Daily Rack is now one Expo app (iOS, Android and web) with two halves. The daily rack loop works end to end: open the rack, pass three tiles, compare with one strong pass and the community split, and export a real 1080×1920 MP4. On top of that, players can sit down to full games of American mahjong against computer players or with friends, live or turn-based, add friends by code, chat, and plan in-person Game Nights with an online table as the fallback. Everything below marked *verified* was exercised in headless Chromium against the Expo web build; the iOS and Android bundles compile, but **no native build has been run on a device yet**. There is deliberately no sign-in: every player is a guest identified by their device. Chat has the safety tools App Store review asks for: community rules, a word filter, reporting, blocking and moderator tools. What remains before launch: device testing, teacher-reviewed content, the lawyer's card review, push notifications, hosting and store builds.

## Decisions that differ from the handoff

| Handoff proposal | What was built | Why |
| --- | --- | --- |
| Expo / React Native app plus a small web route | One Expo Router app for iOS, Android and the web; the server hosts the web export, so shared links still play with no install | Matches the handoff. The clip renderer is canvas and WebCodecs code, so native builds run it in a WebView of the web build and receive the MP4 over the bridge for the share sheet or Photos. |
| Encoder chosen in F00 | WebCodecs H.264 via Mediabunny, VP9/AV1 fallback | Hardware or software H.264 exists in current Safari and Chrome; verified here in Chromium |
| Audio codec chosen in F00 | AAC when the browser has it, otherwise Opus | Linux Chromium has no AAC encoder, so the verified voiceover export used Opus. iPhones support AAC. Check that Instagram accepts Opus-in-MP4 if Android exports need it. |
| Provider choices open | Node + Hono + SQLite (built into Node 22) | Small, no paid services; swap to Postgres when hosting is chosen |
| No multiplayer in the P0 scope | Full four-seat games, friends, chat and Game Night (added at the owner's request) | The owner asked for real games with friends, live or turn-based, plus in-person game planning |
| Card to be decided after legal review | Games use an original house card (33 hands, eight sections) | Real play needs a card; the League card can't be copied without a licence |

## Feature status

| ID | Feature | Status | Evidence and gaps |
| --- | --- | --- | --- |
| F00 | Runtime and video feasibility | Verified in Chromium only | Headless Chromium 153 on Linux exported H.264 1080×1920, 30 fps, 32.0 s, 960 frames, about 4 MB, in about 23 s (faster than real time). A 3 s voiceover exported as Opus 48 kHz. **Not yet run on an iPhone or an Android phone.** |
| F01 | Reviewed puzzle publication | Implemented, content not reviewed | Puzzles validate on load: 13 unique instances, legal copy counts, passable tiles, a reason for every suggested tile. Published revisions are immutable (content hash check). **All 7 racks are practice drafts awaiting a teacher's review** and show a notice. No staff tool to withdraw a revision yet; set `status = 'withdrawn'` in the database. |
| F02 | Guest daily rack and resume | Verified | E2E: first open lands on the rack without sign-up; the draft survives a reload. API tests: unscheduled day returns no rack with the next publication time, correct across daylight saving. |
| F03 | Section and three-tile interaction | Verified | E2E: tap-only selection, a fourth tile is refused with an explanation, 13 tiles conserved. Sort changes order only. Jokers cannot be passed (client and server). |
| F04 | Canonical submission | Verified | API tests: invalid, unknown, repeated and joker selections; same-key replay returns the same attempt; same key with a different answer conflicts; a new key returns `already_submitted`; three concurrent submits count once. |
| F05 | Result and independent split | Verified | API tests: two-owner isolation, no split before answering, rates withheld under 30 answers, per-tile counts reconcile to 300%, deleted players are taken back out. E2E: result with and without a split; demo answers are labelled on screen. |
| F06 | Preview and optional voiceover | Implemented, partly verified | Preview and export draw from the same timeline. E2E recorded a voiceover with a fake microphone. Caption edits and caption colour work. The microphone-denied path is implemented but untested on devices. Voiceovers stay on the device. |
| F07 | Video export and handoff | Partly verified | E2E saved and probed real MP4 files. The share-sheet path (Web Share API with the file) is implemented but cannot be exercised headless; on browsers without file sharing, the clip downloads and the rack link is copied. Status copy never claims a post happened. |
| F08 | Progress and account claim | Progress verified; sign-in dropped by decision | Streak (same-day daily racks only), best streak, racks solved, strong passes, section practice. **No sign-in, by the owner's decision (October 25, 2026).** On iOS the guest token lives in the Keychain, which today survives deleting and reinstalling the app on the same phone. A new phone starts as a new player, with no friends, games or streak. If that becomes a problem, a one-time "move to a new phone" code would fix it without accounts. With no accounts, Sign in with Apple and in-app account deletion aren't required; Delete my data stays. |
| F09 | Exact shared-rack links | Verified on web | E2E and API tests: `/r/:token` opens the exact revision, hides the poster's pass until the visitor answers, shows it only if the poster opted in, and revoked links return 410. The app registers the `dailyrack://` scheme; universal links need the production domain. |
| F10 | Measurement and monitoring | Implemented, basic | Client milestone events with unique ids (deduplicated on retry) plus server-side `attempt_submitted` and `shared_rack_completed`. No dashboard, no install attribution yet (installs are unknown until the store builds exist). Errors log as structured JSON with a request id. |
| F11 | Accessibility and safe recovery | Partly done | Spoken tile labels and slot announcements, tap-only play, 44 px targets, reduced-motion support, honest error and retry states, delete-my-data (verified by an API test). **Not yet audited with VoiceOver, TalkBack or large text sizes.** |
| F12 | Release candidate verification | Started | Hosted on Railway (https://daily-rack-production.up.railway.app) with a persistent volume; a smoke test from outside passed (guest session, daily rack, a game against the computer, live WebSocket, moderator lock). No custom domain, store builds or policy pages yet. |
| F20, F22, F23 | Weekday modes, reminders, player-type card | Not started | P1 |
| F21 | Game Night | Verified on web | See the multiplayer table below. |
| F30–F31 | Creator attribution, night recaps | Not started | P2 |

## Multiplayer (games, friends, Game Night)

| Feature | Status | Evidence and gaps |
| --- | --- | --- |
| Game engine and house card | Verified | 20 engine tests: card validity (every concrete hand is makeable with 152 tiles and 8 jokers), wins with jokers, exposures and concealed hands, the Charleston with vote and courtesy pass, claim priority and payments (discarder pays double), exposure then joker swap, wall games, private views. **The house card has not been reviewed by a teacher**, and scoring values are a first pass. |
| Computer players | Verified | Easy, Steady and Sharp. Four Steady players finish about 94% of hands with a Mahjong; Sharp beats Steady head to head. They call, swap jokers and pass in the Charleston. |
| Tables, live and turn-based | Verified on web | API tests: a hand against the computer to the end and the next deal; stale and out-of-turn moves refused; hands stay private; leaving mid-hand hands the seat to a computer; live timeouts auto-play. E2E: a full hand against the computer, then hand 2 with the deal passed on; two guests at the same live table play a hand to the end and see the same scores. |
| Friends, presence and chat | Verified on web | API tests plus E2E: add by code, accept, unread counts, direct and table chat delivered live over the WebSocket. |
| Safety: rules, filter, report, block, moderation | Verified on web | Covers App Store Guideline 1.2 (see `docs/MODERATION.md`). API tests: the rules gate, the word filter on messages, names and Game Nights, two-way blocking (friendship ends, messages hidden and not pushed, no requests, tables or invites), reports hiding a message for the reporter and then for everyone, moderator suspend and unsuspend, token-protected moderator endpoints, and cleanup on delete-my-data. E2E: rules sheet before the first friend request, the filter refusing a message, reporting a message, the moderator seeing it, blocking from a chat, and unblocking on the You tab. **Someone has to review reports within 24 hours after launch**; the webhook and `npm run reports` are the tools. The filter is English-only. |
| Game Night | Verified on web | API tests plus E2E: plan up to three times, invite link, live votes and RSVPs, lock in a time, a valid `.ics` calendar file, and "play online instead" opening a table with held seats. Suggestions for three or two players are framed as house-rule ideas, not rulings. |
| Native app (iOS, Android) | Compiles; not run | `expo export` bundles both platforms to Hermes bytecode and `expo-doctor` passes 20 of 20 checks. **Not yet run on a device or simulator**: the share sheet, Photos save, secure token storage, keyboard handling in chat and the WebView clip export need checking on hardware. |
| Notifications | Not built | Turn-based play relies on the Play tab badge and live updates while the app is open. Push notifications for "your move", invites and Game Night reminders need an Expo push setup and an Apple/Google account. |

## Test commands and latest results

- `npm test`: 77 tests passed (core, game engine, daily rack API, multiplayer API including the WebSocket, safety and moderation).
- `npm run typecheck`: core, server and the Expo app type-check cleanly.
- `npm run e2e` on a fresh database (`BOT_DELAY_MS=120`, `ADMIN_TOKEN` set): 37 of 37 checks passed, covering first open, selection rules, draft resume, result, a real MP4 export (H.264 1080×1920, 32.0 s, 4.0 MB) and a voiceover export (Opus 48 kHz), a full hand against the computer and the next deal, the community rules, the word filter, friends and live chat, a live table with a friend played to the end, Game Night from invite to calendar file, reporting a message (and the moderator view), blocking and unblocking, the shared rack link, and no uncaught page errors.
- `npx expo install --check`: every dependency matches Expo SDK 58 (`expo` 58.0.19, React Native 0.88.0, React 19.3.0).
- `npx expo export --platform ios` and `--platform android`: both bundle; `npx expo-doctor`: 20 of 20 checks passed.

## Before launch

1. Run F00 on real devices: a baseline iPhone (Safari) and a mid-range Android phone (Chrome). Measure export time, memory and file size, and check playback after upload to Instagram and TikTok.
2. Get a teacher to review the first 14 racks, then set `teacherReviewed`.
3. Get a lawyer to review how racks refer to the card, and decide between an original practice card, a League licence, or both.
4. Pick the app name and run a trademark check.
5. Add privacy, support and terms pages. (Hosting is done: the server runs on Railway at https://daily-rack-production.up.railway.app with a persistent volume; turn on volume backups in the dashboard.)
6. Try the app on an iPhone in Expo Go from a Codespace (`API_URL=https://daily-rack-production.up.railway.app npm run phone`, see the README), then set up EAS builds for TestFlight and Play internal testing with `EXPO_PUBLIC_API_URL` set to the Railway address.
7. `ADMIN_TOKEN` is set on Railway. Add `SUPPORT_EMAIL` and ideally `REPORT_WEBHOOK_URL`, decide who reviews reports every day, and paste the App Review note from `docs/MODERATION.md` into the submission.
8. Add push notifications for turn-based moves, table invites and Game Night reminders.
9. Have a teacher review the house card and its point values.
