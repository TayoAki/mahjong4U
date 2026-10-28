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

Suit letters `a`, `b` and `c` stand for three different suits, whichever ones the player
uses. `value` is the hand's points, and `concealed: true` marks a C hand.

## Whose card?

The house card is original to this app. Before adding a published card, such as the
National Mah Jongg League's annual card, make sure you have the right to use its hands in
the app. The League's terms ask for written consent before its card content is used in
software. That's a decision for the app's owner and their lawyer, not something this
folder settles.
