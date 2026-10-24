# Daily Rack - Complete Handoff
Prepared October 24, 2026. Working name: Daily Rack.

## Start here
Open START-HERE.html for the offline image gallery and file links, or read Daily-Rack-Complete-Plan.pdf for the complete written handoff.

This package contains the original supplied PRD, all five generated image files, an executable product plan, screen specifications, design tokens, architecture and API proposals, a prioritized build backlog, QA and launch plans, content operations, and reusable prompts.

## What is complete
- A coordinated five-screen UI overview: Today, Rack, Result, Clip, and Game Night.
- Individual portrait concepts for Rack, Result, and Clip.
- A corrected overview whose suggested pass matches its explanation.
- A written plan and implementation handoff, with editable Markdown, JSON and CSV.
- The first overview is preserved under 02-design/archive for completeness.

## What the package represents
This is a product and visual-design handoff. There is no implemented mobile app, playable prototype, backend, rendered video, deployment, store listing, device verification, or approved puzzle set in this package. Implementation backlog items are Planned.

Generated screen images are visual references. Their tile art can contain symbol/count errors and must not become a source of game data. The JSON fixture defines the intended thirteen-tile example; it is not a reviewed lesson. Percentages, streaks, participants, dates and suggested passes are illustrative.

## Important product decisions
- First open goes directly to the Rack. Today is the returning player's dashboard.
- P0 is the daily rack, result/split, actual clip export, and progress. Game Night and Learn are P1 concepts even though they appear in the visual overview.
- Do not expose the community's answer before submission.
- Suggestions are labeled "One strong pass"; agreement is not proof of a unique correct answer.
- Use a playable web link for install-free entry. Google's official documentation says Google Play Instant stopped being available in December 2025; see REFERENCES.md.
- Keep the original PRD intact. Proposed clarifications are documented separately.

## Package map
| Location | Contents |
| --- | --- |
| Daily-Rack-Complete-Plan.pdf | Readable plan, screen gallery, design and engineering handoff |
| 01-product/ | Product definition, executable PLAN.md, decisions and open questions |
| 02-design/ | Screen specs, visual system, design-tokens.json, final images and archived first overview |
| 03-engineering/ | Proposed architecture, data model, API contract, illustrative puzzle fixture |
| 04-delivery/ | Build backlog CSV, QA/release, content operations and launch measurement |
| 05-prompts/ | Reusable image and implementation prompts |
| 06-source/original-prd.txt | Byte-for-byte copy of the supplied PRD |
| REFERENCES.md | Provenance and official technical references |
| MANIFEST.json | File inventory, sizes and SHA-256 checksums, excluding this manifest itself |

## Image files
- 02-design/images/01-ui-overview-final.png - all five key screens; use this overview.
- 02-design/images/02-rack-screen.png - detailed selection screen.
- 02-design/images/03-result-screen.png - detailed result and split.
- 02-design/images/04-clip-screen.png - detailed export preview.
- 02-design/archive/01-ui-overview-initial.png - superseded first overview, retained for completeness.

There are no separate full-size Today or Game Night images; those screens are present in the overview.

## Suggested next action
Start F00: prove the mobile runtime, readable thirteen-tile interaction, and a real 1080 x 1920 MP4 export on representative iOS and Android devices. In parallel, review the content approach and approve a first puzzle set. Then implement the guest Rack -> Result -> Clip path feature by feature.

