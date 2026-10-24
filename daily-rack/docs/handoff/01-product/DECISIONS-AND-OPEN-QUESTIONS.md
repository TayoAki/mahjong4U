# Decisions and open questions

## Decisions used for this handoff
| Topic | Proposed decision | Reason |
| --- | --- | --- |
| Name | Daily Rack is a placeholder | No final name or trademark check supplied |
| Audience | Learners first | Matches the PRD's primary user |
| First open | Rack, without authentication | Preserves the short first-value path |
| Dashboard | Today for returning users | The Today concept is not a forced extra step |
| Release scope | Core P0; Learn/Game Night P1 | Resolves the screen-list/priority mismatch |
| Suggestions | One reviewed strong pass plus alternatives where useful | Strategy can be debatable |
| Community split | Hidden until submission; independent tile rates | Prevents answer priming and misread totals |
| Progress | Streak, racks solved, reviewed alignment where defined | Majority agreement is not accuracy |
| Install-free play | Playable web first | Android Instant Apps are unavailable [R1] |
| Media | Deterministic local export preferred | Avoids uploading voice by default; feasibility still requires F00 |
| Runtime | Expo/React Native/TypeScript proposal | Shared mobile UI with native-build escape hatch [R2-R5] |
| AI | Development aid only in P0 | Runtime strategy should be reviewed, reproducible content |
| Data calendar | Proposed America/New_York publication calendar | One shared content day; store all timestamps as UTC |
| Poll locking | Host explicitly confirms a winner | Avoids silent locking while votes or ties remain |

These are implementation proposals, not claims that services or accounts have already been selected or configured.

## Decisions to resolve before building the dependent feature
1. Product owner: confirm name, final platform priorities and supported devices.
2. Content owner: confirm a practice-card approach, licensing path, or another reviewed approach. Do not publish copied card material. Obtain the review requested by the PRD.
3. Teacher/editor: approve eligible section vocabulary, suggestion method, alternate acceptable passes and correction process.
4. Product owner: choose the global publication time and streak boundary. Proposed default is midnight in America/New_York; local reminder times remain independent.
5. Engineering: prove the video renderer, text measurement, audio synchronization and platform storage/share behavior on device before selecting a library.
6. Owner: choose identity, database, hosting and monitoring providers after evaluating project constraints. No paid service purchase is authorized by this package.
7. Owner/content team: approve original tile art and font licenses; generated screenshots do not supply production tile assets.
8. Product: define whether section changes are allowed after submission. Proposed default: no changes to the counted first attempt; allow an explicitly uncounted practice replay later.
9. Privacy/product: decide retention, age audience, public-share defaults and whether raw voice ever leaves the device.
10. Measurement: choose an attribution method that can actually be observed; unknown installs must remain unknown.

## Known visual limitations
The final overview corrects the suggested-pass comparison in the initial overview. All PNGs remain generated illustrations. Individual tile symbols, dot/bamboo counts, label placement and exact geometry can still differ from the fixture or the written specification. Rebuild tiles as deterministic, accessible components from reviewed assets.

The Clip PNG is a still image. It is not an encoded video or evidence that a native sharing integration works. The five-screen overview includes P1 controls. No standalone Today/Game Night portrait was generated.

## Source limits
Social performance, market claims, competitor pricing and the card-rights discussion come from the original supplied PRD. They were not independently validated here. They should not be turned into promotional promises. This handoff's current technical checks are listed in REFERENCES.md.

