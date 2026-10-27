import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Sheet } from '../components/ui.tsx';
import { Tile } from '../components/Tile.tsx';
import { colors } from '../theme.ts';

// A plain-language guide to a hand of American mahjong at our tables, and the words the
// table uses. Opened from the table header and from the Play tab.

const TERMS: [string, string][] = [
  ['Charleston', 'Before play, everyone passes 3 tiles: right, across, then left. A second round (left, across, right) happens only if everyone agrees.'],
  ['Courtesy pass', 'After the Charleston you may trade 0 to 3 tiles with the player across. You trade the smaller of the two numbers you both choose.'],
  ['Call', 'Taking someone’s discard. You can call it for Mahjong, or to finish a group of 3 or more that you then lay face up.'],
  ['Exposure', 'A called group, face up in front of you. Exposing means your hand must be one marked X (exposed) on the card.'],
  ['Pung, kong, quint, sextet', '3, 4, 5 and 6 of the same tile.'],
  ['“2 away”', 'In Closest hands: how many more tiles that hand needs. 0 away is Mahjong.'],
  ['Joker swap', 'On your turn, if someone has a joker in an exposure and you hold the real tile, you can trade it for their joker.'],
  ['Jokerless', 'A winning hand with no jokers anywhere. It scores double.'],
  ['Wall game', 'The wall ran out before anyone won. Nobody pays.'],
  ['C / X', 'On the card: C hands must stay concealed (no calls except for Mahjong); X hands may be exposed.'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

export function HowToPlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="How to play" onClose={onClose}>
      <Section title="The goal">
        <Body>Be first to build one of the hands on the card with 14 tiles. Tap the card icon at the table to see every hand.</Body>
      </Section>
      <Section title="The tiles">
        <View style={styles.tiles} accessible accessibilityLabel="Examples: a dot, a bam, a crak, a wind, a dragon, a flower and a joker">
          {['DOT_5', 'BAMBOO_5', 'CHARACTER_5', 'WIND_EAST', 'DRAGON_RED', 'FLOWER_1', 'JOKER'].map((f) => (
            <Tile key={f} face={f} width={34} flat />
          ))}
        </View>
        <Body small>Three suits numbered 1 to 9 (dots, bams, craks), four winds, three dragons, flowers and jokers. Jokers stand in for any tile in a group of 3 or more, never in a pair or a single.</Body>
      </Section>
      <Section title="A hand, start to finish">
        <Body small>1. Everyone gets 13 tiles; East (the dealer) gets 14.</Body>
        <Body small>2. The Charleston: pass tiles you don’t want, pick a hand to aim for. Jokers can’t be passed.</Body>
        <Body small>3. East discards first. Then, in turn to the right: draw a tile, discard a tile.</Body>
        <Body small>4. When someone discards a tile you need, you get a moment to call it. We only ask when the tile fits a hand you can still make.</Body>
        <Body small>5. Make a hand on the card and tap Mahjong!</Body>
      </Section>
      <Section title="At this table">
        <Body small>Everyone else’s tiles stay face down, like a real table: you see how many they hold, what they’ve exposed and every discard. All hands are shown when the hand ends.</Body>
        <Body small>Tap tiles in your rack to choose them. Suggest picks the tiles your closest hands don’t use. Closest hands shows what you’re nearest to.</Body>
        <Body small>At live tables each move has a timer. If it runs out, the computer makes that one move for you and everyone sees a note saying so. Turn-based tables wait for you and let you know when it’s your move.</Body>
      </Section>
      <Section title="Words you’ll see">
        {TERMS.map(([term, meaning]) => (
          <Body key={term} small>
            <Text style={{ fontWeight: '700' }}>{term}</Text>: {meaning}
          </Body>
        ))}
      </Section>
      <Button title="Got it" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.primary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
