export type ClientMessageType = "auth" | "transcript" | "end_of_speech";

export interface AuthMessage {
  type: "auth";
  token: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  text: string;
  is_final: boolean;
  token: string;
}

export type ServerMessageType = "session_start" | "auth_ok" | "auth_error" | "reply" | "error";

export interface SessionStartMessage {
  type: "session_start";
  sessionId: string;
}

export interface AuthOkMessage {
  type: "auth_ok";
}

export interface AuthErrorMessage {
  type: "auth_error";
  message: string;
}

export interface ReplyChunk {
  type: "reply";
  text: string;
  is_final: boolean;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage =
  | SessionStartMessage
  | AuthOkMessage
  | AuthErrorMessage
  | ReplyChunk
  | ErrorMessage;

export function sendMessage(ws: any, msg: ServerMessage): void {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}
