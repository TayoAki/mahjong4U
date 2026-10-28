import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { PASS_SIZE, isPassable, spokenLabel, type PublicPuzzle } from '@daily-rack/core';
import { DAILY_SEAT, dealTiles, passTarget } from '@daily-rack/core/mahjong';
import { ApiError, api } from '../lib/api.ts';
import { draftKey, newKey, readJson, remove, writeJson, type Draft } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { playSound } from '../lib/sounds.ts';
import { Button, Chip, ErrorPanel, Notice, Row } from './ui.tsx';
import { TileButton } from './Tile.tsx';
import { Rack, type RackItem } from '../game/Rack.tsx';
import { useAfterFirstRender } from './Arrive.tsx';
import { DailyBoard, Status, TableFrame, barStyles, charlestonPhase, dailyView, feel, playerName, useDailyRack, useDailyTable } from '../daily/DailyTable.tsx';
import { colors } from '../theme.ts';

/**
 * Today's rack as the moment the first Charleston starts: the table, the three other
 * players waiting on you, and your thirteen tiles on your rack. Pick what you're aiming
 * for, tap three tiles (drag to arrange them, as at a game) and pass right.
 */
export function RackPlay({
  puzzle,
  shareToken,
  source,
  header,
  top,
  onSubmitted,
}: {
  puzzle: PublicPuzzle;
  shareToken?: string;
  source: 'today' | 'shared-link';
  header: ReactNode;
  /** Shown above the table on a phone, beside it on a big screen. */
  top?: ReactNode;
  onSubmitted: (attemptId: string) => void;
}) {
  const key = draftKey(puzzle.revisionId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sizes = useDailyTable();
  const ready = useAfterFirstRender();
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

  // The puzzle's tiles as engine tiles, so the rack and table can show them like a game's.
  const ids = useMemo(() => dealTiles(puzzle.tiles), [puzzle.tiles]);
  const byTile = useMemo(() => new Map(puzzle.tiles.map((t) => [ids.get(t.instanceId)!, t])), [puzzle.tiles, ids]);
  const deal = useMemo(() => [...byTile.keys()], [byTile]);
  const rack = useDailyRack(puzzle.revisionId, deal);
  if (!draft) return null;

  const selected = draft.selected.filter((id) => ids.has(id));
  const chosen = selected.map((id) => ids.get(id)!);
  const section = puzzle.sections.find((s) => s.id === draft.sectionId) ?? null;
  const canSubmit = section !== null && selected.length === PASS_SIZE && !submitting;
  const say = (text: string) => AccessibilityInfo.announceForAccessibility(text);
  // A changed answer gets a fresh request key; retrying the same answer keeps its key.
  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch, idempotencyKey: newKey() } : d));
  const right = playerName(passTarget(DAILY_SEAT, 'right'));
  const nameOf = (tile: number) => byTile.get(tile)?.spokenLabel ?? spokenLabel(byTile.get(tile)?.faceCode ?? '');

  const unchoose = (tile: number) => {
    const id = byTile.get(tile)?.instanceId;
    if (!id) return;
    setNotice(null);
    update({ selected: selected.filter((s) => s !== id) });
    say(`${nameOf(tile)} returned to your rack.`);
  };

  const toggle = (tile: number) => {
    const t = byTile.get(tile);
    if (!t || submitting) return;
    if (selected.includes(t.instanceId)) {
      unchoose(tile);
      return;
    }
    if (!isPassable(t.faceCode)) {
      setNotice('Jokers can’t be passed. Choose another tile.');
      say('Jokers can never be passed.');
      return;
    }
    if (selected.length >= PASS_SIZE) {
      setNotice('Choose 3 tiles. Tap one in your pass to swap it out.');
      say('Your pass is full. Tap a tile in your pass to swap it out.');
      return;
    }
    setNotice(null);
    feel('pick');
    playSound('tap');
    update({ selected: [...selected, t.instanceId] });
    say(`${nameOf(tile)}, selected, pass slot ${selected.length + 1} of 3.`);
  };

  const submit = async () => {
    if (!section || selected.length !== PASS_SIZE) return;
    setSubmitting(true);
    setError(null);
    feel('place');
    playSound('pass');
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

  const items: RackItem[] = rack.tiles.map((tile) => {
    const passable = isPassable(byTile.get(tile)?.faceCode ?? '');
    const picked = chosen.includes(tile);
    return {
      tile,
      label: `${nameOf(tile)}${picked ? ', chosen to pass' : ''}${passable ? '' : ', cannot be passed'}`,
      selected: picked,
      highlight: false,
      badge: passable ? undefined : 'Keep',
    };
  });

  const left = PASS_SIZE - selected.length;
  // The three you're passing, small beside the Pass button.
  const slot = Math.max(30, Math.round(sizes.tileWidth * 0.6));
  const reason = left > 0 ? `Choose ${left} more tile${left === 1 ? '' : 's'} to pass.` : !section ? 'Pick what you’re aiming for, then pass.' : 'Your first answer is the one that counts.';

  const bar = (
    <View style={{ gap: 8 }}>
      <Status testID="rack-status" detail={left > 0 ? undefined : reason}>
        {left > 0 ? `First Charleston · Pass right · choose ${left}` : `First Charleston · Pass right to ${right}`}
      </Status>
      <Text style={styles.ask}>What are you aiming for?</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Section to aim for">
        {puzzle.sections.map((s) => (
          <Chip key={s.id} label={s.label} selected={draft.sectionId === s.id} onPress={() => update({ sectionId: s.id })} style={styles.chip} />
        ))}
      </View>
      <Row gap={10}>
        <View style={styles.slots} testID="pass-slots">
          {[0, 1, 2].map((i) => {
            const tile = chosen[i];
            return tile !== undefined ? (
              <TileButton key={tile} face={byTile.get(tile)!.faceCode} width={slot} label={`${nameOf(tile)}, in pass slot ${i + 1} of 3. Tap to return it.`} onPress={() => unchoose(tile)} />
            ) : (
              <View key={`slot-${i}`} style={[styles.slot, { width: slot, height: Math.round(slot * 1.3) }]} accessible accessibilityLabel={`Pass slot ${i + 1} of 3, empty`}>
                <Text style={styles.slotText}>{i + 1}</Text>
              </View>
            );
          })}
        </View>
        <Button style={{ flex: 1 }} title="Pass" icon={submitting ? undefined : 'arrow'} disabled={!canSubmit} loading={submitting} onPress={submit} hint={reason} testID="submit-pass" />
      </Row>
      {error && <ErrorPanel message={error} onRetry={submit} />}
      {notice && (
        <Text style={[barStyles.tip, barStyles.tipWarn]} testID="rack-notice">
          {notice}
        </Text>
      )}
      <Row style={{ justifyContent: 'space-between' }} gap={4}>
        <Text style={barStyles.mine} testID="pass-count">
          You · South · {selected.length} of 3 chosen
        </Text>
        <Button variant="text" compact icon="sort" title={rack.label} hint="Changes the order of your tiles" onPress={rack.nextOrder} testID="rack-order" />
      </Row>
      {rack.hint && (
        <Text style={styles.arrangeHint} testID="arrange-hint">
          Drag tiles to arrange them. Tap three to pass.
        </Text>
      )}
      <View accessibilityLabel="Your deal">
        <Rack items={items} tileWidth={sizes.tileWidth} tapsDisabled={submitting} animate={ready} onTap={toggle} onArrange={rack.arrange} onLift={() => feel('pick')} />
      </View>
    </View>
  );

  return (
    <TableFrame
      header={header}
      top={top}
      left={!puzzle.review.teacherReviewed && <Notice tone="warn">Practice rack: this suggestion has not been reviewed by a teacher yet.</Notice>}
      large={sizes.large}
      board={
        <DailyBoard
          view={dailyView({ hand: deal, phase: charlestonPhase(submitting ? [] : [DAILY_SEAT]) })}
          caption={`${puzzle.title} · ${source === 'shared-link' ? 'A shared rack' : 'Today’s rack'}`}
          width={sizes.boardWidth}
          large={sizes.large}
        />
      }
      bar={bar}
    />
  );
}

const styles = StyleSheet.create({
  ask: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, flexBasis: '30%' },
  slots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  slot: { borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B8C2B9', alignItems: 'center', justifyContent: 'center' },
  slotText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  arrangeHint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
