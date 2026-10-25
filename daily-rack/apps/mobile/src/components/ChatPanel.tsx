import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { api, type Message, type Profile } from '../lib/api.ts';
import { useRealtimeMessages } from '../lib/realtime.tsx';
import { useSafety } from '../lib/safety.tsx';
import { useSession } from '../lib/session.tsx';
import { colors } from '../theme.ts';
import { Body, ErrorPanel, Icon, Loading } from './ui.tsx';

const MAX = 500;

/** Messages for one conversation (direct, table or game night), live over the socket. */
export function ChatPanel({ conversationId, emptyText = 'No messages yet. Say hello.', height }: { conversationId: string; emptyText?: string; height?: number }) {
  const { principalId } = useSession();
  const { guard, openMessage, version } = useSafety();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<ScrollViewInstance>(null);

  const load = useCallback(() => {
    api
      .messages(conversationId)
      .then((r) => {
        setMessages(r.messages);
        setPeople(r.people);
        setError(null);
        void api.markRead(conversationId).catch(() => undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, [conversationId]);
  // Reload after a block or report so hidden messages disappear.
  useEffect(load, [load, version]);

  useRealtimeMessages((m) => {
    if (m.type !== 'message' || m.conversationId !== conversationId) return;
    const incoming = m.message as Message;
    if (incoming.senderId && !people[incoming.senderId]) {
      load();
      return;
    }
    setMessages((prev) => (prev && !prev.some((x) => x.id === incoming.id) ? [...prev, incoming] : prev));
    void api.markRead(conversationId).catch(() => undefined);
  });

  useEffect(() => {
    if (messages?.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await guard(() => api.sendMessage(conversationId, body));
      if (!message) return;
      setDraft('');
      setMessages((prev) => (prev && !prev.some((x) => x.id === message.id) ? [...prev, message] : prev));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ gap: 10 }, height ? { height } : { flex: 1 }]}>
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!messages && !error ? (
        <Loading label="Loading messages" />
      ) : (
        <ScrollView ref={list} style={{ flex: 1 }} nestedScrollEnabled contentContainerStyle={{ gap: 8, paddingVertical: 4, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {(messages ?? []).length === 0 && (
            <Body muted center>
              {emptyText}
            </Body>
          )}
          {(messages ?? []).map((item) => {
            const mine = item.senderId === principalId;
            const sender = item.senderId ? people[item.senderId] : null;
            return (
              <View key={item.id} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
                <Pressable
                  style={[styles.bubble, mine ? styles.mine : styles.theirs]}
                  accessibilityRole={mine ? 'text' : 'button'}
                  accessibilityLabel={`${mine ? 'You' : (sender?.name ?? 'Someone')}: ${item.body}`}
                  accessibilityHint={mine ? undefined : 'Opens options to report the message or block the sender'}
                  disabled={mine || !item.senderId}
                  onPress={() => item.senderId && openMessage({ id: item.id, senderId: item.senderId, name: sender?.name ?? 'this player', body: item.body })}
                  onLongPress={() => item.senderId && !mine && openMessage({ id: item.id, senderId: item.senderId, name: sender?.name ?? 'this player', body: item.body })}
                >
                  {!mine && <Text style={[styles.sender, { color: sender?.color ?? colors.muted }]}>{sender?.name ?? 'Someone'}</Text>}
                  <Text style={[styles.text, mine && { color: '#fff' }]}>{item.body}</Text>
                  <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>{new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.composer}>
        <TextInput
          testID="chat-input"
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, MAX))}
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
          accessibilityLabel="Message"
          onSubmitEditing={send}
          blurOnSubmit={false}
          returnKeyType="send"
          onKeyPress={(e) => {
            // Enter sends on the web; Shift+Enter keeps a new line.
            const key = e.nativeEvent as { key: string; shiftKey?: boolean };
            if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              void send();
            }
          }}
        />
        <Pressable testID="chat-send" accessibilityRole="button" accessibilityLabel="Send" onPress={send} disabled={!draft.trim() || sending} style={[styles.send, (!draft.trim() || sending) && { opacity: 0.4 }]}>
          <Icon name="send" color="#fff" size={20} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { fontSize: 12, fontWeight: '700' },
  text: { fontSize: 16, lineHeight: 22, color: colors.ink },
  time: { fontSize: 11, color: colors.muted, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, fontSize: 16, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
