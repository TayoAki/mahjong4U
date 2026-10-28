# Two-player mahjong

A mode for two people (or one person and the computer): each player builds **two hands at once** from the same card. It's for couples and pairs of friends, who otherwise can't play American mahjong together on a phone.

**Naming.** Call it "Two-player" or "Two-player mahjong" everywhere players can see it. The best-known published two-player American variant is "Siamese Mah Jongg®", a registered trademark of its creator; that name must never appear in the app, lessons, store copy or how-to-play text. These are our own house rules, modelled on the publicly described game, and we don't use that variant's card. Code identifiers say `twoPlayer` / `two-player`.

The player-facing rules are in the app: the **Two-player rules** sheet (`apps/mobile/src/game/TwoPlayerRules.tsx`) and the short **Two-player games** lesson (`TWO_PLAYER_LESSON` in `apps/mobile/src/lessons/content.ts`). Keep them in step with the engine.

## The rules as the engine plays them

`packages/core/src/mahjong/twoPlayer.ts`, a pure state machine like `game.ts`.

- **Deal.** The whole 152-tile set in one shuffled wall. Each player gets 27 tiles; East (seat 0) draws a 28th and opens with a discard. No Charleston. Seats are East and West.
- **Two hands, one pool.** A player's concealed tiles are one pool (`players[s].concealed`). How they're split into two racks is only an app display choice, kept on the device. Exposures belong to `hands[0]` or `hands[1]` and stay there.
- **Turns.** After a discard, the other player is asked only if they have a legal call (otherwise they draw straight away, as at four seats). A call is `{ type: 'expose', hand, size }` (pung, kong, quint or sextet, jokers allowed, via `exposureOptions` against that hand's exposures and the whole pool), `{ type: 'mahjong', hand }`, or `pass`. After an exposure or a non-final Mahjong the caller discards. Concealed (C) hands never take exposures, so they only take a discard for Mahjong.
- **Mahjong.** `declare-mahjong` names the hand and, optionally, the concealed tiles to lay down (`tiles`); without them the engine picks the most valuable fit from the pool (`bestWinFrom`: naturals first, then jokers; fewer jokers wins a tie). A Mahjong on a discard must use the called tile. The hand is locked (`shown`), scored at once, and the player goes on with their turn: they discard, or declare the second hand straight away if the rest already makes it.
- **End.** A player's second Mahjong ends the game. So does an empty wall (a wall game), and, as a shortcut, a moment when neither player has a hand that can still win (also a wall game).
- **Jokers.** On your turn, swap a matching natural for a joker in any exposure, yours or the other player's, except in a declared hand. Swaps from a dead hand's exposures are allowed. Jokers never fill pairs or singles, and a discarded joker can't be called (the shared `match.ts` rules).
- **Dead hands.** Each live hand is checked with `deadReasonFrom` (dead.ts) against what's face up: discards, every exposure and declared hands' tiles. A dead hand can't be declared or take calls. Unlike four seats, the player keeps drawing and discarding, even with both hands dead.
- **Scoring.** Every Mahjong is paid by the other player when it's declared: the card value, doubled when jokerless (the four-player rule: only for hands with a group that could hold jokers), doubled again for the game-ending second Mahjong. Self-drawn and called Mahjongs pay the same. A wall game adds nothing; Mahjongs already made keep their payments. Payments always sum to zero.

`TwoPlayerResult` carries the same fields as `GameResult` for the game-ending Mahjong (empty for a wall game), with every Mahjong in `mahjongs` and the totals in `payments`, so tables and stats handle both kinds of game the same way.

### API

| Function | What it does |
| --- | --- |
| `newTwoPlayerGame(card, { seed })` | Deals a game |
| `applyTwoPlayerAction(card, state, seat, action)` | The next state and its events; throws `GameError` for an illegal move |
| `twoPlayerPendingSeats`, `twoPlayerPhaseKey` | Who must act; a key for the step (same format as four seats) |
| `twoPlayerView(card, state, seat)` | What one player may see: their own pool, the other player's count, both players' hands, discards, wall count, Mahjongs, payments so far and their prompt |
| `twoPlayerClaimOptions`, `bestWinFrom`, `twoPlayerVisibleCounts` | Calls hand by hand, the best Mahjong in a pool, tiles face up |
| `twoPlayerBotAction(card, view, level, random)` | The computer's move, from a view (`twoPlayerBot.ts`) |
| `twoPlayerHints`, `planSplit`, `suggestTwoPlayerDiscard` | The closest lines for each hand, a rack split by plan, the Suggest button |

## Computer players

`packages/core/src/mahjong/twoPlayerBot.ts`. A bot works only from its own view. Every move it plans from scratch: for each of its few best first choices for one hand (3 at Easy, 6 at Steady, 10 at Sharp), it finds the best hand for the tiles left over, and the same the other way round; the pair needing the fewest tiles between them wins (with a penalty when tiles it needs can no longer turn up). From the plan it:

- declares Mahjong whenever it can, choosing the hand and tiles that leave the other hand best placed;
- swaps for a joker when that doesn't set the plan back;
- calls a discard onto the hand where it brings the plan closer, never one that would leave a hand dead;
- discards the tile the plan needs least, then the one the fewest runner-up plans want. Sharp bots plan again for their three best discards. Easy and Steady bots make the odd careless choice, and Easy hesitates over calls.

Counting runs on small arrays of tile counts, with targets cached per card and set of exposures, and skips any hand that can't beat the best pairing found so far. On the 2026 card (about 1,100 concrete hands) a Sharp bot's move takes about 2 ms at the median and 11 ms at the 99th percentile on the build machine (Easy about 1 ms and 4 ms); the house card is about twice as fast. In 30 Sharp-against-Sharp games per card, about 2.6 Mahjongs were made per game and two in three games ended with a second Mahjong.

## Server

- Tables have a `variant` column, `four` (the default) or `two-player` (migration in `db.ts`). `variants.ts` gives tables one interface to each engine, so the lobby, live timers, auto-moves, computer seats, "your move" pushes, realtime updates and results are shared.
- `POST /v1/tables` takes `variant: 'two-player'` with one seat (`bot`, `friend` or `open`). Two-player tables are private only: no matchmaking, no ranked play.
- Moves are the four-player action shapes with `hand` added (`exchange-joker`, `declare-mahjong` with optional `tiles`, and claim responses).
- The Plus gate is unchanged: on a premium card, a game against the computer uses a free hand; with a friend the host needs Plus.
- Stats record each game as one hand played, never ranked, so ratings and the weekly board don't move. `won` means the player ended the game with their second Mahjong; the hand, value and self-drawn and jokerless flags are that Mahjong's; `payment` is the total for the game.

## App

- **New table** (`app/table/new.tsx`): "How many of you?" 4, 3 or 2. Three seats a computer in the empty chair; two sets up a two-player game.
- **Play tab**: the Two-player card (`game/TwoPlayerCard.tsx`) plays the computer straight away, or opens the form set to two.
- **Table** (`game/TwoPlayerScreen.tsx`, `game/TwoPlayerBoard.tsx`): the felt with the other player's tile backs, both of their hands and the discards; below it your two hands, each with its exposures (or its declared Mahjong) and its own rack. Drag a tile past a rack's top or bottom edge, or tap it and tap Move, to move it between racks. New tiles go to the rack the plan wants them in (`twoRacks.ts` keeps the split per game on the device). Closest hands for each hand count the tiles left once the other hand's planned tiles are set aside. Only your moves stay pinned at the bottom, so both racks fit under the table on a phone.
- The table's help button opens the Two-player rules; the lesson is linked from those rules, the Play tab and Learn ("Just the two of you?"). It sits outside the numbered path, so the lesson count stays ten.

## Tests

- `packages/core/src/mahjong/twoPlayer.test.ts`: deal sizes and no Charleston, private views, calls onto either hand, joker discards, the first Mahjong locking a hand, the second ending the game at double, Mahjong on a discard and with chosen tiles, exposures counted toward a hand, joker swaps (not from declared hands), concealed hands, dead hands, wall games, and whole bot games on both cards (tiles conserved, payments balanced, some games to two Mahjongs) with a speed check.
- `apps/server/src/play.test.ts` ("two-player tables"): against the computer to the end and the next game, a friend joining, a live game with timeouts, "your move" pushes and the Plus gate.
- `scripts/e2e.mjs` section 7c: a game against the computer from the new-table form, moving tiles between the racks by tap and by drag, and a few discards.
