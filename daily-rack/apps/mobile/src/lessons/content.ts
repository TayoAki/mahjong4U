import { shortLabel } from '@daily-rack/core';
import { HOUSE_CARD, TILE_FACES, analyze, concreteHands } from '@daily-rack/core/mahjong';

// Ten short lessons in American mahjong, written for this app's rules and its own house
// card (never the League card). Everything runs on the device: the checks that depend on
// the card use the same engine as the table, so a lesson can't teach a move the table
// won't allow. Keep this file free of React Native imports so it can be checked in Node.

/** A tile face code, as the engine uses them: 'DOT_5', 'WIND_EAST', 'FLOWER_3', 'JOKER'. */
export type Face = string;

/** Something to look at alongside the words. */
export interface Visual {
  /** Tiles in a row. */
  tiles?: Face[];
  /** Tiles laid out group by group, the way a hand is shown. */
  groups?: Face[][];
  /** A hand from the house card, by id, printed the way the card shows it. */
  hand?: string;
  /** A few words over the tiles, such as "The discard". */
  caption?: string;
}

export interface Option {
  label: string;
  correct: boolean;
  /** Shown once the option is tapped, right or wrong. */
  why: string;
  /** Show a house-card hand in place of the label (the label is still read aloud). */
  hand?: string;
  /** Small tiles shown under the label. */
  tiles?: Face[];
}

export interface CheckResult {
  ok: boolean;
  message: string;
}

export type Step =
  | ({ kind: 'read'; title: string; body: string } & Visual)
  | ({ kind: 'choose'; prompt: string; options: Option[] } & Visual)
  | ({
      kind: 'pick';
      prompt: string;
      rack: Face[];
      count: number;
      /** A Charleston or courtesy pass: jokers can't be picked. */
      passing?: boolean;
      check: (picked: Face[]) => CheckResult;
    } & Visual);

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  steps: Step[];
  /** Offer a game against the computer when the lesson is done. */
  practice?: 'table';
}

// ------------------------------------------------------------------ helpers

const rep = (face: Face, n: number): Face[] => Array.from({ length: n }, () => face);

/** "7 dot", "east wind", "red dragon", "flower". */
function named(face: Face): string {
  return face === 'DRAGON_WHITE' ? 'white dragon' : shortLabel(face).toLowerCase();
}

const COUNT_WORDS = ['', '', 'two', 'three', 'four'];

