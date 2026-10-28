import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { isPremiumCard } from '@daily-rack/core';
import { HOUSE_CARD, type Action, type BotLevel } from '@daily-rack/core/mahjong';
import { readJson, writeJson } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { usePlus } from '../lib/plus.tsx';
import { CardContext, loadCards, useCardList, useTableCard } from '../lib/cards.tsx';
import { Body, Button, Card, Chip, Display, Heading, IconButton, Loading, Row, Screen, Segmented, Sheet, TopBar } from '../components/ui.tsx';
import { PipSays } from '../components/Pip.tsx';
import { CardView } from '../game/CardView.tsx';
import { GameScreen } from '../game/GameScreen.tsx';
import { HowToPlay } from '../game/HowToPlay.tsx';
import { LEVEL_LABEL } from '../game/Lobby.tsx';
import type { OfflineSettings } from '../offline/OfflineTable.ts';
import { colors } from '../theme.ts';
import { CoachPanel } from './CoachPanel.tsx';
import { PracticeReview } from './PracticeReview.tsx';
import { adviceFor, newPractice, pipPicks, practiceAct, practiceBotStep, practiceEnded, practicePayload, takeBack, type PracticeSave } from './PracticeRound.ts';

const KEY = 'dr:practice-round';
/** A beat between computer moves so you can follow the play. */
const BOT_DELAY_MS = 700;

/**
 * A practice round with Pip: one untimed hand against the computer on this device, with
 * Pip coaching each decision and any move open to a take-back. Picks up where you left off.
 */
