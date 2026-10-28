import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HOUSE_CARD, type BotLevel } from '@daily-rack/core/mahjong';
import { api, getConfig, type FriendsOverview, type SeatChoice, type TablePayload, type TableSeat } from '../lib/api.ts';
import { publicLink } from '../lib/config.ts';
import { copyText, shareLink } from '../lib/share.ts';
import { useActiveCard } from '../lib/cards.tsx';
import { useSafety } from '../lib/safety.tsx';
import { Avatar, Body, Button, Card, ErrorPanel, Eyebrow, Heading, Icon, IconButton, Notice, Row, Screen, Segmented, Sheet } from '../components/ui.tsx';
import { colors, fonts } from '../theme.ts';
import { TWO_PLAYER_SUMMARY } from './TwoPlayerRules.tsx';

interface Props {
  data: TablePayload;
  header: ReactNode;
  principalId: string | null;
  busy: boolean;
  error: string | null;
  start: () => void;
  setSeat: (position: number, seat: SeatChoice) => void;
  leave: () => void;
}

export const LEVEL_LABEL: Record<BotLevel, string> = { easy: 'Easy', normal: 'Steady', hard: 'Sharp' };

/** Before the first hand: who sits where, the invite code, and the start button. */
export function Lobby({ data, header, principalId, busy, error, start, setSeat, leave }: Props) {
  const { table } = data;
  const isHost = table.hostId === principalId;
  const { openPlayer } = useSafety();
  const card = useActiveCard();
  const [friends, setFriends] = useState<FriendsOverview['friends']>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isHost) api.friends().then((f) => setFriends(f.friends)).catch(() => undefined);
  }, [isHost]);

  const filled = table.seats.every((s) => s.kind !== 'open');
  const friendName = (id: string) => friends.find((f) => f.id === id)?.name ?? 'a friend';

  const describe = (seat: TableSeat) => {
    if (seat.kind === 'human') return `${seat.principalId === table.hostId ? 'Host' : 'Player'}${seat.principalId === principalId ? ' · you' : ''}${seat.online ? ' · here now' : ''}`;
    if (seat.kind === 'bot') return `Computer · ${LEVEL_LABEL[seat.botLevel ?? 'normal']}`;
    if (seat.reservedFor) return seat.reservedFor === principalId ? 'Held for you' : `Held for ${friendName(seat.reservedFor)}`;
    return 'Anyone with the code can sit here';
  };

  const invite = async () => {
    const config = await getConfig();
    const url = publicLink(`/t/${table.code}`, config.publicBaseUrl);
    const result = await shareLink({ title: 'Join my mahjong table', message: `Pull up a chair: join my mahjong table with code ${table.code}.`, url });
    if (result === 'copied') setCopied(true);
  };

  return (
    <Screen
      footer={
        isHost ? (
          <>
            <Button title={filled ? (table.variant === 'two-player' ? 'Start the game' : 'Deal the first hand') : 'Fill every seat to start'} icon="play" disabled={!filled} loading={busy} onPress={start} testID="start-table" />
            <Button title="Close this table" variant="text" compact onPress={leave} />
          </>
        ) : (
          <Button title="Leave table" variant="secondary" onPress={leave} />
        )
      }
    >
      {header}
      {error && <ErrorPanel message={error} />}
      <Card tone="felt" style={{ alignItems: 'center', gap: 8 }}>
        <Eyebrow light>Table code</Eyebrow>
        <Text style={styles.code} testID="table-code" selectable>
          {table.code}
        </Text>
        <Text style={styles.feltText}>
          {table.mode === 'live' ? 'Live: everyone plays now, with a turn timer.' : 'Turn-based: play when it suits you. We keep your place.'}
        </Text>
        <Row gap={8}>
          <Button variant="light" compact icon="share" title="Invite" onPress={invite} />
          <Button
            variant="light"
            compact
            icon="copy"
            title={copied ? 'Copied' : 'Copy code'}
            onPress={() => {
              void copyText(table.code);
              setCopied(true);
            }}
          />
        </Row>
      </Card>

      <View style={{ gap: 8 }}>
        <Heading>Seats</Heading>
        {table.seats.map((seat) => {
          const canEdit = isHost && seat.position > 0 && seat.kind !== 'human';
          return (
            <View key={seat.position} style={styles.seat}>
              {seat.kind === 'open' ? (
                <View style={styles.emptySeat}>
                  <Icon name="plus" color={colors.muted} size={20} />
                </View>
              ) : (
                <Avatar name={seat.name} color={seat.color} size={40} online={seat.kind === 'human' ? seat.online : undefined} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.seatName}>{seat.kind === 'open' ? (seat.reservedFor ? 'Reserved' : 'Open seat') : seat.name}</Text>
                <Body small muted>
                  {seat.wind} · {describe(seat)}
                </Body>
              </View>
              {canEdit && <Button variant="text" compact title="Change" onPress={() => setEditing(seat.position)} testID={`seat-${seat.position}-change`} />}
              {seat.kind === 'human' && seat.principalId && seat.principalId !== principalId && (
                <IconButton icon="more" label={`Report or block ${seat.name}`} color={colors.muted} onPress={() => openPlayer({ id: seat.principalId!, name: seat.name })} />
              )}
            </View>
          );
        })}
      </View>

      {table.variant === 'two-player' ? (
        <Card>
          <Body bold>Two-player rules</Body>
          <Body small muted>
            {TWO_PLAYER_SUMMARY} Hands come from the {card.id === HOUSE_CARD.id ? 'Daily Rack house card' : card.name}. Each Mahjong is paid by the other player, and the one that ends the game pays double. Tap the help button at the top for the full rules.
          </Body>
        </Card>
      ) : (
        <Card>
          <Body bold>House rules</Body>
          <Body small muted>
            {table.settings.skipCharleston
              ? 'No Charleston: play starts straight away.'
              : `Charleston: first round always${table.settings.secondCharleston ? ', second round if everyone agrees' : ''}${table.settings.courtesyPass ? ', then an optional courtesy pass' : ''}.`}{' '}
            Hands come from the {card.id === HOUSE_CARD.id ? 'Daily Rack house card' : card.name}. Whoever throws the winning tile pays double; a self-drawn Mahjong collects double from everyone.
          </Body>
        </Card>
      )}
      {!isHost && <Notice>The host deals the first hand once every seat is filled.</Notice>}

      <SeatSheet
        position={editing}
        friends={friends}
        onClose={() => setEditing(null)}
        onPick={(choice) => {
          if (editing !== null) setSeat(editing, choice);
          setEditing(null);
        }}
      />
    </Screen>
  );
}

