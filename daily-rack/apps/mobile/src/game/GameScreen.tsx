import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  SEATS,
  SEAT_WINDS,
  arrangeWin,
  explainClaimForView,
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
import { Body, Button, Card, Chip, Columns, ErrorPanel, Heading, IconButton, Notice, Row, Screen } from '../components/ui.tsx';
import { PipSays } from '../components/Pip.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { celebrateHaptic } from '../lib/celebrate.ts';
import { useLayout } from '../lib/layout.ts';
import { notePractice } from '../lib/reminders.ts';
import { Tile, TileStyle } from '../components/Tile.tsx';
import { useAfterFirstRender } from '../components/Arrive.tsx';
import { playSound, preloadSounds, setSoundsEnabled } from '../lib/sounds.ts';
import { useActiveCard } from '../lib/cards.tsx';
import { useTableSounds } from './useTableSounds.ts';
import { HandHints, Pattern } from './CardView.tsx';
import { Exposures, TableBoard } from './TableBoard.tsx';
import { Rack, type RackItem } from './Rack.tsx';
import { useArrangeHint, useRackOrder } from './rackOrder.ts';
import { arrangeTiles, faceOf, groupName, sortTiles, tileName, tileShort, type SortMode } from './tiles.ts';
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
  /** Matched games are one hand: this looks for another game of the same kind. */
  rematch?: () => void;
  /** A line for the result, such as a ranked game's rating change. */
  resultNote?: string | null;
  /**
   * A coach for your moves, such as Pip in a practice round. It's drawn where your moves go
   * and is handed them, with the tiles you've picked, so it can show them, pick tiles for
   * you, or make a move itself.
   */
  coach?: (table: CoachTable) => ReactNode;
  /** Tiles Pip suggests, marked on your rack. */
  marked?: number[];
}

/** What a coach at the table sees and can do. */
export interface CoachTable {
  /** The tiles you've picked. */
  selected: number[];
  /** Picks tiles for you; an empty list clears your pick. */
  select: (tiles: number[]) => void;
  /** Makes a move, with the same sounds and feel as the buttons. */
  send: (action: Action) => void;
  /** Your moves as the table shows them, to draw (or hold back while the coach asks something). */
  moves: ReactNode;
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
export function GameScreen({ data, header, busy, error, act, nextHand, leave, rematch, resultNote, coach, marked }: Props) {
  const game = data.game!;
  const view = game.view;
  const me = view.seat;
  const prompt = view.prompt;
  const phase = view.phase;
  const prefs = usePrefs();
  const card = useActiveCard();
  const { openPlayer } = useSafety();
  const layout = useLayout();
  // Tablets in landscape (and desktops): the table on the left, your rack and moves on the right.
  const sideBySide = layout.wide;
  const sideWidth = sideBySide ? Math.floor(((layout.wideColumn - 56 - 22) * 1) / 2.25) : layout.contentWidth;
  const boardWidth = sideBySide ? Math.min(layout.wideColumn - 56 - 22 - sideWidth, layout.height - 120) : layout.contentWidth;
  const [sort, setSort] = useState<SortMode>('suit');
  const [arranged, setArranged] = useRackOrder(game.id);
  const [arrangeHint, dismissArrangeHint] = useArrangeHint(game.id);
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

  // Once you drag a tile the rack is in your own order, until you pick a sort again.
  const own = arranged?.active ? arranged.order : null;
  const hand = useMemo(() => {
    const drawn = view.drawn !== null && view.hand.includes(view.drawn) ? view.drawn : null;
    if (own) return arrangeTiles(own, view.hand, sort, drawn);
    // Like a real rack: sorted, with the tile you just drew at the end.
    const sorted = sortTiles(
      view.hand.filter((t) => t !== drawn),
      sort,
    );
    return drawn === null ? sorted : [...sorted, drawn];
  }, [view.hand, view.drawn, sort, own]);
  // Remember where new tiles landed, so they stay put when the next ones arrive.
  const handKey = hand.join(',');
  useEffect(() => {
    if (own && own.join(',') !== handKey) setArranged({ order: hand, active: true });
  }, [handKey]);
  const myExposures = view.players[me]?.exposures ?? [];
  const myDead = view.players[me]?.dead ?? null;
  const rackWidth = (sideBySide ? sideWidth - 28 : layout.contentWidth) - 16;
  // Large-tile mode stands five tiles to a row instead of seven; tablets get bigger tiles.
  const perRow = prefs.largeTiles ? 5 : 7;
  const maxTile = (prefs.largeTiles ? 72 : 52) + (layout.tablet ? 14 : 0);
  const tileWidth = Math.max(34, Math.min(maxTile, Math.floor((rackWidth - 6 * (perRow - 1)) / perRow)));

  // "Why can't I call this?" for the latest discard from someone else.
  const lastDiscard = view.discards.at(-1);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => setWhy(null), [lastDiscard?.tile, phase.kind]);
  const canAskWhy = !prompt && !myDead && lastDiscard !== undefined && lastDiscard.seat !== me && (phase.kind === 'claim' || phase.kind === 'turn');

