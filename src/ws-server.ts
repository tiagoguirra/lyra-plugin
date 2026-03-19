import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { createSession } from "./session";
import { sendMessage } from "./messages";
import { streamTts } from "./tts";
import { SessionHandler } from "./session-handler";
import { PluginConfig } from "./types";

export class LyraWebSocketServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, SessionHandler>();

  constructor(
    private api: any,
    private cfg: PluginConfig,
  ) { }

  start(): void {
    const port = this.cfg.wsPort ?? 8765;

    this.wss = new WebSocketServer({ port });

    this.wss.on("listening", () => {
      this.api.logger.info(`[lyra-ws] WebSocket server listening on port ${port}`);
    });

    this.wss.on("connection", (ws) => {
      const id = randomUUID();
      const session = createSession(ws, id);
      const handler = new SessionHandler(
        this.api,
        this.cfg,
        session,
        () => this.sessions.delete(id),
      );
      this.sessions.set(id, handler);

      sendMessage(ws, { type: "session_start", sessionId: id });
      this.api.logger.info(`[lyra-ws] session started: ${id}`);

      ws.on("close", () => handler.onClose());
      ws.on("message", (data: Buffer | string, isBinary: boolean) =>
        handler.handleMessage(data, isBinary),
      );
    });

    this.wss.on("error", (err) => {
      this.api.logger.error("[lyra-ws] server error:", err);
    });
  }

  stop(): void {
    this.wss?.close();
  }

  activeSessions(): number {
    return this.sessions.size;
  }

  public async speakToClient(clientId: string, text: string): Promise<boolean> {
    const handler = [...this.sessions.values()]
      .find(h => h.session.clientId === clientId);

    if (!handler) return false;

    const { session } = handler;
    session.state = "speaking";
    await streamTts(text, this.cfg as any, (chunk) => session.ws.send(chunk));
    sendMessage(session.ws, { type: "audio_done" });

    if (text.includes("[ASK]")) {
      sendMessage(session.ws, { type: "ask_user" });
      // Auto-iniciar gravação após ask_user — bypassa VAD
      handler.startAudioStream();
    }
    session.state = "idle";
    return true;
  }
}
