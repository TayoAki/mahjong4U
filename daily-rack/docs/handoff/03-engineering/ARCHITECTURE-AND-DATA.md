# Architecture and data proposal

## Boundaries
This is a proposed implementation, not a configured service stack. Pin compatible versions and verify native behavior during F00.

| Boundary | Responsibility | Proposed approach |
| --- | --- | --- |
| Native client | Rack interaction, cached draft, progress view, preview and local media | React Native, TypeScript, Expo and Expo Router [R2-R5] |
| Playable web client | Exact-rack guest play and comparison | Small browser route sharing domain rules and UI where practical |
| API | Guest identity, publication, validation, results, split, ownership, share links | Typed server API; hosting/provider selected at implementation |
| Database | Immutable content revisions, attempts, aggregate consistency and ownership | Relational PostgreSQL proposal |
| Content administration | Author, review, preview, approve, publish, withdraw | Protected staff-only surface or controlled import workflow |
| Media engine | Deterministic frames, text layout, audio, encoding and temp-file cleanup | Native on-device renderer/encoder, subject to F00 |
| Observability | Sanitized failures, latency, export outcomes and funnel events | Provider selected later |

No runtime language model is required. The user's own words can be captured through bounded editable captions or an optional recording. Never substitute unreviewed model output for a teacher's suggestion.

Expo Router supports shared routing across native/web [R5]. A library requiring custom native code needs a compatible development build; Expo Go alone is not proof that the encoder can ship [R2]. Expo audio and file sharing are candidate platform integrations [R3-R4]; they do not by themselves render a video.

## Main request flow
The API issues a guest principal. The client requests the published puzzle, without hidden suggestion or split payloads. A draft remains local while the user chooses. Submission is validated and committed once, with server ownership and an idempotency key. The response identifies the immutable attempt. The result endpoint returns the reviewed suggestion and an aggregate snapshot. Preview and export then derive from that exact result revision.

A saved result remains meaningful after a new daily rack appears. A shared link resolves an exact puzzle revision rather than redirecting to today's different rack.

## Entities and invariants
| Entity | Key fields and invariants |
| --- | --- |
| Principal | ID; kind guest/account; verified auth subject where relevant; created/deleted status |
| Puzzle | ID; stable public slug; mode; content-calendar day; active revision reference |
| PuzzleRevision | ID; puzzle ID; revision; 13 unique tile-instance IDs; approved sections; content version; reviewer state; publication window |
| Suggestion | Puzzle revision; section; suggested 3 distinct tile IDs; per-tile reasoning; acceptable alternate sets; review metadata |
| Attempt | ID; principal ID; puzzle revision; section; exactly 3 distinct tile IDs; server timestamp; counts_for_split |
| IdempotencyRecord | Principal + operation + key; request hash; stored result; key cannot be reused for different input |
| SplitAggregate | Puzzle revision; optional section scope; eligible attempt count; per-instance counts; computed_at; aggregate version |
| Progress | Principal; unique publication days completed; racks solved; section practice; derived streak |
| ShareLink | Opaque token/hash; owner; puzzle revision; optional public attempt snapshot; expiry/revocation; opt-in visibility |
| ClipDraft | Local ID; owned attempt; timeline version; caption edits; local voice/file references; render state |
| Night - P1 | Host principal; title; event zone; proposed slots; confirmed slot; status |
| NightVote - P1 | Night; guest/member identity; slot votes; RSVP; authorization/revocation state |

An attempt is a counted first answer, not each render, replay or share. Enforce one counted attempt per principal and puzzle identity, across revisions. A revised publication does not give an existing principal a second contribution to the day's split. Keep the attempt's exact original revision for historical display. New submissions target the designated active revision; withdrawn revisions are handled deliberately.

Thirteen unique instance IDs may include repeated face codes. Validate face codes and legal multiplicities against the chosen practice ruleset. Reject unknown IDs and duplicate selected IDs server-side. The included fixture shows the intended sample but is not a rules engine or reviewed content.

## Aggregation and trust
Commit the attempt and its aggregate effect atomically, or use a replay-safe event/outbox operation. Retry must never double-increment the denominator or any tile count. Derive rates from canonical eligible attempts and make repair/rebuild possible.

A guest principal is not proof of one physical person. Apply bounded rate limits and abuse monitoring, exclude internal/test attempts and suspicious activity according to a documented policy, and describe the split as recorded player attempts rather than verified people.

Display a sample-size threshold. Keep per-instance and grouped-face rate definitions separate. If filtering by selected section, label the filter and use the corresponding denominator. The initial unfiltered split is simpler.

## Authentication and guest claim
Create guest credentials server-side; use platform-appropriate secure storage and secure cookie handling on web. Never authorize records with a client-supplied owner ID alone. Verify account provider tokens on the server.

A guest claim requires proof of both the active guest session and the authenticated account. Merge transactionally and idempotently. When the account and guest already answered the same puzzle, retain both histories if useful but count only one canonical contribution; correct aggregates in the same replay-safe workflow. Streak days and racks solved remain unique. Cancelling sign-in leaves guest progress intact.

Choose the identity provider later. Verify every advertised Apple/Google flow independently, including cancellation, restart, sign-out and expired sessions.

## Media state and fallback
Render state is idle -> preparing -> rendering -> ready, with cancelled/failed branches and retry. A manifest records puzzle/attempt revision, timeline version, font/asset versions, dimensions, frame rate, caption schedule and audio reference. Preview and encoding consume the same manifest.

Proposed P0 output: 1080 x 1920 MP4, 30 fps, a widely supported codec/audio combination selected and proven in F00. Verify actual metadata, duration, orientation and playback. Measure memory and storage before committing a large native encoder integration.

Retain a completed temporary file through the share handoff, then clean it according to a bounded retention policy. Cancellation, low storage and app interruption cannot delete the user's recorded explanation without clear recovery behavior. A render retry cannot create a second puzzle attempt.

If native rendering is infeasible on baseline devices, evaluate a bounded server render job as a separate decision. That adds upload consent, ownership checks, durable retries, expiry, deletion and ongoing costs. It is not silently included or configured here. Browser export capability likewise requires a separate technical decision; web play must still work even if native export is the first shipping path.

## Security and privacy
API, database and worker secrets stay server-side. Intentionally public app configuration is not a place for secrets. Limit staff content mutation to authorized editors/reviewers. Public share links reveal only approved puzzle material and an explicitly shared pass. Private recordings and progress are private by default.

Define retention before launch. Deletion must cover identity records, app data, public links, recordings and any uploaded external media, with replay-safe cleanup and late-job guards. Use disposable accounts for deletion tests. This plan does not promise immediate removal from backups.

## Deployment units
Track the native binary, API, database/migrations, playable web route, optional media worker, and content process as separate deployables. Each needs its own real environment verification. A working web page is not evidence of a working native binary or backend.

