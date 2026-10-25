import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { frameCount, type ClipTimeline } from '@daily-rack/core';
import { drawFrame, type CaptionStyle, type RenderAssets } from './renderer.web.ts';

export interface ExportResult {
  blob: Blob;
  file: File;
  videoCodec: string;
  audioCodec: string | null;
  elapsedMs: number;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
  }
}

export function canExportMp4(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Encodes every frame of the timeline offline (faster than real time where the device
 * allows) into a 1080x1920, 30 fps MP4. The optional voiceover starts at 0 s.
 */
export async function exportClip(options: {
  timeline: ClipTimeline;
  assets: RenderAssets;
  style: CaptionStyle;
  voice: AudioBuffer | null;
  fileName: string;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}): Promise<ExportResult> {
  const { timeline, assets, style, voice, signal } = options;
  const started = performance.now();
  if (!canExportMp4()) throw new Error('This browser cannot encode video. Try the latest Safari or Chrome.');

  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], {
    width: timeline.width,
    height: timeline.height,
    frameRate: timeline.fps,
  });
  if (!videoCodec) throw new Error('This device has no video encoder for a 1080×1920 clip.');
  const audioCodec = voice
    ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: voice.numberOfChannels, sampleRate: voice.sampleRate })
    : null;
  if (voice && !audioCodec) throw new Error('This device cannot encode your voiceover. Export without it or try another browser.');

  const canvas = new OffscreenCanvas(timeline.width, timeline.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not start the renderer.');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: 6_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: timeline.fps });
  const audio = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 }) : null;
  if (audio) output.addAudioTrack(audio);

  await output.start();
  try {
    const frames = frameCount(timeline);
    for (let f = 0; f < frames; f++) {
      if (signal.aborted) throw new ExportCancelled();
      const t = f / timeline.fps;
      drawFrame(ctx, timeline, t, assets, style);
      await video.add(t, 1 / timeline.fps);
      if (f % 10 === 0) options.onProgress(f / frames);
    }
    if (audio && voice) await audio.add(voice);
    if (signal.aborted) throw new ExportCancelled();
    await output.finalize();
  } catch (error) {
    if (output.state !== 'finalized') await output.cancel().catch(() => undefined);
    throw error;
  }
  options.onProgress(1);

  const blob = new Blob([target.buffer!], { type: 'video/mp4' });
  return {
    blob,
    file: new File([blob], options.fileName, { type: 'video/mp4' }),
    videoCodec,
    audioCodec,
    elapsedMs: Math.round(performance.now() - started),
  };
}
