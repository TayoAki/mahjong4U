import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURES, contentDay, spokenLabel } from '@daily-rack/core';
import { DAILY_TURNS, HOUSE_CARD, dailyShareText, dealTiles, rankPass } from '@daily-rack/core/mahjong';
import { ApiError, api, getConfig, type AppConfig, type ResultResponse } from '../../lib/api.ts';
import { discardsKey, readJson, writeJson, type DiscardsSave } from '../../lib/storage.ts';
import { track } from '../../lib/analytics.ts';
import { publicLink } from '../../lib/config.ts';
import { shareText } from '../../lib/share.ts';
import { useNotifications } from '../../lib/notification-prompt.tsx';
import { notePractice } from '../../lib/reminders.ts';
import { celebrateHaptic } from '../../lib/celebrate.ts';
import { Confetti } from '../../components/Confetti.tsx';
import { PipSays, type PipMood } from '../../components/Pip.tsx';
import { LinkCard } from '../../components/LinkCard.tsx';
import { Badge, Body, Button, Card, Display, ErrorPanel, Heading, Icon, Loading, Notice, Row, Screen, TopBar } from '../../components/ui.tsx';
import { Tile } from '../../components/Tile.tsx';
import { Rack, type RackItem } from '../../game/Rack.tsx';
import { LESSONS } from '../../lessons/content.ts';
import { DailyBoard, TableFrame, barStyles, charlestonPhase, dailyView, useDailyRack, useDailyTable } from '../../daily/DailyTable.tsx';
import { DailyDiscards } from '../../daily/DailyDiscards.tsx';
import { RankList, type RankRow } from '../../daily/RankList.tsx';
import { colors, fonts } from '../../theme.ts';

const NO_DISCARDS: DiscardsSave = { picks: [], best: [] };
const isSave = (s: unknown): s is DiscardsSave => {
  const save = s as Partial<DiscardsSave> | null;
  return Array.isArray(save?.picks) && Array.isArray(save.best) && save.picks.length === save.best.length && save.picks.every((t) => Number.isInteger(t));
};
const CHARLESTON_LESSON = LESSONS.find((l) => l.id === 'charleston');

