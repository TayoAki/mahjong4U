import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { publicPhaseKey, type Action, type TwoPlayerAction } from '@daily-rack/core/mahjong';
import { ApiError, api, type SeatChoice, type TablePayload, type TwoPlayerTablePayload } from '../../lib/api.ts';
import { useRealtime, useRealtimeMessages } from '../../lib/realtime.tsx';
import { useSession } from '../../lib/session.tsx';
import { useSafety } from '../../lib/safety.tsx';
import { useMatchmaking } from '../../lib/matchmaking.tsx';
import { CardContext, useTableCard } from '../../lib/cards.tsx';
import { track } from '../../lib/analytics.ts';
import { ChatPanel } from '../../components/ChatPanel.tsx';
import { Body, Button, Card, Display, ErrorPanel, IconButton, Loading, Row, Screen, Sheet, TopBar } from '../../components/ui.tsx';
import { CardView } from '../../game/CardView.tsx';
import { GameScreen } from '../../game/GameScreen.tsx';
import { HowToPlay } from '../../game/HowToPlay.tsx';
import { Lobby } from '../../game/Lobby.tsx';
import { TwoPlayerRules } from '../../game/TwoPlayerRules.tsx';
import { TwoPlayerScreen } from '../../game/TwoPlayerScreen.tsx';
import { useVoice } from '../../voice/useVoice.ts';
import { VoiceBar } from '../../voice/VoiceBar.tsx';
import { usePlus } from '../../lib/plus.tsx';

