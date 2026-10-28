import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Action, BotLevel } from '@daily-rack/core/mahjong';
import { readJson, writeJson } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { Body, Button, Card, Chip, Display, IconButton, Loading, Row, Screen, Segmented, Sheet, TopBar } from '../components/ui.tsx';
import { CardView } from '../game/CardView.tsx';
import { GameScreen } from '../game/GameScreen.tsx';
import { HowToPlay } from '../game/HowToPlay.tsx';
import { LEVEL_LABEL } from '../game/Lobby.tsx';
import { colors } from '../theme.ts';
import { actOffline, botStep, newOfflineGame, nextOfflineHand, offlinePayload, offlineResult, type OfflineSave } from './OfflineTable.ts';
import { queueOfflineResult, syncOfflineResults } from './results.ts';

const KEY = 'dr:offline-game';
/** A beat between computer moves so you can follow the play. */
const BOT_DELAY_MS = 700;

/** A game against the computer on this device, no connection needed. Picks up where you left off. */
export function OfflineGameView({ me, onExit }: { me: string; onExit: () => void }) {
  const [save, setSave] = useState<OfflineSave | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'help' | 'card' | 'leave' | null>(null);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [quick, setQuick] = useState(false);

  useEffect(() => {
    readJson<OfflineSave | null>(KEY, null).then(setSave);
  }, []);

  const update = (next: OfflineSave | null) => {
    setSave(next);
    void writeJson(KEY, next);
  };

  // Computer players move one at a time, with a pause, until it's your turn.
  useEffect(() => {
    if (!save) return;
    const next = botStep(save, me);
    if (!next) return;
    const timer = setTimeout(() => update(next), BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [save, me]);

  // A finished hand goes into your stats the next time you're online.
  useEffect(() => {
    if (!save || save.recorded) return;
    const result = offlineResult(save);
    if (!result) return;
    update({ ...save, recorded: true });
    void queueOfflineResult(result).then(() => syncOfflineResults().catch(() => undefined));
  }, [save]);

  const payload = useMemo(() => (save ? offlinePayload(save, me) : null), [save, me]);

  const act = (action: Action) => {
    if (!save) return;
    setError(null);
    try {
      update(actOffline(save, action, me));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const header = (
    <TopBar
      title="Offline game"
      onBack={onExit}
      right={
        <Row gap={0}>
          <IconButton icon="help" label="How to play" onPress={() => setSheet('help')} />
          <IconButton icon="card" label="House card" onPress={() => setSheet('card')} />
        </Row>
      }
    />
  );

  const sheets = (
    <>
      <HowToPlay visible={sheet === 'help'} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === 'card'} title="House card" onClose={() => setSheet(null)}>
        <CardView />
      </Sheet>
      <Sheet visible={sheet === 'leave'} title="End this game?" onClose={() => setSheet(null)}>
        <Body>Your scores for this game are cleared. Hands you finished still count in your stats.</Body>
        <Button
          title="End game"
          variant="danger"
          onPress={() => {
            setSheet(null);
            update(null);
            onExit();
          }}
          testID="offline-end"
        />
        <Button title="Keep playing" variant="text" onPress={() => setSheet(null)} />
      </Sheet>
    </>
  );

  if (save === undefined) return <Loading label="Finding your game" />;

  if (!save || !payload) {
    return (
      <Screen>
        {header}
        <Card tone="felt" style={{ gap: 12 }}>
          <Display size={30} style={{ color: colors.feltText }}>
            Play without a connection
          </Display>
          <Body style={{ color: colors.feltText }}>Three computer players, right on your phone. Your game is saved as you go, and finished hands join your stats when you’re back online.</Body>
          <Segmented label="Computer strength" value={level} onChange={setLevel} options={(['easy', 'normal', 'hard'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
          <Row gap={8}>
            <Chip label="Full Charleston" selected={!quick} onPress={() => setQuick(false)} />
            <Chip label="Quick: skip it" selected={quick} onPress={() => setQuick(true)} />
          </Row>
          <Button
            title="Deal me in"
            icon="arrow"
            onPress={() => {
              update(newOfflineGame({ level, skipCharleston: quick }, me));
              track('offline_game_started', { level });
            }}
            testID="offline-deal"
          />
        </Card>
        <View />
        {sheets}
      </Screen>
    );
  }

  return (
    <>
      <GameScreen data={payload} header={header} busy={false} error={error} act={act} nextHand={() => update(nextOfflineHand(save, me))} leave={() => setSheet('leave')} />
      {sheets}
    </>
  );
}
