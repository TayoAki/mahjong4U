# Design system

## Direction
A welcoming tabletop experience with crisp editorial hierarchy: warm ivory UI, forest-green felt, tactile ivory tiles and focused magenta actions. The UI stays calm while the rack carries the visual personality.

Generated images establish the direction. The explicit tokens below and in design-tokens.json are proposed implementation values; do not measure every pixel from generated art.

## Colors
| Token | Value | Use |
| --- | --- | --- |
| canvas | #FAF7F0 | Main screen background |
| ink | #173F36 | Main text, headings and felt base |
| primary | #99028F | Primary actions, active selection, share title text |
| surface | #FFFFFF | Raised cards and white title banner |
| sage | #EEF1E7 | Comparison and explanation cards |
| pink | #FCE8F3 | Streak highlights and selected badges |
| muted | #667069 | Secondary text |
| border | #DEDCD4 | Quiet outlines and separators |
| captionBlue | #1B4F9C | Export caption background |
| captionMagenta | #B5179E | Alternate export caption treatment |
| tileIvory | #FFF8E9 | Tile face |
| tileGreen | #164D3F | Dot/bamboo artwork |
| tileRed | #B62226 | Character and dragon artwork |

Keep white text on the magenta primary action. Selected tiles use an outline, selection mark and a clear state change, rather than color alone. Validate actual contrast for every text-size/background pair before release.

## Typography
- Display/headings: an editorial serif with strong letterforms; target 28-34 logical pixels for main mobile headings.
- Body, labels and controls: a system sans serif; body 16-17, labels 13-14, action labels 16-17 semibold.
- Production font choice and licenses are unresolved. System fonts are an acceptable first implementation; do not ship unlicensed fonts extracted from an image.
- Support larger text and translation without truncating primary actions. A long screen may scroll, but the action and safe area must remain accessible.
- All-caps belongs to brief labels and clip captions, not long teaching explanations.

## Layout
Use a 4-point grid. Proposed spacing tokens: 4, 8, 12, 16, 20, 24, 32 and 40. Screen horizontal padding is 20; major section gap is 24; card padding is 16. Cards use 16-20 corner radius; primary controls use 14-16. Respect native safe areas once.

Aim for at least a 44 x 44 logical-pixel touch area, larger where space permits. Exact platform guidance should be checked with the supported OS and components at build time. Do not shrink thirteen tiles into illegible targets just to mimic an image.

## Rack behavior and representation
The mobile selection view may wrap the thirteen original tile instances into two rails. In the illustrated selected state, ten remain in two five-tile rows and three are in the pass tray. A selected tile must not exist twice in the actual state.

The export can use a long overhead rack because its purpose is watching rather than tapping. Use deterministic tile art, correct face counts and stable instance IDs in both renderers. Share the underlying data, not the screenshot bitmap.

Tapping selects/moves a tile into the tray; tapping a tray tile returns it to its original logical position. Dragging can supplement tapping, never replace it. Sorting changes visual order only. Long-press or an explicit accessible detail affordance can show an enlarged face and spoken label.

## Reusable components
| Component | Required states |
| --- | --- |
| PrimaryAction | Enabled, disabled with reason, loading, retry |
| SectionChip | Available, selected, unavailable with explanation |
| Tile | Rack, selected, tray, focused, enlarged; duplicate faces have distinct IDs |
| PassTray | 0/3, 1/3, 2/3, 3/3, validation error |
| FeltBoard | Loading, playable, disabled after submission |
| PassComparison | User pass, one strong pass, alternate explanation |
| SplitRow | Tile identity, count/rate, sample size, unavailable |
| StreakCard | No streak, active streak, milestone, saved/guest |
| ClipPreview | Ready, playing, paused, rendering, failed |
| VoiceoverControl | Not requested, granted, denied, recording, review, delete |
| DateOption and RSVPRow | Proposed, voted, tied, confirmed, pending |
| Empty/ErrorPanel | Plain-language reason and one useful recovery action |

## Motion and haptics
Use brief, purposeful tile movement and modest feedback after a completed selection. Honor reduced motion. A puzzle remains usable with animations and haptics disabled. Avoid celebratory effects that imply a uniquely correct strategic pass.

## Production asset list
Needed before implementation is complete: reviewed tile artwork for all supported faces, original felt/wood assets if textures are retained, small outline icon set, approved app mark and licensed font selection. None of these production assets is supplied as editable vector artwork in this package.

