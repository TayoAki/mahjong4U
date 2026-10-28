import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type Leaderboard, type LeaderboardEntry } from '../lib/api.ts';
import { useSafety } from '../lib/safety.tsx';
import { Avatar, Body, ErrorPanel, Loading, Notice, Screen, Segmented, TopBar } from '../components/ui.tsx';
import { colors } from '../theme.ts';

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Ranked players by rating, and this week's biggest winners in ranked games. */
export default function LeaderboardScreen() {
  const router = useRouter();
  const { openPlayer } = useSafety();
  const [board, setBoard] = useState<'rating' | 'weekly'>('rating');
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .leaderboard(board)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [board]);
  useFocusEffect(load);

  const row = (e: LeaderboardEntry, pinned = false) => (
    <Pressable
      key={`${pinned ? 'you-' : ''}${e.player.id}`}
      accessibilityRole={e.isYou ? 'text' : 'button'}
      accessibilityLabel={`Number ${e.rank}, ${e.isYou ? 'you' : e.player.name}, ${board === 'rating' ? `rating ${e.score}` : `${formatScore(e.score)} points this week`}, ${e.games} games`}
      disabled={e.isYou}
      onPress={() => openPlayer({ id: e.player.id, name: e.player.name })}
      style={[styles.row, e.isYou && styles.you]}
      testID={e.isYou ? 'leaderboard-you' : undefined}
    >
      <Text style={styles.rank}>{e.rank}</Text>
      <Avatar name={e.player.name} color={e.player.color} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {e.isYou ? `${e.player.name} (you)` : e.player.name}
        </Text>
        <Body small muted>
          {e.games} {e.games === 1 ? 'game' : 'games'} · {e.wins} won
        </Body>
      </View>
      <Text style={styles.score}>{board === 'rating' ? e.score : formatScore(e.score)}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <TopBar title="Leaderboard" onBack={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />
      <Segmented
        label="Leaderboard"
        value={board}
        onChange={(v) => {
          setData(null);
          setBoard(v);
        }}
        options={[
          { value: 'rating', label: 'Rating' },
          { value: 'weekly', label: 'This week' },
        ]}
      />
      <Body small muted>
        {board === 'rating'
          ? 'Ratings move after every ranked game: beat stronger players to climb faster. You appear after 3 ranked games.'
          : 'Points won in ranked games since Monday. Starts fresh every week.'}
      </Body>
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!data && !error && <Loading label="Loading the leaderboard" />}
      {data && data.entries.length === 0 && <Notice>No ranked games {board === 'weekly' ? 'this week' : 'yet'}. Play a ranked game from the Play tab to be first.</Notice>}
      {data && (
        <View style={{ gap: 6 }} testID="leaderboard-list">
          {data.entries.map((e) => row(e))}
          {data.you && !data.entries.some((e) => e.isYou) && (
            <>
              <Text style={styles.gap}>…</Text>
              {row(data.you, true)}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12 },
  you: { borderColor: colors.primary, backgroundColor: colors.pink },
  rank: { width: 28, fontSize: 16, fontWeight: '800', color: colors.muted, textAlign: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  score: { fontSize: 18, fontWeight: '800', color: colors.primary },
  gap: { textAlign: 'center', color: colors.muted },
});
