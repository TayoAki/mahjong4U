import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { BotLevel } from '@daily-rack/core/mahjong';
import { api, type TableSummary } from '../../lib/api.ts';
import { useRealtimeMessages } from '../../lib/realtime.tsx';
import { useSession } from '../../lib/session.tsx';
import { track } from '../../lib/analytics.ts';
import { Badge, Body, Button, Card, Chip, Display, ErrorPanel, Eyebrow, Heading, Icon, IconButton, Notice, Row, Screen, Segmented, Sheet } from '../../components/ui.tsx';
import { HowToPlay } from '../../game/HowToPlay.tsx';
import { OnlineCard } from '../../game/OnlineCard.tsx';
import { LinkCard } from '../../components/LinkCard.tsx';
import { LEVEL_LABEL } from '../../game/Lobby.tsx';
import { colors } from '../../theme.ts';

export default function PlayScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [quick, setQuick] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'quick' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TableSummary | null>(null);
  const [help, setHelp] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const { offline } = useSession();

  const load = useCallback(() => {
    api
      .tables()
      .then((r) => setTables(r.tables))
      .catch((e: Error) => setError(e.message));
    api
      .stats()
      .then((s) => setRating(s.ranked.games > 0 ? s.ranked.rating : null))
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);
  useRealtimeMessages((m) => {
    if (m.type === 'table') load();
  });

  const playComputer = async () => {
    setBusy('quick');
    setError(null);
    try {
      const created = await api.createTable({
        mode: 'turn',
        seats: [{ type: 'bot', level }, { type: 'bot', level }, { type: 'bot', level }],
        settings: { skipCharleston: quick },
      });
      track('table_created', { mode: 'turn', vsComputer: true, level });
      router.push(`/table/${created.table.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (t: TableSummary) => {
    setRemoving(null);
    setTables((list) => list?.filter((x) => x.id !== t.id) ?? null);
    try {
      await api.leaveTable(t.id);
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  const join = async () => {
    setBusy('join');
    setError(null);
    try {
      const joined = await api.joinByCode(code.trim().toUpperCase());
      track('table_joined', { mode: joined.table.mode });
      setCode('');
      router.push(`/table/${joined.table.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Eyebrow>Sit down to a game</Eyebrow>
        <Display size={38}>Play mahjong</Display>
        <Body muted>Full American mahjong: Charleston, calling tiles, jokers and Mahjong. Live or turn-based.</Body>
        <Button title="New to mahjong? How to play" variant="text" compact icon="help" onPress={() => setHelp(true)} style={{ alignSelf: 'flex-start' }} testID="how-to-play" />
      </View>
      {offline ? (
        <Notice>You’re offline. You can still play the computer offline and take the lessons; online games come back when your connection does.</Notice>
      ) : (
        error && <ErrorPanel message={error} />
      )}

      <Card tone="felt" style={{ gap: 12 }}>
        <Row>
          <Icon name="play" color="#F4EFE3" />
          <Text style={styles.feltTitle}>Play the computer</Text>
        </Row>
        <Text style={styles.feltBody}>Three computer players fill the table. Take as long as you like on every move.</Text>
        <Segmented label="Computer strength" value={level} onChange={setLevel} options={(['easy', 'normal', 'hard'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
        <Row gap={8}>
          <Chip label="Full Charleston" selected={!quick} onPress={() => setQuick(false)} />
          <Chip label="Quick: skip it" selected={quick} onPress={() => setQuick(true)} />
        </Row>
        <Button title="Deal me in" icon="arrow" onPress={playComputer} loading={busy === 'quick'} testID="quick-play" />
        <Button title="No connection? Play offline" variant="light" compact onPress={() => router.push('/offline')} testID="play-offline" />
      </Card>

      <OnlineCard rating={rating} />

      <Card style={{ gap: 12 }}>
        <Row>
          <Icon name="users" />
          <Heading>Play with friends</Heading>
        </Row>
        <Body muted>Set up a table, hold seats for friends or share a code, and fill any empty chair with a computer player.</Body>
        <Button title="Set up a table" variant="secondary" onPress={() => router.push('/table/new')} testID="new-table" />
        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8))}
            placeholder="Table code"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel="Table code"
            onSubmitEditing={() => code.length >= 4 && join()}
            testID="join-code-input"
          />
          <Button title="Join" compact disabled={code.length < 4} loading={busy === 'join'} onPress={join} testID="join-code" />
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <Heading>Learn and improve</Heading>
        <LinkCard icon="card" title="Lessons" body="Ten short lessons, from the tiles to scoring, with quick checks." onPress={() => router.push('/lessons')} testID="open-lessons" />
        <LinkCard icon="flame" title="Your stats" body="Hands won, streaks, rating and the hands on the card you’ve made." onPress={() => router.push('/stats')} testID="open-stats" />
      </View>

      <View style={{ gap: 10 }}>
        <Heading>Your tables</Heading>
        {tables && tables.length === 0 && <Body muted>No games yet. Deal one above.</Body>}
        {tables?.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Table ${t.code}, ${t.players.join(', ')}${t.yourMove ? ', your move' : ''}${t.invited ? ', you are invited' : ''}`}
            onPress={() => router.push(`/table/${t.id}`)}
            style={({ pressed }) => [styles.tableRow, pressed && { backgroundColor: colors.sage }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.tableTitle} numberOfLines={1}>
                {t.players.filter((p) => p !== 'Open seat').join(' · ')}
              </Text>
              <Body small muted>
                {t.kind === 'public' ? (t.ranked ? 'Ranked' : 'Quick match') : t.mode === 'live' ? 'Live' : 'Turn-based'} · {t.status === 'lobby' ? 'Waiting to start' : t.status === 'between' ? `After hand ${t.handNumber}` : `Hand ${t.handNumber}`} · {t.code}
              </Body>
            </View>
            {t.yourMove ? <Badge label="Your move" /> : t.invited ? <Badge label="Invited" tone="ink" /> : null}
            <IconButton icon="close" label={t.invited ? `Decline table ${t.code}` : `Leave table ${t.code}`} color={colors.muted} onPress={() => setRemoving(t)} />
          </Pressable>
        ))}
      </View>

      <Sheet visible={removing !== null} title={removing?.invited ? 'Turn down this invitation?' : removing?.humans === 1 ? 'Remove this game?' : 'Leave this table?'} onClose={() => setRemoving(null)}>
        <Body>
          {removing?.invited
            ? 'Your held seat opens up for anyone with the code.'
            : removing?.humans === 1
              ? 'It’s just you and the computer, so the game ends and comes off your list.'
              : removing?.status === 'lobby'
                ? 'Your seat opens up for someone else.'
                : 'A computer player takes your seat so the others can finish.'}
        </Body>
        <Button title={removing?.invited ? 'Turn it down' : removing?.humans === 1 ? 'Remove game' : 'Leave'} variant="danger" onPress={() => removing && remove(removing)} testID="confirm-remove" />
        <Button title="Keep it" variant="text" onPress={() => setRemoving(null)} />
      </Sheet>
      <HowToPlay visible={help} onClose={() => setHelp(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feltTitle: { fontSize: 20, fontWeight: '700', color: '#F4EFE3' },
  feltBody: { fontSize: 15, lineHeight: 21, color: 'rgba(244,239,227,0.88)' },
  joinRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 18, letterSpacing: 3, color: colors.ink },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  tableTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
