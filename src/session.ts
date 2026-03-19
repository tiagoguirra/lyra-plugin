export type SessionState =
  | "idle"
  | "authenticated"
  | "streaming_audio"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceSession {
  id: string;
  ws: any;
  createdAt: Date;
  state: SessionState;
  authenticated: boolean;
  clientId: string;           // human-readable client identifier (e.g. "tiago-pi")
  audioBuffer: Buffer[];      // PCM chunks received during streaming_audio
  sttStream?: any;            // active Deepgram STT stream
  cancelRequested: boolean;   // client requested cancellation
  pendingSttText?: string;    // final text returned by STT
}

export function createSession(ws: any, id: string): VoiceSession {
  return {
    id,
    ws,
    createdAt: new Date(),
    state: "idle",
    authenticated: false,
    clientId: "",
    audioBuffer: [],
    cancelRequested: false,
  };
}

/** Resets session state fields after a pipeline ends (cancel, error, or completion). */
export function resetSessionState(session: VoiceSession): void {
  // cancelRequested is intentionally NOT cleared here — callers manage it explicitly
  // so a cancel signal survives through the async pipeline until the finally block.
  session.audioBuffer = [];
  session.pendingSttText = undefined;
  session.sttStream = undefined;
  session.state = "authenticated";
}
