import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  HAND_SLOTS,
  findWin,
  isJoker,
  otherSeat,
  patternText,
  planSplit,
  suggestTwoPlayerDiscard,
  twoPlayerHints,
  type HandSlot,
  type TwoPlayerAction,
  type TwoPlayerHint,
  type TwoSeat,
} from '@daily-rack/core/mahjong';
import type { TwoPlayerTablePayload } from '../lib/api.ts';
import { updatePrefs, usePrefs } from '../lib/prefs.ts';
import { useSafety } from '../lib/safety.tsx';
import { Body, Button, Card, Columns, ErrorPanel, Heading, IconButton, Notice, Row, Screen } from '../components/ui.tsx';
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
import { Pattern } from './CardView.tsx';
import { Exposures } from './TableBoard.tsx';
import { HandTiles, TwoPlayerBoard } from './TwoPlayerBoard.tsx';
import { Rack, type RackItem } from './Rack.tsx';
import { reconcileRacks, sameRacks, useTwoRacks, type TwoRacks } from './twoRacks.ts';
import { faceOf, groupName, sortTiles, tileName, tileShort } from './tiles.ts';
import { formatSeconds, useCountdown } from './useCountdown.ts';
import { colors, fonts } from '../theme.ts';

interface Props {
  data: TwoPlayerTablePayload;
  header: ReactNode;
  busy: boolean;
  error: string | null;
  act: (action: TwoPlayerAction) => void;
  nextHand: () => void;
  leave: () => void;
}

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));
const shortName = (name: string) => name.replace(' (computer)', '');
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function feel(kind: 'pick' | 'place' | 'nudge') {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'pick' ? Haptics.selectionAsync() : Haptics.impactAsync(kind === 'place' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  done.catch(() => undefined);
}

/**
 * A two-player game: the table with the other player across from you, and below it your
 * two hands, each with its exposures and its own rack. Your concealed tiles are one pool;
 * the racks are how you split it, and you can drag a tile from one rack to the other or
 * tap it and move it.
 */
export function TwoPlayerScreen({ data, header, busy, error, act, nextHand, leave }: Props) {
  const game = data.game!;
  const view = game.view;
  const me = view.seat;
  const opp = otherSeat(me);
  const prompt = view.prompt;
  const phase = view.phase;
  const prefs = usePrefs();
  const card = useActiveCard();
  const { openPlayer } = useSafety();
  const layout = useLayout();
  const sideBySide = layout.wide;
  // The column's width inside the screen's padding, which is wider on tablets.
  const columnWidth = layout.tablet ? layout.column - 56 : layout.contentWidth;
  const sideWidth = sideBySide ? Math.floor((layout.wideColumn - 56 - 22) / 2.1) : columnWidth;
  const boardWidth = sideBySide ? Math.min(layout.wideColumn - 56 - 22 - sideWidth, layout.height - 120) : columnWidth;
  const seconds = useCountdown(game.deadline);
  const ready = useAfterFirstRender();
  const ownDiscard = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jokerWarned, setJokerWarned] = useState(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => setSoundsEnabled(prefs.sounds), [prefs.sounds]);
  useEffect(preloadSounds, []);
  // The table's sounds follow the same moments as at four seats.
  useTableSounds(game.id, { ...view, players: view.players.map((p) => ({ exposures: p.hands.flatMap((h) => h.exposures) })) }, ownDiscard);

  const seatInfo = (seat: number) => data.table.seats[game.positions[seat] ?? 0]!;
  const nameOf = (seat: number) => shortName(seatInfo(seat).name);
  const who = (seat: number) => (seat === me ? 'You' : nameOf(seat));
  const whose = (seat: number) => (seat === me ? 'your' : `${nameOf(seat)}’s`);
  // Each Mahjong is paid as it's declared; the table's totals catch up when the game ends.
  const scoreOf = (seat: number) => (data.table.scores[game.positions[seat] ?? 0] ?? 0) + (view.result ? 0 : (view.payments[seat] ?? 0));
  const mine = view.players[me]!;
  const ended = phase.kind === 'ended';
  const myTurn = prompt?.type === 'turn';

  // Your racks: kept as you arranged them, with new tiles going where your plan wants them.
  const [savedRacks, saveRacks, racksLoaded] = useTwoRacks(game.id);
  const declared: [boolean, boolean] = [mine.hands[0]!.shown !== null, mine.hands[1]!.shown !== null];
  const racks = useMemo(
    () =>
      reconcileRacks(
        savedRacks,
        view.concealed,
        (fresh) => {
          const plan = planSplit(card, view);
          if (!savedRacks) return plan;
          return [fresh.filter((t) => !plan[1].includes(t)), fresh.filter((t) => plan[1].includes(t))];
        },
        declared,
      ),
    [savedRacks, view.concealed.join(','), declared.join(), card],
  );
  useEffect(() => {
    if (racksLoaded && !sameRacks(savedRacks, racks)) saveRacks(racks);
  }, [racks, racksLoaded]);
  const rackOf = (tile: number): HandSlot | null => (racks[0].includes(tile) ? 0 : racks[1].includes(tile) ? 1 : null);

  const exposuresKey = mine.hands.map((h) => h.exposures.map((e) => e.tiles.join('.')).join('|')).join('/');
  const hints = useMemo(() => (ended ? [null, null] : twoPlayerHints(card, view)), [card, view.concealed.join(','), exposuresKey, view.discards.length, ended]);

  const promptKey = `${game.id}:${prompt?.type ?? 'none'}:${view.concealed.length}:${phase.kind === 'claim' ? phase.tile : ''}`;
  useEffect(() => {
    setNotice(null);
    setJokerWarned(false);
    if (prompt) feel('nudge');
  }, [promptKey]);
  useEffect(() => {
    if (selected !== null && !view.concealed.includes(selected)) setSelected(null);
  }, [view.concealed.join(',')]);

  // Every Mahjong of yours gets confetti; a Mahjong partway through the game gets its sound too.
  const myMahjongs = view.mahjongs.filter((m) => m.seat === me).length;
  const mahjongCount = useRef(view.mahjongs.length);
  useEffect(() => {
    const before = mahjongCount.current;
    mahjongCount.current = view.mahjongs.length;
    if (view.mahjongs.length <= before) return;
    if (!ended) playSound('reveal');
    if (view.mahjongs.at(-1)?.seat === me) {
      setBurst((b) => b + 1);
      celebrateHaptic();
    }
  }, [view.mahjongs.length]);
  useEffect(() => {
    if (view.result) void notePractice();
  }, [game.id, Boolean(view.result)]);

  const send = (action: TwoPlayerAction) => {
    feel(action.type === 'discard' || action.type === 'claim' ? 'place' : 'pick');
    if (action.type === 'discard') {
      ownDiscard.current = action.tile;
      playSound('place');
    }
    setSelected(null);
    act(action);
  };

  const toggle = (tile: number) => {
    if (busy || ended) return;
    setNotice(null);
    setJokerWarned(false);
    feel('pick');
    playSound('tap');
    setSelected((s) => (s === tile ? null : tile));
  };

  const moveTo = (tile: number, slot: HandSlot) => {
    const from = rackOf(tile);
    if (from === null || from === slot || declared[slot]) return;
    const next: TwoRacks = [racks[0].filter((t) => t !== tile), racks[1].filter((t) => t !== tile)];
    next[slot] = [...next[slot], tile];
    saveRacks(next);
    feel('nudge');
  };

  const arrange = (slot: HandSlot, order: number[]) => {
    const next: TwoRacks = [...racks];
    next[slot] = order;
    saveRacks(next);
    feel('nudge');
  };

  const suggest = () => {
    const tile = suggestTwoPlayerDiscard(card, view);
    if (tile === null) return;
    setSelected(tile);
    setNotice(`Suggested: ${tileShort(tile)}. Neither of your planned hands needs it.`);
  };

  const discard = () => {
    if (selected === null) return;
    if (isJoker(selected) && !jokerWarned) {
      setJokerWarned(true);
      return;
    }
    send({ type: 'discard', tile: selected });
  };

  // Declare with the tiles in that hand's rack when they make it; otherwise the game finds the best fit.
  const declare = (slot: HandSlot) => {
    const exposures = mine.hands[slot]!.exposures;
    const tiles = racks[slot];
    const exact = tiles.length + exposures.reduce((n, e) => n + e.tiles.length, 0) === 14 && findWin(card, tiles, exposures) !== null;
    send({ type: 'declare-mahjong', hand: slot, ...(exact ? { tiles } : {}) });
  };

  const status = (() => {
    if (phase.kind === 'turn') {
      if (phase.seat !== me) return `${nameOf(opp)} is playing.`;
      if (prompt?.type === 'turn' && prompt.mahjong.length > 0) return `Mahjong is ready on hand ${prompt.mahjong.map((s) => s + 1).join(' and ')}!`;
      return view.drawn !== null ? `Your turn. You drew ${tileShort(view.drawn)}. Discard a tile.` : 'Your turn. Discard a tile.';
    }
    if (phase.kind === 'claim') return prompt ? 'Your call.' : phase.from === me ? `You threw ${tileShort(phase.tile)}. Seeing if ${nameOf(opp)} calls it.` : `${nameOf(opp)} threw ${tileShort(phase.tile)}.`;
    return 'Game over.';
  })();

  const timer = (() => {
    if (seconds === null || ended) return null;
    if (prompt) return `${formatSeconds(seconds)} to move`;
    return `${nameOf(opp)}: ${formatSeconds(seconds)}`;
  })();

  const actions = (() => {
    if (!prompt) return null;
    if (prompt.type === 'turn') {
      const joker = selected !== null && isJoker(selected);
      return (
        <View style={{ gap: 8 }}>
          {prompt.mahjong.map((slot) => (
            <Button key={slot} title={`Mahjong on hand ${slot + 1}!`} icon="check" onPress={() => declare(slot)} loading={busy} testID={`action-mahjong-${slot}`} />
          ))}
          <Button
            variant={prompt.mahjong.length > 0 || (joker && jokerWarned) ? 'secondary' : 'primary'}
            title={selected === null ? 'Tap a tile to discard' : joker && jokerWarned ? 'Yes, discard the joker' : `Discard ${tileShort(selected)}`}
            disabled={selected === null || busy}
            onPress={discard}
            testID="action-discard"
          />
          {prompt.exchanges.map((x) => (
            <Button
              key={`${x.target}-${x.hand}-${x.exposure}`}
              variant="text"
              compact
              title={`Swap your ${tileShort(x.tile)} for the joker in ${whose(x.target)} hand ${x.hand + 1}`}
              disabled={busy}
              onPress={() => send({ type: 'exchange-joker', ...x })}
              testID={`action-swap-${x.target}-${x.hand}-${x.exposure}`}
            />
          ))}
        </View>
      );
    }
    const calls = prompt.options.flatMap((o) => o.sizes.map((size) => ({ hand: o.hand, size })));
    const wins = prompt.options.filter((o) => o.canMahjong);
    const hands = (list: { hand: HandSlot }[]) => [...new Set(list.map((o) => o.hand + 1))].join(' or ');
    return (
      <View style={styles.claim} testID="claim-prompt">
        <Row gap={12}>
          <Tile face={faceOf(prompt.tile)} width={44} highlight />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.claimTitle}>
              {who(prompt.from)} threw {tileShort(prompt.tile)}
            </Text>
            <Text style={styles.claimText}>
              {wins.length > 0 ? `It completes hand ${hands(wins)}!` : `You can call it for a ${[...new Set(calls.map((c) => groupName(c.size)))].join(' or ')} on hand ${hands(calls)}, and lay that group face up.`}
              {seconds !== null ? ` ${seconds}s to decide.` : ''}
            </Text>
          </View>
        </Row>
        {wins.map((o) => (
          <Button
            key={o.hand}
            title={`Mahjong on hand ${o.hand + 1}!`}
            icon="check"
            onPress={() => send({ type: 'claim', response: { type: 'mahjong', hand: o.hand } })}
            loading={busy}
            testID={`action-claim-mahjong-${o.hand}`}
          />
        ))}
        <View style={styles.callRow}>
          {calls.map((c) => (
            <Button
              key={`${c.hand}-${c.size}`}
              style={{ flexGrow: 1 }}
              variant="secondary"
              compact
              title={`${capitalized(groupName(c.size))} on hand ${c.hand + 1}`}
              disabled={busy}
              onPress={() => send({ type: 'claim', response: { type: 'expose', hand: c.hand, size: c.size } })}
              testID={`action-call-${c.hand}-${c.size}`}
            />
          ))}
          <Button style={{ flexGrow: 1 }} variant="text" compact title="Pass" disabled={busy} onPress={() => send({ type: 'claim', response: { type: 'pass' } })} testID="action-claim-pass" />
        </View>
      </View>
    );
  })();

  const rackWidth = (sideBySide ? sideWidth - 28 : columnWidth) - 16;
  // Two racks of about fourteen: nine tiles to a row keeps each rack to two rows.
  const perRow = prefs.largeTiles ? 7 : 9;
  const maxTile = (prefs.largeTiles ? 60 : 46) + (layout.tablet ? 10 : 0);
  const tileWidth = Math.max(28, Math.min(maxTile, Math.floor((rackWidth - 6 * (perRow - 1)) / perRow)));
  const moveTarget = selected !== null ? rackOf(selected) : null;
  const canMove = moveTarget !== null && !declared[moveTarget === 0 ? 1 : 0] && !ended;

  const handArea = (slot: HandSlot) => {
    const hand = mine.hands[slot]!;
    const mahjong = view.mahjongs.find((m) => m.seat === me && m.hand === slot);
    const top = hints[slot]?.[0];
    const rack = racks[slot];
    const items: RackItem[] = rack.map((t) => ({
      tile: t,
      label: `${tileName(t)}${view.drawn === t ? ', just drawn' : ''}, hand ${slot + 1}`,
      selected: selected === t,
      highlight: view.drawn === t && selected !== t,
      badge: view.drawn === t ? 'Drew' : undefined,
    }));
    const badge = hand.shown ? `Mahjong · ${mahjong?.value ?? 0} points` : hand.dead ? 'Dead hand' : top ? (top.distance === 0 ? 'Mahjong!' : `${top.distance} away`) : null;
    return (
      <View key={slot} style={styles.hand} testID={`my-hand-${slot}`}>
        <View style={styles.handHead}>
          <Text style={styles.handTitle} accessibilityRole="header">
            Hand {slot + 1}
          </Text>
          {badge && <Text style={[styles.handBadge, hand.dead && !hand.shown && styles.handBadgeDead, hand.shown && styles.handBadgeWon]}>{badge}</Text>}
        </View>
        {hand.shown ? (
          <HandTiles view={view} seat={me} slot={slot} width={Math.min(26, Math.floor((rackWidth - 30) / 14))} />
        ) : (
          <>
            {hand.exposures.length > 0 && <Exposures exposures={hand.exposures} width={Math.min(26, Math.floor((rackWidth - 30) / 15))} depth="lying" align="flex-start" />}
            {hand.dead && !ended && (
              <Text style={styles.deadText} testID={`dead-hand-${slot}`}>
                This hand is dead: {hand.dead.text}. Keep playing toward your other hand.
              </Text>
            )}
            {rack.length > 0 ? (
              <Rack
                items={items}
                tileWidth={tileWidth}
                tapsDisabled={ended}
                animate={ready}
                onTap={toggle}
                onArrange={(order) => arrange(slot, order)}
                onLift={() => feel('pick')}
                onDropAway={(tile, direction) => {
                  if ((slot === 0 && direction === 'down') || (slot === 1 && direction === 'up')) moveTo(tile, slot === 0 ? 1 : 0);
                }}
                testID={`rack-${slot}-tile`}
              />
            ) : (
              !ended && (
                <View style={styles.emptyRack}>
                  <Text style={styles.small}>No tiles here yet. Drag a tile in, or tap one and move it.</Text>
                </View>
              )
            )}
          </>
        )}
      </View>
    );
  };

  // Your two hands sit under the table, with the rack tools; only your moves stay pinned, so the
  // racks never crowd the felt.
  const hands = ended ? null : (
    <View style={{ gap: 8 }} testID="my-hands">
      {HAND_SLOTS.map(handArea)}
      <Row style={{ justifyContent: 'flex-end' }} gap={0}>
        <IconButton
          icon={prefs.sounds ? 'sound' : 'mute'}
          label={prefs.sounds ? 'Turn table sounds off' : 'Turn table sounds on'}
          color={colors.muted}
          onPress={() => updatePrefs({ sounds: !prefs.sounds })}
        />
        {myTurn && <Button variant="text" compact icon="bulb" title="Suggest" onPress={suggest} disabled={busy} testID="suggest" />}
        <Button
          variant="text"
          compact
          icon="sort"
          title="Sort"
          hint="Sorts the tiles in each rack by suit"
          onPress={() => saveRacks([sortTiles(racks[0], 'suit'), sortTiles(racks[1], 'suit')])}
          testID="rack-sort"
        />
        {!declared[0] && !declared[1] && (
          <Button variant="text" compact title="Split" hint="Shares your tiles between the racks by the hands you're closest to" onPress={() => saveRacks(planSplit(card, view))} testID="rack-split" />
        )}
      </Row>
    </View>
  );
  const hintsCard = ended ? null : prefs.showHints ? (
    <Card tone="sage">
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Closest hands</Heading>
        <Button variant="text" compact title="Hide" onPress={() => updatePrefs({ showHints: false })} />
      </Row>
      {HAND_SLOTS.map((slot) => {
        const list = hints[slot];
        if (!list || list.length === 0) return null;
        return (
          <View key={slot} style={{ gap: 4 }}>
            <Text style={styles.handTitle}>Hand {slot + 1}</Text>
            <HandHints hints={list} slot={slot} />
          </View>
        );
      })}
      <Body small muted>
        Each hand counts the tiles left once your other hand has what it needs.
      </Body>
    </Card>
  ) : (
    <Button variant="text" compact icon="bulb" title="Show closest hands" onPress={() => updatePrefs({ showHints: true })} />
  );

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
      {data.table.mode === 'turn' && !ended && !prompt && <Text style={styles.small}>Turn-based: we’ll let you know when it’s your move.</Text>}
      {jokerWarned && <Notice tone="warn">Jokers fill any group of 3 or more in either hand, so throwing one away is rarely right, and nobody can call it. Tap again to discard it anyway.</Notice>}
      {notice && (
        <Text style={styles.tip} testID="rack-notice">
          {notice}
        </Text>
      )}
      {ended ? (
        <>
          {data.table.status === 'between' && <Button title="Deal the next game" icon="arrow" onPress={nextHand} loading={busy} testID="next-hand" />}
          <Button title="Leave table" variant="text" onPress={leave} compact />
        </>
      ) : (
        <>
          {actions}
          {canMove && selected !== null && (
            <Button
              variant="secondary"
              compact
              icon="sort"
              title={`Move ${tileShort(selected)} to hand ${moveTarget === 0 ? 2 : 1}`}
              onPress={() => moveTo(selected, moveTarget === 0 ? 1 : 0)}
              testID="move-tile"
            />
          )}
        </>
      )}
    </View>
  );

  const active = (seat: TwoSeat) => phase.kind === 'turn' ? phase.seat === seat : phase.kind === 'claim' ? phase.from !== seat : false;
  const board = (
    <TwoPlayerBoard
      view={view}
      caption={`Game ${game.handNumber} · Two-player · ${data.table.mode === 'live' ? 'Live' : 'Turn-based'}`}
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
          <Text key={`${entry.at}-${i}`} style={[styles.log, (entry.event.type === 'timeout' || entry.event.type === 'dead-hand' || entry.event.type === 'mahjong') && styles.logStrong]} numberOfLines={3}>
            {entry.text}
          </Text>
        ))}
      </View>
    ) : null;
  const resultPanel = view.result ? <ResultPanel data={data} nameOf={nameOf} /> : null;
  const myMahjongNote =
    !ended && myMahjongs === 1 ? (
      <Text style={styles.won} testID="first-mahjong-note">
        One hand down, one to go! Your other hand wins the game, and pays double.
      </Text>
    ) : null;

  return (
    <TileStyle.Provider value={{ bigIndex: prefs.largeTiles }}>
      <View style={{ flex: 1 }}>
        {sideBySide ? (
          <Screen wide>
            {header}
            {error && <ErrorPanel message={error} />}
            <Columns
              ratio={1.1}
              left={
                <>
                  {board}
                  {log}
                  {hintsCard}
                </>
              }
              right={
                <>
                  {resultPanel}
                  <View style={styles.side}>{footer}</View>
                  {myMahjongNote}
                  {hands}
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
            {myMahjongNote}
            {hands}
            {log}
            {hintsCard}
          </Screen>
        )}
        <Confetti run={burst} />
      </View>
    </TileStyle.Provider>
  );
}

