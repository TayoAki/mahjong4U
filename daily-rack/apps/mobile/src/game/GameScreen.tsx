import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SEAT_WINDS, isJoker, passTarget, type Action, type Exposure, type Seat } from '@daily-rack/core/mahjong';
import type { TablePayload } from '../lib/api.ts';
import { updatePrefs, usePrefs } from '../lib/prefs.ts';
import { Avatar, Body, Button, Card, Chip, ErrorPanel, Eyebrow, Heading, Notice, Row, Screen } from '../components/ui.tsx';
import { Tile, TileButton } from '../components/Tile.tsx';
import { HandHints, Pattern } from './CardView.tsx';
import { faceOf, groupName, sortTiles, tileName, tileShort, type SortMode } from './tiles.ts';
import { formatSeconds, useCountdown } from './useCountdown.ts';
import { colors, fonts } from '../theme.ts';

interface Props {
  data: TablePayload;
  header: ReactNode;
  busy: boolean;
  error: string | null;
  act: (action: Action) => void;
  nextHand: () => void;
  leave: () => void;
}

const SIDES = ['right', 'across', 'left'] as const;
const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A hand in progress (or just finished) at a four-seat table. */
export function GameScreen({ data, header, busy, error, act, nextHand, leave }: Props) {
  const game = data.game!;
  const view = game.view;
  const me = view.seat;
  const prompt = view.prompt;
  const phase = view.phase;
  const prefs = usePrefs();
  const { width } = useWindowDimensions();
  const [sort, setSort] = useState<SortMode>('suit');
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const seconds = useCountdown(game.deadline);

  const seatInfo = (seat: number) => data.table.seats[game.positions[seat] ?? 0]!;
  const nameOf = (seat: number) => (seat === me ? 'you' : seatInfo(seat).name);
  const scoreOf = (seat: number) => data.table.scores[game.positions[seat] ?? 0] ?? 0;
  const names = (seats: Seat[]) => seats.filter((s) => s !== me).map(nameOf).join(', ') || 'the table';

  const need = prompt?.type === 'charleston-pass' ? 3 : prompt?.type === 'courtesy-pass' ? prompt.count : prompt?.type === 'turn' ? 1 : 0;
  const passing = prompt?.type === 'charleston-pass' || prompt?.type === 'courtesy-pass';
  const promptKey = `${game.id}:${prompt?.type ?? 'none'}:${phase.kind === 'charleston' ? `${phase.round}${phase.direction}` : ''}:${view.hand.length}`;
  useEffect(() => {
    setSelected([]);
    setNotice(null);
  }, [promptKey]);

  const hand = useMemo(() => sortTiles(view.hand, sort), [view.hand, sort]);
  const myExposures = view.players[me]?.exposures ?? [];
  const avail = Math.min(width, 560) - 40 - 16;
  const tileWidth = Math.max(30, Math.min(54, Math.floor((avail - 6 * 6) / 7)));
  const discardWidth = Math.max(22, Math.min(30, Math.floor((avail - 10 * 3) / 11)));

  const toggle = (tile: number) => {
    if (need === 0 || busy) return;
    if (passing && isJoker(tile)) {
      setNotice('Jokers can’t be passed. Choose another tile.');
      return;
    }
    setNotice(null);
    setSelected((s) => (s.includes(tile) ? s.filter((t) => t !== tile) : need === 1 ? [tile] : s.length < need ? [...s, tile] : [...s.slice(1), tile]));
  };

  const status = (() => {
    switch (phase.kind) {
      case 'charleston':
        return prompt
          ? `Charleston${phase.round === 2 ? ' (second round)' : ''}: choose 3 tiles to pass ${phase.direction} to ${nameOf(passTarget(me, phase.direction))}.`
          : `Passed. Waiting for ${names(phase.waitingFor)}.`;
      case 'charleston-vote':
        return prompt ? 'The first Charleston is done. Play a second one? Anyone can stop it.' : `Waiting for ${names(phase.waitingFor)} to vote.`;
      case 'courtesy-count':
        return prompt ? `Courtesy pass: trade up to 3 tiles with ${nameOf(passTarget(me, 'across'))}, across from you.` : `Waiting for ${names(phase.waitingFor)}.`;
      case 'courtesy-select':
        return prompt?.type === 'courtesy-pass' ? `Choose ${prompt.count} ${prompt.count === 1 ? 'tile' : 'tiles'} to pass across.` : `Waiting for ${names(phase.waitingFor)}.`;
      case 'turn':
        if (phase.seat !== me) return `${nameOf(phase.seat)} is playing.`;
        return view.drawn !== null ? `Your turn. You drew ${tileShort(view.drawn)}. Discard a tile.` : 'Your turn. Discard a tile.';
      case 'claim':
        return `${phase.from === me ? 'You' : nameOf(phase.from)} discarded ${tileShort(phase.tile)}.${prompt ? ' Call it or pass.' : ' Waiting for calls.'}`;
      case 'ended':
        return 'Hand over.';
    }
  })();

  const actions = (() => {
    if (phase.kind === 'ended') {
      return (
        <>
          {data.table.status === 'between' && <Button title="Deal the next hand" icon="arrow" onPress={nextHand} loading={busy} testID="next-hand" />}
          <Button title="Leave table" variant="text" onPress={leave} compact />
        </>
      );
    }
    if (!prompt) return <Text style={styles.waiting}>{status}</Text>;
    switch (prompt.type) {
      case 'charleston-pass':
        return (
          <Button
            title={selected.length === 3 ? `Pass ${prompt.direction}` : `Choose ${3 - selected.length} more`}
            disabled={selected.length !== 3}
            loading={busy}
            onPress={() => act({ type: 'charleston-pass', tiles: selected })}
            testID="action-pass"
          />
        );
      case 'charleston-vote':
        return (
          <Row gap={10}>
            <Button style={{ flex: 1 }} title="Pass again" onPress={() => act({ type: 'charleston-vote', continue: true })} loading={busy} testID="action-vote-yes" />
            <Button style={{ flex: 1 }} variant="secondary" title="Stop here" onPress={() => act({ type: 'charleston-vote', continue: false })} disabled={busy} testID="action-vote-no" />
          </Row>
        );
      case 'courtesy-count':
        return (
          <View style={{ gap: 8 }}>
            <Text style={styles.footerLabel}>How many tiles will you offer across?</Text>
            <Row gap={8}>
              {[0, 1, 2, 3].map((n) => (
                <Chip key={n} label={n === 0 ? 'None' : String(n)} disabled={busy} onPress={() => act({ type: 'courtesy-count', count: n })} testID={`action-courtesy-${n}`} />
              ))}
            </Row>
          </View>
        );
      case 'courtesy-pass':
        return (
          <Button
            title={selected.length === prompt.count ? `Pass ${prompt.count} across` : `Choose ${prompt.count - selected.length} more`}
            disabled={selected.length !== prompt.count}
            loading={busy}
            onPress={() => act({ type: 'courtesy-pass', tiles: selected })}
            testID="action-courtesy-pass"
          />
        );
      case 'turn':
        return (
          <View style={{ gap: 8 }}>
            {prompt.canMahjong && <Button title="Mahjong!" icon="check" onPress={() => act({ type: 'declare-mahjong' })} loading={busy} testID="action-mahjong" />}
            <Button
              variant={prompt.canMahjong ? 'secondary' : 'primary'}
              title={selected[0] !== undefined ? `Discard ${tileShort(selected[0])}` : 'Tap a tile to discard'}
              disabled={selected.length !== 1 || busy}
              onPress={() => act({ type: 'discard', tile: selected[0]! })}
              testID="action-discard"
            />
            {prompt.exchanges.map((x) => (
              <Button
                key={`${x.target}-${x.exposure}`}
                variant="text"
                compact
                title={`Swap your ${tileShort(x.tile)} for ${x.target === me ? 'your' : `${nameOf(x.target)}’s`} joker`}
                disabled={busy}
                onPress={() => act({ type: 'exchange-joker', ...x })}
              />
            ))}
          </View>
        );
      case 'claim':
        return (
          <View style={{ gap: 8 }}>
            {prompt.canMahjong && (
              <Button title={`Mahjong on ${tileShort(prompt.tile)}!`} icon="check" onPress={() => act({ type: 'claim', response: { type: 'mahjong' } })} loading={busy} testID="action-claim-mahjong" />
            )}
            {prompt.sizes.length > 0 && (
              <Row gap={8}>
                {prompt.sizes.map((size) => (
                  <Button
                    key={size}
                    style={{ flex: 1 }}
                    variant="secondary"
                    compact
                    title={`Call for a ${groupName(size)}`}
                    disabled={busy}
                    onPress={() => act({ type: 'claim', response: { type: 'expose', size } })}
                    testID={`action-call-${size}`}
                  />
                ))}
              </Row>
            )}
            <Button variant="text" compact title={seconds !== null ? `Pass (${seconds}s)` : 'Pass'} disabled={busy} onPress={() => act({ type: 'claim', response: { type: 'pass' } })} testID="action-claim-pass" />
          </View>
        );
    }
  })();

  const lastDiscard = view.discards.length - 1;

  return (
    <Screen footer={actions}>
      {header}
      {error && <ErrorPanel message={error} />}
      {view.result && <ResultPanel data={data} nameOf={nameOf} />}

      <Card tone="felt" style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Eyebrow light>
            Hand {game.handNumber} · {data.table.mode === 'live' ? 'Live' : 'Turn-based'}
          </Eyebrow>
          <Text style={styles.feltMeta}>{view.wallCount} left in the wall</Text>
        </Row>
        <Text style={styles.status} testID="table-status" accessibilityLiveRegion="polite">
          {status}
        </Text>
        {seconds !== null && phase.kind !== 'ended' && <Text style={styles.timer}>Auto-play in {formatSeconds(seconds)}</Text>}
        {data.table.mode === 'turn' && phase.kind !== 'ended' && !prompt && <Text style={styles.feltMeta}>Turn-based: we’ll let you know when it’s your move.</Text>}
      </Card>

      <View style={{ gap: 8 }}>
        {([1, 2, 3] as const).map((offset) => {
          const seat = ((me + offset) % 4) as Seat;
          const info = seatInfo(seat);
          const player = view.players[seat]!;
          const active = (phase.kind === 'turn' && phase.seat === seat) || ('waitingFor' in phase && phase.waitingFor.includes(seat));
          return (
            <View key={seat} style={[styles.opponent, active && styles.active]} accessible accessibilityLabel={`${info.name}, ${SIDES[offset - 1]}, ${SEAT_WINDS[seat]} wind, ${player.handCount} tiles, score ${scoreOf(seat)}${active ? ', to play' : ''}`}>
              <Avatar name={info.name} color={info.color} size={38} online={info.kind === 'human' ? info.online : undefined} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.oppName} numberOfLines={1}>
                  {info.name}
                </Text>
                <Text style={styles.oppMeta}>
                  {SEAT_WINDS[seat]} · on your {SIDES[offset - 1]} · {player.handCount} tiles · {formatScore(scoreOf(seat))}
                </Text>
                {player.exposures.length > 0 && <Exposures exposures={player.exposures} width={17} />}
              </View>
            </View>
          );
        })}
      </View>

      <Card tone="felt" style={{ gap: 8 }}>
        <Eyebrow light>Discards</Eyebrow>
        {view.discards.length === 0 ? (
          <Text style={styles.feltMeta}>No discards yet.</Text>
        ) : (
          <View style={styles.discards} accessible accessibilityLabel={`Discards, newest last: ${view.discards.slice(-6).map((d) => tileName(d.tile)).join(', ')}`}>
            {view.discards.map((d, i) => (
              <Tile key={`${d.tile}-${i}`} face={faceOf(d.tile)} width={discardWidth} flat highlight={i === lastDiscard} />
            ))}
          </View>
        )}
        {game.log.slice(-3).map((entry, i) => (
          <Text key={`${entry.at}-${i}`} style={styles.log} numberOfLines={2}>
            {entry.text}
          </Text>
        ))}
      </Card>

      <View style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.mine}>
            Your rack · {SEAT_WINDS[me]} · {formatScore(scoreOf(me))}
          </Text>
          <Button variant="text" compact icon="sort" title={sort === 'suit' ? 'By suit' : 'By number'} onPress={() => setSort(sort === 'suit' ? 'number' : 'suit')} />
        </Row>
        {myExposures.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={styles.oppMeta}>Exposed</Text>
            <Exposures exposures={myExposures} width={26} />
          </View>
        )}
        <View style={styles.rack}>
          {hand.map((t, i) => (
            <TileButton
              key={t}
              face={faceOf(t)}
              label={`${tileName(t)}${view.drawn === t ? ', just drawn' : ''}`}
              width={tileWidth}
              selected={selected.includes(t)}
              highlight={view.drawn === t && !selected.includes(t)}
              disabled={need === 0}
              onPress={() => toggle(t)}
              testID={`rack-tile-${i}`}
            />
          ))}
        </View>
        {notice && <Notice tone="warn">{notice}</Notice>}
      </View>

      {phase.kind !== 'ended' &&
        (prefs.showHints ? (
          <Card tone="sage">
            <Row style={{ justifyContent: 'space-between' }}>
              <Heading>Closest hands</Heading>
              <Button variant="text" compact title="Hide" onPress={() => updatePrefs({ showHints: false })} />
            </Row>
            <HandHints hand={view.hand} exposures={myExposures} />
          </Card>
        ) : (
          <Button variant="text" compact icon="bulb" title="Show closest hands" onPress={() => updatePrefs({ showHints: true })} />
        ))}
    </Screen>
  );
}