  // A Mahjong of your own gets confetti; any finished hand counts as practice for Pip's reminders.
  const [burst, setBurst] = useState(0);
  const iWon = view.result?.kind === 'mahjong' && view.result.winner === me;
  useEffect(() => {
    if (!view.result) return;
    void notePractice();
    if (iWon) {
      setBurst((b) => b + 1);
      celebrateHaptic();
    }
  }, [game.id, Boolean(view.result)]);

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

  const arrange = (order: number[]) => {
    setArranged({ order, active: true });
    dismissArrangeHint();
    feel('nudge');
  };

  // By suit, by number, then back to your own order if you've made one.
  const nextOrder = () => {
    if (own) {
      setArranged({ order: own, active: false });
      setSort('suit');
    } else if (sort === 'suit') setSort('number');
    else if (arranged) setArranged({ ...arranged, active: true });
    else setSort('suit');
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

  const select = (tiles: number[]) => {
    setSelected(tiles);
    setNotice(null);
    setJokerWarned(false);
  };

  // Learning aid, like the hand analysers in other mahjong apps: pick the tiles that the
  // closest hands on the card don't use. Jokers are never suggested.
  const suggest = () => {
    const scores = tileScores(card, view.hand, myExposures, 'hard');
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
        if (myDead) return `Your hand is dead. ${nameOf(phase.seat)} is playing.`;
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
  const markedSet = new Set(marked ?? []);
  const ended = phase.kind === 'ended';
  const rackItems: RackItem[] = hand.map((t) => ({
    tile: t,
    label: `${tileName(t)}${view.drawn === t ? ', just drawn' : ''}${receivedSet.has(t) ? ', just passed to you' : ''}${markedSet.has(t) ? ', Pip suggests it' : ''}`,
    selected: selected.includes(t),
    highlight: (view.drawn === t || receivedSet.has(t) || markedSet.has(t)) && !selected.includes(t),
    badge: markedSet.has(t) ? 'Pip' : receivedSet.has(t) ? 'New' : view.drawn === t ? 'Drew' : undefined,
  }));

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
      {myDead && !ended && (
        <View style={styles.dead} testID="dead-hand-notice">
          <PipSays mood="oops" size={52}>
            {`Your hand is dead: ${myDead.text}. You sit out the rest of this hand, and still pay the winner. It happens to everyone, and you’ll get fresh tiles next hand!`}
          </PipSays>
        </View>
      )}
      {canAskWhy && (
        <View style={{ gap: 6 }}>
          <Button
            variant="text"
            compact
            icon="help"
            title={why ? 'Got it' : `Why can’t I call ${tileShort(lastDiscard.tile)}?`}
            onPress={() => setWhy(why ? null : explainClaimForView(card, view, lastDiscard.tile).text)}
            testID="why-call"
          />
          {why && (
            <View style={styles.why} testID="why-call-text">
              <PipSays mood="think" size={48}>
                {why}
              </PipSays>
            </View>
          )}
        </View>
      )}
      {/* A coached hand is played right here, so there's no move to be told about. */}
      {data.table.mode === 'turn' && !coach && !ended && !prompt && !myDead && <Text style={styles.small}>Turn-based: we’ll let you know when it’s your move.</Text>}
      {jokerWarned && <Notice tone="warn">Jokers fill any group of 3 or more, so throwing one away is rarely right, and nobody can call it. Tap again to discard it anyway.</Notice>}
      {notice && (
        <Text style={[styles.tip, !notice.startsWith('Suggested') && styles.tipWarn]} testID="rack-notice">
          {notice}
        </Text>
      )}
      {ended ? (
        <>
          {rematch ? (
            <Button title="Find another match" icon="arrow" onPress={rematch} testID="rematch" />
          ) : (
            data.table.status === 'between' && <Button title="Deal the next hand" icon="arrow" onPress={nextHand} loading={busy} testID="next-hand" />
          )}
          <Button title="Leave table" variant="text" onPress={leave} compact />
        </>
      ) : (
        <>
          {coach ? coach({ selected, select, send, moves: actions }) : actions}
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
              {/* A coach makes its own suggestions. */}
              {need > 0 && !coach && <Button variant="text" compact icon="bulb" title="Suggest" onPress={suggest} disabled={busy} testID="suggest" />}
              <Button
                variant="text"
                compact
                icon="sort"
                title={own ? 'Your order' : sort === 'suit' ? 'By suit' : 'By number'}
                hint="Changes the order of your tiles"
                onPress={nextOrder}
                testID="rack-order"
              />
            </Row>
          </Row>
          {myExposures.length > 0 && (
            <View style={styles.myExposures}>
              <Text style={styles.small}>Exposed</Text>
              <Exposures exposures={myExposures} width={22} depth="lying" />
            </View>
          )}
          {arrangeHint && (
            <Text style={styles.arrangeHint} testID="arrange-hint">
              Drag tiles to arrange them.
            </Text>
          )}
          <Rack items={rackItems} tileWidth={tileWidth} tapsDisabled={need === 0} animate={ready} onTap={toggle} onArrange={arrange} onLift={() => feel('pick')} />
        </>
      )}
    </View>
  );

  const active = (seat: Seat) => (phase.kind === 'turn' && phase.seat === seat) || ('waitingFor' in phase && phase.waitingFor.includes(seat));

  const board = (
    <TableBoard
      view={view}
      caption={`Hand ${game.handNumber} · ${data.table.mode === 'live' ? 'Live' : 'Turn-based'}`}
      large={prefs.largeTiles}
      seatInfo={seatInfo}
      scoreOf={scoreOf}
      nameOf={nameOf}
      active={active}
      width={boardWidth}
      onPlayer={(info) => openPlayer({ id: info.principalId!, name: info.name })}
    />
  );
  const log =
    game.log.length > 0 ? (
      <View style={{ gap: 4 }} accessible accessibilityLabel={`Recent play: ${game.log.slice(-3).map((e) => e.text).join(' ')}`}>
        {game.log.slice(-3).map((entry, i) => (
          <Text key={`${entry.at}-${i}`} style={[styles.log, (entry.event.type === 'timeout' || entry.event.type === 'dead-hand') && styles.logTimeout]} numberOfLines={3}>
            {entry.text}
          </Text>
        ))}
      </View>
    ) : null;
  const hints = ended ? null : prefs.showHints ? (
    <Card tone="sage">
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Closest hands</Heading>
        <Button variant="text" compact title="Hide" onPress={() => updatePrefs({ showHints: false })} />
      </Row>
      <HandHints hand={view.hand} exposures={myExposures} />
    </Card>
  ) : (
    <Button variant="text" compact icon="bulb" title="Show closest hands" onPress={() => updatePrefs({ showHints: true })} />
  );
  const resultPanel = view.result ? <ResultPanel data={data} nameOf={nameOf} note={resultNote ?? null} /> : null;

  return (
    <TileStyle.Provider value={{ bigIndex: prefs.largeTiles }}>
      <View style={{ flex: 1 }}>
        {sideBySide ? (
          <Screen wide>
            {header}
            {error && <ErrorPanel message={error} />}
            <Columns
              ratio={1.25}
              left={
                <>
                  {board}
                  {log}
                </>
              }
              right={
                <>
                  {resultPanel}
                  <View style={styles.side}>{footer}</View>
                  {hints}
                </>
              }
            />
          </Screen>
        ) : (
          <Screen footer={footer}>
            {header}
            {error && <ErrorPanel message={error} />}
            {resultPanel}
            {board}
            {log}
            {hints}
          </Screen>
        )}
        <Confetti run={burst} />
      </View>
    </TileStyle.Provider>
  );
}

function ResultPanel({ data, nameOf, note }: { data: TablePayload; nameOf: (seat: number) => string; note: string | null }) {
  const game = data.game!;
  const view = game.view;
  const result = view.result!;
  const me = view.seat;
  const card = useActiveCard();
  const { contentWidth } = useLayout();
  const winner = result.winner;
  const title = result.kind === 'wall' ? 'Wall game. Nobody wins this one.' : winner === me ? 'Mahjong! You won the hand.' : `${nameOf(winner!)} called Mahjong.`;
  // The winning hand laid out group by group, the way it reads on the card.
  const arranged =
    result.kind === 'mahjong' && winner !== null && result.handId
      ? arrangeWin(card, result.handId, result.assignment ?? '', result.hands[winner] ?? [], view.players[winner]?.exposures ?? [])
      : null;
  const groupTile = Math.max(16, Math.min(30, Math.floor((Math.min(contentWidth, 560) - 32 - 6 * 6) / 14)));
  const pip =
    result.kind === 'wall'
      ? { mood: 'think' as const, text: 'A wall game: nobody wins, nobody pays. On to the next one!' }
      : winner === me
        ? { mood: 'cheer' as const, text: 'Mahjong! Pip is doing a happy little dance for you.' }
        : { mood: 'happy' as const, text: `${nameOf(winner!)} got there first. Every hand teaches something. Deal again?` };
  return (
    <Card tone={winner === me ? 'pink' : 'default'} testID="result-panel">
      <Text style={styles.resultTitle} accessibilityRole="header">
        {title}
      </Text>
      <PipSays mood={pip.mood} size={52} testID="result-pip">
        {pip.text}
      </PipSays>
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
      {note && (
        <Text style={styles.note} testID="result-note">
          {note}
        </Text>
      )}
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
  arrangeHint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  log: { fontSize: 13, color: colors.muted },
  logTimeout: { color: colors.ink, fontWeight: '700' },
  note: { fontSize: 16, fontWeight: '700', color: colors.primary },
  dead: { backgroundColor: '#FFF2CC', borderRadius: 14, padding: 10 },
  why: { backgroundColor: colors.sage, borderRadius: 14, padding: 10 },
  side: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 },
  resultTitle: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.ink },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
  player: { fontSize: 16, fontWeight: '700', color: colors.ink },
  payment: { fontSize: 16, fontWeight: '800' },
});