export default function TableScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { handlePlusError } = usePlus();
  const { principalId } = useSession();
  const { connected } = useRealtime();
  const { ensureName } = useSafety();
  const [data, setData] = useState<TablePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'chat' | 'card' | 'leave' | 'help' | 'rules' | null>(null);
  const [unread, setUnread] = useState(0);
  const { find } = useMatchmaking();
  const [phrases, setPhrases] = useState<string[]>([]);
  const [ratingBefore, setRatingBefore] = useState<number | null>(null);
  const [ratingNote, setRatingNote] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .table(id)
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id]);
  // Reload on (re)connect so nothing pushed while the socket was down is missed.
  useEffect(load, [load, connected]);

  // Hints, the card sheet and the winning-hand layout follow the table's card.
  const card = useTableCard(data?.table.cardId);

  // Voice chat is for friends at private tables.
  const voiceAllowed = Boolean(data && data.table.kind === 'private' && data.mySeat !== null && data.table.status !== 'closed');
  const voice = useVoice(id, voiceAllowed);

  // Matched tables: strangers chat in quick phrases, and ranked hands move your rating.
  const isPublic = data?.table.kind === 'public';
  const ranked = Boolean(data?.table.ranked);
  const ended = Boolean(data?.game?.view.result);
  useEffect(() => {
    if (!isPublic) return;
    api
      .matchmaking()
      .then((r) => setPhrases(r.phrases))
      .catch(() => undefined);
  }, [isPublic]);
  useEffect(() => {
    if (!ranked) return;
    api
      .stats()
      .then((s) => (ended ? setRatingNote(`Your rating: ${s.ranked.rating}${ratingBefore !== null ? ` (${s.ranked.rating - ratingBefore >= 0 ? '+' : ''}${s.ranked.rating - ratingBefore})` : ''}`) : setRatingBefore(s.ranked.rating)))
      .catch(() => undefined);
    // Once at the start of the hand and once when it ends.
  }, [ranked, ended]);

  useRealtimeMessages((m) => {
    if (m.type === 'table' && m.tableId === id) {
      if (m.payload?.table) setData(m.payload as TablePayload);
      else load();
    }
    if (m.type === 'message' && data && m.conversationId === data.conversationId && sheet !== 'chat' && m.message?.senderId !== principalId) {
      setUnread((n) => n + 1);
    }
  });

  const run = async (fn: () => Promise<TablePayload | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'table' in result) setData(result as TablePayload);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale') load();
      if (!handlePlusError(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Send the step we acted on too, so a pass made at the same moment as someone else's still counts.
  const act = (action: Action | TwoPlayerAction) => run(() => api.act(id, action, data?.game?.version, data?.game ? publicPhaseKey(data.game.view.phase) : undefined));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/play'));

  if (loadError && !data) {
    return (
      <Screen>
        <TopBar title="Table" onBack={back} />
        <ErrorPanel message={loadError} onRetry={load} />
      </Screen>
    );
  }
  if (!data) return <Loading label="Pulling up a chair" />;

  const { table } = data;
  // A game against computer players only has no one to share the code with.
  const solo = table.seats.filter((s) => s.kind === 'human').length === 1 && !table.seats.some((s) => s.kind === 'open') && data.mySeat !== null;
  const humans = table.seats.filter((s) => s.kind === 'human').length;
  const twoPlayer = table.variant === 'two-player';
  const header = (
    <View style={{ gap: 8 }}>
      <TopBar
        title={isPublic ? (ranked ? 'Ranked game' : 'Quick match') : twoPlayer && solo ? 'Two-player' : solo ? 'Vs computer' : `Table ${table.code}`}
        onBack={back}
        right={
          <Row gap={0}>
            {/* At a two-player table, help opens the two-player rules (with the basics a tap away). */}
            <IconButton icon="help" label={twoPlayer ? 'Two-player rules' : 'How to play'} onPress={() => setSheet(twoPlayer ? 'rules' : 'help')} />
            <IconButton icon="card" label={card.name} onPress={() => setSheet('card')} />
            <IconButton
              icon="chat"
              label={unread ? `Table chat, ${unread} new` : 'Table chat'}
              badge={unread}
              onPress={() => {
                setUnread(0);
                setSheet('chat');
              }}
            />
          </Row>
        }
      />
      {voiceAllowed && humans >= 2 && <VoiceBar voice={voice} seats={table.seats} me={principalId} />}
    </View>
  );

  const sheets = (
    <>
      <Sheet visible={sheet === 'chat'} title="Table chat" onClose={() => setSheet(null)}>
        <ChatPanel conversationId={data.conversationId} height={420} emptyText="Say hello to the table." phrases={isPublic ? phrases : undefined} />
      </Sheet>
      <Sheet visible={sheet === 'card'} title={card.name} onClose={() => setSheet(null)}>
        <CardView />
      </Sheet>
      <HowToPlay visible={sheet === 'help'} onClose={() => setSheet(null)} />
      <TwoPlayerRules visible={sheet === 'rules'} onClose={() => setSheet(null)} onBasics={() => setSheet('help')} />
      <Sheet visible={sheet === 'leave'} title={table.status === 'lobby' && table.hostId === principalId ? 'Close this table?' : 'Leave the table?'} onClose={() => setSheet(null)}>
        <Body>
          {table.status === 'lobby'
            ? table.hostId === principalId
              ? 'Everyone waiting here will be sent back.'
              : 'Your seat opens up for someone else.'
            : ranked && !ended
              ? 'A computer player takes your seat so the others can finish. Leaving a ranked game early counts as a loss for your rating.'
              : 'A computer player takes your seat so the others can finish.'}
        </Body>
        <Button
          title={table.status === 'lobby' && table.hostId === principalId ? 'Close table' : 'Leave'}
          variant="danger"
          onPress={async () => {
            setSheet(null);
            await run(() => api.leaveTable(id));
            router.replace('/play');
          }}
          testID="confirm-leave"
        />
        <Button title="Stay" variant="text" onPress={() => setSheet(null)} />
      </Sheet>
    </>
  );

  if (table.status === 'closed') {
    return (
      <Screen>
        {header}
        <Card>
          <Display size={28}>This table has closed</Display>
          <Body muted>The host closed it. Start a new game from the Play tab.</Body>
        </Card>
        <Button title="Back to Play" onPress={() => router.replace('/play')} />
      </Screen>
    );
  }

  if (data.mySeat === null) {
    const held = table.seats.some((s) => s.reservedFor === principalId && s.kind === 'open');
    const open = table.seats.some((s) => s.kind === 'open' && !s.reservedFor) || (table.status !== 'lobby' && table.seats.some((s) => s.kind === 'bot'));
    return (
      <Screen>
        {header}
        {error && <ErrorPanel message={error} />}
        <Card tone="felt" style={{ gap: 8 }}>
          <Display size={30} style={{ color: '#F4EFE3' }}>
            {held ? 'A seat is waiting for you' : 'Join this table?'}
          </Display>
          <Body style={{ color: '#F4EFE3' }}>
            {table.seats.filter((s) => s.kind === 'human').map((s) => s.name).join(', ') || 'Someone'} {table.status === 'lobby' ? 'is setting up' : 'is playing'} a{' '}
            {table.mode === 'live' ? 'live' : 'turn-based'} {table.variant === 'two-player' ? 'two-player game' : 'game'}.
            {table.status !== 'lobby' && !held ? ' You would take over from a computer player.' : ''}
          </Body>
        </Card>
        <View style={{ gap: 10 }}>
          <Button
            title="Take a seat"
            icon="play"
            disabled={!held && !open}
            loading={busy}
            onPress={async () => {
              if (!(await ensureName())) return;
              await run(async () => {
                const joined = await api.joinTable(id);
                track('table_joined', { tableId: id, mode: table.mode });
                return joined;
              });
            }}
            testID="join-table"
          />
          {!held && !open && <Body muted center>Every seat is taken.</Body>}
        </View>
        {sheets}
      </Screen>
    );
  }

  if (table.status === 'lobby' || !data.game) {
    return (
      <CardContext.Provider value={card}>
        <Lobby
          data={data}
          header={header}
          principalId={principalId}
          busy={busy}
          error={error}
          start={() => run(() => api.startTable(id))}
          setSeat={(position: number, seat: SeatChoice) => run(() => api.setSeat(id, position, seat))}
          leave={() => setSheet('leave')}
        />
        {sheets}
      </CardContext.Provider>
    );
  }

  if (twoPlayer) {
    return (
      <CardContext.Provider value={card}>
        <TwoPlayerScreen data={data as TwoPlayerTablePayload} header={header} busy={busy} error={error} act={act} nextHand={() => run(() => api.nextHand(id))} leave={() => setSheet('leave')} />
        {sheets}
      </CardContext.Provider>
    );
  }

  return (
    <CardContext.Provider value={card}>
      <GameScreen
        data={data}
        header={header}
        busy={busy}
        error={error}
        act={act}
        nextHand={() => run(() => api.nextHand(id))}
        leave={() => setSheet('leave')}
        rematch={
          isPublic
            ? () => {
                void find(ranked ? 'ranked' : 'casual');
                router.replace('/play');
              }
            : undefined
        }
        resultNote={ratingNote}
      />
      {sheets}
    </CardContext.Provider>
  );
}
