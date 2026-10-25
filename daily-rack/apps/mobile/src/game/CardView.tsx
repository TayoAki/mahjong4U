import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HOUSE_CARD, analyze, type CardHand, type ConcreteGroup, type Exposure } from '@daily-rack/core/mahjong';
import { Tile } from '../components/Tile.tsx';
import { Body, Notice } from '../components/ui.tsx';
import { SUIT_COLORS, colors } from '../theme.ts';
import { faceForKey } from './tiles.ts';

// The house card printed the way a paper card is: each group in its suit colour, with
// consecutive or like numbers shown as 1, 2, 3 and explained in the note.

const VAR_DIGIT: Record<string, string> = { x: '1', y: '2', z: '3', u: '4', v: '5' };

export function Pattern({ pattern, size = 17 }: { pattern: string; size?: number }) {
  return (
    <Text style={{ fontSize: size, fontWeight: '700', letterSpacing: 0.5 }}>
      {pattern.split(' ').map((token, i) => {
        const suit = /[abc]$/.test(token) ? (token.at(-1) as 'a' | 'b' | 'c') : null;
        const body = (suit ? token.slice(0, -1) : token).replace(/[xyzuv]/g, (ch) => VAR_DIGIT[ch]!);
        return (
          <Text key={i} style={{ color: suit ? SUIT_COLORS[suit] : colors.ink }}>
            {i > 0 ? ' ' : ''}
            {body}
          </Text>
        );
      })}
    </Text>
  );
}

function HandRow({ hand }: { hand: CardHand }) {
  return (
    <View style={styles.handRow} accessible accessibilityLabel={`${hand.pattern}. ${hand.note ?? ''}. ${hand.concealed ? 'Concealed' : 'Exposed'}, ${hand.value} points`}>
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
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        {HOUSE_CARD.description} F is a flower, D a dragon, 0 the white dragon. Colours mark different suits; 1 2 3 stand for any consecutive (or like) numbers. X = may be exposed, C = concealed.
      </Notice>
      {HOUSE_CARD.sections.map((section) => (
        <View key={section.id} style={{ gap: 4 }}>
          <Text style={styles.section}>{section.label}</Text>
          {HOUSE_CARD.hands
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
  const fits = useMemo(() => {
    const seen = new Set<string>();
    return analyze(HOUSE_CARD, hand, exposures).filter((f) => !seen.has(f.concrete.hand.id) && seen.add(f.concrete.hand.id)).slice(0, limit);
  }, [hand, exposures, limit]);
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

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.primary, marginTop: 4 },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  value: { fontSize: 14, fontWeight: '700', color: colors.muted, minWidth: 44, textAlign: 'right' },
  hint: { gap: 6, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  away: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
