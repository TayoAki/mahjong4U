import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ApiError, api, getConfig, type NightDetail, type Rsvp } from '../../lib/api.ts';
import { addToCalendar } from '../../lib/calendar';
import { publicLink } from '../../lib/config.ts';
import { formatWhen } from '../../lib/dates.ts';
import { useRealtimeMessages } from '../../lib/realtime.tsx';
import { useSafety } from '../../lib/safety.tsx';
import { useSession } from '../../lib/session.tsx';
import { shareLink } from '../../lib/share.ts';
import { track } from '../../lib/analytics.ts';
import { ChatPanel } from '../../components/ChatPanel.tsx';
import { Avatar, Badge, Body, Button, Card, Display, ErrorPanel, Heading, Icon, IconButton, Loading, Notice, Row, Screen, Segmented, Sheet, TopBar } from '../../components/ui.tsx';
import { colors } from '../../theme.ts';
import { scheduleNightReminder } from '../../lib/reminders.ts';

const WINDS = ['East', 'South', 'West', 'North'];
const RSVP_LABEL: Record<Rsvp, string> = { pending: 'No answer yet', yes: 'Going', maybe: 'Maybe', no: 'Can’t make it' };

/** Suggestions for a short or long table. House rules vary; these are starting points, not rulings. */
const VARIANT_COPY: Record<NightDetail['variant'], string> = {
  full: 'A full table. With five or more, take turns sitting out a hand.',
  three:
    'Three going. Many groups play three-handed by leaving out the across pass in the Charleston, or you can play online with a computer player in the fourth seat. Agree on house rules before the first hand.',
  two: 'Two going. Some groups play a two-handed game and skip the Charleston, or play online and let computer players fill the other two seats.',
  short: 'Waiting on answers. You need at least two people to play.',
};

