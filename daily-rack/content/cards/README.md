# Extra cards

Tables play with the built-in Daily Rack house card. Put another card here as a JSON file,
and the host of a private table can choose it when setting the table up. Hints, the card
sheet, scoring and the winning-hand layout all follow the table's card.

- Files ending in `.json` load when the server starts. Files whose names start with `_` are
  skipped, such as the example `_house-card-example.json`.
- `npm run content:check` validates every card with the same rules as the house card:
  every hand must be exactly 14 tiles, groups and jokers must be possible with a real set,
  ids must be unique, and every section must exist. A card with any problem is left out,
  and the server logs `card_skipped` with the reason.
- Matched (public) games and offline games always use the house card. Stats count house
  card hands toward card progress.

## Format

```json
{
  "id": "my-club-card-2026",
  "name": "My club card",
  "description": "Shown at the top of the card sheet.",
  "sections": [{ "id": "evens", "label": "2468" }],
  "hands": [
    { "id": "ev1", "section": "evens", "pattern": "FF 2222a 44a 66a 8888a", "value": 25, "note": "One suit" },
    { "id": "ev2", "section": "evens", "pattern": "222a 444a 66b 88b FFFF", "value": 25, "concealed": true }
  ]
}
```

A pattern is groups separated by spaces. Each group repeats one symbol, once per tile:

| Symbol | Means |
| --- | --- |
| `F` | a flower |
| `N` `E` `W` `S` | a wind |
| `0` | the white dragon (soap) |
| `D` + suit letter | the dragon of that suit (`DDa`) |
| `1`–`9` + suit letter | that number in that suit (`2222a`) |
| `x` `y` `z` `u` `v` + suit letter | any consecutive numbers: `x` is any number, `y` is the next one, and so on. Use the same letter for like numbers across suits (`xxxxa xxxxb`). |
| `p` `q` + suit letter | any numbers, different from each other (see below) |

Suit letters `a`, `b` and `c` stand for three different suits, whichever ones the player
uses. `value` is the hand's points, and `concealed: true` marks a C hand.

In a hand with no other suited groups, `DDDDa` can be any dragon (`FFF NNNN FFF DDDDa`). A
dragon with a suit letter of its own, next to numbers in one other suit, is an "opposite"
dragon: either dragon that doesn't match those numbers (`FF 135a 777a 999a DDDb`).

### Printing groups together

Cards print singles side by side: 2026, 1234, 113579. A token with more than one symbol is
several groups written together, and each run of one symbol is a group. The suit letter at
the end goes to every group that takes a suit; `0` (the white dragon) can sit inside it, but
flowers and winds can't.

| Token | Means |
| --- | --- |
| `2026a` | `2a 0 2a 6a` |
| `113579a` | `11a 3a 5a 7a 9a` (a pair of 1s, then singles) |
| `xyzua` | `xa ya za ua`, four consecutive singles |
| `1Da` | `1a Da`, a 1 with its matching dragon |
| `NEWS` | `N E W S` |

They match exactly like the groups written apart; the app just prints them the way the card does.

### Limiting numbers

A rule token after the groups limits a variable to some numbers. Write the variable, `=`, and
the allowed digits:

| Rule | Means |
| --- | --- |
| `x=13579` | like odd numbers only: `NNN xxxxa xxxxb SSS x=13579` |
| `x=2468` | kongs of 2, 4, 6 or 8: `FFF 2468a FFF xxxxb x=2468` |
| `x=26` | a kong of 2s or 6s: `2026a DDDa xxxxb DDDb x=26` |

`x` is where a run starts, so `y`, `z`, `u` and `v` follow it, and the whole run still has to
fit within 1–9.

`p` and `q` (with a suit letter) are free numbers: any numbers, different from each other,
with no link to `x`. `pppppa qqqqqa DDDDb` is two quints of any two different numbers in one
suit. They take rules too (`p=2468`).

### Hands that can be made several ways

Separate whole patterns with ` | ` when one line on the card can be made more than one way.
They all count as the same hand, and the card shows the first, so put the way the printed
card shows first:

```json
{ "id": "369-7", "section": "369", "value": 25, "note": "Pair 3, 6 or 9; kongs match the pair",
  "pattern": "FF 3369a 3333b 3333c | FF 3669a 6666b 6666c | FF 3699a 9999b 9999c" }
```

Use this for "any wind" (`FFF NNNN FFF DDDDa | FFF EEEE FFF DDDDa | ...`), for a dragon that can
be any of the three when all three suits are already in the hand, and for a run longer than
`x`–`v` allows (list each placement: `11a 22a ... 77a | 22a ... 88a | 33a ... 99a`). For specific
numbers that stand for any (as in "any 2 numbers"), a literal first way prints the line the way
the card does: `11111a 44444a DDDDb | pppppa qqqqqa DDDDb`.

`npm run content:check` checks every way: each must be 14 tiles and makeable with a real set.

## The 2026 card

`card-2026.json` was typed from the owner's printed "2026 Mahjongg Hand Tracker" sheet, line
by line. A few lines on that sheet can't be right as printed, so the file uses the closest
reading. Check these against an official card when one is at hand:

- Consecutive Run `111 222 333 4444` (1 and 2 suits) and `11 222 3333 4444` have 13 tiles;
  all three are encoded as `111 222 3333 4444`, like the 2468 line `222 444 6666 8888`.
- Winds `NNNN EEE WWWW SSSS` has 15 tiles; encoded as `NNNN EEE WWW SSSS`, the mirror of the
  `NNN EEEE WWWW SSS` line under it.
- `122 333 122 333 44` (C 35) prints both 333s in the first suit; encoded with the second
  `1 22 333` all in the second suit and the 44 in the first, numbers 1–4 only.
- Where the colours and the "Any N Suits" note disagree, the colours win: `FF 1111 2222 3333`
  (note says 2 suits, printed in 3 colours) and `FF 3369 3369 3369` (same) use 3 suits;
  `11 333 55 777 9999` (note says 3, printed in 2 colours) uses 2; `1111 33 55 77 9999`
  (note says 2, printed in 3 colours) uses 3.
- `1234 DDD DDD DDDD`, "any 3 Dragons": all three dragons, any one of them as the kong.

## Whose card?

The house card is original to this app. `card-2026.json` was added at the owner's request,
typed from their own printed tracker. The National Mah Jongg League's terms ask for written
consent before its card content is used in software, and Daily Rack Plus charges for
unlimited play on this card, so the owner and their lawyer should settle the right to use
its hands before launch. This folder doesn't settle that.
