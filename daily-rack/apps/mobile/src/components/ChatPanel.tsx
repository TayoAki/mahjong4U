import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { api, type Message, type Profile } from '../lib/api.ts';
import { useRealtimeMessages } from '../lib/realtime.tsx';
import { COMMUNITY_RULES, NameField, useSafety } from '../lib/safety.tsx';
import { useSession } from '../lib/session.tsx';
import { colors } from '../theme.ts';
import { Body, Button, ErrorPanel, Icon, Loading } from './ui.tsx';

const MAX = 500;

/** Messages for one conversation (direct, table or game night), live over the socket. */
export function ChatPanel({
  conversationId,
  emptyText = 'No messages yet. Say hello.',
  height,
  phrases,
}: {
  conversationId: string;
  emptyText?: string;
  height?: number;
  /** At matched tables strangers send these set phrases instead of typing. */
  phrases?: string[];
}) {
  const { principalId } = useSession();
  const { guard, openMessage, version, rulesAccepted, askName, agreeInline } = useSafety();
  const [name, setName] = useState('');
  const [agreeing, setAgreeing] = useState(false);
  const [agreeError, setAgreeError] = useState<string | null>(null);
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

  const send = async (text?: string) => {
    const body = (text ?? draft).trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await guard(() => api.sendMessage(conversationId, body));
      if (!message) return;
      if (text === undefined) setDraft('');
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
      {phrases && rulesAccepted ? (
        <View style={styles.phrases} testID="chat-phrases">
          {phrases.map((p) => (
            <Pressable key={p} onPress={() => void send(p)} disabled={sending} accessibilityRole="button" accessibilityLabel={`Send: ${p}`} style={styles.phrase}>
              <Text style={styles.phraseText}>{p}</Text>
            </Pressable>
          ))}
        </View>
      ) : !rulesAccepted || askName ? (
        // Asked right here rather than in another sheet, which can open behind this one.
        <View style={styles.ask} testID="chat-ask">
          {!rulesAccepted && (
            <>
              <Body bold>Before you chat, agree to the community rules:</Body>
              {COMMUNITY_RULES.map((rule) => (
                <Body key={rule} small>
                  • {rule}
                </Body>
              ))}
            </>
          )}
          {askName && <NameField value={name} onChange={setName} error={agreeError} />}
          {!askName && agreeError && <ErrorPanel message={agreeError} />}
          <Button
            title={rulesAccepted ? 'Save name' : 'I agree'}
            icon="check"
            compact
            loading={agreeing}
            disabled={rulesAccepted && !name.trim()}
            onPress={async () => {
              setAgreeing(true);
              setAgreeError(await agreeInline(name));
              setAgreeing(false);
            }}
            testID="agree-rules-inline"
          />
          {rulesAccepted && <Button title="Keep my guest name" variant="text" compact onPress={() => void agreeInline('')} />}
        </View>
      ) : (
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
            onSubmitEditing={() => void send()}
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
          <Pressable testID="chat-send" accessibilityRole="button" accessibilityLabel="Send" onPress={() => void send()} disabled={!draft.trim() || sending} style={[styles.send, (!draft.trim() || sending) && { opacity: 0.4 }]}>
            <Icon name="send" color="#fff" size={20} />
          </Pressable>
        </View>
      )}
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
  ask: { gap: 8, backgroundColor: colors.sage, borderRadius: 14, padding: 12 },
  phrases: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phrase: { backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  phraseText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, fontSize: 16, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
