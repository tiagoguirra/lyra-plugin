// ── Mensagens do cliente → servidor ──────────────────────────────────────────

export interface AuthMessage {
  type: "auth";
  token: string;
  clientId: string;
}

export interface WakeDetectedMessage {
  type: "wake_detected";
}

export interface EndOfAudioMessage {
  type: "end_of_audio";
}

export interface PlaybackDoneMessage {
  type: "playback_done";
}

export interface CancelMessage {
  type: "cancel";
}

export type ClientMessage =
  | AuthMessage
  | WakeDetectedMessage
  | EndOfAudioMessage
  | PlaybackDoneMessage
  | CancelMessage;

// ── Mensagens do servidor → cliente ──────────────────────────────────────────

export interface SessionStartMessage {
  type: "session_start";
  sessionId: string;
}

export interface AuthOkMessage {
  type: "auth_ok";
  sessionId: string;
  clientId: string;
}

export interface AuthErrorMessage {
  type: "auth_error";
  message: string;
}

export interface ReadyForAudioMessage {
  type: "ready_for_audio";
}

export interface SttResultMessage {
  type: "stt_result";
  text: string;
  is_final: boolean;
}

export interface ThinkingMessage {
  type: "thinking";
}

export interface AudioDoneMessage {
  type: "audio_done";
}

export interface AskUserMessage {
  type: "ask_user";
}

export interface ErrorMessage {
  type: "error";
  message: string;
  code?: "stt_failed" | "tts_failed" | "agent_failed";
}

export type ServerMessage =
  | SessionStartMessage
  | AuthOkMessage
  | AuthErrorMessage
  | ReadyForAudioMessage
  | SttResultMessage
  | ThinkingMessage
  | AudioDoneMessage
  | AskUserMessage
  | ErrorMessage;

export function sendMessage(ws: any, msg: ServerMessage): void {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}