export function Exposures({ exposures, width }: { exposures: Exposure[]; width: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {exposures.map((e, i) => {
        const natural = e.tiles.find((t) => !isJoker(t)) ?? e.tiles[0]!;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 1 }} accessible accessibilityLabel={`Exposed ${groupName(e.tiles.length)} of ${tileName(natural)}${e.tiles.some(isJoker) ? ' with jokers' : ''}`}>
            {e.tiles.map((t, j) => (
              <Tile key={j} face={faceOf(t)} width={width} flat />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ResultPanel({ data, nameOf }: { data: TablePayload; nameOf: (seat: number) => string }) {
  const game = data.game!;
  const view = game.view;
  const result = view.result!;
  const me = view.seat;
  const title =
    result.kind === 'wall' ? 'Wall game. Nobody wins this one.' : result.winner === me ? 'Mahjong! You won the hand.' : `${nameOf(result.winner!)} called Mahjong.`;
  return (
    <Card tone={result.winner === me ? 'pink' : 'default'} testID="result-panel">
      <Text style={styles.resultTitle} accessibilityRole="header">
        {title}
      </Text>
      {result.kind === 'mahjong' && result.pattern && (
        <View style={{ gap: 4 }}>
          <Pattern pattern={result.pattern} />
          <Body small muted>
            {result.value} points · {result.from === null ? 'self-drawn' : `on ${nameOf(result.from)}’s discard`}
            {result.jokerless ? ' · jokerless, doubled' : ''}
          </Body>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {[0, 1, 2, 3].map((seat) => {
          const exposures = view.players[seat]?.exposures ?? [];
          const concealed = sortTiles(result.hands[seat] ?? [], 'suit');
          const paid = result.payments[seat] ?? 0;
          return (
            <View key={seat} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.oppName}>
                  {seat === me ? 'You' : nameOf(seat)}
                  {result.winner === seat ? ' · Mahjong' : ''}
                </Text>
                <Text style={[styles.payment, { color: paid > 0 ? colors.online : paid < 0 ? colors.danger : colors.muted }]}>{formatScore(paid)}</Text>
              </Row>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {exposures.length > 0 && <Exposures exposures={exposures} width={18} />}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
                  {concealed.map((t) => (
                    <Tile key={t} face={faceOf(t)} width={18} flat />
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </View>
      <Body small muted>
        Table totals: {data.table.seats.map((s, p) => `${s.position === data.mySeat ? 'You' : s.name} ${formatScore(data.table.scores[p] ?? 0)}`).join(' · ')}
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 27, color: colors.feltText },
  feltMeta: { fontSize: 13, color: 'rgba(244,239,227,0.8)' },
  timer: { fontSize: 15, fontWeight: '700', color: colors.gold },
  waiting: { fontSize: 15, color: colors.muted, textAlign: 'center', paddingVertical: 6 },
  footerLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  opponent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 10 },
  active: { borderColor: colors.primary, backgroundColor: colors.pink },
  oppName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  oppMeta: { fontSize: 13, color: colors.muted },
  discards: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  log: { fontSize: 13, color: 'rgba(244,239,227,0.85)' },
  mine: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  rack: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, backgroundColor: colors.wood, borderRadius: 14, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 8, borderBottomWidth: 5, borderBottomColor: colors.woodDark },
  resultTitle: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.ink },
  payment: { fontSize: 16, fontWeight: '800' },
});
