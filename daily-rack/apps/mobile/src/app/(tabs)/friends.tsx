import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, getConfig, type FriendsOverview, type InboxEntry, type Profile } from '../../lib/api.ts';
import { publicLink } from '../../lib/config.ts';
import { useRealtimeMessages } from '../../lib/realtime.tsx';
import { copyText, shareLink } from '../../lib/share.ts';
import { track } from '../../lib/analytics.ts';
import { Avatar, Badge, Body, Button, Card, Display, ErrorPanel, Eyebrow, Heading, IconButton, Loading, Notice, Row, Screen, Sheet } from '../../components/ui.tsx';
import { colors, fonts } from '../../theme.ts';

export default function FriendsScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Profile | null>(null);

  const load = useCallback(() => {
    Promise.all([api.friends(), api.inbox()])
      .then(([f, i]) => {
        setOverview(f);
        setInbox(i.conversations);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);
  useRealtimeMessages((m) => {
    if (m.type === 'friends' || m.type === 'message' || m.type === 'presence') load();
  });

  const add = async () => {
    setAdding(true);
    setMessage(null);
    setError(null);
    try {
      const r = await api.addFriend(code.trim().toUpperCase());
      track('friend_added', { result: r.result });
      setMessage(
        r.result === 'accepted'
          ? `You and ${r.friend.name} are now friends.`
          : r.result === 'already-friends'
            ? `You're already friends with ${r.friend.name}.`
            : `Request sent to ${r.friend.name}. They'll see it on their Friends tab.`,
      );
      setCode('');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const shareCode = async () => {
    if (!overview) return;
    const config = await getConfig();
    const url = publicLink(`/f/${overview.me.code}`, config.publicBaseUrl);
    const result = await shareLink({ title: 'Add me on Daily Rack', message: `Let's play mahjong. Add me on Daily Rack with code ${overview.me.code}.`, url });
    if (result === 'copied') setMessage('Invite link copied.');
  };

  const chat = async (friend: Profile) => {
    try {
      const { conversationId } = await api.directConversation(friend.id);
      router.push({ pathname: '/chat/[conversationId]', params: { conversationId, name: friend.name } });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!overview && !error) return <Loading label="Finding your friends" />;

  const unreadFor = (id: string) => inbox.find((c) => c.friend.id === id)?.unread ?? 0;

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Eyebrow>Your mahjong group</Eyebrow>
        <Display size={38}>Friends</Display>
      </View>
      {error && <ErrorPanel message={error} onRetry={load} />}
      {message && <Notice>{message}</Notice>}

      {overview && (
        <>
          <Card tone="sage" style={{ gap: 10 }}>
            <Row gap={12}>
              <Avatar name={overview.me.name} color={overview.me.color} size={48} />
              <View style={{ flex: 1 }}>
                <Body bold>{overview.me.name}</Body>
                <Body small muted>
                  Your friend code
                </Body>
                <Text style={styles.code} selectable testID="my-friend-code">
                  {overview.me.code}
                </Text>
              </View>
            </Row>
            <Row gap={8}>
              <Button style={{ flex: 1 }} compact icon="share" title="Share invite" onPress={shareCode} />
              <Button
                style={{ flex: 1 }}
                compact
                variant="secondary"
                icon="copy"
                title="Copy code"
                onPress={() => {
                  void copyText(overview.me.code);
                  setMessage('Code copied.');
                }}
              />
            </Row>
          </Card>

          <View style={{ gap: 8 }}>
            <Heading>Add a friend</Heading>
            <View style={styles.addRow}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12))}
                placeholder="Their friend code"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
                accessibilityLabel="Friend code"
                onSubmitEditing={() => code.length >= 4 && add()}
                testID="friend-code-input"
              />
              <Button title="Add" compact disabled={code.length < 4} loading={adding} onPress={add} testID="add-friend" />
            </View>
          </View>

          {overview.incoming.length > 0 && (
            <View style={{ gap: 8 }}>
              <Heading>Requests</Heading>
              {overview.incoming.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Avatar name={p.name} color={p.color} size={40} />
                  <Text style={styles.name}>{p.name}</Text>
                  <Button
                    title="Accept"
                    compact
                    onPress={async () => {
                      await api.acceptFriend(p.id).catch((e: Error) => setError(e.message));
                      load();
                    }}
                    testID={`accept-${p.code}`}
                  />
                  <Button
                    title="Decline"
                    compact
                    variant="text"
                    onPress={async () => {
                      await api.removeFriend(p.id).catch((e: Error) => setError(e.message));
                      load();
                    }}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Heading>Friends</Heading>
            {overview.friends.length === 0 && <Body muted>Share your code with the people you play with. Once they add you, you can chat, plan game nights and play together.</Body>}
            {overview.friends.map((f) => {
              const unread = unreadFor(f.id);
              const last = inbox.find((c) => c.friend.id === f.id)?.last;
              return (
                <View key={f.id} style={styles.row}>
                  <Avatar name={f.name} color={f.color} size={42} online={f.online} />
                  <Pressable style={{ flex: 1 }} onPress={() => chat(f)} accessibilityRole="button" accessibilityLabel={`Chat with ${f.name}${unread ? `, ${unread} unread` : ''}`}>
                    <Row gap={6}>
                      <Text style={styles.name} numberOfLines={1}>
                        {f.name}
                      </Text>
                      {unread > 0 && <Badge label={`${unread} new`} />}
                    </Row>
                    <Body small muted numberOfLines={1}>
                      {last ? last.body : f.online ? 'Online now' : 'Tap to chat'}
                    </Body>
                  </Pressable>
                  <IconButton icon="chat" label={`Chat with ${f.name}`} onPress={() => chat(f)} />
                  <IconButton icon="play" label={`Play with ${f.name}`} color={colors.primary} onPress={() => router.push({ pathname: '/table/new', params: { friend: f.id } })} />
                  <IconButton icon="close" label={`Remove ${f.name}`} color={colors.muted} onPress={() => setRemoving(f)} />
                </View>
              );
            })}
          </View>

          {overview.outgoing.length > 0 && (
            <View style={{ gap: 8 }}>
              <Heading>Waiting on</Heading>
              {overview.outgoing.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Avatar name={p.name} color={p.color} size={36} />
                  <Text style={styles.name}>{p.name}</Text>
                  <Button
                    title="Cancel"
                    compact
                    variant="text"
                    onPress={async () => {
                      await api.removeFriend(p.id).catch((e: Error) => setError(e.message));
                      load();
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <Sheet visible={removing !== null} title={`Remove ${removing?.name ?? ''}?`} onClose={() => setRemoving(null)}>
        <Body>You'll stop seeing each other's online status, and your chat closes. You can add each other again any time.</Body>
        <Button
          title="Remove friend"
          variant="danger"
          onPress={async () => {
            if (removing) await api.removeFriend(removing.id).catch((e: Error) => setError(e.message));
            setRemoving(null);
            load();
          }}
        />
        <Button title="Keep" variant="text" onPress={() => setRemoving(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.caption, fontSize: 26, letterSpacing: 4, color: colors.ink },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 18, letterSpacing: 3, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
});
