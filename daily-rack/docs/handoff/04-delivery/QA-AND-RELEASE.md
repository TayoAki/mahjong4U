# QA and release plan

## Current evidence
Image concepts and handoff documents exist. No mobile, web, service, encoding, authentication or store checks have run. The tests below are future acceptance work. Package validation checks the archive and documents only.

## Core verification matrix
| Area | Meaningful cases | Pass evidence |
| --- | --- | --- |
| Deal and selection | Exactly 13 unique instances; duplicates; tap/drag; fourth tile; sort; unselect | Device interaction plus invariant checks |
| Submission | Missing section; 2/4 IDs; repeated/unknown ID; duplicate network request; concurrent submit | One canonical attempt and one aggregate contribution |
| Result | Own pass; alternate reasonable pass; per-tile reasoning; no pre-submit split leak | Reviewed content and API observations |
| Split | 0 attempts; below threshold; snapshot staleness; 3 selections per counted attempt | Reconciled denominator and counts |
| Progress | First day; consecutive day; missed day; same day twice; clock/time-zone edge | Unique days and defined content-calendar behavior |
| Guest claim | Fresh account; existing answer; repeated claim; cancelled sign-in | No lost history or double counting |
| Media | Captions-only; 20-second voice; delete/re-record; low storage; cancellation; interrupted render | Decodable 1080 x 1920 MP4, synchronized audio, recovery |
| Sharing | Save cancel; permission denial; absent destination; share-sheet cancel; reopened file | Actual file availability; honest completion state |
| Exact links | Installed/uninstalled; web; old revision; withdrawn rack; revoked link | Same intended rack and spoiler control |
| Ownership | A attempts to read/change B's attempt, clip or invite | Explicit rejection and no data leak |
| P1 night | Poll tie; changed RSVP; event-zone DST; revoked invite; 3-player state | Correct host/guest permissions and visible resolution |

Test Apple and Google access independently if both are advertised. Use real target-device builds; browser-only behavior is insufficient evidence for native exports or permissions.

## Layout and accessibility
Check smallest supported phone, a large phone, notches and safe areas; increased text size; screen reader order; high contrast; reduced motion; all actions without dragging. Check long teaching copy, chip wrapping, scrolling with a sticky action and all keyboard states for caption editing. Never place a tile's only action in a tiny decorative face.

## Content checks
Use approved tile assets and deterministic symbols; verify the deal, intended stage and any restrictions on passing. Check each suggestion with the chosen evaluation method and a teacher. Add acceptable alternatives when warranted. Do not treat most popular as correct. Review wording, card references and original artwork before publication.

## Media checks
Inspect actual file dimensions, orientation, duration, codecs and audio. Watch the saved file, including first/last frames and caption timing. Verify no duplicated/missing tiles or incorrect character/dot faces. Check destination previews for overlay interference. Record device, OS, build, output metadata, export duration, file size and observed playback.

A screenshot of a player is not media verification. Calling a share API successfully is not proof of posting.

## Operational checks
Verify production origins, session verification, database migrations, aggregate repair, content scheduling, audit logs and rollback. Trigger one controlled sanitized error in a permitted environment and confirm useful monitoring. Rehearse content withdrawal and repair a deliberately duplicated test event. Do not send unsolicited alerts to external recipients.

## Privacy and account checks
Review the actual data flows, permissions, providers and retention. Provide working support/policy URLs and accurate app disclosures once the owner supplies business details. If accounts ship, verify the complete deletion path with disposable test data, including public-link revocation and external-media cleanup if applicable. Recheck current store requirements before submission rather than treating this document as legal or store approval.

## Release gates
1. Content: first reviewed puzzle set and original licensed assets are approved.
2. Functional: one guest can complete the whole loop and save a real video on supported iOS/Android devices.
3. Durable: retries, guest claim, progress, links and ownership work in real services.
4. Accessible: screen reader, text scaling and reduced-motion paths remain usable.
5. Measured: duplicate-resistant event flow and known attribution limits are verified.
6. Operational: production services, monitoring, correction/rollback and support routes work.
7. Distribution: signing and private test builds succeed; beta feedback has no blocking failures.
8. Publication: owner authorizes actual release; store metadata and current policies are checked. Store submission and approval are separate later statuses.

## Evidence log template
Feature ID; build/revision; environment; device/browser and OS; scenario; expected behavior; observed behavior; supporting artifact; reviewer; result; remaining limitation. Mark Verified only when acceptance is supported by evidence.

