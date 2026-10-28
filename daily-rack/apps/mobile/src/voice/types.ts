// The small slice of WebRTC that voice chat uses, the same on phones and in browsers.

export interface TrackLike {
  enabled: boolean;
  stop(): void;
}

export interface StreamLike {
  getTracks(): TrackLike[];
  getAudioTracks(): TrackLike[];
}

export interface SessionDescriptionInit {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface PeerConnectionLike {
  connectionState: string;
  remoteDescription: unknown;
  addTrack(track: TrackLike, stream: StreamLike): unknown;
  createOffer(options?: object): Promise<SessionDescriptionInit>;
  createAnswer(): Promise<SessionDescriptionInit>;
  setLocalDescription(description: unknown): Promise<void>;
  setRemoteDescription(description: unknown): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  close(): void;
}

export interface RemoteAudio {
  setMuted(muted: boolean): void;
  stop(): void;
}

export interface WebRTC {
  RTCPeerConnection: new (config: { iceServers: { urls: string | string[]; username?: string; credential?: string }[] }) => PeerConnectionLike;
  description(init: SessionDescriptionInit): unknown;
  candidate(init: IceCandidateInit): unknown;
  getUserMedia(constraints: { audio: object | boolean; video: boolean }): Promise<StreamLike>;
  playRemote(stream: StreamLike): RemoteAudio;
}
