import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Sheet } from '../components/ui.tsx';
import { PipSays } from '../components/Pip.tsx';
import { colors } from '../theme.ts';

// Our two-player house rules in plain English, for players. Opened from a two-player
// table, the Play tab and the new-table form. The engine is packages/core/src/mahjong/twoPlayer.ts.

/** The rules in one line, for places with room for little more. */
export const TWO_PLAYER_SUMMARY = 'You each build two hands at once from the same card. No Charleston, and the first to finish both hands wins.';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

export function TwoPlayerRules({ visible, onClose, onBasics, onLesson }: { visible: boolean; onClose: () => void; onBasics?: () => void; onLesson?: () => void }) {
  return (
    <Sheet visible={visible} title="Two-player rules" onClose={onClose}>
      <PipSays mood="wave" size={52}>
        Just the two of you? Perfect. You each play two hands at once, so there’s always something to aim for.
      </PipSays>
      <Section title="The deal">
        <Body small>All 152 tiles go into one wall. You each get 27 tiles. East draws one more and starts by discarding. There’s no Charleston.</Body>
      </Section>
      <Section title="Two hands from one pool">
        <Body small>You build two hands from the same card at the same time. Your hidden tiles are one pool for both, and we show them as two racks so you can sort them however you like: drag a tile from one rack to the other, or tap it and tap Move.</Body>
        <Body small>Anything you expose belongs to hand 1 or hand 2, and stays with that hand.</Body>
      </Section>
      <Section title="Your turn">
        <Body small>Draw a tile, or take your opponent’s discard, then discard one.</Body>
        <Body small>You can take a discard to expose a pung, kong or quint on either hand (jokers allowed), or to finish a hand for Mahjong. After you expose, you discard.</Body>
        <Body small>Concealed hands (C on the card) can’t have exposures, so they only take a discard for Mahjong.</Body>
      </Section>
      <Section title="Mahjong, twice">
        <Body small>When 14 tiles make a line on the card, counting that hand’s exposures, declare Mahjong on that hand. It’s locked and shown, and you play on toward your second hand with the tiles you have left.</Body>
        <Body small>The game ends when someone declares their second Mahjong, or when the wall runs out.</Body>
      </Section>
      <Section title="Jokers">
        <Body small>On your turn you can swap a matching tile for a joker in any exposure, yours or your opponent’s, except in a hand that’s already Mahjong. Jokers never go in pairs or singles, and nobody can take a discarded joker.</Body>
      </Section>
      <Section title="Dead hands">
        <Body small>If a hand’s exposures don’t fit any line on the card, that hand is dead and can’t win. Keep playing toward your other hand. With both hands dead you still play, you just can’t win this game.</Body>
      </Section>
      <Section title="Scoring">
        <Body small>Each Mahjong scores its value on the card from your opponent, doubled if it’s jokerless.</Body>
        <Body small>The Mahjong that ends the game (your second) pays double.</Body>
        <Body small>If the wall runs out, there’s nothing more to pay. Mahjongs already made keep their points.</Body>
      </Section>
      <Button title="Got it" onPress={onClose} />
      {onLesson && <Button title="Take the short two-player lesson" variant="secondary" icon="bulb" onPress={onLesson} testID="two-player-lesson" />}
      {onBasics && <Button title="New to mahjong? How to play" variant="text" icon="help" onPress={onBasics} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.primary },
});