/** "the 7 dot", "the two flowers and the 4 bam". Every flower has the same name. */
function listed(faces: Face[]): string {
  const counts = new Map<string, number>();
  for (const f of faces) counts.set(named(f), (counts.get(named(f)) ?? 0) + 1);
  const parts = [...counts].map(([name, n]) => (n === 1 ? `the ${name}` : `the ${COUNT_WORDS[n] ?? n} ${name}s`));
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The rack with one copy of each picked tile taken out. */
function without(rack: Face[], picked: Face[]): Face[] {
  const rest = [...rack];
  for (const face of picked) {
    const i = rest.indexOf(face);
    if (i !== -1) rest.splice(i, 1);
  }
  return rest;
}

/** Engine tile ids for these faces, each id used once. Any free flower stands in for another. */
function toTiles(faces: Face[]): number[] {
  const used = new Set<number>();
  return faces.map((face) => {
    let id = TILE_FACES.findIndex((f, i) => f === face && !used.has(i));
    if (id === -1 && face.startsWith('FLOWER_')) id = TILE_FACES.findIndex((f, i) => f.startsWith('FLOWER_') && !used.has(i));
    if (id === -1) throw new Error(`Lesson uses more ${face} tiles than the set has`);
    used.add(id);
    return id;
  });
}

/**
 * How many tiles away these tiles are from the named house-card hand, or from the closest
 * hand on the card when no hand is named. The same count as Closest hands at the table.
 */
function away(faces: Face[], handId?: string): number {
  const fits = analyze(HOUSE_CARD, toTiles(faces), []);
  const fit = handId ? fits.find((f) => f.concrete.hand.id === handId) : fits[0];
  return fit?.distance ?? Infinity;
}

/**
 * Check for a pass: right as long as the hand you're aiming for (or, with no hand named,
 * your closest hand on the card) is no further away afterwards.
 */
function passCheck(rack: Face[], handId?: string): (picked: Face[]) => CheckResult {
  return (picked) => {
    const before = away(rack, handId);
    const after = away(without(rack, picked), handId);
    if (after <= before) {
      return {
        ok: true,
        message: handId ? 'Good pass. Your hand doesn’t use any of those tiles.' : `Good pass. Your closest hand is still ${before} away.`,
      };
    }
    const needed = picked.filter((f) => away(without(rack, [f]), handId) > before);
    if (needed.length === 0) return { ok: false, message: 'Together, those tiles leave your hand short. Try a different set.' };
    const which = needed.length === 1 ? 'it' : 'them';
    return {
      ok: false,
      message: handId
        ? `Keep ${listed(needed)}: your hand uses ${which}. Pass tiles it doesn’t need.`
        : `Passing ${listed(needed)} would leave your closest hand ${after} away instead of ${before}. Keep ${which}, and pass tiles it doesn’t use.`,
    };
  };
}

/**
 * A real example of a house-card hand, group by group. `label` picks the suits and numbers
 * the way the engine names them, e.g. 'a=DOT X=4'.
 */
function example(handId: string, label: string): Face[][] {
  const options = concreteHands(HOUSE_CARD).filter((c) => c.hand.id === handId);
  const concrete = options.find((c) => c.label === label) ?? options[0];
  if (!concrete) return [];
  let flower = 0;
  return concrete.groups.map((g) => Array.from({ length: g.n }, () => (g.face === 'FLOWER' ? `FLOWER_${(flower++ % 8) + 1}` : g.face)));
}

const sectionList = (() => {
  const labels = HOUSE_CARD.sections.map((s) => s.label);
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
})();

// ------------------------------------------------------------------ racks used in checks

/** Lesson 4: a Charleston pass toward FF 2222 44 66 8888 in craks. */
const CHARLESTON_RACK: Face[] = [
  'FLOWER_2', 'FLOWER_5', 'CHARACTER_2', 'CHARACTER_2', 'CHARACTER_4', 'CHARACTER_6', 'CHARACTER_8',
  'CHARACTER_8', 'JOKER', 'WIND_NORTH', 'DOT_5', 'BAMBOO_9', 'DRAGON_GREEN',
];

/** Lesson 5: a courtesy pass of 2 toward 11 333 555 777 999 in dots. */
const COURTESY_RACK: Face[] = [
  'DOT_1', 'DOT_1', 'DOT_3', 'DOT_3', 'DOT_3', 'WIND_EAST', 'DOT_5',
  'DOT_5', 'DOT_7', 'DOT_9', 'DOT_9', 'BAMBOO_6', 'JOKER',
];

/** Lesson 6: calling a 4 dot for 222 444 66 88 FFFF in dots and bams. */
const CALL_RACK: Face[] = [
  'DOT_2', 'DOT_2', 'DOT_4', 'DOT_4', 'DOT_5', 'BAMBOO_4', 'BAMBOO_6',
  'BAMBOO_8', 'BAMBOO_8', 'FLOWER_1', 'FLOWER_2', 'FLOWER_3', 'JOKER',
];

/** Lesson 9: a rack closest to FF 2222 44 66 8888 in bams. */
const CHOOSE_RACK: Face[] = [
  'FLOWER_1', 'FLOWER_2', 'BAMBOO_2', 'BAMBOO_2', 'BAMBOO_4', 'BAMBOO_4', 'BAMBOO_6',
  'BAMBOO_8', 'BAMBOO_8', 'JOKER', 'DOT_3', 'WIND_NORTH', 'CHARACTER_7',
];

// ------------------------------------------------------------------ the lessons

export const LESSONS: Lesson[] = [
  {
    id: 'tiles',
    title: 'The tiles',
    summary: 'Suits, winds, dragons, flowers and jokers: what’s in the 152-tile set.',
    minutes: 3,
    steps: [
      {
        kind: 'read',
        title: 'Three suits',
        body: 'Most tiles belong to one of three suits: dots, bams (short for bamboo) and craks (short for characters). Each suit runs from 1 to 9, and there are four of every tile.\n\nDots are circles, bams are sticks of bamboo, and craks show a Chinese number above a red character.',
        groups: [
          ['DOT_1', 'DOT_2', 'DOT_3'],
          ['BAMBOO_1', 'BAMBOO_2', 'BAMBOO_3'],
          ['CHARACTER_1', 'CHARACTER_2', 'CHARACTER_3'],
        ],
      },
      {
        kind: 'read',
        title: 'Winds and dragons',
        body: 'There are four winds: North, East, West and South, with four of each.\n\nThere are three dragons: red, green and white, also four of each. Each dragon goes with a suit: red with craks, green with bams and white with dots. Some hands on the card ask for the dragon that matches a suit, so these pairs are worth learning. Players often call the white dragon “soap.”',
        groups: [
          ['WIND_NORTH', 'WIND_EAST', 'WIND_WEST', 'WIND_SOUTH'],
          ['DRAGON_RED', 'DRAGON_GREEN', 'DRAGON_WHITE'],
        ],
      },
      {
        kind: 'read',
        title: 'Flowers and jokers',
        body: 'There are eight flowers. Every flower counts as the same tile, so any two flowers make a pair, even if the pictures differ.\n\nThere are eight jokers. A joker can stand in for a tile you’re missing, but only in a group of three or more. There’s a whole lesson on jokers later.\n\nThat makes 152 tiles in all: 108 suit tiles, 16 winds, 12 dragons, 8 flowers and 8 jokers.',
        groups: [
          ['FLOWER_1', 'FLOWER_2', 'FLOWER_3'],
          ['JOKER', 'JOKER'],
        ],
      },
      {
        kind: 'choose',
        prompt: 'Which dragon goes with craks?',
        tiles: ['CHARACTER_5'],
        options: [
          { label: 'Red dragon', tiles: ['DRAGON_RED'], correct: true, why: 'Red goes with craks, green with bams, and white (soap) with dots.' },
          { label: 'Green dragon', tiles: ['DRAGON_GREEN'], correct: false, why: 'Green goes with bams. Craks take the red dragon.' },
          { label: 'White dragon', tiles: ['DRAGON_WHITE'], correct: false, why: 'White, or soap, goes with dots. Craks take the red dragon.' },
        ],
      },
      {
        kind: 'pick',
        prompt: 'Tap the three bams.',
        rack: ['DOT_2', 'BAMBOO_2', 'CHARACTER_7', 'DRAGON_GREEN', 'BAMBOO_7', 'FLOWER_2', 'BAMBOO_9', 'WIND_WEST'],
        count: 3,
        check: (picked) => {
          const wrong = picked.filter((f) => !f.startsWith('BAMBOO_'));
          if (wrong.length === 0) return { ok: true, message: 'The 2, 7 and 9 bams are the ones with sticks of bamboo.' };
          if (wrong.includes('DRAGON_GREEN')) {
            return { ok: false, message: 'The green dragon goes with bams on the card, but it isn’t a bam. Bams are the tiles with sticks of bamboo.' };
          }
          return { ok: false, message: `${capitalized(listed(wrong))} ${wrong.length === 1 ? 'isn’t a bam' : 'aren’t bams'}. Look for the sticks of bamboo.` };
        },
      },
      {
        kind: 'choose',
        prompt: 'How many tiles are in an American mahjong set?',
        options: [
          { label: '136', correct: false, why: 'That’s a set with no flowers or jokers. American mahjong uses 152.' },
          { label: '144', correct: false, why: 'Close. That’s the set without its 8 jokers. American mahjong uses 152.' },
          { label: '152', correct: true, why: '108 suit tiles, 16 winds, 12 dragons, 8 flowers and 8 jokers.' },
        ],
      },
    ],
  },

  {
    id: 'card',
    title: 'Reading the card',
    summary: 'How hands are written: groups, colors, numbers, X and C, and points.',
    minutes: 4,
    steps: [
      {
        kind: 'read',
        title: 'Every hand is on the card',
        body: `You win by building one of the hands printed on the card, exactly, with 14 tiles. Nothing else counts.\n\nThis app uses its own card, the ${HOUSE_CARD.name}. It has ${HOUSE_CARD.hands.length} hands in ${HOUSE_CARD.sections.length} sections: ${sectionList}. You can read it any time from the You tab, or with the card button at the table.`,
      },
      {
        kind: 'read',
        title: 'Groups of tiles',
        body: 'Each hand is written as groups, one letter or number per tile. FF is two flowers. 2222 is four 2s. 44 is a pair of 4s.\n\nThree of the same tile is a pung, four is a kong and five is a quint. On the card, N, E, W and S are winds, F is a flower and D is a dragon.\n\nBelow is this hand built in dots.',
        hand: 'ev1',
        groups: example('ev1', 'a=DOT'),
      },
      {
        kind: 'read',
        title: 'Colors mean suits',
        body: 'The colors on the card don’t stand for particular suits. They tell you which groups share a suit. Groups printed in one color are all in the same suit. Groups in different colors are in different suits, and you choose which.\n\nIn this hand, 2222 and 88 share a color, so they’re one suit. 4444 and 6666 are each in another suit. Here is one way to build it.',
        hand: 'ev3',
        groups: example('ev3', 'a=BAMBOO b=CHARACTER c=DOT'),
      },
      {
        kind: 'read',
        title: 'Numbers that can change',
        body: 'Some hands let you choose the numbers. When a hand’s note says consecutive, 1111 2222 3333 means any three numbers in a row: 4, 5, 6 or 7, 8, 9 work just as well as 1, 2, 3.\n\nWhen a note says any number or like number, the same digit in each color means one number repeated, such as 7s in three suits. The section name and the note tell you when the numbers can change.',
        hand: 'ru1',
        groups: example('ru1', 'a=DOT X=4'),
      },
      {
        kind: 'read',
        title: 'X, C and points',
        body: 'Each line ends with a letter and a number. X means the hand may be exposed: you may call other players’ discards to finish groups and lay them face up. C means concealed: every tile stays in your rack, and you may call a discard only to win.\n\nThe number is the hand’s value in points. Harder hands are worth more.',
        hand: 't4',
      },
      {
        kind: 'choose',
        prompt: 'Which tiles make this hand?',
        hand: 'ln1',
        options: [
          {
            label: 'Two flowers and four 5s in each suit',
            tiles: example('ln1', 'a=DOT b=BAMBOO c=CHARACTER X=5').flat(),
            correct: true,
            why: 'Three colors mean three different suits, and the note asks for one number in all of them.',
          },
          {
            label: 'Two flowers and four each of 5, 6 and 7 dots',
            tiles: example('ru1', 'a=DOT X=5').flat(),
            correct: false,
            why: 'Those tiles make a different hand: FF 1111 2222 3333 in Runs. Here the three colors ask for three suits, and the note asks for one number.',
          },
          {
            label: 'Two flowers, four 5 dots, four 5 bams and four 6 craks',
            tiles: ['FLOWER_1', 'FLOWER_2', ...rep('DOT_5', 4), ...rep('BAMBOO_5', 4), ...rep('CHARACTER_6', 4)],
            correct: false,
            why: 'Close, but a Like Numbers hand uses the same number in every group.',
          },
        ],
      },
      {
        kind: 'choose',
        prompt: 'This hand is marked C. Can you call a discard to finish one of its groups?',
        hand: 't4',
        options: [
          { label: 'No. I can call a discard only if it gives me Mahjong.', correct: true, why: 'C means concealed: every tile stays in your rack until you win.' },
          { label: 'Yes, if I lay the group face up', correct: false, why: 'That’s how X hands work. A C hand must stay concealed, so the only discard you may call is your winning tile.' },
          { label: 'Yes, but only for a pair', correct: false, why: 'A pair can never be called except as your winning tile, and a C hand can’t be exposed at all.' },
        ],
      },
    ],
  },

  {
    id: 'deal',
    title: 'The deal and the goal',
    summary: 'Seats and winds, who starts with 14 tiles, and how you win.',
    minutes: 2,
    steps: [
      {
        kind: 'read',
        title: 'Four seats, four winds',
        body: 'Four people play. Each seat has a wind: East, South, West and North. East is the dealer for the hand, and the deal moves one seat to the right after each hand.\n\nPlay always goes to the right: from East to South, then West, then North.',
        tiles: ['WIND_EAST', 'WIND_SOUTH', 'WIND_WEST', 'WIND_NORTH'],
      },
      {
        kind: 'read',
        title: 'The deal',
        body: 'The tiles are shuffled face down and built into a wall. Everyone takes 13 tiles, and East takes 14. East gets one extra because East starts play by discarding a tile, without drawing first.\n\nYour tiles stand on a rack facing you, so only you can see them.',
      },
      {
        kind: 'read',
        title: 'The goal',
        body: 'Be the first to make one hand from the card with 14 tiles. Between turns you hold 13. On your turn you draw a tile, so you have 14 for a moment, and then you discard one.\n\nWhen a tile you draw, or a tile someone else discards, completes a hand on the card, you declare Mahjong and win the hand.',
      },
      {
        kind: 'choose',
        prompt: 'How many tiles does East start with?',
        tiles: ['WIND_EAST'],
        options: [
          { label: '13', correct: false, why: 'Everyone else starts with 13. East gets one more, because East discards first.' },
          { label: '14', correct: true, why: 'East starts with 14 and opens play by discarding one.' },
          { label: '15', correct: false, why: 'One too many. East starts with 14, one more than everyone else.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'When have you won?',
        options: [
          { label: 'When my 14 tiles make one hand on the card, exactly', correct: true, why: 'In American mahjong, only the hands on the card win.' },
          { label: 'When I have four groups of three and a pair', correct: false, why: 'That’s how some other styles of mahjong work. In American mahjong, only the hands printed on the card count.' },
          { label: 'When I have the most pairs', correct: false, why: 'Pairs alone don’t win. Your 14 tiles must match a hand on the card.' },
        ],
      },
      {
        kind: 'read',
        title: 'What comes next',
        body: 'Before anyone discards, the table trades tiles in the Charleston. That’s the next lesson.',
      },
    ],
  },

  {
    id: 'charleston',
    title: 'The Charleston',
    summary: 'Passing tiles right, across and left before play starts.',
    minutes: 4,
    practice: 'table',
    steps: [
      {
        kind: 'read',
        title: 'Trading before play',
        body: 'Right after the deal, everyone passes tiles they don’t want. This is the Charleston. It’s your chance to shape your tiles toward a hand on the card.\n\nEveryone passes three tiles at the same time and gets three back.',
      },
      {
        kind: 'read',
        title: 'Right, across, left',
        body: 'The first Charleston has three passes:\n1. Three tiles to the player on your right.\n2. Three tiles to the player across from you.\n3. Three tiles to the player on your left.\n\nLook at what you get each time before you choose your next pass.',
      },
      {
        kind: 'read',
        title: 'Jokers never pass',
        body: 'You can never pass a joker, in any Charleston or in the courtesy pass. Keep them: a joker can fill any group of three or more.',
        tiles: ['JOKER'],
      },
      {
        kind: 'read',
        title: 'A second Charleston, if everyone agrees',
        body: 'After the first Charleston, the table may do a second one in the other order: left, across, then right. It happens only if all four players agree, so any one player can stop it.\n\nAt computer tables you can also choose Quick, which skips the Charleston entirely.',
      },
      {
        kind: 'choose',
        prompt: 'What order does the first Charleston go in?',
        options: [
          { label: 'Right, across, left', correct: true, why: 'The second Charleston, if everyone agrees, goes the other way: left, across, right.' },
          { label: 'Left, across, right', correct: false, why: 'That’s the second Charleston, which happens only if everyone agrees. The first goes right, across, left.' },
          { label: 'Across, right, left', correct: false, why: 'Not quite. The first Charleston goes right, then across, then left.' },
        ],
      },
      {
        kind: 'pick',
        prompt: 'You’re aiming for FF 2222 44 66 8888 in craks. Choose 3 tiles to pass right.',
        hand: 'ev1',
        rack: CHARLESTON_RACK,
        count: 3,
        passing: true,
        check: passCheck(CHARLESTON_RACK, 'ev1'),
      },
    ],
  },

  {
    id: 'courtesy',
    title: 'The courtesy pass',
    summary: 'One last, optional trade with the player across. You trade the smaller number.',
    minutes: 2,
    steps: [
      {
        kind: 'read',
        title: 'One last trade',
        body: 'After the Charleston comes the courtesy pass, an optional trade with the player across from you. You each choose a number from 0 to 3, and you trade the smaller of the two.\n\nSay you’d like to trade 3 and the player across says 1. You each pass 1 tile. If either of you says 0, you don’t trade at all. Jokers still can’t be passed.',
      },
      {
        kind: 'choose',
        prompt: 'You offer 3 tiles. The player across offers 2. How many do you trade?',
        options: [
          { label: '3', correct: false, why: 'You trade the smaller of the two numbers, so 3 is too many.' },
          { label: '2', correct: true, why: 'The smaller of 3 and 2 is 2, so you each pass 2 tiles.' },
          { label: '0', correct: false, why: 'You only skip the trade if someone says 0. Here you trade the smaller number, 2.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'You offer 1 tile. The player across offers 0. How many do you trade?',
        options: [
          { label: '1', correct: false, why: 'The player across said 0, and 0 is the smaller number. Nobody passes.' },
          { label: '0', correct: true, why: 'The smaller number is 0, so you two don’t trade.' },
        ],
      },
      {
        kind: 'pick',
        prompt: 'You agreed on 2. You’re aiming for 11 333 555 777 999 in dots. Choose the 2 tiles to pass across.',
        hand: 'od1',
        rack: COURTESY_RACK,
        count: 2,
        passing: true,
        check: passCheck(COURTESY_RACK, 'od1'),
      },
    ],
  },

  {
    id: 'calling',
    title: 'Turns and calls',
    summary: 'Draw and discard, and when you can take someone else’s discard.',
    minutes: 5,
    practice: 'table',
    steps: [
      {
        kind: 'read',
        title: 'Your turn',
        body: 'East starts by discarding one tile. After that, play goes to the right. On your turn, draw a tile from the wall, then discard a tile face up in the middle of the table.\n\nIf the tile you draw completes a hand on the card, don’t discard: declare Mahjong instead.',
      },
      {
        kind: 'read',
        title: 'Calling a discard',
        body: 'When someone discards a tile you need, you can call it: take it instead of waiting for your turn. There are two reasons to call:\n1. To finish a pung (3 of the same tile), a kong (4) or a quint (5), which you lay face up. A face-up group is called an exposure.\n2. To win, because the tile completes your hand. That’s calling Mahjong.\n\nAt this table, you’re only asked when the tile fits a hand you can still make.',
      },
      {
        kind: 'read',
        title: 'Making an exposure',
        body: 'To call for an exposure, you need the rest of the group already: two matching tiles for a pung, three for a kong. Jokers count. The group must match one in an X hand you can still make, at the same size. If your hand needs a kong of 4 dots, call for a kong, not a pung.\n\nLay the group face up, then discard. You skip the draw, and play carries on to your right, so anyone in between misses that turn.',
        groups: [rep('DOT_4', 3)],
        caption: 'An exposed pung of 4 dots',
      },
      {
        kind: 'read',
        title: 'Pairs, singles and jokers',
        body: 'You can’t call a discard for a pair or a single tile unless it’s the last tile you need for Mahjong.\n\nNobody can call a discarded joker, not even for Mahjong.',
      },
      {
        kind: 'read',
        title: 'When two players call',
        body: 'Sometimes two players want the same discard. Mahjong beats an exposure. If both calls are the same kind, the player who comes next in turn after the discarder gets the tile.',
      },
      {
        kind: 'choose',
        prompt: 'The player on your left discards a 6 bam. You call it for a pung. The player across calls it for Mahjong. Who gets it?',
        tiles: ['BAMBOO_6'],
        caption: 'The discard',
        options: [
          { label: 'You, because you’re next in turn', correct: false, why: 'Being next only settles a tie between two calls of the same kind. Mahjong beats an exposure.' },
          { label: 'The player across', correct: true, why: 'Mahjong always beats an exposure.' },
          { label: 'Nobody: the two calls cancel out', correct: false, why: 'Someone always gets it. Mahjong beats an exposure, so the player across takes the tile and wins.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'The player across discards a tile. You and the player on your left both call it for Mahjong. Who wins?',
        options: [
          { label: 'You', correct: false, why: 'Play goes to the right. After the player across comes the player on your left, then you.' },
          { label: 'The player on your left', correct: true, why: 'Both calls are Mahjong, so the tile goes to whoever is next in turn after the discarder. Going right from the player across, that’s the player on your left.' },
          { label: 'Whoever called first', correct: false, why: 'Speed doesn’t decide it. The tie goes to whoever is next in turn after the discarder: the player on your left.' },
        ],
      },
      {
        kind: 'pick',
        prompt: 'You’re making 222 444 66 88 FFFF with dots and bams. The player on your right discards a 4 dot. Tap the 2 tiles you’d lay face up with it for a pung.',
        hand: 'ev2',
        tiles: ['DOT_4'],
        caption: 'The discard',
        rack: CALL_RACK,
        count: 2,
        check: (picked) => {
          const wrong = picked.filter((f) => f !== 'DOT_4' && f !== 'JOKER');
          if (wrong.length === 0) {
            return picked.includes('JOKER')
              ? { ok: true, message: 'That works: a joker can fill a pung. You hold two real 4 dots, though, and the table lays those down first, so your joker stays in your rack for later.' }
              : { ok: true, message: 'Three 4 dots, face up. Your joker stays in your rack for a group you can’t fill.' };
          }
          const face = wrong[0]!;
          if (face === 'BAMBOO_4') return { ok: false, message: 'A pung is three of the very same tile. The 4 bam is a different suit.' };
          if (face.startsWith('DOT_')) return { ok: false, message: `A pung is three identical tiles, so the ${named(face)} can’t join two 4 dots.` };
          return { ok: false, message: `The ${named(face)} doesn’t match a 4 dot. A pung is three of the very same tile.` };
        },
      },
      {
        kind: 'choose',
        prompt: 'Can you call a discard to complete a pair?',
        options: [
          { label: 'Only if it completes my hand for Mahjong', correct: true, why: 'Exposures are only for groups of three or more. A pair or a single can be called only as your winning tile.' },
          { label: 'Yes, any time', correct: false, why: 'Calls for exposures are only for pungs, kongs and quints. A pair can be called only as your winning tile.' },
          { label: 'Never', correct: false, why: 'You can, if that tile completes your whole hand. That’s calling Mahjong.' },
        ],
      },
    ],
  },

  {
    id: 'jokers',
    title: 'Jokers',
    summary: 'Where jokers can go, where they can’t, and how to swap for one.',
    minutes: 4,
    steps: [
      {
        kind: 'read',
        title: 'Groups of three or more',
        body: 'A joker can stand in for any tile, but only in a group of three or more of the same tile: a pung, a kong or a quint. A joker can never be part of a pair, and it can never stand in for a single tile.\n\nBelow, two jokers help make a kong of 8 bams.',
        groups: [['BAMBOO_8', 'BAMBOO_8', 'JOKER', 'JOKER']],
      },
      {
        kind: 'read',
        title: 'Reading the card for jokers',
        body: 'Look at the size of each group. In this hand, jokers can help with 2222 and 8888, but not with FF, 44 or 66, because those are pairs.\n\nHands made only of pairs and single tiles, like the ones in the Pairs section, can’t use jokers at all.',
        hand: 'ev1',
      },
      {
        kind: 'choose',
        prompt: 'Is this Mahjong for 11 333 555 777 999 in craks?',
        hand: 'od1',
        groups: [['CHARACTER_1', 'JOKER'], rep('CHARACTER_3', 3), rep('CHARACTER_5', 3), rep('CHARACTER_7', 3), rep('CHARACTER_9', 3)],
        options: [
          { label: 'Yes', correct: false, why: 'Look at the 11. A joker can’t stand in for a tile in a pair, so this hand still needs a real 1 crak.' },
          { label: 'No', correct: true, why: 'The joker is in the pair, and jokers can’t go in pairs. The hand still needs a real 1 crak.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'And this one?',
        hand: 'od1',
        groups: [rep('CHARACTER_1', 2), rep('CHARACTER_3', 3), rep('CHARACTER_5', 3), ['CHARACTER_7', 'CHARACTER_7', 'JOKER'], rep('CHARACTER_9', 3)],
        options: [
          { label: 'Yes', correct: true, why: 'The joker fills 777, a pung, and that’s allowed.' },
          { label: 'No', correct: false, why: 'It is Mahjong. The joker sits in 777, a group of three, and that’s allowed.' },
        ],
      },
      {
        kind: 'read',
        title: 'Joker swaps',
        body: 'On your turn, if any exposure on the table has a joker in it and you hold the real tile the joker stands for, you can swap: your tile goes into the exposure and the joker comes to you.\n\nYou can swap from anyone’s exposure, even your own, as many times as you can before you discard.',
        groups: [['WIND_EAST', 'JOKER', 'WIND_EAST']],
        caption: 'A pung of East winds with a joker in it',
      },
      {
        kind: 'pick',
        prompt: 'The player across has exposed this pung of East winds, with a joker. It’s your turn. Tap the tile you’d swap for the joker.',
        tiles: ['WIND_EAST', 'JOKER', 'WIND_EAST'],
        caption: 'Their exposure',
        rack: ['DOT_1', 'WIND_WEST', 'DRAGON_GREEN', 'WIND_EAST', 'BAMBOO_3', 'FLOWER_4', 'JOKER'],
        count: 1,
        check: ([face]) => {
          if (face === 'WIND_EAST') return { ok: true, message: 'Your East wind goes into their pung, and the joker joins your rack.' };
          if (face === 'JOKER') return { ok: false, message: 'That’s already a joker. Swap in the real tile the joker stands for: an East wind.' };
          return { ok: false, message: `The joker stands for an East wind, so only an East wind can replace it, not the ${named(face ?? '')}.` };
        },
      },
      {
        kind: 'read',
        title: 'Throwing a joker away',
        body: 'You may discard a joker, but nobody can call it, not even for Mahjong. A joker can finish so many groups that discarding one is rarely a good idea.',
      },
    ],
  },

  {
    id: 'exposed',
    title: 'Exposed or concealed',
    summary: 'What calling a tile commits you to, and when to keep everything hidden.',
    minutes: 3,
    steps: [
      {
        kind: 'read',
        title: 'Exposures are for keeps',
        body: 'When you call a discard and lay a group face up, it stays there for the rest of the hand. You can’t take it back or change it. Other players can only swap a joker out of it.\n\nYour exposures must fit the hand you finish with: the same tile, in a group of the same size.',
        groups: [rep('BAMBOO_5', 4)],
        caption: 'An exposed kong of 5 bams',
      },
      {
        kind: 'read',
        title: 'X hands and C hands',
        body: 'Hands marked X on the card may be exposed. Hands marked C must stay concealed. With a C hand you may still call a discard to win, but never to make an exposure.\n\nSo the moment you expose any group, every C hand is out of reach for the rest of the hand.',
        hand: 't4',
      },
      {
        kind: 'choose',
        prompt: 'You’ve exposed a kong of North winds. Which of these hands can you still make?',
        groups: [rep('WIND_NORTH', 4)],
        caption: 'Your exposure',
        options: [
          { label: 'N N N N, E E E E, W W W W, S S', hand: 'wd1', correct: true, why: 'It has a kong of North, the same size as your exposure.' },
          { label: 'F F, N N N, E E E, W W W, S S S', hand: 'wd2', correct: false, why: 'This hand needs a pung of North: three tiles, not four. An exposure must match a group of the same size.' },
          { label: 'N N N N N, S S S S S, F F F F', hand: 'qu3', correct: false, why: 'This hand needs a quint of North, five tiles. Your exposure is a kong of four.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'You’ve exposed a pung of 3 dots. Can you still win with this hand?',
        hand: 't4',
        groups: [rep('DOT_3', 3)],
        caption: 'Your exposure',
        options: [
          { label: 'Yes, it has 3s in it', correct: false, why: 'This hand is marked C, concealed. Once you’ve exposed anything, C hands are out.' },
          { label: 'No, it’s a concealed hand', correct: true, why: 'C hands must stay fully concealed, so any exposure rules them out.' },
        ],
      },
      {
        kind: 'read',
        title: 'When to stay concealed',
        body: 'Exposing a group gets you closer, but it also shows everyone what you’re making, and it locks you in. Early in a hand, think twice before calling: hidden tiles keep your options open.\n\nOn this card, the concealed hands are worth 50 points, more than any exposed hand.',
      },
    ],
  },

  {
    id: 'choosing',
    title: 'Choosing a hand',
    summary: 'Finding your closest hands, counting “away,” and staying flexible.',
    minutes: 5,
    practice: 'table',
    steps: [
      {
        kind: 'read',
        title: 'Start with what you have',
        body: 'After the deal, compare your tiles with the card. Pairs, pungs and numbers that fit a pattern are clues. So are flowers, winds and dragons, since some hands need lots of them.\n\nLook for the two or three hands your tiles fit best.',
      },
      {
        kind: 'read',
        title: '“2 away”',
        body: 'To compare hands, count how many more tiles each one needs. A hand that needs two more tiles is “2 away,” and 0 away is Mahjong. Jokers count toward any group of three or more.\n\nAt the table, Closest hands does this counting for you and shows the tiles each hand still needs.',
      },
      {
        kind: 'choose',
        prompt: 'Which hand are these tiles closest to?',
        tiles: CHOOSE_RACK,
        caption: 'Your tiles',
        options: [
          { label: 'F F, 2 2 2 2, 4 4, 6 6, 8 8 8 8', hand: 'ev1', correct: true, why: `In bams it’s ${away(CHOOSE_RACK, 'ev1')} away, closer than anything else on the card.` },
          { label: '1 1, 3 3 3, 5 5 5, 7 7 7, 9 9 9', hand: 'od1', correct: false, why: `That one is ${away(CHOOSE_RACK, 'od1')} away. Look at all the even bams.` },
          { label: 'N N N N, E E E E, W W W W, S S', hand: 'wd1', correct: false, why: `That one is ${away(CHOOSE_RACK, 'wd1')} away: you have only one wind.` },
        ],
      },
      {
        kind: 'pick',
        prompt: 'Now choose 3 tiles to pass in the Charleston, without moving further from your closest hand.',
        rack: CHOOSE_RACK,
        count: 3,
        passing: true,
        check: passCheck(CHOOSE_RACK),
      },
      {
        kind: 'read',
        title: 'Stay flexible',
        body: 'Don’t lock in too early. Keep a couple of hands in mind through the Charleston, especially hands that share tiles, and settle on one by the time play starts.\n\nKeep watching the discards. If the tiles your hand needs are being thrown away or exposed by others, fewer are left for you. That’s a good moment to switch.',
      },
      {
        kind: 'choose',
        prompt: 'Two of your hands are both 3 away. One needs a 5 bam, and three 5 bams are already in the discards. The other needs tiles nobody has thrown. Which do you lean toward?',
        options: [
          { label: 'The hand that needs the 5 bam', correct: false, why: 'There are only four of each tile, so at most one 5 bam is left. Lean toward the other hand.' },
          { label: 'The other hand', correct: true, why: 'With three 5 bams gone, at most one is left. The other hand has more tiles still in play.' },
        ],
      },
    ],
  },

  {
    id: 'scoring',
    title: 'Scoring and defense',
    summary: 'Who pays what, the doubles, wall games, and not handing others the win.',
    minutes: 4,
    practice: 'table',
    steps: [
      {
        kind: 'read',
        title: 'Who pays',
        body: 'Each hand on the card has a value, such as 25 or 50 points. When you win, the other three players pay you.\n\nIf you won on a discard, the player who threw it pays double the value. The other two pay the value once.',
      },
      {
        kind: 'read',
        title: 'Doubles',
        body: 'Self-drawn: if you draw your winning tile from the wall yourself, all three players pay you double.\n\nJokerless: a winning hand with no jokers in it is worth double. Hands made only of pairs and single tiles can’t use jokers anyway, so they don’t get this bonus.\n\nBoth doubles can happen together.',
      },
      {
        kind: 'read',
        title: 'Wall games',
        body: 'If the wall runs out before anyone wins, it’s a wall game. Nobody pays.',
      },
      {
        kind: 'choose',
        prompt: 'You win with this 25-point hand on a discard from the player across. Your hand has a joker in it. What do you collect?',
        hand: 'ev1',
        options: [
          { label: '50 from the player across and 25 from each of the others: 100 in all', correct: true, why: 'The discarder pays double, and the other two pay the value once.' },
          { label: '25 from each player: 75 in all', correct: false, why: 'The player who threw your winning tile pays double: 50, not 25.' },
          { label: '50 from each player: 150 in all', correct: false, why: 'Everyone pays double only when you draw the winning tile yourself.' },
        ],
      },
      {
        kind: 'choose',
        prompt: 'Same hand, but this time you drew the winning tile yourself and used no jokers. What does each player pay you?',
        hand: 'ev1',
        options: [
          { label: '25 each', correct: false, why: 'Both doubles apply here. Jokerless makes the hand worth 50, and self-drawn means each player pays double that.' },
          { label: '50 each', correct: false, why: 'That counts only one double. Jokerless makes the hand worth 50, and self-drawn doubles that again.' },
          { label: '100 each: 300 in all', correct: true, why: 'Jokerless doubles the hand to 50, and a self-drawn win means everyone pays double that.' },
        ],
      },
      {
        kind: 'read',
        title: 'Defense: don’t feed the winner',
        body: 'Because the discarder pays double, every discard carries a little risk. Watch what others expose: it tells you which hands they’re making. Late in the hand, when the wall is short or someone has several exposures, hold on to tiles that would fit their hands.\n\nTiles that have already been discarded without being called are usually safer to throw. Sometimes the best defense is to give up on your own hand and discard safely.',
      },
      {
        kind: 'choose',
        prompt: 'The player on your right has exposed a kong of 5 bams and a kong of 6 bams. Which discard is the most dangerous?',
        groups: [rep('BAMBOO_5', 4), rep('BAMBOO_6', 4)],
        caption: 'Their exposures',
        options: [
          { label: '7 bam', tiles: ['BAMBOO_7'], correct: true, why: 'Those kongs fit FF 1111 2222 3333 in one suit (Runs) as 4, 5, 6 or 5, 6, 7, so a 4 bam or a 7 bam could be their winning tile.' },
          { label: 'North wind', tiles: ['WIND_NORTH'], correct: false, why: 'No hand on the card has kongs of 5 and 6 bams with winds, so this is a safer discard. The 7 bam could finish their run.' },
          { label: '2 dot', tiles: ['DOT_2'], correct: false, why: 'Nothing they’ve shown needs a 2 dot, so this is a safer discard. The 7 bam could finish their run.' },
        ],
      },
    ],
  },
];

// ------------------------------------------------------------------ more to learn

/** Two-player games (our house rules; the table plays them through the two-player engine). */
export const TWO_PLAYER_LESSON: Lesson = {
  id: 'two-player',
  title: 'Two-player games',
  summary: 'Just the two of you: two hands each, no Charleston, and how scoring works.',
  minutes: 3,
  practice: 'table',
  steps: [
    {
      kind: 'read',
      title: 'Just the two of you',
      body: 'Two-player mahjong is for couples, pairs of friends, or you and the computer. You use the whole set, but there’s no Charleston.\n\nYou each get 27 tiles. East draws one more and starts by discarding.',
    },
    {
      kind: 'read',
      title: 'Two hands at once',
      body: 'With two players, you each build two hands from the same card at the same time.\n\nYour hidden tiles are one pool for both hands. The app shows them as two racks so you can sort them; drag a tile from one rack to the other whenever you change your mind. Anything you expose belongs to hand 1 or hand 2, and stays with that hand.',
      groups: [['FLOWER_1', 'FLOWER_2'], rep('DOT_5', 4), rep('BAMBOO_5', 4), rep('CHARACTER_5', 4)],
      caption: 'One of your two hands',
    },
    {
      kind: 'choose',
      prompt: 'You hold 27 tiles. How many tiles does each finished hand need?',
      options: [
        { label: '14', correct: true, why: 'Every hand on the card is 14 tiles, counting its exposures. Two hands make 28: your 27 plus the tile you draw or take.' },
        { label: '13', correct: false, why: 'You hold 13 between turns at four players, but a finished hand is always 14 tiles, counting its exposures.' },
        { label: '27', correct: false, why: 'That’s both hands together, less one. Each hand on its own needs 14.' },
      ],
    },
    {
      kind: 'read',
      title: 'Your turn',
      body: 'Draw a tile, or take your opponent’s discard, then discard one.\n\nYou can take a discard to expose a pung, kong or quint on either hand, or to finish a hand for Mahjong. Concealed hands (C on the card) can’t have exposures, so they only take a discard for Mahjong.',
    },
    {
      kind: 'choose',
      prompt: 'You hold three 5 dots. Hand 2 needs a kong of 5 dots, and hand 1 is a concealed hand. Your opponent throws a 5 dot. What can you do?',
      tiles: ['DOT_5'],
      options: [
        { label: 'Take it for hand 2 and expose the kong', correct: true, why: 'Exposures go on whichever hand they belong to. Then you discard a tile.' },
        { label: 'Take it for hand 1', correct: false, why: 'Hand 1 is concealed, so it can only take a discard to finish for Mahjong.' },
        { label: 'Nothing: discards are only for Mahjong', correct: false, why: 'Like at four players, you can take a discard to expose a group of three or more on an exposed hand.' },
      ],
    },
    {
      kind: 'read',
      title: 'Mahjong, then keep going',
      body: 'When 14 tiles make a line on the card, declare Mahjong on that hand. It’s locked and shown, your opponent pays its value, and you play on with your other tiles toward your second hand.\n\nYour second Mahjong ends the game.',
    },
    {
      kind: 'choose',
      prompt: 'You declare your first Mahjong with a 25-point hand that has a joker in it. What does your opponent pay?',
      options: [
        { label: '25', correct: true, why: 'Each Mahjong is paid by your opponent at its value on the card, straight away. With no jokers it would be 50.' },
        { label: '50', correct: false, why: 'Only a jokerless hand doubles. This one has a joker, so it’s 25.' },
        { label: 'Nothing until the game ends', correct: false, why: 'Each Mahjong is paid as soon as you declare it, even if the game ends in a wall game.' },
      ],
    },
    {
      kind: 'choose',
      prompt: 'Later you finish your second hand, also 25 points with a joker. What does that one pay?',
      options: [
        { label: '50', correct: true, why: 'The Mahjong that ends the game pays double.' },
        { label: '25', correct: false, why: 'Your second Mahjong ends the game, and that one pays double: 50.' },
        { label: '100', correct: false, why: 'It doubles once, for ending the game: 50. It would double again if it were jokerless.' },
      ],
    },
    {
      kind: 'read',
      title: 'Jokers and the wall',
      body: 'Jokers work as usual: never in pairs or singles, and a discarded joker can’t be taken. On your turn you can swap a matching tile for a joker in any exposure, yours or your opponent’s, unless that hand is already Mahjong.\n\nIf the wall runs out before anyone finishes both hands, nothing more is paid. Mahjongs already made keep their points.',
    },
  ],
};

/** Lessons outside the main path, opened from where they're useful (two-player games). */
export const MORE_LESSONS: Lesson[] = [TWO_PLAYER_LESSON];
