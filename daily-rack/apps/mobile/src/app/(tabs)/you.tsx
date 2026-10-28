import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, getConfig, type Profile, type Progress } from '../../lib/api.ts';
import { updatePrefs, usePrefs } from '../../lib/prefs.ts';
import { useReportProblem } from '../../lib/report-problem.tsx';
import { useSafety } from '../../lib/safety.tsx';
import { forgetSession, useSession } from '../../lib/session.tsx';
import { clearAll } from '../../lib/storage.ts';
import { Avatar, Body, Button, Card, Columns, Display, ErrorPanel, Eyebrow, Heading, Notice, Row, Screen, Segmented, Sheet } from '../../components/ui.tsx';
import { CardView } from '../../game/CardView.tsx';
import { LinkCard } from '../../components/LinkCard.tsx';
import { NotificationSettings } from '../../components/NotificationSettings.tsx';
import { PlusCard } from '../../components/PlusCard.tsx';
import { cancelLocal, forgetPushToken } from '../../lib/notifications';
import { LESSONS } from '../../lessons/content.ts';
import { resetLessonProgress, useLessonProgress } from '../../lessons/progress.ts';
import { colors, fonts } from '../../theme.ts';

export default function YouScreen() {
  const router = useRouter();
  const lessons = useLessonProgress();
  const { profile, refreshProfile, retry } = useSession();
  const prefs = usePrefs();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [name, setName] = useState(profile?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'card' | 'delete' | 'contact' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const { openRules, version } = useSafety();
  const { reportProblem } = useReportProblem();

  useEffect(() => setName(profile?.name ?? ''), [profile?.name]);
  const load = useCallback(() => {
    api
      .progress()
      .then(setProgress)
      .catch((e: Error) => setError(e.message));
    api
      .blocks()
      .then((r) => setBlocked(r.blocked))
      .catch(() => undefined);
    void getConfig().then((c) => setSupportEmail(c.supportEmail));
  }, []);
  useFocusEffect(load);
  useEffect(load, [load, version]);

  const save = async () => {
    setError(null);
    try {
      await api.rename(name);
      await refreshProfile();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteEverything = async () => {
    setDeleting(true);
    try {
      // Stop pushes and Pip's reminders before the data goes.
      await forgetPushToken();
      await cancelLocal('dr-');
      await api.deleteMe();
      await clearAll();
      resetLessonProgress();
      await forgetSession();
      setSheet(null);
      if (Platform.OS === 'web') window.location.assign('/');
      else retry();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      setSheet(null);
    }
  };

  const maxSection = Math.max(1, ...(progress?.sections.map((s) => s.count) ?? [1]));

  return (
    <Screen wide>
      <View style={{ paddingTop: 12 }}>
        <Eyebrow>Profile and settings</Eyebrow>
        <Display size={38}>You</Display>
      </View>
      {error && <ErrorPanel message={error} onRetry={load} />}

      <Columns
        left={
          <>
            <Card style={{ gap: 10 }}>
              <Row gap={12}>
                {profile && <Avatar name={profile.name} color={profile.color} size={48} />}
                <View style={{ flex: 1 }}>
                  <Body small muted>
                    Name friends see at the table
                  </Body>
                  <TextInput
                    value={name}
                    onChangeText={(t) => {
                      setName(t.slice(0, 24));
                      setSaved(false);
                    }}
                    style={styles.input}
                    accessibilityLabel="Your name"
                    testID="profile-name"
                  />
                </View>
              </Row>
              <Button title={saved ? 'Saved' : 'Save name'} compact variant="secondary" disabled={!name.trim() || name === profile?.name} onPress={save} testID="save-name" />
              {profile && (
                <Body small muted>
                  Friend code: <Text style={{ fontFamily: fonts.caption, letterSpacing: 2, color: colors.ink }}>{profile.code}</Text>
                </Body>
              )}
            </Card>

            <PlusCard />

            {progress && (
              <View style={styles.stats}>
                <Stat value={progress.streak} label="day streak" />
                <Stat value={progress.bestStreak} label="best streak" />
                <Stat value={progress.racksSolved} label="racks solved" />
                <Stat value={progress.strongPasses} label="strong passes" />
              </View>
            )}
            {progress && progress.sections.length > 0 && (
              <Card>
                <Heading>Sections you practise</Heading>
                {progress.sections.map((s) => (
                  <Row key={s.label} gap={10}>
                    <Text style={{ width: 110, color: colors.ink }}>{s.label}</Text>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${(s.count / maxSection) * 100}%` }]} />
                    </View>
                    <Text style={{ width: 28, textAlign: 'right', fontWeight: '700', color: colors.ink }}>{s.count}</Text>
                  </Row>
                ))}
              </Card>
            )}

            <LinkCard
              icon="card"
              title="Lessons"
              body={lessons.loaded ? `${LESSONS.filter((l) => lessons.done.has(l.id)).length} of ${LESSONS.length} done. Learn the game step by step.` : 'Learn the game step by step.'}
              onPress={() => router.push('/learn')}
              testID="you-lessons"
            />
            <LinkCard icon="flame" title="Your stats" body="Hands, wins, streaks, rating and card progress." onPress={() => router.push('/stats')} testID="you-stats" />

          </>
        }
        right={
          <>
            <NotificationSettings />

            <Card style={{ gap: 10 }}>
              <Heading>At the table</Heading>
              <Body small muted>
                Show the closest hands on the card while you play.
              </Body>
              <Segmented
                label="Hints"
                value={prefs.showHints ? 'on' : 'off'}
                onChange={(v) => updatePrefs({ showHints: v === 'on' })}
                options={[
                  { value: 'on', label: 'Hints on' },
                  { value: 'off', label: 'Hints off' },
                ]}
              />
              <Segmented
                label="Tile size"
                value={prefs.largeTiles ? 'large' : 'standard'}
                onChange={(v) => updatePrefs({ largeTiles: v === 'large' })}
                options={[
                  { value: 'standard', label: 'Standard tiles' },
                  { value: 'large', label: 'Large tiles' },
                ]}
              />
              <Segmented
                label="Table sounds"
                value={prefs.sounds ? 'on' : 'off'}
                onChange={(v) => updatePrefs({ sounds: v === 'on' })}
                options={[
                  { value: 'on', label: 'Sounds on' },
                  { value: 'off', label: 'Sounds off' },
                ]}
              />
              <Body small muted>
                Tile sounds follow your phone’s silent switch.
              </Body>
              <Button title="Read the house card" variant="text" icon="card" onPress={() => setSheet('card')} />
            </Card>

            <Card style={{ gap: 10 }}>
              <Heading>Clip captions</Heading>
              <Segmented
                label="Caption color"
                value={prefs.captionStyle}
                onChange={(captionStyle) => updatePrefs({ captionStyle })}
                options={[
                  { value: 'blue', label: 'Blue' },
                  { value: 'magenta', label: 'Magenta' },
                ]}
              />
            </Card>

            <Card style={{ gap: 10 }}>
              <Heading>Safety</Heading>
              <Body small muted>
                Report or block anyone from their name, a chat message, a table seat or a game night. Blocked players can’t see your messages, send you requests or join your tables.
              </Body>
              {blocked.length === 0 ? (
                <Body small>You haven’t blocked anyone.</Body>
              ) : (
                blocked.map((p) => (
                  <Row key={p.id} gap={10}>
                    <Avatar name={p.name} color={p.color} size={32} />
                    <Text style={{ flex: 1, fontSize: 16, color: colors.ink }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Button
                      title="Unblock"
                      compact
                      variant="secondary"
                      onPress={async () => {
                        await api.unblock(p.id).catch((e: Error) => setError(e.message));
                        load();
                      }}
                      testID={`unblock-${p.code}`}
                    />
                  </Row>
                ))
              )}
              <Button title="Community rules" variant="text" icon="help" onPress={openRules} />
              <Button title="Report a problem" variant="text" icon="flag" onPress={() => reportProblem()} testID="report-problem" />
              <Button
                title="Contact us"
                variant="text"
                icon="send"
                onPress={() => {
                  setFeedbackState('idle');
                  setFeedbackError(null);
                  setSheet('contact');
                }}
                testID="contact-us"
              />
            </Card>

            <Card style={{ gap: 10 }}>
              <Heading>Your data</Heading>
              <Body small muted>
                You play as a guest on this device. Voiceovers never leave your phone. Deleting removes your answers, games, friends, messages and game nights, and takes your answers out of
                the community split.
              </Body>
              <Button title="Delete my data" variant="danger" onPress={() => setSheet('delete')} />
            </Card>

            <Notice>
              Daily Rack is an independent app. It is not affiliated with or endorsed by the National Mah Jongg League and does not reproduce any official card. Games use the original Daily Rack house
              card.
            </Notice>
          </>
        }
      />

      <Sheet visible={sheet === 'card'} title="House card" onClose={() => setSheet(null)}>
        <CardView />
      </Sheet>
      <Sheet visible={sheet === 'contact'} title="Contact us" onClose={() => setSheet(null)}>
        {feedbackState === 'sent' ? (
          <>
            <Body testID="feedback-sent">Thanks! A person reads every message. If you need a reply, include a way to reach you.</Body>
            <Button title="Done" onPress={() => setSheet(null)} />
          </>
        ) : (
          <>
            <Body>Have an idea, a question, or need help with a player? Tell us here. If something isn’t working, Report a problem sends us the details we need to fix it.</Body>
            <TextInput
              value={feedback}
              onChangeText={(t) => setFeedback(t.slice(0, 2000))}
              placeholder="Your message"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, { minHeight: 120, paddingTop: 10, textAlignVertical: 'top' }]}
              accessibilityLabel="Your message"
              testID="feedback-input"
            />
            {feedbackError && <ErrorPanel message={feedbackError} />}
            <Button
              title="Send"
              icon="send"
              disabled={!feedback.trim()}
              loading={feedbackState === 'sending'}
              onPress={async () => {
                setFeedbackState('sending');
                setFeedbackError(null);
                try {
                  await api.feedback(feedback.trim());
                  setFeedback('');
                  setFeedbackState('sent');
                } catch (e) {
                  setFeedbackError((e as Error).message);
                  setFeedbackState('idle');
                }
              }}
              testID="send-feedback"
            />
            {supportEmail && <Button title={`Or email ${supportEmail}`} variant="text" onPress={() => void Linking.openURL(`mailto:${supportEmail}?subject=Daily%20Rack`)} />}
          </>
        )}
      </Sheet>
      <Sheet visible={sheet === 'delete'} title="Delete your data?" onClose={() => setSheet(null)}>
        <Body>This removes your streak, answers, share links, friends, chats and game nights for good. Computer players take your seats at any open tables. It can’t be undone.</Body>
        <Body small muted>If you subscribe to Daily Rack Plus, cancel it in your App Store or Google Play settings first: deleting your data here doesn’t stop the subscription.</Body>
        <Button title="Delete everything" variant="danger" loading={deleting} onPress={deleteEverything} />
        <Button title="Keep my data" variant="text" onPress={() => setSheet(null)} />
      </Sheet>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 12, fontSize: 17, color: colors.ink, marginTop: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  statValue: { fontFamily: fonts.serif, fontSize: 32, color: colors.primary },
  statLabel: { fontSize: 14, color: colors.muted },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#EBE8DF', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
});
