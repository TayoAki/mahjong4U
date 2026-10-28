import { NativeModules } from 'react-native';
import type { WebRTC } from './types.ts';

// On phones, WebRTC comes from react-native-webrtc. It's part of development and store
// builds but not Expo Go, so it's loaded lazily: in Expo Go voice chat says it isn't available.

export function loadWebRTC(): WebRTC | null {
  try {
    if (!NativeModules.WebRTCModule) return null;
    const rn = require('react-native-webrtc') as typeof import('react-native-webrtc');
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
