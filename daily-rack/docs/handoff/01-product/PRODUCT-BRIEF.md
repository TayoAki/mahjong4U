# Product brief

## Outcome
Help newer American mahjong players make one useful rack decision between weekly games. Every completed decision can become a faceless vertical teaching clip, so the session produces something a player can share.

The core journey is: open the shared daily rack, choose a direction, pass three tiles, see a reasoned comparison and the community split, and save or share a clip. No account is required before this first result or export.

## Audience
| Audience | Need | Priority |
| --- | --- | --- |
| Learner, roughly first two years | Practice choosing a direction and passing tiles with feedback | Primary |
| Creator or teacher | Turn a rack explanation into a repeatable episode | Secondary; later attribution tools |
| Game-night host | Get four players together and recover from a cancellation | P1 expansion |

The PRD's Instagram research is supplied evidence, not independently audited in this handoff. Its view counts are hypotheses about useful content formats, not forecasts of app conversion or retention.

## Product principles
1. A puzzle has one primary question. Choosing a section supplies context for the pass; the clip focuses on that pass.
2. The daily published rack is shared and immutable, so players can compare the same decision.
3. Provide one strong reviewed suggestion, not a claim that every alternative is wrong.
4. Reveal the split after submission; do not influence a new answer with community choices.
5. Make the session useful without sign-up, microphone permission, camera access, or posting.
6. Keep the overhead rack, captions and optional voice as the main export.
7. Publish original teaching explanations and approved tile artwork. Do not reproduce the annual card.
8. Keep the return loop short. Ask to save progress after delivering value.

## P0 release
- A daily, reviewed thirteen-tile puzzle with stable tile-instance IDs.
- Section selection, sort, and a three-slot pass tray.
- Server-validated submission with duplicate-request protection.
- Result comparison, one-line tile reasoning and a real per-tile split.
- Deterministic 9:16 clip preview and actual MP4 export, with captions and optional short voiceover.
- Save/share through supported device flows.
- Guest progress, daily streak, racks solved and an optional account claim.
- A playable web route for shared rack links and reliable native deep links.
- The small You/progress surface required for saved progress and account controls.
- Basic operational monitoring, content correction, analytics and account-data controls.

## P1
Themed weekday modes; Rule Check; Tile Tricks; a player-type card after enough racks; opt-in reminders; Game Night date voting, RSVPs, seat order and approved two-/three-player variant guidance.

## P2
Creator episode attribution and creator analytics; game-night recap clips. These must not delay the core loop.

## Exclusions from the initial release
Full multiplayer mahjong, wagering, live matchmaking, reproducing the official card, a card-scanning tool, a public social feed, chat, subscriptions, paid creator tools, AI-generated strategy at runtime, and automatic posting to social accounts.

## Entry and return flows
### First open
Open the Rack. Offer lightweight card-year/learning and experience preferences without a sign-up wall or long questionnaire. Let users skip optional preferences. Choose section and three tiles, submit, compare, and make a clip. After the user has a usable result/export, offer "Keep your streak."

### Daily return
Open Today with the new drop, existing streak, and a clear play/resume action. If today's rack is already submitted, show the saved result. Share invitations appear at earned moments, such as a milestone or a sufficiently supported rare choice.

### Shared link
Open the exact immutable puzzle revision in a playable web flow if the native app is unavailable. Hide the poster's pass until the visitor submits. If the poster opted to publish their answer, show the comparison afterwards. Offer tomorrow's rack and the native app after the result. Do not assume installation preserves a deferred link automatically; provide a visible recovery link/code.

### Game Night, P1
Host proposes two or three date/time options with a time zone, shares an invite link, receives votes, and explicitly confirms the selected time. Ties and pending RSVPs remain visible. Supply an ICS/calendar action after confirmation. Seat order and variant help come later in the same P1 flow.

## Success
The PRD's north star is attributed new installs per sharing player. Supporting outcomes are completed guest sessions, successful exports, share-link plays and return visits. These are measured separately: opening a share sheet is not proof of a post or a new install.

The first-session target is a usable clip within 60 seconds, excluding an optional recording. This is a target to test on actual devices and networks, not a demonstrated result.

## Source clarifications
The PRD calls the key-screen set an MVP while listing Game Night as P1. This plan preserves five visual concepts but limits P0 implementation to the core loop and required support surfaces. It also replaces the PRD's Android Instant App suggestion with a playable web entry based on Google's current notice [R1].