function ResultScreen() {
  // `?play=discards` opens straight at the day's discards (from Today).
  const { attemptId = '', play } = useLocalSearchParams<{ attemptId: string; play?: string }>();
  const router = useRouter();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [save, setSave] = useState<DiscardsSave | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [stage, setStage] = useState<'review' | 'discards'>(play === 'discards' ? 'discards' : 'review');
  const [shareNote, setShareNote] = useState<string | null>(null);
  const { ask, refresh } = useNotifications();

  const load = () => {
    setError(null);
    void getConfig().then(setConfig);
    api
      .result(attemptId)
      .then(async (r) => {
        // The day's discards are kept on this device, so they're here when you come back.
        const saved = await readJson<DiscardsSave>(discardsKey(r.puzzle.revisionId), NO_DISCARDS);
        setSave(isSave(saved) ? saved : NO_DISCARDS);
        setResult(r);
        track('result_viewed', { attemptId, splitShown: r.split.minimumSampleMet });
        if (r.attempt.isDaily) {
          void notePractice().then(refresh);
          // Celebrate a strong pass or a streak milestone.
          if (r.alignment === 'matches' || r.alignment === 'alternate' || r.progress.milestone) {
            setBurst((b) => b + 1);
            celebrateHaptic();
          }
          // After the first rack, Pip offers a reminder for tomorrow's.
          if (r.progress.racksSolved <= 1) setTimeout(() => ask('first-rack'), 3000);
        }
      })
      .catch((e: Error) => setError(e instanceof ApiError && e.status === 404 ? 'That result is not available on this device.' : e.message));
  };
  useEffect(load, [attemptId]);

  const home = () => router.replace('/');
  if (error) {
    return (
      <Screen>
        <TopBar title="Your result" onBack={home} />
        <ErrorPanel message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!result || !save) return <Loading label="Comparing passes" />;

  const discards = save.picks.length >= DAILY_TURNS ? save.best : null;
  const shareLine = dailyShareText({ brand: config?.brand, day: contentDay(new Date(result.attempt.createdAt), config?.timeZone), alignment: result.alignment, discards });

  const share = async () => {
    setShareNote(null);
    const c = config ?? (await getConfig());
    let url = publicLink('/', c.publicBaseUrl);
    try {
      // The link opens this exact rack; once they've answered, they see your pass too.
      const link = await api.createShareLink(result.attempt.id, true);
      url = link.url ?? publicLink(link.path, c.publicBaseUrl);
    } catch {
      // Share the line anyway, with a link to the app.
    }
    const outcome = await shareText({ title: c.brand, text: shareLine, url }).catch(() => 'dismissed' as const);
    track('share_handoff_opened', { attemptId: result.attempt.id, kind: 'text', outcome });
    if (outcome === 'copied') setShareNote('Copied! Paste it into your group chat.');
  };

  const updateSave = (next: DiscardsSave) => {
    setSave(next);
    void writeJson(discardsKey(result.puzzle.revisionId), next);
  };

  if (stage === 'discards') {
    return (
      <DailyDiscards
        result={result}
        save={save}
        header={<TopBar title="Daily discards" onBack={() => setStage('review')} />}
        shareLine={shareLine}
        shareNote={shareNote}
        onSave={updateSave}
        onShare={share}
        onBack={() => setStage('review')}
      />
    );
  }
  return (
    <>
      <Review
        result={result}
        save={save}
        shareLine={shareLine}
        shareNote={shareNote}
        onHome={home}
        onDiscards={() => setStage('discards')}
        onShare={share}
        onClip={() => router.push(`/clip/${result.attempt.id}`)}
        onLesson={() => router.push('/lessons/charleston')}
      />
      <Confetti run={burst} />
    </>
  );
}

/** The pass, answered: yours next to the strong pass on the same table, and every tile ranked. */
function Review({
  result,
  save,
  shareLine,
  shareNote,
  onHome,
  onDiscards,
  onShare,
  onClip,
  onLesson,
}: {
  result: ResultResponse;
  save: DiscardsSave;
  shareLine: string;
  shareNote: string | null;
  onHome: () => void;
  onDiscards: () => void;
  onShare: () => void;
  onClip: () => void;
  onLesson: () => void;
}) {
  const { puzzle, suggestion, split, progress } = result;
  const sizes = useDailyTable();
  const ids = useMemo(() => dealTiles(puzzle.tiles), [puzzle.tiles]);
  const deal = useMemo(() => [...ids.values()], [ids]);
  const ranked = useMemo(() => rankPass(HOUSE_CARD, puzzle.tiles), [puzzle.tiles]);
  const rack = useDailyRack(puzzle.revisionId, deal);

  const faceOf = new Map(puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const faces = (list: string[]) => list.map((id) => faceOf.get(id) ?? '');
  const mine = new Set(result.attempt.tileInstanceIds);
  const strong = new Set(suggestion.tileInstanceIds);
  const tileOf = (id: string) => ids.get(id);
  const mineTiles = new Set(result.attempt.tileInstanceIds.map(tileOf));
  const strongTiles = new Set(suggestion.tileInstanceIds.map(tileOf));
  const spoken = new Map(puzzle.tiles.map((t) => [ids.get(t.instanceId)!, t.spokenLabel ?? spokenLabel(t.faceCode)]));
  const played = save.picks.length;
  const score = save.best.filter(Boolean).length;

  const rows: RankRow[] = ranked.rows.map((r) => ({
    key: r.key,
    choice: r.choice,
    base: ranked.now,
    mine: r.instanceIds.some((id) => mine.has(id)),
    strong: r.instanceIds.some((id) => strong.has(id)),
    rate: split.minimumSampleMet ? (split.groups.find((g) => g.faceKey === r.key)?.rate ?? 0) : null,
  }));

  const items: RackItem[] = rack.tiles.map((tile) => ({
    tile,
    label: `${spoken.get(tile) ?? ''}${mineTiles.has(tile) ? ', you passed it' : ''}${strongTiles.has(tile) ? ', in the strong pass' : ''}`,
    selected: mineTiles.has(tile),
    highlight: strongTiles.has(tile) && !mineTiles.has(tile),
    badge: strongTiles.has(tile) ? 'Strong' : undefined,
  }));

  const headline = (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Display center size={30}>
          {result.alignmentCopy}
        </Display>
        <View style={{ flexDirection: 'row' }}>
          <Badge label={`Aiming for ${result.section.label}`} />
        </View>
      </View>
      <PipSays mood={pipMood(result)} size={52} testID="result-pip">
        {pipLine(result)}
      </PipSays>
      <View style={styles.compare}>
        <PassCard title="Your pass" faces={faces(result.attempt.tileInstanceIds)} />
        <PassCard title={suggestion.label} faces={faces(suggestion.tileInstanceIds)} note={result.section.id !== result.suggestedSection.id ? `aiming for ${result.suggestedSection.label}` : undefined} />
      </View>
      {result.poster && <PassCard title="The pass that was shared with you" faces={faces(result.poster.tileInstanceIds)} half />}
    </View>
  );

  const bar = (
    <View style={{ gap: 4 }}>
      {played < DAILY_TURNS ? (
        <Button title={played === 0 ? 'Play it on: three discards' : `Carry on: turn ${played + 1} of ${DAILY_TURNS}`} icon="arrow" onPress={onDiscards} testID="play-discards" />
      ) : (
        <Button title={`See your discards: ${score} of ${DAILY_TURNS} best`} icon="arrow" variant="secondary" onPress={onDiscards} testID="play-discards" />
      )}
      <Button title="Share your result" icon="share" variant="text" compact onPress={onShare} testID="share-result" />
      {shareNote && (
        <Text style={barStyles.tip} testID="share-copied">
          {shareNote}
        </Text>
      )}
      {FEATURES.clips && <Button title="Make my clip" variant="text" compact onPress={onClip} testID="make-clip" />}
      {!result.attempt.isDaily && <Button title="Play today's rack" variant="text" compact onPress={onHome} />}
    </View>
  );

  const table = (
    <View style={{ gap: 6 }}>
      <Rack items={items} tileWidth={sizes.tileWidth} tapsDisabled animate={false} onTap={() => undefined} onArrange={rack.arrange} />
      <Body small muted center>
        Raised: your pass. Marked Strong: the strong pass.
      </Body>
    </View>
  );

  const details = (
    <>
      <Card tone="sage">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Icon name="leaf" size={28} />
          <View style={{ flex: 1, gap: 4 }}>
            <Body bold style={{ fontSize: 17 }}>
              {suggestion.headline}
            </Body>
            <Body>{suggestion.explanation}</Body>
          </View>
        </View>
        {suggestion.tileInstanceIds.map((id) => (
          <View key={id} style={styles.reason} accessible accessibilityLabel={`${spokenLabel(faceOf.get(id) ?? '')}: ${suggestion.reasons[id]}`}>
            <Tile face={faceOf.get(id) ?? ''} width={34} flat />
            <Body style={{ flex: 1 }}>{suggestion.reasons[id]}</Body>
          </View>
        ))}
        {result.alternates[0] && (
          <Body small>
            <Text style={{ fontWeight: '700' }}>Also strong: </Text>
            {result.alternates[0].note}
          </Body>
        )}
      </Card>

      <RankList
        title="Every tile, ranked"
        intro={`Best to pass first. Away: tiles you’d still need for your nearest hand without it (you’re ${ranked.now} away now). Useful: unseen tiles that would bring it closer. Green tiles cost you nothing.`}
        verb="pass"
        rows={rows}
        testID="pass-ranking"
      />
      {split.minimumSampleMet ? (
        <Body small muted>
          Passed: share of {split.eligibleAttemptCount} players passing at least one of that tile.
          {split.syntheticAttemptCount > 0 ? ` Includes ${split.syntheticAttemptCount} demo answers for testing.` : ''}
        </Body>
      ) : (
        <Card>
          <Body bold>More players are weighing in.</Body>
          <Body small muted>
            {split.eligibleAttemptCount} {split.eligibleAttemptCount === 1 ? 'answer' : 'answers'} so far. How everyone passed shows here once {split.threshold} players have passed.
          </Body>
        </Card>
      )}
      <LinkCard icon="leaf" title="How to choose a pass" body={`Pip’s Charleston lesson${CHARLESTON_LESSON ? `, about ${CHARLESTON_LESSON.minutes} minutes` : ''}.`} onPress={onLesson} testID="charleston-lesson" />

      {played > 0 && (
        <Card tone="sage" testID="discards-saved">
          <Row style={{ justifyContent: 'space-between' }}>
            <Heading>Daily discards</Heading>
            <Text style={styles.squares}>{save.best.map((b) => (b ? '🟩' : '⬜')).join('')}</Text>
          </Row>
          <Body>{played < DAILY_TURNS ? `${played} of ${DAILY_TURNS} played. Your hand is waiting.` : `${score} of ${DAILY_TURNS} of your throws were among the best.`}</Body>
          <Text style={styles.share} testID="share-text" selectable>
            {shareLine}
          </Text>
        </Card>
      )}

      {result.attempt.isDaily && progress.streak > 0 && (
        <Card tone="pink" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Icon name="flame" size={36} color="#D9475A" />
          <View style={{ flex: 1 }}>
            <Text style={styles.streak}>
              {progress.streak} {progress.streak === 1 ? 'day' : 'days'}. {progress.streak === 1 ? 'A fresh start.' : 'Nicely played.'}
            </Text>
            <Body small muted>
              {progress.milestone ? 'A milestone worth sharing.' : 'Keep the momentum going.'}
            </Body>
          </View>
        </Card>
      )}
      {!result.review.teacherReviewed && <Notice tone="warn">Practice rack: this suggestion has not been reviewed by a teacher yet.</Notice>}
    </>
  );

  return (
    <TableFrame
      header={<TopBar title="Your result" onBack={onHome} />}
      top={headline}
      board={<DailyBoard view={dailyView({ hand: deal, phase: charlestonPhase([]) })} caption={`${puzzle.title} · First Charleston · Passed right`} width={sizes.boardWidth} large={sizes.large} />}
      left={table}
      right={details}
      bar={bar}
      large={sizes.large}
    />
  );
}

function pipMood(result: ResultResponse): PipMood {
  if (result.progress.milestone) return 'proud';
  return result.alignment === 'matches' || result.alignment === 'alternate' ? 'cheer' : result.alignment === 'close' ? 'happy' : 'think';
}

/** Pip's take, warm whatever the pass. */
function pipLine(result: ResultResponse): string {
  const streak = result.attempt.isDaily ? result.progress.streak : 0;
  if (result.progress.milestone && streak > 1) return `${streak} days in a row! You're becoming a regular at this table.`;
  if (result.alignment === 'matches') return streak > 1 ? `Spot on, and day ${streak} of your streak. Lovely play!` : 'Spot on. You read that rack like a pro!';
  if (result.alignment === 'alternate') return 'A different pass that’s just as strong. Great eye!';
  if (result.alignment === 'close') return 'Close to the strong pass. You’re getting a feel for it.';
  return 'A different idea from the strong pass. Have a look at why below. Every rack teaches something!';
}

function PassCard({ title, faces, note, half }: { title: string; faces: string[]; note?: string; half?: boolean }) {
  return (
    <Card style={[{ flex: half ? undefined : 1, padding: 12 }, half && { alignSelf: 'flex-start' }]}>
      <Text style={styles.passTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`${title}: ${faces.map(spokenLabel).join(', ')}`}>
        {faces.map((f, i) => (
          <Tile key={`${f}-${i}`} face={f} width={40} flat />
        ))}
      </View>
      {note && (
        <Body small muted>
          {note}
        </Body>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  compare: { flexDirection: 'row', gap: 10 },
  passTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streak: { fontFamily: fonts.serif, fontSize: 22, color: colors.primary },
  squares: { fontSize: 20, letterSpacing: 2 },
  share: { fontSize: 15, fontWeight: '600', color: colors.ink, backgroundColor: colors.surface, borderRadius: 10, padding: 10 },
});

/** Switched off for now (FEATURES.dailyRack): old links land on Today. */
export default function ResultRoute() {
  return FEATURES.dailyRack ? <ResultScreen /> : <Redirect href="/" />;
}
