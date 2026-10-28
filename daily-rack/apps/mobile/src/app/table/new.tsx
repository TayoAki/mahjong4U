import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { BotLevel } from '@daily-rack/core/mahjong';
import { api, type FriendsOverview, type SeatChoice } from '../../lib/api.ts';
import { track } from '../../lib/analytics.ts';
import { useSafety } from '../../lib/safety.tsx';
import { useCardList } from '../../lib/cards.tsx';
import { Body, Button, Card, Chip, ErrorPanel, Heading, Row, Screen, Segmented, TopBar } from '../../components/ui.tsx';
import { LEVEL_LABEL, SeatSheet } from '../../game/Lobby.tsx';
import { TWO_PLAYER_SUMMARY, TwoPlayerRules } from '../../game/TwoPlayerRules.tsx';
import { colors } from '../../theme.ts';
import { useNotifications } from '../../lib/notification-prompt.tsx';
import { usePlus } from '../../lib/plus.tsx';
import { PLUS, isPremiumCard } from '@daily-rack/core';

const SIDES = ['On your right (South)', 'Across (West)', 'On your left (North)'];

/** How many people are playing: a full table, three with a computer in the empty seat, or two-player. */
type Players = 4 | 3 | 2;

/** Set up a table with friends: how many of you, mode, who sits where, and the Charleston house rules. */
export default function NewTableScreen() {
  const router = useRouter();
  const { ask } = useNotifications();
  const { plus, freeHandsLeft, handlePlusError } = usePlus();
  const { friend, players: playersParam } = useLocalSearchParams<{ friend?: string; players?: string }>();
  const [friends, setFriends] = useState<FriendsOverview['friends']>([]);
  const [players, setPlayers] = useState<Players>(playersParam === '2' ? 2 : playersParam === '3' ? 3 : 4);
  const [mode, setMode] = useState<'live' | 'turn'>('turn');
  const [seats, setSeats] = useState<SeatChoice[]>([{ type: 'open' }, { type: 'bot', level: 'normal' }, { type: 'bot', level: 'normal' }]);
  // With three of you, a computer takes the last seat; with two, one seat sits across from you.
  const [fill, setFill] = useState<BotLevel>('normal');
  const [opponent, setOpponent] = useState<SeatChoice>({ type: 'open' });
  const [rules, setRules] = useState(false);
  const [secondCharleston, setSecondCharleston] = useState(true);
  const [courtesyPass, setCourtesyPass] = useState(true);
  const [skipCharleston, setSkipCharleston] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ensureName } = useSafety();
  const cards = useCardList();
  const [cardId, setCardId] = useState<string | null>(null);

  useEffect(() => {
    api
      .friends()
      .then((f) => {
        setFriends(f.friends);
        if (friend && f.friends.some((x) => x.id === friend)) {
          setSeats((s) => [{ type: 'friend', friendId: friend }, ...s.slice(1)]);
          setOpponent({ type: 'friend', friendId: friend });
        }
      })
      .catch(() => undefined);
  }, [friend]);

  const label = (seat: SeatChoice) =>
    seat.type === 'bot' ? `Computer · ${LEVEL_LABEL[seat.level]}` : seat.type === 'friend' ? `Held for ${friends.find((f) => f.id === seat.friendId)?.name ?? 'a friend'}` : 'Open: anyone with the code';

  const choosePlayers = (n: Players) => {
    setPlayers(n);
    // Three of you: the other two seats are for people, and a computer fills the empty one.
    if (n === 3) setSeats((s) => s.map((x, i) => (i < 2 && x.type === 'bot' ? { type: 'open' } : x)));
  };
  // The seats the table is set up with, after the host's.
  const chosen: SeatChoice[] = players === 2 ? [opponent] : players === 3 ? [seats[0]!, seats[1]!, { type: 'bot', level: fill }] : seats;

  const create = async () => {
    // Other people will see this name at the table.
    if (chosen.some((s) => s.type !== 'bot') && !(await ensureName())) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTable({
        mode,
        seats: chosen,
        settings: { secondCharleston, courtesyPass, skipCharleston },
        ...(cardId ? { cardId } : {}),
        ...(players === 2 ? { variant: 'two-player' as const } : {}),
      });
      track('table_created', { mode, vsComputer: chosen.every((s) => s.type === 'bot'), friends: chosen.filter((s) => s.type === 'friend').length, players });
      router.replace(`/table/${created.table.id}`);
      // Turn-based games and friends' seats are where "your move" pushes earn their keep.
      if (mode === 'turn' || chosen.some((s) => s.type === 'friend')) setTimeout(() => ask('turn-table'), 1200);
    } catch (e) {
      if (!handlePlusError(e)) setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Open the table" icon="arrow" onPress={create} loading={busy} testID="create-table" />}>
      <TopBar title="New table" onBack={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />
      {error && <ErrorPanel message={error} />}

      <View style={{ gap: 10 }}>
        <Heading>How many of you?</Heading>
        <View style={styles.players} accessibilityRole="radiogroup" accessibilityLabel="How many of you are playing">
          {([4, 3, 2] as const).map((n) => (
            <Chip key={n} label={String(n)} selected={players === n} onPress={() => choosePlayers(n)} style={styles.playerChip} testID={`players-${n}`} />
          ))}
        </View>
        <Body small muted testID="players-note">
          {players === 4
            ? 'A full table. Fill the seats with friends, an open seat for anyone with the code, or computer players.'
            : players === 3
              ? 'Only three of you? A computer takes the empty seat.'
              : `Two-player mahjong. ${TWO_PLAYER_SUMMARY}`}
        </Body>
        {players === 2 && <Button variant="text" compact icon="help" title="Two-player rules" onPress={() => setRules(true)} style={{ alignSelf: 'flex-start' }} testID="new-two-player-rules" />}
      </View>

      <View style={{ gap: 10 }}>
        <Heading>How do you want to play?</Heading>
        <Segmented
          label="Game pace"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'turn', label: 'Turn-based' },
          ]}
        />
        <Body small muted>
          {mode === 'live'
            ? 'Everyone plays at the same time. A timer keeps things moving; if someone steps away, the computer makes a safe move for them.'
            : 'Play at your own pace. Each player gets a nudge when it’s their move, and the game waits for them.'}
        </Body>
      </View>

      {cards.length > 1 && (
        <View style={{ gap: 10 }}>
          <Heading>Which card?</Heading>
          <View style={{ gap: 8 }}>
            {cards.map((c) => (
              <Chip
                key={c.id}
                label={isPremiumCard(c.id) && !plus ? `${c.name} · Plus` : c.name}
                selected={(cardId ?? cards[0]!.id) === c.id}
                onPress={() => setCardId(c.id)}
                testID={`card-${c.id}`}
              />
            ))}
          </View>
          {isPremiumCard(cardId) && !plus && (
            <Body small muted>
              {chosen.every((s) => s.type === 'bot')
                ? `Against the computer you get ${PLUS.freeCardHandsPerDay} free hands a day on this card${freeHandsLeft !== null ? ` (${freeHandsLeft} left today)` : ''}. Plus makes it unlimited.`
                : 'Hosting friends on this card comes with Plus. Your friends join free.'}
            </Body>
          )}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Heading>Seats</Heading>
        <View style={styles.seat}>
          <View style={{ flex: 1 }}>
            <Text style={styles.side}>{players === 2 ? 'You (East, starts first)' : 'You (East, deals first)'}</Text>
          </View>
        </View>
        {players === 2 ? (
          <View style={styles.seat}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.side}>Across from you (West)</Text>
              <Body small muted>
                {label(opponent)}
              </Body>
            </View>
            <Button variant="text" compact title="Change" onPress={() => setEditing(0)} testID="new-seat-1" />
          </View>
        ) : (
          seats.map((seat, i) =>
            players === 3 && i === 2 ? (
              <View key={i} style={[styles.seat, { flexWrap: 'wrap' }]} testID="computer-fills">
                <View style={{ flex: 1, gap: 2, minWidth: 160 }}>
                  <Text style={styles.side}>{SIDES[i]}</Text>
                  <Body small muted>
                    A computer player takes this seat
                  </Body>
                </View>
                <Row gap={6}>
                  {(['easy', 'normal', 'hard'] as const).map((l) => (
                    <Chip key={l} label={LEVEL_LABEL[l]} selected={fill === l} onPress={() => setFill(l)} />
                  ))}
                </Row>
              </View>
            ) : (
              <View key={i} style={styles.seat}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.side}>{SIDES[i]}</Text>
                  <Body small muted>
                    {label(seat)}
                  </Body>
                </View>
                <Button variant="text" compact title="Change" onPress={() => setEditing(i)} testID={`new-seat-${i + 1}`} />
              </View>
            ),
          )
        )}
        <Body small muted>
          {chosen.some((s) => s.type !== 'bot')
            ? `Open seats need filling before the first ${players === 2 ? 'game' : 'hand'}. You can still change them in the lobby.`
            : `Every seat is filled, so the first ${players === 2 ? 'game starts' : 'hand is dealt'} as soon as you open the table.`}
        </Body>
      </View>

      {players !== 2 && (
        <Card style={{ gap: 10 }}>
          <Body bold>Charleston</Body>
          <Row gap={8}>
            <Chip label="Play the Charleston" selected={!skipCharleston} onPress={() => setSkipCharleston(false)} />
            <Chip label="Skip it" selected={skipCharleston} onPress={() => setSkipCharleston(true)} />
          </Row>
          {!skipCharleston && (
            <>
              <Row gap={8}>
                <Chip label="Second Charleston (if all agree)" selected={secondCharleston} onPress={() => setSecondCharleston(!secondCharleston)} />
              </Row>
              <Row gap={8}>
                <Chip label="Courtesy pass" selected={courtesyPass} onPress={() => setCourtesyPass(!courtesyPass)} />
              </Row>
            </>
          )}
        </Card>
      )}

      <SeatSheet
        position={editing}
        friends={friends}
        onClose={() => setEditing(null)}
        onPick={(choice) => {
          if (editing !== null && players === 2) setOpponent(choice);
          else if (editing !== null) setSeats((s) => s.map((x, i) => (i === editing ? choice : x)));
          setEditing(null);
        }}
      />
      <TwoPlayerRules visible={rules} onClose={() => setRules(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  players: { flexDirection: 'row', gap: 8 },
  playerChip: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, minHeight: 56 },
  side: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
