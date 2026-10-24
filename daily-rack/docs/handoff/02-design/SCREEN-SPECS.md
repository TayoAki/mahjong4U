# Screen specifications

## 01 - Today
Purpose: orient a returning player and lead to today's decision.

Hierarchy: wordmark and streak; themed-drop heading; overhead rack hero; Play/Resume action; small weekly rhythm; progress link. Before submission, do not reveal which tiles other players passed. The visual phrase "See how your pass compares" is a spoiler-free teaser.

Primary action: "Play today's rack". If a draft exists: "Resume your rack". If submitted: "See your result". Today is not mandatory on first open.

States:
- Loading: reserve hero geometry and show honest loading feedback.
- Ready: reviewed daily puzzle is available.
- Draft: restore section and tile-instance selections.
- Completed: open the saved result; do not create another counted submission.
- No drop: "The next rack is on its way" with an actual next-publication time if known.
- Offline: cached puzzle may be practiced; mark any result as pending until the server confirms it.

Expanded navigation is Today, Learn, Game Night, You. P0 should show only working destinations, Today and You.

## 02 - Rack
Purpose: choose a section and three tiles without a timer or account pressure.

Header: back, "Today's rack", help. Main copy: "What would you pass?" / "Pick a section, then choose 3 tiles."

Inputs: one section from the puzzle's approved choices; a thirteen-tile deal; sort control; exactly three pass slots. The example section chips are 2468, Consecutive Run and Any Like Numbers. They are labels, not reproduced card rows.

Interaction:
1. Selecting a chip records direction and does not silently change tiles.
2. A tile tap moves that unique instance into the first available tray slot.
3. A tray tap removes it; selecting a fourth tile explains "Choose 3 tiles" and keeps state predictable.
4. Sort by suit reorders only the remaining visual rack; it never changes IDs or selection.
5. Submit is enabled only with one valid section and exactly three distinct IDs.
6. Disable duplicate requests while submitting. Retry with the same idempotency key after an uncertain network outcome.
7. After accepted submission, open the server-owned result. Preserve an unsent draft through an ordinary app restart.

States: 0-3 selected, invalid/unknown section, loading, submitting, timeout with safe retry, cached offline draft, published puzzle withdrawn, already submitted. Copy errors precisely rather than resetting the rack.

Accessibility: announce face and selection, such as "Seven character, selected, pass slot 1 of 3." Duplicate 2-dot tiles remain independently operable. All actions work without dragging.

The illustrated final state contains ten remaining tiles plus three passed tiles, thirteen total. Its artwork is not authoritative game data.

## 03 - Result
Purpose: explain one useful direction and show independent community choices.

Hierarchy: direction headline and chosen-section badge; "Your pass" alongside "One strong pass"; concise reasoning for each suggestion; split bars; streak/progress; "Make my clip".

The fixture's user and suggested passes match: 7-character, 9-character and red dragon. Actual reviewed puzzles may differ. If the user chose another reasonable pass, avoid calling it wrong solely because it differs.

Split definition: for tile instance i, confirmed counted first attempts selecting i divided by eligible counted first attempts for this exact puzzle revision. Display denominator and snapshot time or a natural freshness label. Thirteen per-instance rates sum to 300%, because each attempt chooses three tiles. The three displayed fixture bars are only a subset and need not total 100%.

For identical faces, keep IDs distinct in the backend. Recommended UI groups identical faces and labels the statistic "Players passing at least one 2 dot"; that grouped numerator is distinct attempts, not summed instance counts. Never mix grouped and per-instance definitions in the same label.

Small samples: default proposed threshold 30 eligible attempts; below it show "More players are weighing in" instead of percentages. Final threshold is a product choice. Empty split is a valid state. Teacher suggestions remain available if the split service fails.

If data is revoked for a content correction, preserve the user's history and explain that the lesson was updated. Never silently compare different puzzle revisions.

## 04 - Clip
Purpose: make a postable asset with minimal setup.

Hierarchy: back and "Make your clip"; complete 9:16 preview; optional voiceover; Share clip; Save video. No camera permission. No tab bar while composing.

Required controls: play/pause/scrub; record up to 20 seconds; review/re-record/delete recording; editable short reasoning text within bounded templates; caption toggle/style; render progress; cancel/retry; share/save after a real file exists.

Clip content from the PRD:
- 1080 x 1920, overhead rack and pass tray.
- First-three-second hook: magenta #99028F sentence-case text on a white rounded banner, roughly 25-43% down the frame.
- White bold all-caps word captions on #1B4F9C or #B5179E boxes, roughly 72-86% down.
- A primary daily clip of 30-60 seconds; short Tile Tricks later remain under 20 seconds.
- Sequence: question, rack, three tile moves with brief reasoning, split, final question and "Play today's rack" end card.
- Optional voice only, no bundled music. Caption-only export is fully usable.
- App name and configured short link on the end card. No invented live URL.

Suggested 32-second template: 0-3 hook; 3-7 rack/context; 7-19 three four-second tile explanations; 19-25 split; 25-29 question; 29-32 end card. A 20-second recording does not need to fill the entire visual duration; captions and intentional holds cover the remaining time. Preview and render use the same timeline definition.

Word timing: use recording timestamps or a reviewed alignment method; without voice use a deterministic readable schedule. Never invent a transcript or silently upload audio for alignment. Keep critical captions away from anticipated platform overlays and verify destination previews on actual devices.

Permissions/recovery: request microphone access only at Record. On denial, offer captions-only and a settings route where appropriate. Saving uses the platform-appropriate user-selected destination/permission path. Low storage, interruptions, unsupported codecs and missing share targets have actionable states.

A platform share sheet is the P0 destination handoff. Opening it does not confirm publication to Reels or TikTok. Destination-specific integrations require a separate current feasibility check.

## 05 - Game Night - P1
Purpose: get a small group to a confirmed table.

Hierarchy: night name; date poll; time-zone-aware time options; participant RSVP list; host confirmation; invite action; later seats and variant help.

The visual overview shows example people and dates only. Votes must store concrete start instants plus an event time zone. Display the viewer's local time and event zone when ambiguity matters. Handle daylight-saving changes at date selection.

Host can propose 2-3 slots, share an unguessable link, close voting and confirm a time. Ties stay open until the host decides. Guests can vote without installing. Invite access does not confer host editing rights. Provide ICS/calendar handoff after confirmation, not silent calendar writes.

States: new draft, active poll, tied poll, date confirmed, pending players, three players, cancelled night, expired/revoked link. Variant switch displays approved instructions; it does not invent rules.

## Support surfaces
- Preferences: card context and experience level; skippable on first play.
- You/progress: streak, unique racks completed, section practice distribution and reviewed outcomes when defined.
- Keep your streak: optional Apple/Google access after value; guest data survives cancellation.
- Data/account: sign out, manage local recordings and initiate deletion if accounts ship.
- Exact-rack web entry: correct puzzle title/revision, same core selection flow, recovery when the link is unavailable.

## UI copy guidelines
Short, nonjudgmental and concrete. Use "One strong pass", "See the split", "Make my clip", "Keep your streak", and "More players are weighing in". Avoid "Only correct answer", "Posted!" after merely opening a share sheet, or invented percentages before real data exists.

