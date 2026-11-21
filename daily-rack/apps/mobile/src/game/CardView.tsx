import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { analyze, patternPieces, patternText, type CardHand, type ConcreteGroup, type Exposure } from '@daily-rack/core/mahjong';
import { useActiveCard } from '../lib/cards.tsx';
import { Tile } from '../components/Tile.tsx';
import { Body, Notice } from '../components/ui.tsx';
import { SUIT_COLORS, colors } from '../theme.ts';
import { faceForKey } from './tiles.ts';

// A card printed the way a paper card is: each group in its suit colour, with consecutive
// or like numbers shown as example numbers (1, 2, 3, or the first ones a hand allows) and
// explained in the note. A hand that can be made several ways shows its first way.

export function Pattern({ pattern, size = 17, oneLine = false }: { pattern: string; size?: number; oneLine?: boolean }) {
  const pieces = useMemo(() => patternPieces(pattern), [pattern]);
  return (
    <Text style={{ fontSize: size, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 }} numberOfLines={oneLine ? 1 : undefined}>
      {pieces.map((piece, i) => (
        <Text key={i} style={{ color: piece.suit ? SUIT_COLORS[piece.suit] : colors.ink }}>
          {i > 0 ? ' ' : ''}
          {piece.text}
        </Text>
      ))}
    </Text>
  );
}

function HandRow({ hand }: { hand: CardHand }) {
  return (
    <View style={styles.handRow} accessible accessibilityLabel={`${patternText(hand.pattern)}. ${hand.note ?? ''}. ${hand.concealed ? 'Concealed' : 'Exposed'}, ${hand.value} points`}>
      <View style={{ flex: 1, gap: 2 }}>
        <Pattern pattern={hand.pattern} />
        {hand.note ? (
          <Body small muted>
            {hand.note}
          </Body>
        ) : null}
      </View>
      <Text style={styles.value}>
        {hand.concealed ? 'C' : 'X'} {hand.value}
      </Text>
    </View>
  );
}

export function CardView() {
  const card = useActiveCard();
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        {card.description} F is a flower, D a dragon, 0 the white dragon. Colors mark different suits. The note under a hand says which numbers it takes: printed numbers can stand for any consecutive (or like) numbers. X = may be exposed, C = concealed.
      </Notice>
      {card.sections.map((section) => (
        <View key={section.id} style={{ gap: 4 }}>
          <Text style={styles.section}>{section.label}</Text>
          {card.hands
            .filter((h) => h.section === section.id)
            .map((h) => (
              <HandRow key={h.id} hand={h} />
            ))}
        </View>
      ))}
    </View>
  );
}

function GroupTiles({ groups, width }: { groups: ConcreteGroup[]; width: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
      {groups.map((g, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
          {Array.from({ length: g.n }, (_, j) => (
            <Tile key={j} face={faceForKey(g.face)} width={width} flat />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The closest hands on the card to what you hold, with the tiles each one needs. */
export function HandHints({ hand, exposures, limit = 3 }: { hand: number[]; exposures: Exposure[]; limit?: number }) {
  const card = useActiveCard();
  const fits = useMemo(() => {
    const seen = new Set<string>();
    return analyze(card, hand, exposures).filter((f) => !seen.has(f.concrete.hand.id) && seen.add(f.concrete.hand.id)).slice(0, limit);
  }, [card, hand, exposures, limit]);
  if (fits.length === 0) return <Body muted>No hand on the card fits your exposures any more. Keep discarding safely.</Body>;
  return (
    <View style={{ gap: 12 }}>
      {fits.map((f) => (
        <View key={f.concrete.hand.id} style={styles.hint}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pattern pattern={f.concrete.hand.pattern} size={15} />
            <Text style={styles.away}>{f.distance === 0 ? 'Mahjong!' : `${f.distance} away`}</Text>
          </View>
          <GroupTiles groups={f.concrete.groups} width={17} />
        </View>
      ))}
    </View>
  );
}

/**
 * The hand on the card you're closest to, pinned in one line above your rack so you never
 * have to leave the table (or hold up a paper card) to know what you're building. Tap it
 * for the next closest.
 */
export function ClosestHand({ hand, exposures, onPress }: { hand: number[]; exposures: Exposure[]; onPress: () => void }) {
  const card = useActiveCard();
  const best = useMemo(() => analyze(card, hand, exposures)[0] ?? null, [card, hand, exposures]);
  const away = best ? (best.distance === 0 ? 'Mahjong!' : `${best.distance} away`) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        best ? `Closest hand on the card: ${patternText(best.concrete.hand.pattern)}, ${away}. Show more hands` : 'No hand on the card fits your exposures. Show the card'
      }
      style={({ pressed }) => [styles.closest, pressed && { opacity: 0.7 }]}
      hitSlop={4}
      testID="closest-hand"
    >
      <Text style={styles.closestLabel}>Closest</Text>
      {best ? <Pattern pattern={best.concrete.hand.pattern} size={14} oneLine /> : <Text style={styles.closestNone}>No hand fits your exposures</Text>}
      <View style={{ flex: 1 }} />
      {away && <Text style={styles.away}>{away}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  closest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closestLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  closestNone: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.primary, marginTop: 4 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  value: { fontSize: 14, fontWeight: '700', color: colors.muted, minWidth: 44, textAlign: 'right' },
  hint: { gap: 6, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  away: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
