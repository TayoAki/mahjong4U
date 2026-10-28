import { NativeModules } from 'react-native';
import type { WebRTC } from './types.ts';

// On phones, WebRTC comes from LiveKit's maintained build of react-native-webrtc (same API,
// supports React Native's New Architecture). It's part of development and store builds but
// not Expo Go, so it's loaded lazily: in Expo Go voice chat says it isn't available.

export function loadWebRTC(): WebRTC | null {
  try {
    if (!NativeModules.WebRTCModule) return null;
    const rn = require('@livekit/react-native-webrtc') as typeof import('@livekit/react-native-webrtc');
    return {
      RTCPeerConnection: rn.RTCPeerConnection as unknown as WebRTC['RTCPeerConnection'],
      description: (init) => new rn.RTCSessionDescription(init),
      candidate: (init) => new rn.RTCIceCandidate(init),
      getUserMedia: (constraints) => rn.mediaDevices.getUserMedia(constraints) as unknown as ReturnType<WebRTC['getUserMedia']>,
      // The native library plays remote audio by itself; muting a player turns their track off.
      playRemote: (stream) => ({
        setMuted: (muted) => stream.getAudioTracks().forEach((t) => (t.enabled = !muted)),
        stop: () => undefined,
      }),
    };
  } catch {
    return null;
  }
}
