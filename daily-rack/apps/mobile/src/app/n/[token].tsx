import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, type InvitePreview } from '../../lib/api.ts';
import { formatWhen } from '../../lib/dates.ts';
import { Avatar, Body, Button, Card, Display, ErrorPanel, Loading, Row, Screen, TopBar } from '../../components/ui.tsx';
import { colors } from '../../theme.ts';

/** Game night invite link: a preview, then one tap to join and vote. */
export default function NightInviteScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .invite(token)
      .then(setInvite)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const night = await api.joinNight(token);
      router.replace(`/night/${night.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="You’re invited" onBack={() => router.replace('/nights')} />
      {error && <ErrorPanel message={error} />}
      {!invite && !error && <Loading label="Opening the invite" />}
      {invite && (
        <>
          <Card tone="felt" style={{ gap: 10 }}>
            <Row gap={10}>
              <Avatar name={invite.host.name} color={invite.host.color} size={40} />
              <Body style={{ color: colors.feltText }}>{invite.host.name} is hosting</Body>
            </Row>
            <Display size={32} style={{ color: colors.feltText }}>
              {invite.title}
            </Display>
            {invite.location && <Body style={{ color: colors.feltText }}>{invite.location}</Body>}
          </Card>
          <View style={{ gap: 6 }}>
            <Body bold>{invite.status === 'confirmed' ? 'When' : 'Times on the table'}</Body>
            {invite.slots.map((s) => (
              <Body key={s.id}>{formatWhen(s.startsAt, invite.timeZone)}</Body>
            ))}
          </View>
          <Button title="Join and RSVP" icon="arrow" onPress={join} loading={busy} testID="join-night" />
          <Body small muted center>
            You’ll be able to vote on times, chat with the group and add it to your calendar.
          </Body>
        </>
      )}
    </Screen>
  );
}
