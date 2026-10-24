# Build status

Status date: October 24, 2026. Feature IDs follow [`docs/handoff/04-delivery/BUILD-BACKLOG.csv`](docs/handoff/04-delivery/BUILD-BACKLOG.csv).

**Summary:** the P0 guest loop works end to end in a browser. A player opens the daily rack, picks a section, passes three tiles, sees their pass beside one strong pass and the community split, and exports a real 1080×1920 MP4, with or without a voiceover. A friend can play the same rack from a shared link. What remains before launch: device testing on iPhone and Android, teacher-reviewed content, the lawyer's card review, account sign-in, hosting, and native store builds.

## Decisions that differ from the handoff

| Handoff proposal | What was built | Why |
| --- | --- | --- |
| Expo / React Native app plus a small web route | One mobile-first web app (React + Vite) that serves both the daily rack and shared links | Shared links must play with no install, and this environment can verify a browser end to end but cannot build or run iOS/Android binaries. The app can be wrapped for the stores later; the clip renderer runs in a WebView. |
| Encoder chosen in F00 | WebCodecs H.264 via Mediabunny, VP9/AV1 fallback | Hardware or software H.264 exists in current Safari and Chrome; verified here in Chromium |
| Audio codec chosen in F00 | AAC when the browser has it, otherwise Opus | Linux Chromium has no AAC encoder, so the verified voiceover export used Opus. iPhones support AAC. Check that Instagram accepts Opus-in-MP4 if Android exports need it. |
| Provider choices open | Node + Hono + SQLite (built into Node 22) | Small, no paid services; swap to Postgres when hosting is chosen |

## Feature status

| ID | Feature | Status | Evidence and gaps |
| --- | --- | --- | --- |
| F00 | Runtime and video feasibility | Verified in Chromium only | Headless Chromium 153 on Linux exported H.264 1080×1920, 30 fps, 32.0 s, 960 frames, about 4 MB, in about 23 s (faster than real time). A 3 s voiceover exported as Opus 48 kHz. **Not yet run on an iPhone or an Android phone.** |
| F01 | Reviewed puzzle publication | Implemented, content not reviewed | Puzzles validate on load: 13 unique instances, legal copy counts, passable tiles, a reason for every suggested tile. Published revisions are immutable (content hash check). **All 7 racks are practice drafts awaiting a teacher's review** and show a notice. No staff tool to withdraw a revision yet; set `status = 'withdrawn'` in the database. |
| F02 | Guest daily rack and resume | Verified | E2E: first open lands on the rack without sign-up; the draft survives a reload. API tests: unscheduled day returns no rack with the next publication time, correct across daylight saving. |
| F03 | Section and three-tile interaction | Verified | E2E: tap-only selection, a fourth tile is refused with an explanation, swapping a tile, 13 tiles conserved. Sort changes order only. Jokers cannot be passed (client and server). |
| F04 | Canonical submission | Verified | API tests: invalid, unknown, repeated and joker selections; same-key replay returns the same attempt; same key with a different answer conflicts; a new key returns `already_submitted`; three concurrent submits count once. |
| F05 | Result and independent split | Verified | API tests: two-owner isolation, no split before answering, rates withheld under 30 answers, per-tile counts reconcile to 300%, deleted players are taken back out. E2E: result with and without a split; demo answers are labelled on screen. |
| F06 | Preview and optional voiceover | Implemented, partly verified | Preview and export draw from the same timeline. E2E recorded a voiceover with a fake microphone. Caption edits and caption colour work. The microphone-denied path is implemented but untested on devices. Voiceovers stay on the device. |
| F07 | Video export and handoff | Partly verified | E2E saved and probed real MP4 files. The share-sheet path (Web Share API with the file) is implemented but cannot be exercised headless; on browsers without file sharing, the clip downloads and the rack link is copied. Status copy never claims a post happened. |
| F08 | Progress and account claim | Progress verified; claim not built | Streak (same-day daily racks only), best streak, racks solved, strong passes, section practice. **Sign in with Apple/Google and the guest-to-account merge are not built**: they need provider accounts. The handoff's `POST /v1/me/claim-guest` is the planned route. |
| F09 | Exact shared-rack links | Verified on web | E2E and API tests: `/r/:token` opens the exact revision, hides the poster's pass until the visitor answers, shows it only if the poster opted in, and revoked links return 410. Native deep links wait on the native wrapper. |
| F10 | Measurement and monitoring | Implemented, basic | Client milestone events with unique ids (deduplicated on retry) plus server-side `attempt_submitted` and `shared_rack_completed`. No dashboard, no install attribution yet (installs are unknown until the store builds exist). Errors log as structured JSON with a request id. |
| F11 | Accessibility and safe recovery | Partly done | Spoken tile labels and slot announcements, tap-only play, 44 px targets, reduced-motion support, honest error and retry states, delete-my-data (verified by an API test). **Not yet audited with VoiceOver, TalkBack or large text sizes.** |
| F12 | Release candidate verification | Not started | No hosting, domain, store builds or policy pages yet |
| F20–F23 | Weekday modes, Game Night, reminders, player-type card | Not started | P1, after the P0 evidence gate |
| F30–F31 | Creator attribution, night recaps | Not started | P2 |

## Test commands and latest results

- `npm test`: 39 tests passed (core logic and API).
- `npm run e2e` on a fresh database: 15 of 15 checks passed, covering first open, selection rules, draft resume, result, export, voiceover export, shared link, and the Today and You screens.
- `E2E_EXPECT_SPLIT=1 npm run e2e` after `npm run seed:demo`: 14 of 14 checks passed, with the split and demo label shown. (This run was before the voiceover step was added to the script.)

## Before launch

1. Run F00 on real devices: a baseline iPhone (Safari) and a mid-range Android phone (Chrome). Measure export time, memory and file size, and check playback after upload to Instagram and TikTok.
2. Get a teacher to review the first 14 racks, then set `teacherReviewed`.
3. Get a lawyer to review how racks refer to the card, and decide between an original practice card, a League licence, or both.
4. Pick the app name and run a trademark check.
5. Choose hosting, set `PUBLIC_BASE_URL`, and add privacy, support and terms pages.
6. Add Sign in with Apple/Google with the guest claim, then wrap the app for the stores.