export default function NightScreen() {
  const { id = '', created } = useLocalSearchParams<{ id: string; created?: string }>();
  const router = useRouter();
  const { principalId } = useSession();
  const { openPlayer, version } = useSafety();
  const [night, setNight] = useState<NightDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(created ? 'Game night created. Send the invite so everyone can vote.' : null);
  const [mode, setMode] = useState<'live' | 'turn'>('live');
  const [cancelling, setCancelling] = useState(false);

  const loaded = useRef(false);
  const load = useCallback(() => {
    api
      .night(id)
      .then((n) => {
        loaded.current = true;
        setNight(n);
        setError(null);
        // Pip reminds everyone going, two hours before (cancelled if plans change).
        const me = n.members.find((m) => m.id === principalId);
        const when = n.status === 'confirmed' ? (n.slots.find((s) => s.id === n.confirmedSlot)?.startsAt ?? null) : null;
        void scheduleNightReminder({ id: n.id, title: n.title, when, going: me?.rsvp === 'yes', location: n.location }).catch(() => undefined);
      })
      .catch((e: Error) => {
        // Blocking the host (or being removed) takes you out of the night.
        if (e instanceof ApiError && (e.status === 403 || e.status === 404) && loaded.current) router.replace('/nights');
        else setError(e.message);
      });
  }, [id, principalId]);
  useEffect(load, [load, version]);
  useRealtimeMessages((m) => {
    if (m.type === 'night' && m.nightId === id) load();
  });

  const run = async (key: string, fn: () => Promise<NightDetail | unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'members' in r) setNight(r as NightDetail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/nights'));
  if (!night) {
    return error ? (
      <Screen>
        <TopBar title="Game night" onBack={back} />
        <ErrorPanel message={error} onRetry={load} />
      </Screen>
    ) : (
      <Loading label="Opening game night" />
    );
  }

  const me = night.members.find((m) => m.id === principalId);
  const myVotes = me?.votes ?? [];
  const confirmed = night.slots.find((s) => s.id === night.confirmedSlot) ?? null;
  const nameOf = (pid: string) => night.members.find((m) => m.id === pid)?.name ?? 'Player';

  const invite = async () => {
    const config = await getConfig();
    const url = publicLink(night.invitePath, config.publicBaseUrl);
    const when = confirmed ? formatWhen(confirmed.startsAt, night.timeZone) : 'Vote on a time';
    const result = await shareLink({ title: night.title, message: `${night.title}: ${when}. Tap to RSVP.`, url });
    track('night_invite_shared', { result });
    if (result === 'copied') setNotice('Invite link copied. Paste it into your group chat.');
  };

  const toggleVote = (slotId: string) => {
    const votes = myVotes.includes(slotId) ? myVotes.filter((v) => v !== slotId) : [...myVotes, slotId];
    void run(`vote-${slotId}`, () => api.respondNight(id, { votes }));
  };

  return (
    <Screen>
      <TopBar title="Game night" onBack={back} />
      {error && <ErrorPanel message={error} onRetry={load} />}
      {notice && <Notice>{notice}</Notice>}

      <Card tone="felt" style={{ gap: 8 }}>
        <Row gap={8}>
          <Badge label={night.status === 'confirmed' ? 'Confirmed' : night.status === 'cancelled' ? 'Cancelled' : 'Voting'} tone={night.status === 'confirmed' ? 'sage' : 'pink'} />
          {night.isHost && <Badge label="You’re hosting" tone="ink" />}
        </Row>
        <Display size={32} style={{ color: colors.feltText }}>
          {night.title}
        </Display>
        <Text style={styles.feltText}>{confirmed ? formatWhen(confirmed.startsAt, night.timeZone) : `Voting on ${night.slots.length} ${night.slots.length === 1 ? 'time' : 'times'}`}</Text>
        {night.location && <Text style={styles.feltText}>{night.location}</Text>}
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Button variant="light" compact icon="share" title="Invite people" onPress={invite} testID="invite-night" />
          {confirmed && (
            <Button
              variant="light"
              compact
              icon="calendar"
              title="Add to calendar"
              onPress={() => run('calendar', () => addToCalendar(id))}
              loading={busy === 'calendar'}
              testID="add-calendar"
            />
          )}
        </Row>
      </Card>

      {night.status !== 'cancelled' && (
        <View style={{ gap: 8 }}>
          <Heading>Are you in?</Heading>
          <Segmented
            label="Your answer"
            value={me?.rsvp === 'pending' || !me ? ('' as 'yes') : (me.rsvp as 'yes' | 'maybe' | 'no')}
            onChange={(rsvp) => run('rsvp', () => api.respondNight(id, { rsvp }))}
            options={[
              { value: 'yes', label: 'Going' },
              { value: 'maybe', label: 'Maybe' },
              { value: 'no', label: 'Can’t' },
            ]}
          />
        </View>
      )}

      {night.status === 'polling' && (
        <View style={{ gap: 8 }}>
          <Heading>Which times work?</Heading>
          <Body small muted>
            Tap every time you could make.{night.isHost ? ' Lock one in when the votes are in.' : ''}
          </Body>
          {night.slots.map((s, i) => {
            const voted = myVotes.includes(s.id);
            return (
              <View key={s.id} style={[styles.slot, s.leading && styles.leading]}>
                <Pressable
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
                  onPress={() => toggleVote(s.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: voted }}
                  accessibilityLabel={`${formatWhen(s.startsAt, night.timeZone)}, ${s.votes} votes`}
                  testID={`vote-${i}`}
                >
                  <View style={[styles.check, voted && styles.checkOn]}>{voted && <Icon name="check" color="#fff" size={16} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotText}>{formatWhen(s.startsAt, night.timeZone)}</Text>
                    <Body small muted>
                      {s.votes} {s.votes === 1 ? 'vote' : 'votes'}
                      {s.leading ? (night.tied ? ' · tied' : ' · leading') : ''}
                    </Body>
                  </View>
                </Pressable>
                {night.isHost && (
                  <Button compact variant={s.leading ? 'primary' : 'secondary'} title="Lock in" loading={busy === `confirm-${s.id}`} onPress={() => run(`confirm-${s.id}`, () => api.confirmNight(id, s.id))} testID={`confirm-${i}`} />
                )}
              </View>
            );
          })}
        </View>
      )}

      {night.status === 'confirmed' && night.seats && night.seats.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Body bold>Seating for the first hand</Body>
          {night.seats.map((pid, i) => (
            <Body key={pid} small>
              {WINDS[i] ?? `Seat ${i + 1}`}: {pid === principalId ? 'You' : nameOf(pid)}
            </Body>
          ))}
          <Body small muted>
            Drawn at random from everyone going. East deals first.
          </Body>
        </Card>
      )}

      {night.status !== 'cancelled' && (
        <Card tone="sage" style={{ gap: 6 }}>
          <Body bold>
            {night.going} going
          </Body>
          <Body small>{VARIANT_COPY[night.variant]}</Body>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        <Heading>Who’s invited</Heading>
        {night.members.map((m) => (
          <View key={m.id} style={styles.member}>
            <Avatar name={m.name} color={m.color} size={36} online={m.online} />
            <Text style={styles.memberName} numberOfLines={1}>
              {m.id === principalId ? `${m.name} (you)` : m.name}
              {m.id === night.hostId ? ' · host' : ''}
            </Text>
            <Text style={[styles.rsvp, m.rsvp === 'yes' && { color: colors.online }, m.rsvp === 'no' && { color: colors.danger }]}>{RSVP_LABEL[m.rsvp]}</Text>
            {m.id !== principalId && <IconButton icon="more" label={`Report or block ${m.name}`} color={colors.muted} onPress={() => openPlayer(m)} />}
          </View>
        ))}
      </View>

      {night.status !== 'cancelled' && night.isHost && (
        <Card style={{ gap: 10 }}>
          <Body bold>Can’t meet in person?</Body>
          <Body small muted>
            Open an online table instead. Everyone going gets a held seat; computer players fill the rest.
          </Body>
          <Segmented
            label="Online pace"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'live', label: 'Live' },
              { value: 'turn', label: 'Turn-based' },
            ]}
          />
          <Button
            title="Play online instead"
            icon="play"
            variant="secondary"
            loading={busy === 'table'}
            onPress={async () => {
              setBusy('table');
              try {
                const t = await api.nightTable(id, mode);
                router.push(`/table/${t.table.id}`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
            testID="night-online"
          />
        </Card>
      )}

      <View style={{ gap: 8 }}>
        <Heading>Group chat</Heading>
        <ChatPanel conversationId={night.conversationId} height={340} emptyText="Who’s bringing snacks?" />
      </View>

      {night.isHost && night.status !== 'cancelled' && <Button title="Cancel this game night" variant="text" onPress={() => setCancelling(true)} />}

      <Sheet visible={cancelling} title="Cancel the game night?" onClose={() => setCancelling(false)}>
        <Body>Everyone invited will see it’s off. This can’t be undone.</Body>
        <Button
          title="Cancel game night"
          variant="danger"
          onPress={async () => {
            setCancelling(false);
            await run('cancel', () => api.cancelNight(id));
            router.replace('/nights');
          }}
        />
        <Button title="Keep it" variant="text" onPress={() => setCancelling(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feltText: { color: colors.feltText, fontSize: 16 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 12 },
  leading: { borderColor: colors.primary },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  memberName: { flex: 1, fontSize: 16, color: colors.ink, fontWeight: '600' },
  rsvp: { fontSize: 14, fontWeight: '700', color: colors.muted },
});
