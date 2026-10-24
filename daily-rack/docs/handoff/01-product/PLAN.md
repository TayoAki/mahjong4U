# Daily Rack - Executable plan
Status date: October 24, 2026.

## Outcome and delivery target
A guest can practice a daily American mahjong rack and produce a shareable vertical clip. Proposed targets: iOS and Android native apps plus a small install-free web rack flow. This delivery is the design/planning handoff only.

## Current evidence
| Work | Status | Evidence |
| --- | --- | --- |
| Supplied PRD retained | Complete | 06-source/original-prd.txt |
| Five-screen visual direction | Complete as concept | 02-design/images/01-ui-overview-final.png |
| Rack, Result, Clip detail concepts | Complete as concept | Individual PNG files |
| Product/design/build documents | Complete as handoff | This package |
| Functional app, APIs and storage | Planned | No implementation provided |
| Device, media or service verification | Not performed | No runtime was built or exercised |
| Puzzle correctness | Unreviewed | Fixture is illustrative |
| Publication or store distribution | Not performed | No deployments or submissions |

## Navigation
- First open: Rack -> Result -> Clip -> optional Keep your streak sheet.
- Returning root: Today -> today's Rack, or saved Result if already answered.
- Task stack: Rack, Result, Clip, recording sheet and share sheet.
- P0 support: You/progress, account access and data controls.
- P1 root additions: Learn and Game Night.
- Shared entry: /racks/:puzzleRevisionId on web; linked native route when installed.
- Additional engineering routes are support states, not additional large product areas.

The four-tab visual overview shows the intended expanded navigation. P0 should expose Today and You only until Learn/Game Night have working content and behavior.

## State and data overview
Puzzle definitions and reviewed suggestions are server-owned immutable revisions. Each deal contains exactly thirteen unique tile instances, even when tile faces repeat. Attempts belong to a server-issued guest principal or an authenticated principal. Submission fixes the three tile-instance IDs, selected section, puzzle revision and publication day.

Local state holds an unsent selection, cached approved puzzle data and temporary clip files. The server validates submissions, aggregates the split, records progress and controls public share links. Voiceover stays local by default. Shared links contain opaque references, not credentials.

## Feature plan
Detailed acceptance criteria and evidence requirements are in 04-delivery/BUILD-BACKLOG.csv. All items below are Planned.

| ID | Outcome | Depends on | Release |
| --- | --- | --- | --- |
| F00 | Prove native runtime, tile interaction and MP4 encoder | None | P0 |
| F01 | Publish immutable, reviewed puzzle content | F00 | P0 |
| F02 | Guest opens and resumes the daily deal | F01 | P0 |
| F03 | Select a section and exactly three tile instances | F02 | P0 |
| F04 | Submit once and obtain an owned immutable result | F03 | P0 |
| F05 | Compare with a reviewed pass and real split | F04 | P0 |
| F06 | Build deterministic preview and optional voiceover | F05 | P0 |
| F07 | Export and save/share an actual vertical video | F00, F06 | P0 |
| F08 | Persist guest progress and claim it into an account | F04 | P0 |
| F09 | Play an exact shared rack on web/native links | F04, F05 | P0 |
| F10 | Measure funnel and diagnose real failures | F02, F04, F07, F09 | P0 |
| F11 | Complete accessibility, recovery and account-data controls | F02-F10 | P0 |
| F12 | Validate private distribution and production services | F01-F11 | P0 |
| F20 | Add themed Rule Check/Tile Trick learning drops | P0 evidence gate | P1 |
| F21 | Create date polls, votes and guest RSVPs | P0 evidence gate | P1 |
| F22 | Confirm time, seats and approved variant help | F21 | P1 |
| F23 | Add reminders and evidence-based player-type cards | F08, P0 evidence gate | P1 |
| F30 | Add opt-in creator attribution and plays | F09, P1 gate | P2 |
| F31 | Create opt-in game-night recap clips | F07, F22, P1 gate | P2 |

## Sequence and gates
### Gate A: technical and content feasibility
Prove the real encoder on representative devices; confirm the minimum supported OS versions and dependency versions; approve the content-rights approach; have a qualified teacher review the first set. If the video spike fails, resolve it before calling the app feasible.

### Gate B: usable guest vertical slice
Implement F01-F07. A tester must open a rack, choose a section, pass three tiles, see their own result, and save a decodable MP4. A mock preview or successful API response does not satisfy this gate.

### Gate C: durable sharing and return
Implement F08-F11. Confirm guest claim, exact-rack links, deduplicated analytics, recovery and account-data controls. Complete a small observed beta before changing the scope.

### Gate D: release candidate
Complete F12, verify production origins, migrations, signing, policy/support pages and distribution builds separately. Owner authorizes actual publication at that stage; this handoff publishes nothing.

### Gate E: expand only with evidence
Review the PRD's share/conversion assumptions after the first four weeks. If people cannot finish or export, improve the core loop. If exports work but links do not produce plays, fix the destination. Then choose P1 work based on observed demand.

## Working build loop
For each feature: scope acceptance, implement one complete action, run on the target runtime, compare screenshots, fix observed gaps, verify the relevant behavior, review the actual diff, and update evidence in this plan. Record status as Planned, In progress, Implemented/unverified, Verified, Blocked or Deferred.

Do not mark a feature Verified from image review or code inspection alone. Tests should protect real invariants and failure modes, not mirror view code.

## First feature: F00
Entry: no app project exists in this package.
Exit: a minimal development build plays a fixture selection and saves a real 1080 x 1920 MP4 on iOS and Android.
Acceptance:
- Pin a compatible runtime and record it; do not copy a stale SDK version from a tutorial.
- Load thirteen tile instances with readable labels and a large-target selection path.
- Preview, encode, play back and save a short clip with correct orientation and no clipped captions.
- Exercise background/foreground behavior and cancellation.
- Measure export duration, memory pressure and resulting file size on baseline devices.
Evidence: device models/OS, build revision, file metadata, playback result and measured timings.
Unresolved: final minimum devices, encoder implementation, font/tile asset approvals.
Next feature after F00: F01, reviewed puzzle definition and publication.

