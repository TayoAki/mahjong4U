import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLayout } from '../lib/layout.ts';
import { PASS_SIZE, isPassable, sortBySuit, spokenLabel, type PublicPuzzle } from '@daily-rack/core';
import { ApiError, api } from '../lib/api.ts';
import { draftKey, newKey, readJson, remove, writeJson, type Draft } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { Body, Button, Chip, Display, ErrorPanel, Icon, Notice } from './ui.tsx';
import { TileButton } from './Tile.tsx';
import { colors } from '../theme.ts';

/** Section chips, the 13-tile deal and the three-slot pass tray. Tap-only; no dragging needed. */
export function RackPlay({
  puzzle,
  shareToken,
  source,
  onSubmitted,
}: {
  puzzle: PublicPuzzle;
  shareToken?: string;
  source: 'today' | 'first-open' | 'shared-link';
  onSubmitted: (attemptId: string) => void;
}) {
  const key = draftKey(puzzle.revisionId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sorted, setSorted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trayError, setTrayError] = useState<string | null>(null);
  const { contentWidth } = useLayout();
  // Five to a row; on a tablet the tiles grow, but not past a comfortable size.
  const tileWidth = Math.min(84, Math.floor((contentWidth - 28 - 4 * 8) / 5));
  const loaded = useRef(false);

  useEffect(() => {
    readJson<Draft>(key, { sectionId: null, selected: [], idempotencyKey: newKey() }).then((d) => {
      loaded.current = true;
      setDraft(d);
    });
    track('rack_opened', { revisionId: puzzle.revisionId, source });
  }, [key, puzzle.revisionId, source]);

  useEffect(() => {
    if (loaded.current && draft) void writeJson(key, draft);
  }, [key, draft]);

  const byId = useMemo(() => new Map(puzzle.tiles.map((t) => [t.instanceId, t])), [puzzle.tiles]);
  if (!draft) return null;
  const selected = draft.selected.filter((id) => byId.has(id));
  const remaining = (sorted ? sortBySuit(puzzle.tiles) : puzzle.tiles).filter((t) => !selected.includes(t.instanceId));
  const section = puzzle.sections.find((s) => s.id === draft.sectionId) ?? null;
  const canSubmit = section !== null && selected.length === PASS_SIZE && !submitting;
  const say = (text: string) => AccessibilityInfo.announceForAccessibility(text);
  // A changed answer gets a fresh request key; retrying the same answer keeps its key.
  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch, idempotencyKey: newKey() } : d));

  const choose = (id: string) => {
    const tile = byId.get(id);
    if (!tile) return;
    if (!isPassable(tile.faceCode)) {
      setTrayError('Jokers can never be passed.');
      say('Jokers can never be passed.');
      return;
    }
    if (selected.length >= PASS_SIZE) {
      setTrayError('Choose 3 tiles. Tap one in your pass to swap it out.');
      say('Your pass is full. Tap a tile in your pass to swap it out.');
      return;
    }
    setTrayError(null);
    update({ selected: [...selected, id] });
    say(`${spokenLabel(tile.faceCode)}, selected, pass slot ${selected.length + 1} of 3.`);
  };

  const unchoose = (id: string) => {
    setTrayError(null);
    update({ selected: selected.filter((s) => s !== id) });
    const tile = byId.get(id);
    if (tile) say(`${spokenLabel(tile.faceCode)} returned to your rack.`);
  };

  const submit = async () => {
    if (!section || selected.length !== PASS_SIZE) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submit({ revisionId: puzzle.revisionId, sectionId: section.id, tileInstanceIds: selected, idempotencyKey: draft.idempotencyKey, shareToken });
      await remove(key);
      onSubmitted(res.attemptId);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_submitted' && typeof e.extra.attemptId === 'string') {
        await remove(key);
        onSubmitted(e.extra.attemptId);
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Your pass is saved; try again.');
      setSubmitting(false);
    }
  };

  const reason = !section ? 'Pick a section first.' : selected.length < PASS_SIZE ? `Choose ${PASS_SIZE - selected.length} more tile${PASS_SIZE - selected.length === 1 ? '' : 's'}.` : 'Your first answer is the one that counts.';

  return (
    <View style={{ gap: 18 }}>
      <View>
        <Display center>{puzzle.question}</Display>
        <Body center style={{ marginTop: 4 }}>
          {puzzle.prompt}
        </Body>
      </View>
      {!puzzle.review.teacherReviewed && <Notice tone="warn">Practice rack: this suggestion has not been reviewed by a teacher yet.</Notice>}

      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Section to aim for">
        {puzzle.sections.map((s) => (
          <Chip key={s.id} label={s.label} selected={draft.sectionId === s.id} onPress={() => update({ sectionId: s.id })} style={{ flexBasis: '30%' }} />
        ))}
      </View>

      <View style={styles.felt} accessibilityLabel="Your deal">
        <View style={styles.feltHead}>
          <Text style={styles.feltLabel}>YOUR DEAL · {puzzle.tiles.length} TILES</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort by suit"
            accessibilityState={{ selected: sorted }}
            onPress={() => setSorted((v) => !v)}
            style={[styles.sort, sorted && { backgroundColor: colors.feltText }]}
          >
            <Text style={[styles.sortText, sorted && { color: colors.felt }]}>Sort</Text>
            <Icon name="sort" size={18} color={sorted ? colors.felt : colors.feltText} />
          </Pressable>
        </View>
        <View style={styles.deal}>
          {remaining.map((t) => (
            <TileButton
              key={t.instanceId}
              face={t.faceCode}
              width={tileWidth}
              label={`${t.spokenLabel ?? spokenLabel(t.faceCode)}${isPassable(t.faceCode) ? '' : ', cannot be passed'}`}
              badge={isPassable(t.faceCode) ? undefined : 'Keep'}
              onPress={() => choose(t.instanceId)}
            />
          ))}
        </View>
        <View style={[styles.tray, trayError ? { borderColor: colors.danger } : null]}>
          <View style={styles.trayInner}>
            <View style={styles.trayHead}>
              <Text style={styles.trayLabel}>YOUR PASS</Text>
              <Text style={styles.trayCount}>{selected.length} of 3 selected</Text>
            </View>
            <View style={styles.slots}>
              {[0, 1, 2].map((i) => {
                const tile = selected[i] ? byId.get(selected[i]!) : undefined;
                return tile ? (
                  <TileButton
                    key={tile.instanceId}
                    face={tile.faceCode}
                    width={tileWidth * 1.15}
                    label={`${spokenLabel(tile.faceCode)}, in pass slot ${i + 1} of 3. Tap to return it.`}
                    onPress={() => unchoose(tile.instanceId)}
                  />
                ) : (
                  <View key={`slot-${i}`} style={[styles.slot, { width: tileWidth * 1.15, height: tileWidth * 1.15 * 1.3 }]}>
                    <Text style={styles.slotText}>{i + 1}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
        <Text style={styles.feltHint}>{trayError ?? 'Tap a tile to pass it. Tap it again to change your mind.'}</Text>
      </View>

      {error && <ErrorPanel message={error} onRetry={submit} />}
      <Button title={submitting ? 'Locking in your pass…' : 'See the split'} icon={submitting ? undefined : 'arrow'} disabled={!canSubmit} loading={submitting} onPress={submit} hint={reason} testID="submit-pass" />
      <Body small muted center>
        {reason}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  felt: { backgroundColor: colors.felt, borderRadius: 24, padding: 14, gap: 14 },
  feltHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feltLabel: { color: colors.feltText, fontSize: 13, fontWeight: '700', letterSpacing: 1.6 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, minHeight: 40, paddingHorizontal: 12 },
  sortText: { color: colors.feltText, fontWeight: '600', fontSize: 14 },
  deal: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 12 },
  tray: { backgroundColor: colors.wood, borderRadius: 20, padding: 9, borderWidth: 2, borderColor: 'transparent' },
  trayInner: { backgroundColor: '#FBF6EA', borderRadius: 14, padding: 12, gap: 10 },
  trayHead: { flexDirection: 'row', justifyContent: 'space-between' },
  trayLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.4, color: colors.ink },
  trayCount: { fontSize: 14, color: colors.muted },
  slots: { flexDirection: 'row', justifyContent: 'space-evenly' },
  slot: { borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CDBF9F', backgroundColor: '#F3ECDC', alignItems: 'center', justifyContent: 'center' },
  slotText: { color: '#A39573', fontWeight: '700' },
  feltHint: { color: '#D8E3DC', textAlign: 'center', fontSize: 14 },
});
