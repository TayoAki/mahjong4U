import type { WebRTC } from './types.ts';

// In the browser WebRTC is built in. Remote voices play through an audio element each.

export function loadWebRTC(): WebRTC | null {
  if (typeof window === 'undefined' || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return null;
  return {
    RTCPeerConnection: window.RTCPeerConnection as unknown as WebRTC['RTCPeerConnection'],
    description: (init) => init,
    candidate: (init) => init,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints) as unknown as ReturnType<WebRTC['getUserMedia']>,
    playRemote: (stream) => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.srcObject = stream as unknown as MediaStream;
      audio.play().catch(() => undefined);
      return {
        setMuted: (muted) => {
          audio.muted = muted;
        },
        stop: () => {
          audio.pause();
          audio.srcObject = null;
        },
      };
    },
  };
}
