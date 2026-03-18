export type SessionState =
  | "idle"
  | "receiving"
  | "processing"
  | "streaming";

export interface VoiceSession {
  id: string;
  ws: any;
  agentChannel: string;
  createdAt: Date;
  state: SessionState;
  lastText: string;
}

export function createSession(ws: any, id: string): VoiceSession {
  return {
    id,
    ws,
    agentChannel: `lyra-channel:${id}`,
    createdAt: new Date(),
    state: "idle",
    lastText: "",
  };
}
