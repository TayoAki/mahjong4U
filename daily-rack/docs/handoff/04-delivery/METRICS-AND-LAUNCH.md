# Metrics and launch plan

## Definitions
| Metric | Definition |
| --- | --- |
| Installs per sharing player | Attributed first native installs from share links / unique players creating a share handoff in the window |
| K over 7 days | Attributed new activated players brought through shares/invites / active players in that window |
| Export rate | Completed rack sessions producing a successfully encoded usable file / completed rack sessions |
| Share handoff rate | Completed rack sessions opening a supported share handoff / completed rack sessions |
| Link-to-play | Valid shared-link sessions completing that exact rack / valid shared-link opens |
| Web-play-to-install | Attributable native first installs from web finishers / eligible unique web finishers |
| D1/D7/D30 return | Activated cohort members returning at the defined day offset / eligible cohort members |

A completed export, share-sheet handoff and actual published social post are separate observations. Destination apps may not confirm publication. Never label a share-sheet open as a confirmed post. Deduplicate numerator and denominator definitions, and publish the attribution coverage/unknown fraction alongside install metrics.

## PRD starting assumptions
These are supplied targets, not industry benchmarks or demonstrated results: K 0.3 at launch and 0.5 by day 90; 15% share rate; 40% link-to-play; 25% play-to-install; D1/D7/D30 retention 40%/20%/10%; 20 weekly creator episodes. Game-night activity has no numeric target yet.

The original 15% combines exports and shares. Initially report an explicitly defined combined event plus the separate export and handoff rates so the team can see which behavior changed. Reassess all targets after four weeks of actual cohorts.

## Event contract
| Event | Trigger | Key properties |
| --- | --- | --- |
| rack_opened | Published rack becomes interactive | puzzle/revision, entry source, platform |
| attempt_submitted | Server accepts canonical attempt | attempt ID, puzzle/revision, section; no raw voice |
| result_viewed | Result is actually shown | attempt ID, split available/threshold state |
| clip_preview_ready | Timeline can play | timeline version, caption/voice mode |
| clip_render_started | Actual encoding begins | render operation ID, platform |
| clip_render_succeeded/failed | Encoding ends | duration, dimensions, error category |
| clip_save_succeeded | Verified save completion | operation ID, destination category if known |
| share_handoff_opened | Supported share UI opens | share token ID, destination if observed |
| shared_link_opened | Valid playable link resolves | opaque link ID, puzzle/revision |
| shared_rack_completed | Visitor submits same rack | link attribution ID, canonical attempt |
| account_claimed | Guest merge commits | pseudonymous principal, merge outcome |
| app_first_open | First observed native activation | permitted attribution fields, coverage state |

Use server events for canonical acceptance/claim, client events for UI/media milestones, and unique event/operation IDs for retries. Exclude internal and test traffic. Do not put raw recording audio, caption transcripts, contacts or credentials into routine analytics.

## First-session study
Observe a small proposed beta cohort of roughly 10-20 newer players. Measure time to interactive rack, confusion about direction, tile selection mistakes, result comprehension, export time and willingness to share. Treat qualitative feedback and timing distributions as initial evidence, not statistically conclusive lift.

Measure the 60-second goal separately with and without optional recording, including real network and encoding time. Do not claim it is met until observed.

## Launch sequence
- Before beta: reviewed content set, real export, recovery, progress, privacy/support details and content-correction path.
- Private beta: fix completion and trust failures; watch saved videos on actual destination previews.
- Small launch: publish approved daily content on the owner's authorized channels only when separately requested. No posting or outreach is performed here.
- Four-week review: replace assumptions with observed cohorts and attribution coverage.
- P1 decision: choose learning or game-night work only when the core loop is reliable and evidence supports that expansion.

If solving is high but exporting is low, investigate media friction and value. If handoffs happen but links fail to convert, improve the shared-rack destination. Do not use new features to conceal a broken core action.

