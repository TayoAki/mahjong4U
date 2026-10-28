import type { IceCandidateInit, PeerConnectionLike, RemoteAudio, SessionDescriptionInit, StreamLike, WebRTC } from './types.ts';

// One player's side of a table's voice call: a direct connection to each other person in
// the call (at most three). The server only passes the setup messages along. To avoid both
// sides calling at once, the person whose id sorts first places each call.

export type PeerState = 'connecting' | 'connected' | 'failed';

export interface PeerInfo {
  id: string;
  state: PeerState;
  muted: boolean;
}

interface Peer {
  pc: PeerConnectionLike;
  state: PeerState;
  muted: boolean;
  remote: RemoteAudio | null;
  /** Candidates that arrived before the other side's description. */
  pending: IceCandidateInit[];
}

type Signal = { sdp?: SessionDescriptionInit; candidate?: IceCandidateInit };

export class VoiceCall {
  private peers = new Map<string, Peer>();

  constructor(
    private rtc: WebRTC,
    private me: string,
    private stream: StreamLike,
    private iceServers: { urls: string | string[]; username?: string; credential?: string }[],
    private sendSignal: (to: string, data: Signal) => void,
    private onChange: () => void,
  ) {}

  /** The server's list of who is in the call: connect to newcomers, drop those who left. */
  roster(members: string[]): void {
    for (const id of [...this.peers.keys()]) if (!members.includes(id)) this.close(id);
    for (const id of members) if (id !== this.me && !this.peers.has(id) && this.me < id) void this.call(id);
  }

  async signal(from: string, data: Signal): Promise<void> {
    try {
      if (data.sdp?.type === 'offer') {
        const peer = this.peer(from);
        await peer.pc.setRemoteDescription(this.rtc.description(data.sdp));
        await this.flush(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(from, { sdp: { type: 'answer', sdp: answer.sdp } });
      } else if (data.sdp?.type === 'answer') {
        const peer = this.peers.get(from);
        if (!peer) return;
        await peer.pc.setRemoteDescription(this.rtc.description(data.sdp));
        await this.flush(peer);
      } else if (data.candidate) {
        const peer = this.peers.get(from) ?? this.peer(from);
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(this.rtc.candidate(data.candidate));
        else peer.pending.push(data.candidate);
      }
    } catch {
      this.mark(from, 'failed');
    }
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream.getAudioTracks()) track.enabled = !muted;
  }

  mutePeer(id: string, muted: boolean): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.muted = muted;
    peer.remote?.setMuted(muted);
    this.onChange();
  }

  close(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.remote?.stop();
    peer.pc.close();
    this.peers.delete(id);
    this.onChange();
  }

  end(): void {
    for (const id of [...this.peers.keys()]) this.close(id);
    for (const track of this.stream.getTracks()) track.stop();
  }

  list(): PeerInfo[] {
    return [...this.peers.entries()].map(([id, p]) => ({ id, state: p.state, muted: p.muted }));
  }

  private async call(id: string) {
    const peer = this.peer(id);
    try {
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(id, { sdp: { type: 'offer', sdp: offer.sdp } });
    } catch {
      this.mark(id, 'failed');
    }
  }

  private peer(id: string): Peer {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new this.rtc.RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = { pc, state: 'connecting', muted: false, remote: null, pending: [] };
    this.peers.set(id, peer);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.addEventListener('icecandidate', (event: { candidate?: IceCandidateInit | null }) => {
      const c = event.candidate;
      if (c?.candidate) this.sendSignal(id, { candidate: { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } });
    });
    pc.addEventListener('track', (event: { streams?: StreamLike[] }) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      peer.remote?.stop();
      peer.remote = this.rtc.playRemote(stream);
      peer.remote.setMuted(peer.muted);
    });
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState;
      this.mark(id, s === 'connected' ? 'connected' : s === 'failed' || s === 'closed' ? 'failed' : 'connecting');
    });
    this.onChange();
    return peer;
  }

  private async flush(peer: Peer) {
    const queued = peer.pending.splice(0);
    for (const c of queued) await peer.pc.addIceCandidate(this.rtc.candidate(c)).catch(() => undefined);
  }

  private mark(id: string, state: PeerState) {
    const peer = this.peers.get(id);
    if (!peer || peer.state === state) return;
    peer.state = state;
    this.onChange();
  }
}
