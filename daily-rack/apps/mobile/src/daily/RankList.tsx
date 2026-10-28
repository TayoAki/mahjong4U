import { StyleSheet, Text, View } from 'react-native';
import { formatRate, spokenLabel } from '@daily-rack/core';
import type { TileChoice } from '@daily-rack/core/mahjong';
import { Body, Heading } from '../components/ui.tsx';
import { Tile } from '../components/Tile.tsx';
import { faceForKey, faceOf } from '../game/tiles.ts';
import { colors } from '../theme.ts';

// "Every tile, ranked", after the trainers that list every possible cut once you've chosen:
// one row per face, best first. Away is how many tiles you'd still need for your nearest
// hand without it; Useful is how many unseen tiles would bring that hand a step closer.
// The best rows are green and your own choice is marked.

export interface RankRow {
  /** Match key: a face code, 'FLOWER' or 'JOKER'. */
  key: string;
  /** The coach's view of letting this tile go; null when it can't go (a joker in a pass). */
  choice: TileChoice | null;
  /** Tiles away from your nearest hand right now, or with your best throw, so a row can show what it costs. */
  base: number;
  mine: boolean;
  /** In the strong pass. */
  strong?: boolean;
  /** Share of players who passed it, where the split is shown. */
  rate?: number | null;
}

const BEST_BG = '#E3F3E3';

export function RankList({ title, intro, rows, verb, testID }: { title: string; intro: string; rows: RankRow[]; verb: 'pass' | 'throw'; testID?: string }) {
  const rates = rows.some((r) => r.rate !== undefined && r.rate !== null);
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <Heading>{title}</Heading>
      <Body small muted>
        {intro}
      </Body>
      <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.headText, { flex: 1 }]}>{verb === 'pass' ? 'Pass' : 'Throw'}</Text>
        <Text style={[styles.headText, styles.num]}>Away</Text>
        <Text style={[styles.headText, styles.num]}>Useful</Text>
        {rates && <Text style={[styles.headText, styles.rate]}>Passed</Text>}
      </View>
      {rows.map((row) => (
        <Row key={row.key} row={row} verb={verb} rates={rates} />
      ))}
    </View>
  );
}

function Row({ row, verb, rates }: { row: RankRow; verb: 'pass' | 'throw'; rates: boolean }) {
  const { choice, mine, strong } = row;
  const face = choice ? faceOf(choice.tile) : faceForKey(row.key);
  const name = spokenLabel(face);
  const cost = choice && Number.isFinite(choice.distance) ? choice.distance - row.base : 0;
  const away = choice && Number.isFinite(choice.distance) ? String(choice.distance) : '–';
  const label = [
    `${name}: ${!choice ? `can’t be ${verb === 'pass' ? 'passed' : 'thrown'}` : choice.best ? `one of the best to ${verb}` : `ranked ${choice.rank}`}`,
    choice ? `without it you’d be ${away} tiles from your nearest hand${cost > 0 ? `, ${cost} more than ${verb === 'pass' ? 'now' : 'the best throw'}` : ''}, with ${choice.helpers} useful tiles left` : null,
    rates && row.rate !== undefined && row.rate !== null ? `${formatRate(row.rate)} of players passed it` : null,
    mine ? `your ${verb === 'pass' ? 'pick' : 'throw'}` : null,
    strong ? 'in the strong pass' : null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <View style={[styles.row, choice?.best && styles.best, mine && styles.mine]} accessible accessibilityLabel={label} testID={choice?.best ? 'rank-row-best' : 'rank-row'}>
      <Tile face={face} width={30} flat />
      <View style={styles.marks}>
        {choice?.best && <Mark label="Best" tone="best" />}
        {mine && <Mark label={verb === 'pass' ? 'You' : 'Your throw'} tone="mine" />}
        {strong && <Mark label="Strong" tone="strong" />}
        {!choice && <Text style={styles.keep}>Jokers can’t be passed</Text>}
      </View>
      <View style={[styles.num, styles.away]}>
        <Text style={styles.value}>{away}</Text>
        {cost > 0 && <Text style={styles.cost}>+{cost}</Text>}
      </View>
      <Text style={[styles.value, styles.num]}>{choice ? choice.helpers : '–'}</Text>
      {rates && <Text style={[styles.value, styles.rate]}>{row.rate !== undefined && row.rate !== null ? formatRate(row.rate) : '–'}</Text>}
    </View>
  );
}

function Mark({ label, tone }: { label: string; tone: 'best' | 'mine' | 'strong' }) {
  return (
    <View style={[styles.mark, tone === 'best' && { backgroundColor: colors.online }, tone === 'mine' && { backgroundColor: colors.primary }, tone === 'strong' && { backgroundColor: colors.ink }]}>
      <Text style={styles.markText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  headText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 10 },
  best: { backgroundColor: BEST_BG, borderColor: colors.online },
  mine: { borderWidth: 2, borderColor: colors.primary },
  marks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  mark: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  markText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  keep: { fontSize: 13, color: colors.muted },
  num: { width: 52, textAlign: 'right' },
  away: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 3 },
  rate: { width: 56, textAlign: 'right' },
  value: { fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  cost: { fontSize: 12, fontWeight: '700', color: colors.danger },
});
