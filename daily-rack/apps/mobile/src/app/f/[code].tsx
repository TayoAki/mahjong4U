import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api.ts';
import { useSession } from '../../lib/session.tsx';
import { track } from '../../lib/analytics.ts';
import { Body, Button, Card, Display, ErrorPanel, Screen, TopBar } from '../../components/ui.tsx';

/** Friend invite link: /f/CODE sends (or accepts) a friend request after one tap. */
export default function FriendInviteScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { profile } = useSession();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const own = profile?.code === code.toUpperCase();

  useEffect(() => setError(own ? 'This is your own invite link. Share it with friends so they can add you.' : null), [own]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.addFriend(code.toUpperCase());
      track('friend_added', { result: r.result, via: 'link' });
      setDone(r.result === 'requested' ? `Request sent to ${r.friend.name}.` : `You and ${r.friend.name} are friends.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Friend invite" onBack={() => router.replace('/friends')} />
      <Card tone="sage" style={{ gap: 8 }}>
        <Display size={30}>{done ?? 'Someone wants to play mahjong with you'}</Display>
        <Body muted>Friends can chat, see when each other are online, plan game nights and sit down at the same table.</Body>
      </Card>
      {error && <ErrorPanel message={error} />}
      <View style={{ gap: 10 }}>
        {!done && !own && <Button title="Add friend" icon="plus" onPress={add} loading={busy} testID="accept-invite" />}
        <Button title="Go to Friends" variant={done ? 'primary' : 'text'} onPress={() => router.replace('/friends')} />
      </View>
    </Screen>
  );
}