/** The closest lines on the card for one hand, with the other hand's planned tiles set aside. */
function HandHints({ hints, slot }: { hints: TwoPlayerHint[]; slot: HandSlot }) {
  return (
    <View style={styles.hints} accessible accessibilityLabel={`Closest hands for hand ${slot + 1}: ${hints.map((h) => `${patternText(h.concrete.hand.pattern)}, ${h.distance === 0 ? 'Mahjong' : `${h.distance} away`}`).join('; ')}`}>
      {hints.map((h) => (
        <View key={h.concrete.hand.id} style={styles.hintRow}>
          <View style={{ flex: 1 }}>
            <Pattern pattern={h.concrete.hand.pattern} size={13} />
          </View>
          <Text style={styles.away}>{h.distance === 0 ? 'Mahjong!' : `${h.distance} away`}</Text>
        </View>
      ))}
    </View>
  );
}

function ResultPanel({ data, nameOf }: { data: TwoPlayerTablePayload; nameOf: (seat: number) => string }) {
  const game = data.game!;
  const view = game.view;
  const result = view.result!;
  const me = view.seat;
  const { contentWidth } = useLayout();
  const winner = result.winner;
  const who = (seat: number) => (seat === me ? 'You' : nameOf(seat));
  const title =
    result.kind === 'wall'
      ? result.mahjongs.length > 0
        ? 'Wall game. The Mahjongs made still count.'
        : 'Wall game. Nobody wins this one.'
      : winner === me
        ? 'You won the game!'
        : `${nameOf(winner!)} won the game.`;
  const pip =
    result.kind === 'wall'
      ? { mood: 'think' as const, text: result.mahjongs.length > 0 ? 'The wall ran out, but every Mahjong made along the way is paid. On to the next one!' : 'A wall game: nobody wins, nobody pays. On to the next one!' }
      : winner === me
        ? { mood: 'cheer' as const, text: 'Two hands, two Mahjongs! Pip is doing a double happy dance for you.' }
        : { mood: 'happy' as const, text: `${nameOf(winner!)} finished both hands first. Two hands at once takes practice. Deal again?` };
  const small = Math.max(14, Math.min(22, Math.floor((Math.min(contentWidth, 560) - 40) / 16)));
  return (
    <Card tone={winner === me ? 'pink' : 'default'} testID="result-panel">
      <Text style={styles.resultTitle} accessibilityRole="header">
        {title}
      </Text>
      <PipSays mood={pip.mood} size={52} testID="result-pip">
        {pip.text}
      </PipSays>
      {result.mahjongs.map((m, i) => (
        <View key={i} style={{ gap: 4 }} testID={`result-mahjong-${i}`}>
          <Text style={styles.player}>
            {who(m.seat)} · hand {m.hand + 1}
          </Text>
          <Pattern pattern={m.pattern} size={15} />
          <HandTiles view={view} seat={m.seat} slot={m.hand} width={small} />
          <Body small muted>
            {m.value} points · {m.from === null ? 'self-drawn' : `on ${m.from === me ? 'your' : `${nameOf(m.from)}’s`} discard`}
            {m.jokerless ? ' · jokerless, doubled' : ''}
            {m.final ? ' · the game-winning Mahjong, doubled' : ''}
          </Body>
        </View>
      ))}
      <View style={{ gap: 10 }}>
        {view.players.map((p) => {
          const paid = result.payments[p.seat] ?? 0;
          const concealed = sortTiles(result.concealed[p.seat] ?? [], 'suit');
          const open = p.hands.filter((h) => !h.shown && h.exposures.length > 0);
          return (
            <View key={p.seat} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.player}>{who(p.seat)}</Text>
                <Text style={[styles.payment, { color: paid > 0 ? colors.online : paid < 0 ? colors.danger : colors.muted }]}>{formatScore(paid)}</Text>
              </Row>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {open.map((h, i) => (
                  <Exposures key={i} exposures={h.exposures} width={small - 2} />
                ))}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
                  {concealed.map((t) => (
                    <Tile key={t} face={faceOf(t)} width={small - 2} flat />
                  ))}
                </View>
              </View>
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
  timer: { backgroundColor: colors.felt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  timerUrgent: { backgroundColor: colors.danger },
  timerText: { color: '#fff', fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  claim: { gap: 10, backgroundColor: colors.pink, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: colors.primary },
  claimTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  claimText: { fontSize: 14, color: colors.ink, lineHeight: 19 },
  callRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontSize: 12, color: colors.muted },
  hand: { gap: 4 },
  handHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  handTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.primary },
  handBadge: { fontSize: 13, fontWeight: '700', color: colors.ink },
  handBadgeDead: { color: colors.danger },
  handBadgeWon: { color: colors.online },
  deadText: { fontSize: 13, lineHeight: 18, color: colors.ink, backgroundColor: '#FFF2CC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  emptyRack: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 14, padding: 14, alignItems: 'center' },
  hints: { gap: 4, backgroundColor: colors.sage, borderRadius: 10, padding: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  away: { fontSize: 12, fontWeight: '700', color: colors.primary },
  won: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  log: { fontSize: 13, color: colors.muted },
  logStrong: { color: colors.ink, fontWeight: '700' },
  side: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 },
  resultTitle: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.ink },
  player: { fontSize: 16, fontWeight: '700', color: colors.ink },
  payment: { fontSize: 16, fontWeight: '800' },
});
