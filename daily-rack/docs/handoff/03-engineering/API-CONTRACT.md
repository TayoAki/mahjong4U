# Proposed API contract
Design contract only; no endpoint is deployed. JSON examples in this package are fixtures, not production responses.

## Common rules
Use HTTPS; validate bodies at the boundary; derive caller identity from the verified guest/account session. Mutations receive an idempotency key where retry could duplicate work. Return a request ID for support without logging credentials or raw audio.

Errors use code, user-safe message, retryable and request_id. Distinguish invalid input, missing identity, forbidden ownership, unavailable/withdrawn puzzle, duplicate counted attempt, idempotency conflict, rate limit and temporary service failure. Keep the submitted selection through recoverable failures.

## P0 operations
| Method and route | Input | Result and constraints |
| --- | --- | --- |
| POST /v1/guest-sessions | New guest request; limited metadata | Opaque guest session; never accept an arbitrary owner ID |
| GET /v1/daily | Optional display locale | Active puzzle ID/revision, publication window, server time; no answer/split |
| GET /v1/puzzles/:revisionId | Exact revision | Public deal, section choices and content status; no reviewed answer before authorized result |
| POST /v1/attempts | revision_id, section_id, 3 tile_instance_ids, idempotency key | Owned immutable attempt/result reference; atomic first-attempt contribution |
| GET /v1/attempts/:id/result | Owned attempt ID | User pass, reviewed suggestion, reasons, split snapshot and progress |
| GET /v1/puzzles/:revisionId/split | Caller must have an eligible result for that puzzle | Per-tile counts, denominator, scope, threshold status and computed_at |
| GET /v1/me/progress | Verified principal | Unique solved puzzles/days, streak and practice metrics |
| POST /v1/me/claim-guest | Verified account + active guest proof | Transactional replay-safe ownership/progress merge |
| POST /v1/share-links | Owned attempt, explicit publish_pass flag | Opaque share URL token and public snapshot policy |
| GET /v1/share-links/:token | Opaque public token | Exact playable puzzle; poster pass withheld until visitor submits |
| DELETE /v1/share-links/:id | Owner authorization | Revocation status; does not delete the original attempt |
| DELETE /v1/me | Verified account/session and required confirmation | Deletion state; cleanup tracked if asynchronous |

The route names are proposed and can change before implementation. Do not expose internal review metadata or private attempt lists in a public puzzle response.

## Submission example
revision_id: demo-charleston-001-r1
section_id: evens
tile_instance_ids: t09, t10, t11
idempotency_key: a client-generated unique request key

Validation: the revision exists and accepts submissions; the section is allowed; each selected ID belongs to the exact deal; selected IDs are distinct; there are exactly three; the principal has no other counted attempt for the same puzzle identity. Jokers or other faces that cannot be passed must be excluded by the approved ruleset, not guessed from the UI.

Same key and same body returns the prior success after a lost response. Same key with a different body returns an idempotency conflict. A different key after successful first submission returns the existing result or a stable already-submitted error, never a new counted answer.

## Split response fields
puzzle_revision_id; scope (all or selected section); eligible_attempt_count; minimum_sample_met; computed_at; aggregate_version; rows with tile_instance_id, count and rate. If grouped by face, use a different explicit row kind and count distinct attempts containing that face.

No fabricated fallback rates. Return a threshold/unavailable state honestly. Use reviewed suggestion content even if aggregate refresh is temporarily unavailable.

## P1 night operations
POST /v1/nights; POST /v1/nights/:id/invites; GET /v1/night-invites/:token; PUT /v1/nights/:id/votes; POST /v1/nights/:id/confirm; PATCH /v1/nights/:id/rsvp; GET /v1/nights/:id/calendar. Separate host authority from invitee voting. Store slot instants and the event time zone. Use version checks for concurrent confirmation/cancellation.

## Optional server-render extension
Only if selected after F00: POST /v1/render-jobs; GET /v1/render-jobs/:id; DELETE /v1/render-jobs/:id. Authorize every job and file; validate uploaded references, lengths and size; distinguish accepted, rendering, failed, cancelled and ready. Request acceptance is not completed rendering.

## Contract checks
Use two principals to verify result, share management, guest claim and night ownership. Test malformed body, unknown tile, repeated tile ID, invalid section, concurrent requests, lost responses, replay, content withdrawal and rate limiting. Validate that GET /daily cannot leak suggestions or splits before submission.

