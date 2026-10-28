import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  HOUSE_CARD,
  SEATS,
  SEAT_WINDS,
  arrangeWin,
  isJoker,
  passTarget,
  publicPhaseKey,
  tileScores,
  type Action,
  type PublicPhase,
  type Seat,
} from '@daily-rack/core/mahjong';
import type { TablePayload } from '../lib/api.ts';
import { updatePrefs, usePrefs } from '../lib/prefs.ts';
import { useSafety } from '../lib/safety.tsx';
import { Body, Button, Card, Chip, ErrorPanel, Heading, IconButton, Notice, Row, Screen } from '../components/ui.tsx';
import { Tile, TileButton } from '../components/Tile.tsx';
import { Arrive, useAfterFirstRender } from '../components/Arrive.tsx';
import { playSound, preloadSounds, setSoundsEnabled } from '../lib/sounds.ts';
import { useTableSounds } from './useTableSounds.ts';
import { HandHints, Pattern } from './CardView.tsx';
import { Exposures, TableBoard } from './TableBoard.tsx';
import { faceOf, groupName, sortTiles, tileName, tileShort, type SortMode } from './tiles.ts';
import { formatSeconds, useCountdown } from './useCountdown.ts';
import { colors, fonts, table } from '../theme.ts';

interface Props {
  data: TablePayload;
  header: ReactNode;
  busy: boolean;
  error: string | null;
  act: (action: Action) => void;
  nextHand: () => void;
  leave: () => void;
}

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A little physical feedback on phones: a tick when picking a tile, a knock when one hits the table. */
function feel(kind: 'pick' | 'place' | 'nudge') {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'pick'
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(kind === 'place' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  done.catch(() => undefined);
}
const shortName = (name: string) => name.replace(' (computer)', '');

/** Tiles that just arrived from a pass, shown with a "New" badge until you pass or discard. */
interface Received {
  tiles: number[];
  from: Seat | null;
}

/**
 * A hand in progress (or just finished), laid out like a real table: the other three
 * players around the felt with their tiles face down, and your rack pinned at the bottom
 * with whatever you can do right now just above it.
 */
export function GameScreen({ data, header, busy, error, act, nextHand, leave }: Props) {
  const game = data.game!;
  const view = game.view;
  const me = view.seat;
  const prompt = view.prompt;
  const phase = view.phase;
  const prefs = usePrefs();
  const { openPlayer } = useSafety();
  const { width } = useWindowDimensions();
  const [sort, setSort] = useState<SortMode>('suit');
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [jokerWarned, setJokerWarned] = useState(false);
  const [received, setReceived] = useState<Received | null>(null);
  const [dismissedTimeout, setDismissedTimeout] = useState<string | null>(null);
  const seconds = useCountdown(game.deadline);
  const ownDiscard = useRef<number | null>(null);
  useEffect(() => setSoundsEnabled(prefs.sounds), [prefs.sounds]);
  useEffect(preloadSounds, []);
  useTableSounds(game.id, view, ownDiscard);

  const seatInfo = (seat: number) => data.table.seats[game.positions[seat] ?? 0]!;
  const nameOf = (seat: number) => shortName(seatInfo(seat).name);
  const who = (seat: number) => (seat === me ? 'You' : nameOf(seat));
  const whose = (seat: number) => (seat === me ? 'your' : `${nameOf(seat)}’s`);
  const scoreOf = (seat: number) => data.table.scores[game.positions[seat] ?? 0] ?? 0;
  const names = (seats: Seat[]) => seats.filter((s) => s !== me).map(nameOf).join(', ') || 'the table';

  const need = prompt?.type === 'charleston-pass' ? 3 : prompt?.type === 'courtesy-pass' ? prompt.count : prompt?.type === 'turn' ? 1 : 0;
  const passing = prompt?.type === 'charleston-pass' || prompt?.type === 'courtesy-pass';
  const promptKey = `${game.id}:${prompt?.type ?? 'none'}:${phase.kind === 'charleston' ? `${phase.round}${phase.direction}` : ''}:${view.hand.length}`;
  useEffect(() => {
    setSelected([]);
    setNotice(null);
    setJokerWarned(false);
    if (prompt) feel('nudge');
  }, [promptKey]);
  const ready = useAfterFirstRender();

  // Work out which tiles a pass brought in, by comparing the rack before and after the step.
  const stepKey = `${game.id}:${publicPhaseKey(phase)}`;
  const previous = useRef<{ key: string; gameId: string; hand: number[]; phase: PublicPhase } | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = { key: stepKey, gameId: game.id, hand: view.hand, phase };
    if (!prev || prev.key === stepKey) return;
    if (prev.gameId !== game.id) {
      setReceived(null);
      return;
    }
    if (prev.phase.kind !== 'charleston' && prev.phase.kind !== 'courtesy-select') return;
    const before = new Set(prev.hand);
    const tiles = view.hand.filter((t) => !before.has(t));
    if (tiles.length === 0) return;
    const direction = prev.phase.kind === 'charleston' ? prev.phase.direction : 'across';
    setReceived({ tiles, from: SEATS.find((s) => s !== me && passTarget(s, direction) === me) ?? null });
  }, [stepKey]);

  // The newest note that the computer moved for you because your time ran out.
  const timedOut = useMemo(() => {
    const recent = game.log.slice(-6);
    return [...recent].reverse().find((e) => e.event.type === 'timeout' && e.event.position === data.mySeat) ?? null;
  }, [game.log, data.mySeat]);

  const hand = useMemo(() => {
    // Like a real rack: sorted, with the tile you just drew at the end.
    const drawn = view.drawn !== null && view.hand.includes(view.drawn) ? view.drawn : null;
    const sorted = sortTiles(
      view.hand.filter((t) => t !== drawn),
      sort,
    );
    return drawn === null ? sorted : [...sorted, drawn];
  }, [view.hand, view.drawn, sort]);
  const myExposures = view.players[me]?.exposures ?? [];
  const rackWidth = Math.min(width, 560) - 40 - 16;
  const tileWidth = Math.max(34, Math.min(52, Math.floor((rackWidth - 6 * 6) / 7)));

  const send = (action: Action) => {
    if (action.type === 'charleston-pass' || action.type === 'courtesy-pass' || action.type === 'discard') setReceived(null);
    feel(action.type === 'discard' || action.type === 'claim' || action.type === 'charleston-pass' || action.type === 'courtesy-pass' ? 'place' : 'pick');
    // Your own tiles sound the moment you let go, without waiting for the server.
    if (action.type === 'discard') {
      ownDiscard.current = action.tile;
      playSound('place');
    } else if (action.type === 'charleston-pass' || action.type === 'courtesy-pass') {
      playSound('pass');
    }
    act(action);
  };

  const toggle = (tile: number) => {
    if (need === 0 || busy) return;
    if (passing && isJoker(tile)) {
      setNotice('Jokers can’t be passed. Choose another tile.');
      return;
    }
    setNotice(null);
    setJokerWarned(false);
    feel('pick');
    playSound('tap');
    setSelected((s) => (s.includes(tile) ? s.filter((t) => t !== tile) : need === 1 ? [tile] : s.length < need ? [...s, tile] : [...s.slice(1), tile]));
  };

  // Learning aid, like the hand analysers in other mahjong apps: pick the tiles that the
  // closest hands on the card don't use. Jokers are never suggested.
  const suggest = () => {
    const scores = tileScores(HOUSE_CARD, view.hand, myExposures, 'hard');
    const picks = [...scores.entries()]
      .filter(([t]) => !isJoker(t))
      .sort((a, b) => a[1] - b[1])
      .slice(0, need)
      .map(([t]) => t);
    setSelected(picks);
    setJokerWarned(false);
    setNotice(
      need === 1
        ? `Suggested: ${tileShort(picks[0]!)}. Your closest hands don’t need it.`
        : `Suggested: ${picks.map(tileShort).join(', ')}. Your closest hands don’t need them.`,
    );
  };

  const discard = () => {
    const tile = selected[0];
    if (tile === undefined) return;
    if (isJoker(tile) && !jokerWarned) {
      setJokerWarned(true);
      return;
    }
    send({ type: 'discard', tile });
  };

  const status = (() => {
    switch (phase.kind) {
      case 'charleston':
        return prompt
          ? `Charleston${phase.round === 2 ? ' (second round)' : ''}: choose 3 tiles to pass ${phase.direction} to ${nameOf(passTarget(me, phase.direction))}.`
          : `Passed. Waiting for ${names(phase.waitingFor)}.`;
      case 'charleston-vote':
        return prompt ? 'First Charleston done. Pass again? Anyone can say stop.' : `Waiting for ${names(phase.waitingFor)} to vote.`;
      case 'courtesy-count':
        return prompt ? `Courtesy pass: trade up to 3 tiles with ${nameOf(passTarget(me, 'across'))}, across from you.` : `Waiting for ${names(phase.waitingFor)}.`;
      case 'courtesy-select':
        return prompt?.type === 'courtesy-pass'
          ? `Choose ${prompt.count} ${prompt.count === 1 ? 'tile' : 'tiles'} to pass across to ${nameOf(passTarget(me, 'across'))}.`
          : `Waiting for ${names(phase.waitingFor)}.`;
      case 'turn':
        if (phase.seat !== me) return `${nameOf(phase.seat)} is playing.`;
        return view.drawn !== null ? `Your turn. You drew ${tileShort(view.drawn)}. Discard a tile.` : 'Your turn. Discard a tile.';
      case 'claim':
        return prompt ? 'Your call.' : `${who(phase.from)} threw ${tileShort(phase.tile)}. Seeing if anyone calls it.`;
      case 'ended':
        return 'Hand over.';
    }
  })();

  const timer = (() => {
    if (seconds === null || phase.kind === 'ended') return null;
    if (prompt) return `${formatSeconds(seconds)} to move`;
    if (phase.kind === 'turn') return `${nameOf(phase.seat)}: ${formatSeconds(seconds)}`;
    return formatSeconds(seconds);
  })();

  const actions = (() => {
    if (!prompt) return null;
    switch (prompt.type) {
      case 'charleston-pass':
        return (
          <Button
            title={selected.length === 3 ? `Pass ${prompt.direction} to ${nameOf(passTarget(me, prompt.direction))}` : `Choose ${3 - selected.length} more`}
            disabled={selected.length !== 3}
            loading={busy}
            onPress={() => send({ type: 'charleston-pass', tiles: selected })}
            testID="action-pass"
          />
        );
      case 'charleston-vote':
        return (
          <Row gap={10}>
            <Button style={{ flex: 1 }} title="Pass again" onPress={() => send({ type: 'charleston-vote', continue: true })} loading={busy} testID="action-vote-yes" />
            <Button style={{ flex: 1 }} variant="secondary" title="Stop here" onPress={() => send({ type: 'charleston-vote', continue: false })} disabled={busy} testID="action-vote-no" />
          </Row>
        );
      case 'courtesy-count':
        return (
          <View style={{ gap: 6 }}>
            <Text style={styles.hint}>You both pick a number; you trade the smaller one. Pick None to keep your tiles.</Text>
            <Row gap={8}>
              {[0, 1, 2, 3].map((n) => (
                <Chip key={n} label={n === 0 ? 'None' : String(n)} disabled={busy} onPress={() => send({ type: 'courtesy-count', count: n })} testID={`action-courtesy-${n}`} />
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
            onPress={() => send({ type: 'courtesy-pass', tiles: selected })}
            testID="action-courtesy-pass"
          />
        );
      case 'turn': {
        const tile = selected[0];
        const joker = tile !== undefined && isJoker(tile);
        return (
          <View style={{ gap: 8 }}>
            {prompt.canMahjong && <Button title="Mahjong!" icon="check" onPress={() => send({ type: 'declare-mahjong' })} loading={busy} testID="action-mahjong" />}
            <Button
              variant={prompt.canMahjong || (joker && jokerWarned) ? 'secondary' : 'primary'}
              title={tile === undefined ? 'Tap a tile to discard' : joker && jokerWarned ? 'Yes, discard the joker' : `Discard ${tileShort(tile)}`}
              disabled={tile === undefined || busy}
              onPress={discard}
              testID="action-discard"
            />
            {prompt.exchanges.map((x) => (
              <Button
                key={`${x.target}-${x.exposure}`}
                variant="text"
                compact
                title={`Swap your ${tileShort(x.tile)} for ${whose(x.target)} joker`}
                disabled={busy}
                onPress={() => send({ type: 'exchange-joker', ...x })}
              />
            ))}
          </View>
        );
      }
      case 'claim':
        return (
          <View style={styles.claim} testID="claim-prompt">
            <Row gap={12}>
              <Tile face={faceOf(prompt.tile)} width={44} highlight />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.claimTitle}>
                  {who(prompt.from)} threw {tileShort(prompt.tile)}
                </Text>
                <Text style={styles.claimText}>
                  {prompt.canMahjong ? 'It completes your hand!' : `You can call it for a ${prompt.sizes.map(groupName).join(' or ')} and lay that group face up.`}
                  {seconds !== null ? ` ${seconds}s to decide.` : ''}
                </Text>
              </View>
            </Row>
            {prompt.canMahjong && (
              <Button title={`Mahjong on ${tileShort(prompt.tile)}!`} icon="check" onPress={() => send({ type: 'claim', response: { type: 'mahjong' } })} loading={busy} testID="action-claim-mahjong" />
            )}
            <Row gap={8}>
              {prompt.sizes.map((size) => (
                <Button
                  key={size}
                  style={{ flex: 1 }}
                  variant="secondary"
                  compact
                  title={`Call for a ${groupName(size)}`}
                  disabled={busy}
                  onPress={() => send({ type: 'claim', response: { type: 'expose', size } })}
                  testID={`action-call-${size}`}
                />
              ))}
              <Button style={{ flex: 1 }} variant="text" compact title="Pass" disabled={busy} onPress={() => send({ type: 'claim', response: { type: 'pass' } })} testID="action-claim-pass" />
            </Row>
          </View>
        );
    }
  })();

  const receivedSet = new Set(received?.tiles ?? []);
  const ended = phase.kind === 'ended';

  const footer = (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={10}>
        <Text style={styles.status} testID="table-status" accessibilityLiveRegion="polite">
          {status}
        </Text>
        {timer && (
          <View style={[styles.timer, prompt && seconds !== null && seconds <= 10 && styles.timerUrgent]} accessibilityLabel={`Time left: ${timer}`}>
            <Text style={styles.timerText}>{timer}</Text>
          </View>
        )}
      </Row>
      {timedOut && timedOut.at !== dismissedTimeout && !ended && (
        <View style={styles.banner} testID="timeout-notice">
          <Text style={styles.bannerText}>Your time ran out, so the computer made that move for you.</Text>
          <Button variant="text" compact title="OK" onPress={() => setDismissedTimeout(timedOut.at)} />
        </View>
      )}
      {received && !ended && (
        <Text style={styles.received} testID="received-notice">
          {received.from !== null ? `${nameOf(received.from)} passed you` : 'You received'} {received.tiles.map(tileShort).join(', ')}. They’re marked New.
        </Text>
      )}
      {data.table.mode === 'turn' && !ended && !prompt && <Text style={styles.small}>Turn-based: we’ll let you know when it’s your move.</Text>}
      {jokerWarned && <Notice tone="warn">Jokers fill any group of 3 or more, so throwing one away is rarely right, and nobody can call it. Tap again to discard it anyway.</Notice>}
      {notice && (
        <Text style={[styles.tip, !notice.startsWith('Suggested') && styles.tipWarn]} testID="rack-notice">
          {notice}
        </Text>
      )}
      {ended ? (
        <>
          {data.table.status === 'between' && <Button title="Deal the next hand" icon="arrow" onPress={nextHand} loading={busy} testID="next-hand" />}
          <Button title="Leave table" variant="text" onPress={leave} compact />
        </>
      ) : (
        <>
          {actions}
          <Row style={{ justifyContent: 'space-between' }} gap={4}>
            <Text style={styles.mine} numberOfLines={1}>
              {SEAT_WINDS[me]} · {formatScore(scoreOf(me))}
            </Text>
            <Row gap={0}>
              <IconButton
                icon={prefs.sounds ? 'sound' : 'mute'}
                label={prefs.sounds ? 'Turn table sounds off' : 'Turn table sounds on'}
                color={colors.muted}
                onPress={() => updatePrefs({ sounds: !prefs.sounds })}
              />
              {need > 0 && <Button variant="text" compact icon="bulb" title="Suggest" onPress={suggest} disabled={busy} testID="suggest" />}
              <Button variant="text" compact icon="sort" title={sort === 'suit' ? 'By suit' : 'By number'} onPress={() => setSort(sort === 'suit' ? 'number' : 'suit')} />
            </Row>
          </Row>
          {myExposures.length > 0 && (
            <View style={styles.myExposures}>
              <Text style={styles.small}>Exposed</Text>
              <Exposures exposures={myExposures} width={22} depth="lying" />
            </View>
          )}
          <View style={styles.rack}>
            {hand.map((t, i) => (
              // Tiles you draw or are passed drop into the rack.
              <Arrive key={t} from={{ y: -26 }} animate={ready}>
                <TileButton
                  face={faceOf(t)}
                  depth="standing"
                  label={`${tileName(t)}${view.drawn === t ? ', just drawn' : ''}${receivedSet.has(t) ? ', just passed to you' : ''}`}
                  width={tileWidth}
                  selected={selected.includes(t)}
                  highlight={(view.drawn === t || receivedSet.has(t)) && !selected.includes(t)}
                  badge={receivedSet.has(t) ? 'New' : view.drawn === t ? 'Drew' : undefined}
                  disabled={need === 0}
                  onPress={() => toggle(t)}
                  testID={`rack-tile-${i}`}
                />
              </Arrive>
            ))}
          </View>
        </>
      )}
    </View>
  );

  const active = (seat: Seat) => (phase.kind === 'turn' && phase.seat === seat) || ('waitingFor' in phase && phase.waitingFor.includes(seat));

  return (
    <Screen footer={footer}>
      {header}
      {error && <ErrorPanel message={error} />}
      {view.result && <ResultPanel data={data} nameOf={nameOf} />}

      <TableBoard
        view={view}
        caption={`Hand ${game.handNumber} · ${data.table.mode === 'live' ? 'Live' : 'Turn-based'}`}
        seatInfo={seatInfo}
        scoreOf={scoreOf}
        nameOf={nameOf}
        active={active}
        onPlayer={(info) => openPlayer({ id: info.principalId!, name: info.name })}
      />

      {game.log.length > 0 && (
        <View style={{ gap: 4 }} accessible accessibilityLabel={`Recent play: ${game.log.slice(-3).map((e) => e.text).join(' ')}`}>
          {game.log.slice(-3).map((entry, i) => (
            <Text key={`${entry.at}-${i}`} style={[styles.log, entry.event.type === 'timeout' && styles.logTimeout]} numberOfLines={2}>
              {entry.text}
            </Text>
          ))}
        </View>
      )}

      {!ended &&
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

function ResultPanel({ data, nameOf }: { data: TablePayload; nameOf: (seat: number) => string }) {
  const game = data.game!;
  const view = game.view;
  const result = view.result!;
  const me = view.seat;
  const { width } = useWindowDimensions();
  const winner = result.winner;
  const title = result.kind === 'wall' ? 'Wall game. Nobody wins this one.' : winner === me ? 'Mahjong! You won the hand.' : `${nameOf(winner!)} called Mahjong.`;
  // The winning hand laid out group by group, the way it reads on the card.
  const arranged =
    result.kind === 'mahjong' && winner !== null && result.handId
      ? arrangeWin(HOUSE_CARD, result.handId, result.assignment ?? '', result.hands[winner] ?? [], view.players[winner]?.exposures ?? [])
      : null;
  const groupTile = Math.max(16, Math.min(26, Math.floor((Math.min(width, 560) - 72 - 6 * 6) / 14)));
  return (
    <Card tone={winner === me ? 'pink' : 'default'} testID="result-panel">
      <Text style={styles.resultTitle} accessibilityRole="header">
        {title}
      </Text>
      {result.kind === 'mahjong' && result.pattern && (
        <View style={{ gap: 6 }}>
          <Pattern pattern={result.pattern} />
          {arranged && (
            <View style={styles.groups} accessible accessibilityLabel={`Winning hand: ${arranged.map((g) => g.map(tileName).join(', ')).join('; ')}`}>
              {arranged.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
                  {g.map((t) => (
                    <Tile key={t} face={faceOf(t)} width={groupTile} flat />
                  ))}
                </View>
              ))}
            </View>
          )}
          <Body small muted>
            {result.value} points · {result.from === null ? 'self-drawn' : `on ${result.from === me ? 'your' : `${nameOf(result.from)}’s`} discard`}
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
                <Text style={styles.player}>
                  {seat === me ? 'You' : nameOf(seat)}
                  {winner === seat ? ' · Mahjong' : ''}
                </Text>
                <Text style={[styles.payment, { color: paid > 0 ? colors.online : paid < 0 ? colors.danger : colors.muted }]}>{formatScore(paid)}</Text>
              </Row>
              {!(winner === seat && arranged) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {exposures.length > 0 && <Exposures exposures={exposures} width={18} />}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
                    {concealed.map((t) => (
                      <Tile key={t} face={faceOf(t)} width={18} flat />
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Body small muted>
        Table totals: {data.table.seats.map((s, p) => `${s.position === data.mySeat ? 'You' : shortName(s.name)} ${formatScore(data.table.scores[p] ?? 0)}`).join(' · ')}
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { flex: 1, fontFamily: fonts.serif, fontSize: 17, lineHeight: 22, color: colors.ink },
  tip: { fontSize: 13, lineHeight: 18, color: colors.ink, backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  tipWarn: { backgroundColor: '#FFF2CC' },
  timer: { backgroundColor: colors.felt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  timerUrgent: { backgroundColor: colors.danger },
  timerText: { color: '#fff', fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF2CC', borderRadius: 12, paddingLeft: 12 },
  bannerText: { flex: 1, fontSize: 14, color: colors.ink },
  received: { fontSize: 13, lineHeight: 18, color: colors.ink, backgroundColor: '#FFF2CC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  hint: { fontSize: 14, color: colors.muted },
  claim: { gap: 10, backgroundColor: colors.pink, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: colors.primary },
  claimTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  claimText: { fontSize: 14, color: colors.ink, lineHeight: 19 },
  mine: { fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  small: { fontSize: 12, color: colors.muted },
  myExposures: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    rowGap: 10,
    // The near edge of the table: your tiles stand on the felt in front of the rim.
    backgroundColor: table.felt,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 7,
    borderBottomColor: table.rim,
  },
  log: { fontSize: 13, color: colors.muted },
  logTimeout: { color: colors.ink, fontWeight: '700' },
  resultTitle: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.ink },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
  player: { fontSize: 16, fontWeight: '700', color: colors.ink },
  payment: { fontSize: 16, fontWeight: '800' },
});
