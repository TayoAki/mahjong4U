import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { REASON_MAX_CHARS, VOICEOVER_MAX_SECONDS, buildClipTimeline, spokenLabel, type ClipTimeline } from '@daily-rack/core';
import { api, getConfig, type AppConfig, type ResultResponse } from '../lib/api.ts';
import { publicLink } from '../lib/config.ts';
import { PREFS_KEY, readPrefs, writeJson } from '../lib/storage.ts';
import { track } from '../lib/analytics.ts';
import { drawFrame, loadAssets, type CaptionStyle, type RenderAssets } from '../clip/renderer.web.ts';
import { ExportCancelled, canExportMp4, exportClip, type ExportResult } from '../clip/exporter.web.ts';
import { Body, Button, Card, ErrorPanel, Icon, Loading, Notice, Screen, Segmented, TopBar } from '../components/ui.tsx';
import { colors } from '../theme.ts';

interface Voice {
  url: string;
  buffer: AudioBuffer;
  seconds: number;
}

type NativeBridge = { postMessage: (data: string) => void };
const bridge = (): NativeBridge | null => (typeof window !== 'undefined' ? ((window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView ?? null) : null);

/** Web clip studio: live canvas preview and an on-device MP4 export. Also runs inside the native WebView. */
export function ClipStudio({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const embedded = bridge() !== null;
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [assets, setAssets] = useState<RenderAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [style, setStyle] = useState<CaptionStyle>('blue');
  const [publishPass, setPublishPass] = useState(false);
  const [link, setLink] = useState<{ path: string; url: string | null } | null>(null);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readPrefs().then((p) => setStyle(p.captionStyle));
    Promise.all([api.result(attemptId), getConfig()])
      .then(async ([r, c]) => {
        if (cancelled) return;
        const passReasons: Record<string, string> = {};
        for (const id of r.attempt.tileInstanceIds) passReasons[id] = r.suggestion.reasons[id] ?? `Not part of my ${r.section.label} plan.`;
        setReasons(passReasons);
        setResult(r);
        setConfig(c);
        const loaded = await loadAssets(r.puzzle.tiles.map((t) => t.faceCode));
        if (!cancelled) setAssets(loaded);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  useEffect(() => {
    if (!result) return;
    api.createShareLink(result.attempt.id, publishPass).then(setLink).catch(() => setLink(null));
  }, [result, publishPass]);

  const timeline = useMemo<ClipTimeline | null>(() => {
    if (!result || !config) return null;
    const endCardUrl = config.publicBaseUrl && link ? `${new URL(config.publicBaseUrl).host}${link.path}` : null;
    return buildClipTimeline({
      brand: config.brand,
      question: result.puzzle.question,
      sectionLabel: result.section.label,
      tiles: result.puzzle.tiles,
      passIds: result.attempt.tileInstanceIds as [string, string, string],
      reasons,
      split: result.split.minimumSampleMet ? result.split.rows.map((r) => ({ tileInstanceId: r.tileInstanceId, rate: r.rate })) : null,
      splitAttemptCount: result.split.eligibleAttemptCount,
      endCardUrl,
    });
  }, [result, config, reasons, link]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/result/${attemptId}`));
  if (error) {
    return (
      <Screen>
        {!embedded && <TopBar title="Make your clip" onBack={back} />}
        <ErrorPanel message={error} />
      </Screen>
    );
  }
  if (!result || !timeline || !assets) return <Loading label="Setting up your clip" />;

  const faceOf = new Map(result.puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const shareUrl = link ? (link.url ?? publicLink(link.path, config?.publicBaseUrl ?? null)) : publicLink('/', config?.publicBaseUrl ?? null);

  return (
    <Screen>
      {!embedded && <TopBar title="Make your clip" onBack={back} />}
      <Preview timeline={timeline} assets={assets} style={style} voice={voice} />
      <VoiceoverControl voice={voice} onChange={setVoice} />

      <Card>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: editing }} onPress={() => setEditing((v) => !v)} style={styles.row}>
          <Body bold style={{ flex: 1 }}>
            Edit captions
          </Body>
          <Icon name="chevron" />
        </Pressable>
        {editing && (
          <View style={{ gap: 12 }}>
            {result.attempt.tileInstanceIds.map((id, i) => (
              <View key={id} style={{ gap: 4 }}>
                <Body small bold>
                  Tile {i + 1}: {spokenLabel(faceOf.get(id) ?? '')}
                </Body>
                <TextInput
                  accessibilityLabel={`Caption for tile ${i + 1}`}
                  maxLength={REASON_MAX_CHARS}
                  value={reasons[id] ?? ''}
                  onChangeText={(text) => setReasons((r) => ({ ...r, [id]: text }))}
                  style={styles.input}
                />
                <Body small muted style={{ textAlign: 'right' }}>
                  {(reasons[id] ?? '').length}/{REASON_MAX_CHARS}
                </Body>
              </View>
            ))}
            <Body small bold>
              Caption color
            </Body>
            <Segmented
              label="Caption color"
              value={style}
              onChange={(s) => {
                setStyle(s);
                readPrefs().then((p) => writeJson(PREFS_KEY, { ...p, captionStyle: s }));
              }}
              options={[
                { value: 'blue', label: 'Blue' },
                { value: 'magenta', label: 'Magenta' },
              ]}
            />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: publishPass }} onPress={() => setPublishPass((v) => !v)} style={styles.row}>
              <Body style={{ flex: 1 }}>Show my pass to people who play my link</Body>
              <View style={[styles.check, publishPass && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{publishPass && <Icon name="check" size={16} color="#fff" />}</View>
            </Pressable>
          </View>
        )}
      </Card>

      <ExportActions timeline={timeline} assets={assets} style={style} voice={voice} shareUrl={shareUrl} fileName={`daily-rack-${result.puzzle.revisionId}.mp4`} />
    </Screen>
  );
}

function Preview({ timeline, assets, style, voice }: { timeline: ClipTimeline; assets: RenderAssets; style: CaptionStyle; voice: Voice | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = useRef<{ startT: number; startedAt: number } | null>(null);

  const paint = useCallback(
    (time: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      drawFrame(ctx, timeline, time, assets, style);
    },
    [timeline, assets, style],
  );
  useEffect(() => paint(t), [paint, t]);
  useEffect(() => {
    track('clip_preview_ready', { voice: voice ? 'recorded' : 'captions-only' });
    audioRef.current = voice ? new Audio(voice.url) : null;
    return () => audioRef.current?.pause();
  }, [voice]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (!clock.current) return;
      const now = clock.current.startT + (performance.now() - clock.current.startedAt) / 1000;
      if (now >= timeline.duration) {
        setT(timeline.duration - 0.001);
        setPlaying(false);
        return;
      }
      setT(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline.duration]);

  const play = (from: number) => {
    const start = from >= timeline.duration - 0.05 ? 0 : from;
    clock.current = { startT: start, startedAt: performance.now() };
    if (audioRef.current && voice && start < voice.seconds) {
      audioRef.current.currentTime = start;
      void audioRef.current.play().catch(() => undefined);
    }
    setT(start);
    setPlaying(true);
  };
  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  return (
    <View style={styles.frame}>
      <canvas ref={canvasRef} width={540} height={960} aria-label="Preview of your 9 by 16 clip" role="img" style={{ width: '100%', height: '100%', display: 'block' }} />
      <View style={styles.player}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause preview' : 'Play preview'} onPress={() => (playing ? pause() : play(t))} style={styles.playButton}>
          <Icon name={playing ? 'close' : 'play'} color="#fff" size={20} />
        </Pressable>
        <Text style={styles.time}>{`0:${String(Math.floor(t)).padStart(2, '0')}`}</Text>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          step={0.05}
          value={t}
          aria-label="Scrub preview"
          onChange={(e) => {
            pause();
            setT(Number(e.target.value));
          }}
          style={{ flex: 1, accentColor: '#fff' }}
        />
        <Text style={styles.time}>{`0:${timeline.duration}`}</Text>
      </View>
    </View>
  );
}

type RecorderState = { kind: 'idle' } | { kind: 'requesting' } | { kind: 'recording'; startedAt: number } | { kind: 'denied' } | { kind: 'failed'; message: string };

function VoiceoverControl({ voice, onChange }: { voice: Voice | null; onChange: (v: Voice | null) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (state.kind !== 'recording') return;
    const id = window.setInterval(() => {
      const s = (performance.now() - state.startedAt) / 1000;
      setElapsed(s);
      if (s >= VOICEOVER_MAX_SECONDS) recorder.current?.stop();
    }, 100);
    return () => window.clearInterval(id);
  }, [state]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState({ kind: 'failed', message: 'This device cannot record audio here. Your clip works fine with captions only.' });
      return;
    }
    setState({ kind: 'requesting' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState({ kind: 'denied' });
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      try {
        const context = new AudioContext({ sampleRate: 48_000 });
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        await context.close();
        if (voice) URL.revokeObjectURL(voice.url);
        onChange({ url: URL.createObjectURL(blob), buffer, seconds: Math.min(buffer.duration, VOICEOVER_MAX_SECONDS) });
        setState({ kind: 'idle' });
      } catch {
        setState({ kind: 'failed', message: 'That recording could not be read. Try again, or keep captions only.' });
      }
    };
    rec.start();
    setElapsed(0);
    setState({ kind: 'recording', startedAt: performance.now() });
  };

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={voice ? `Voiceover, ${voice.seconds.toFixed(1)} seconds` : 'Add voiceover'} onPress={() => setOpen((v) => !v)} style={styles.row}>
        <View style={styles.micCircle}>
          <Icon name="mic" />
        </View>
        <View style={{ flex: 1 }}>
          <Body bold>{voice ? `Voiceover · ${voice.seconds.toFixed(1)} s` : 'Add voiceover'}</Body>
          <Body small muted>
            Optional · up to {VOICEOVER_MAX_SECONDS} sec · stays on this device
          </Body>
        </View>
        <Icon name="chevron" />
      </Pressable>
      {open && (
        <View style={{ gap: 10 }}>
          <Body small muted>
            Try a one-line hook: “Not sure what to pass? Here's my rack.” Your voice plays from the start of the clip.
          </Body>
          {state.kind === 'recording' ? (
            <Button title={`Stop · ${Math.floor(elapsed)}s`} onPress={() => recorder.current?.stop()} />
          ) : (
            <Button title={voice ? 'Re-record' : state.kind === 'requesting' ? 'Waiting for microphone…' : 'Record'} icon="mic" variant={voice ? 'secondary' : 'primary'} disabled={state.kind === 'requesting'} onPress={start} />
          )}
          {voice && state.kind !== 'recording' && (
            <Button
              title="Delete voiceover"
              icon="trash"
              variant="danger"
              compact
              onPress={() => {
                URL.revokeObjectURL(voice.url);
                onChange(null);
              }}
            />
          )}
          {state.kind === 'denied' && <Notice>Microphone access is off. Your clip works fine with captions only, or allow the microphone in settings.</Notice>}
          {state.kind === 'failed' && <Notice>{state.message}</Notice>}
        </View>
      )}
    </Card>
  );
}

type ExportState = { kind: 'idle' } | { kind: 'rendering'; progress: number } | { kind: 'ready'; result: ExportResult } | { kind: 'failed'; message: string };

function ExportActions({ timeline, assets, style, voice, shareUrl, fileName }: { timeline: ClipTimeline; assets: RenderAssets; style: CaptionStyle; voice: Voice | null; shareUrl: string; fileName: string }) {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const [status, setStatus] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => setState({ kind: 'idle' }), [timeline, style, voice]);
  useEffect(() => {
    // The native shell reports back after it shares or saves the file.
    (window as unknown as { __clipStatus?: (s: string) => void }).__clipStatus = (s) => setStatus(s);
  }, []);

  const render = async (): Promise<ExportResult | null> => {
    if (state.kind === 'ready') return state.result;
    const controller = new AbortController();
    abort.current = controller;
    setStatus(null);
    setState({ kind: 'rendering', progress: 0 });
    track('clip_render_started', { voice: Boolean(voice) });
    try {
      const result = await exportClip({ timeline, assets, style, voice: voice?.buffer ?? null, fileName, signal: controller.signal, onProgress: (progress) => setState({ kind: 'rendering', progress }) });
      track('clip_render_succeeded', { ms: result.elapsedMs, bytes: result.blob.size, video: result.videoCodec, audio: result.audioCodec });
      setState({ kind: 'ready', result });
      return result;
    } catch (e) {
      if (e instanceof ExportCancelled) {
        setState({ kind: 'idle' });
        setStatus('Render cancelled.');
      } else {
        track('clip_render_failed', { reason: (e as Error).message.slice(0, 120) });
        setState({ kind: 'failed', message: (e as Error).message });
      }
      return null;
    }
  };

  /** Inside the native app, hand the file to native code to share or save. */
  const sendToNative = async (result: ExportResult, intent: 'share' | 'save') => {
    const native = bridge();
    if (!native) return false;
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const CHUNK = 384 * 1024; // a multiple of 3 so each base64 chunk decodes on its own
    const count = Math.ceil(bytes.length / CHUNK);
    native.postMessage(JSON.stringify({ type: 'clip-begin', name: result.file.name, intent, count, text: `What would you pass? Play this rack: ${shareUrl}` }));
    for (let i = 0; i < count; i++) {
      let binary = '';
      const part = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
      for (let j = 0; j < part.length; j++) binary += String.fromCharCode(part[j]!);
      native.postMessage(JSON.stringify({ type: 'clip-chunk', index: i, data: btoa(binary) }));
    }
    native.postMessage(JSON.stringify({ type: 'clip-end' }));
    setStatus(intent === 'share' ? 'Opening the share sheet…' : 'Saving to Photos…');
    return true;
  };

  const download = (result: ExportResult) => {
    track('clip_save_started', { method: 'download' });
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const share = async () => {
    const result = await render();
    if (!result || (await sendToNative(result, 'share'))) return;
    const text = `What would you pass? Play this rack: ${shareUrl}`;
    if (navigator.canShare?.({ files: [result.file] })) {
      track('share_handoff_opened', { method: 'share-sheet' });
      try {
        await navigator.share({ files: [result.file], title: 'Daily Rack', text });
        setStatus('Handed off to the app you picked.');
      } catch (e) {
        setStatus((e as Error).name === 'AbortError' ? 'Share cancelled. Your clip is still ready.' : 'The share sheet could not open. Try Save video.');
      }
      return;
    }
    download(result);
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setStatus('This browser cannot share video directly, so the clip is downloading and the rack link is copied.');
  };

  const save = async () => {
    const result = await render();
    if (!result || (await sendToNative(result, 'save'))) return;
    download(result);
    setStatus(`Download started: ${result.file.name}`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('Rack link copied.');
    } catch {
      setStatus(`Rack link: ${shareUrl}`);
    }
  };

  const supported = canExportMp4();
  return (
    <View style={{ gap: 10 }}>
      {state.kind === 'rendering' && (
        <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]} />
          </View>
          <Body small center>
            Making your video… {Math.round(state.progress * 100)}%
          </Body>
        </View>
      )}
      {state.kind === 'failed' && <ErrorPanel message={state.message} onRetry={() => void render()} />}
      {!supported && <Notice>This browser cannot make video files. Open the app in the latest Safari or Chrome to export.</Notice>}
      {status && (
        <Body small center>
          {status}
        </Body>
      )}
      {state.kind === 'rendering' ? (
        <Button title="Cancel" variant="secondary" onPress={() => abort.current?.abort()} />
      ) : (
        <>
          <Button title="Share clip" icon="share" onPress={share} disabled={!supported} testID="share-clip" />
          <Button title="Save video" icon="download" variant="secondary" onPress={save} disabled={!supported} testID="save-video" />
          <Button title="Copy rack link" variant="text" onPress={copyLink} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, backgroundColor: '#fff', fontSize: 16, color: colors.ink },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '100%', aspectRatio: 9 / 16, maxHeight: 620, alignSelf: 'center', borderRadius: 22, overflow: 'hidden', backgroundColor: colors.felt },
  player: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  playButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  time: { color: '#fff', fontVariant: ['tabular-nums'], fontSize: 14 },
  micCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 8, borderRadius: 4, backgroundColor: '#EBE8DF', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },
});