export function PracticeView({ me, onExit }: { me: string; onExit: () => void }) {
  const { plus } = usePlus();
  const cards = useCardList();
  const [save, setSave] = useState<PracticeSave | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'help' | 'card' | 'menu' | null>(null);
  const [finalTable, setFinalTable] = useState(false);
  const [level, setLevel] = useState<BotLevel>('easy');
  const [quick, setQuick] = useState(false);
  const [cardId, setCardId] = useState<string>(HOUSE_CARD.id);
  const [cardTried, setCardTried] = useState(false);

  useEffect(() => {
    readJson<PracticeSave | null>(KEY, null).then((s) => setSave(s?.v === 1 ? s : null));
  }, []);

  const update = (next: PracticeSave | null, keep = true) => {
    setSave(next);
    if (keep) void writeJson(KEY, next);
  };

  // A round on another card needs that card registered first (it comes from the server).
  const card = useTableCard(save?.game.state.cardId);
  const cardReady = !save || card.id === save.game.state.cardId;
  useEffect(() => {
    if (!cardReady) void loadCards().then(() => setCardTried(true));
  }, [cardReady]);

  // Computer players move one at a time, with a pause, until it's your move. Their moves
  // aren't saved one by one: they follow from your last move (the same moves every time),
  // so a round picked up later simply plays them again.
  useEffect(() => {
    if (!save || !cardReady) return;
    const next = practiceBotStep(save, me);
    if (!next) return;
    const timer = setTimeout(() => update(next, practiceEnded(next)), BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [save, me, cardReady]);

  const payload = useMemo(() => (save && cardReady ? practicePayload(save, me) : null), [save, me, cardReady]);
  const advice = useMemo(() => (save && payload ? adviceFor(card, save.game.state, payload.game!.view) : null), [payload]);
  // Pip's tiles, marked on the rack: the pass, or the best one or two discards.
  const marked = advice?.kind === 'pass' ? advice.pip : advice?.kind === 'discard' && !advice.canMahjong ? pipPicks(advice.rows).map((r) => r.tile) : undefined;

  const deal = (settings: OfflineSettings) => {
    setError(null);
    update(newPractice(settings, me));
    setFinalTable(false);
    track('practice_started', { level: settings.level, charleston: !settings.skipCharleston });
  };
  const again = () => save && deal(save.game.settings);

  const act = (action: Action) => {
    if (!save) return;
    setError(null);
    try {
      update(practiceAct(save, action, me));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const back = () => {
    if (!save) return;
    setError(null);
    update(takeBack(save));
    setFinalTable(false);
  };

  const sheets = (
    <>
      <HowToPlay visible={sheet === 'help'} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === 'card'} title={card.name} onClose={() => setSheet(null)}>
        <CardView />
      </Sheet>
      <Sheet visible={sheet === 'menu'} title="Practice round" onClose={() => setSheet(null)}>
        <Body>Deal a fresh hand, or change the computer players and the Charleston.</Body>
        <Button
          title="Deal a new hand"
          variant="secondary"
          onPress={() => {
            setSheet(null);
            again();
          }}
          testID="practice-restart"
        />
        <Button
          title="Change the settings"
          variant="secondary"
          onPress={() => {
            setSheet(null);
            update(null);
          }}
        />
        <Button title="Keep playing" variant="text" onPress={() => setSheet(null)} />
      </Sheet>
    </>
  );

  if (save === undefined) return <Loading label="Finding your practice round" />;

  if (!save) {
    const choices = cards.filter((c) => plus || !isPremiumCard(c.id));
    return (
      <Screen>
        <TopBar title="Practice round" onBack={onExit} />
        <Card tone="felt" style={{ gap: 12 }}>
          <Display size={30} style={{ color: colors.feltText }}>
            Practice with Pip
          </Display>
          <PipSays mood="wave" size={60} testID="practice-intro">
            One hand, no clock. I’ll help with every pass, discard and call, and you can take back any move.
          </PipSays>
          <Segmented label="Computer strength" value={level} onChange={setLevel} options={(['easy', 'normal', 'hard'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
          <Row gap={8}>
            <Chip label="Full Charleston" selected={!quick} onPress={() => setQuick(false)} testID="practice-charleston" />
            <Chip label="Skip it" selected={quick} onPress={() => setQuick(true)} testID="practice-skip-charleston" />
          </Row>
          {choices.length > 1 && (
            <View style={{ gap: 8 }}>
              <Body small style={{ color: colors.feltText }}>
                Which card?
              </Body>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {choices.map((c) => (
                  <Chip key={c.id} label={c.name} selected={cardId === c.id} onPress={() => setCardId(c.id)} testID={`practice-card-${c.id}`} />
                ))}
              </Row>
            </View>
          )}
          <Button
            title="Deal me in"
            icon="arrow"
            onPress={() => deal({ level, skipCharleston: quick, ...(cardId !== HOUSE_CARD.id ? { cardId } : {}) })}
            testID="practice-deal"
          />
        </Card>
        <Body small muted center>
          Practice rounds stay on this phone and don’t count in your stats.
        </Body>
        {sheets}
      </Screen>
    );
  }

  if (!cardReady || !payload) {
    if (!cardTried) return <Loading label="Fetching the card" />;
    return (
      <Screen>
        <TopBar title="Practice round" onBack={onExit} />
        <Heading>This round needs its card</Heading>
        <Body>Your practice round uses a card that has to be fetched once, and we couldn’t reach the server. Try again with a connection, or deal a new round on the house card.</Body>
        <Button title="New round on the house card" onPress={() => update(null)} />
      </Screen>
    );
  }

  const seats = payload.table.seats;
  const nameOf = (seat: number) => (seats[payload.game!.positions[seat] ?? 0]?.name ?? '').replace(' (computer)', '');

  if (practiceEnded(save) && !finalTable) {
    return (
      <CardContext.Provider value={card}>
        <PracticeReview
          save={save}
          card={card}
          nameOf={nameOf}
          onExit={onExit}
          onAgain={again}
          onTable={() => setFinalTable(true)}
          onTakeBack={back}
          onSettings={() => update(null)}
        />
      </CardContext.Provider>
    );
  }

  const header = (
    <TopBar
      title={finalTable ? 'Final table' : 'Practice round'}
      onBack={finalTable ? () => setFinalTable(false) : onExit}
      right={
        <Row gap={0}>
          <IconButton icon="help" label="How to play" onPress={() => setSheet('help')} />
          <IconButton icon="card" label={card.name} onPress={() => setSheet('card')} />
          {!finalTable && <IconButton icon="more" label="Practice round options" onPress={() => setSheet('menu')} />}
        </Row>
      }
    />
  );

  return (
    <CardContext.Provider value={card}>
      <GameScreen
        // A take-back starts the table afresh, so nothing picked before it lingers.
        key={save.takeBacks}
        data={payload}
        header={header}
        busy={false}
        error={error}
        act={act}
        nextHand={again}
        leave={() => setFinalTable(false)}
        marked={marked}
        coach={(table) => <CoachPanel table={table} advice={advice} card={card} data={payload} movedAt={save.movedAt} canTakeBack={save.history.length > 0} onTakeBack={back} />}
      />
      {sheets}
    </CardContext.Provider>
  );
}
