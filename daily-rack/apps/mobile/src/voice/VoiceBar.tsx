import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TableSeat } from '../lib/api.ts';
import { Button, Icon, Row } from '../components/ui.tsx';
import { colors } from '../theme.ts';
import type { Voice } from './useVoice.ts';

/** Join, mute and leave the table's voice call, and see who's in it. */
export function VoiceBar({ voice, seats, me }: { voice: Voice; seats: TableSeat[]; me: string | null }) {
  const nameOf = (id: string) => seats.find((s) => s.principalId === id)?.name ?? 'Someone';
  const others = voice.members.filter((id) => id !== me);

  if (!voice.available) {
    return <Text style={styles.note}>Voice chat works in the full app and on the web.</Text>;
  }
  if (!voice.joined) {
    return (
      <View style={styles.bar}>
        <Row gap={10} style={{ flex: 1 }}>
          <Icon name="mic" size={20} />
          <Text style={styles.text} numberOfLines={2}>
            {others.length > 0 ? `${others.map(nameOf).join(', ')} ${others.length === 1 ? 'is' : 'are'} talking` : 'Talk with your table'}
          </Text>
        </Row>
        <Button title="Join voice" compact onPress={voice.join} loading={voice.joining} testID="voice-join" />
        {voice.error && <Text style={styles.error}>{voice.error}</Text>}
      </View>
    );
  }
  return (
    <View style={styles.bar} testID="voice-bar">
      <Row gap={6} style={{ flex: 1, flexWrap: 'wrap' }}>
        {voice.peers.length === 0 && <Text style={styles.text}>You’re in voice chat. Waiting for others to join.</Text>}
        {voice.peers.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => voice.togglePeer(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`${nameOf(p.id)}, ${p.state === 'connected' ? 'connected' : p.state === 'failed' ? 'couldn’t connect' : 'connecting'}${p.muted ? ', muted for you' : ''}. Tap to ${p.muted ? 'unmute' : 'mute'}`}
            style={[styles.peer, p.muted && { opacity: 0.55 }]}
            testID={`voice-peer-${p.state}`}
          >
            <View style={[styles.dot, { backgroundColor: p.state === 'connected' ? colors.online : p.state === 'failed' ? colors.danger : colors.gold }]} />
            <Text style={styles.peerName} numberOfLines={1}>
              {nameOf(p.id)}
            </Text>
            {p.muted && <Icon name="mute" size={14} color={colors.muted} />}
          </Pressable>
        ))}
      </Row>
      <Row gap={4}>
        <Button title={voice.muted ? 'Unmute' : 'Mute'} icon={voice.muted ? 'mute' : 'mic'} variant="secondary" compact onPress={voice.toggleMute} testID="voice-mute" />
        <Button title="Leave" variant="text" compact onPress={voice.leave} testID="voice-leave" />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: colors.sage, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  text: { flexShrink: 1, fontSize: 14, color: colors.ink },
  note: { fontSize: 13, color: colors.muted },
  error: { width: '100%', fontSize: 13, color: colors.danger },
  peer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  peerName: { fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 },
});