export function SeatSheet({ position, friends, onClose, onPick }: { position: number | null; friends: FriendsOverview['friends']; onClose: () => void; onPick: (choice: SeatChoice) => void }) {
  const [level, setLevel] = useState<BotLevel>('normal');
  return (
    <Sheet visible={position !== null} title="Who sits here?" onClose={onClose}>
      <Body bold>A computer player</Body>
      <Segmented
        label="Computer strength"
        value={level}
        onChange={setLevel}
        options={(['easy', 'normal', 'hard'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
      />
      <Button title={`Seat a ${LEVEL_LABEL[level].toLowerCase()} computer player`} onPress={() => onPick({ type: 'bot', level })} testID="seat-bot" />
      <Button title="Leave it open for anyone with the code" variant="secondary" onPress={() => onPick({ type: 'open' })} testID="seat-open" />
      <Body bold>Hold it for a friend</Body>
      {friends.length === 0 ? (
        <Body small muted>
          Add friends on the Friends tab to hold seats for them.
        </Body>
      ) : (
        friends.map((f) => (
          <Button key={f.id} variant="secondary" compact title={f.name} onPress={() => onPick({ type: 'friend', friendId: f.id })} />
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.caption, fontSize: 44, letterSpacing: 6, color: colors.feltText },
  feltText: { color: colors.feltText, fontSize: 15, textAlign: 'center' },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  emptySeat: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  seatName: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
