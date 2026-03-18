export type ClientMessageType = "transcript" | "end_of_speech";

export interface ClientMessage {
  type: ClientMessageType;
  text: string;
  is_final: boolean;
}

export type ServerMessageType = "session_start" | "reply" | "error";

export interface SessionStartMessage {
  type: "session_start";
  sessionId: string;
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

export type ServerMessage = SessionStartMessage | ReplyChunk | ErrorMessage;

export function sendMessage(ws: any, msg: ServerMessage): void {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}
