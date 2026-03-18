import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { createSession, VoiceSession } from "./session";
import { sendMessage, ClientMessage } from "./messages";

export class LyraWebSocketServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, VoiceSession>();

  constructor(private api: any, private cfg: any) {}

  start(): void {
    const port: number = this.cfg.wsPort ?? 8765;

    this.wss = new WebSocketServer({ port });

    this.wss.on("listening", () => {
      this.api.logger.info(`[lyra-ws] WebSocket server listening on port ${port}`);
    });

    this.wss.on("connection", (ws) => {
      const id = randomUUID();
      const session = createSession(ws, id);
      this.sessions.set(id, session);

      sendMessage(ws, { type: "session_start", sessionId: id });
      this.api.logger.info(`[lyra-ws] session started: ${id}`);

      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
          sendMessage(ws, { type: "error", message: "invalid json" });
          return;
        }

        if (msg.type === "transcript") {
          session.lastText = msg.text;
          session.state = "receiving";
          this.api.logger.info(`[lyra-ws] transcript [${id}]: "${msg.text}" final=${msg.is_final}`);
          return;
        }

        if (msg.type === "end_of_speech") {
          const text = session.lastText.trim();
          if (!text) {
            sendMessage(ws, { type: "error", message: "empty transcript" });
            return;
          }
          this.streamAgentResponse(session, text).catch((err) => {
            this.api.logger.error(`[lyra-ws] unhandled stream error [${id}]:`, err);
          });
          return;
        }
      });

      ws.on("close", () => {
        this.sessions.delete(id);
        this.api.logger.info(`[lyra-ws] session closed: ${id}`);
      });
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

  private async streamAgentResponse(session: VoiceSession, text: string): Promise<void> {
    session.state = "processing";

    try {
      if (typeof this.api.agent?.streamMessage === "function") {
        session.state = "streaming";

        const stream = await this.api.agent.streamMessage({
          channel: session.agentChannel,
          text,
          userId: `voice:${session.id}`,
        });

        for await (const chunk of stream) {
          sendMessage(session.ws, { type: "reply", text: chunk, is_final: false });
        }

        sendMessage(session.ws, { type: "reply", text: "", is_final: true });
      } else {
        const reply = await this.api.agent.sendMessage({
          channel: session.agentChannel,
          text,
          userId: `voice:${session.id}`,
        });

        sendMessage(session.ws, { type: "reply", text: reply, is_final: true });
      }
    } catch (error) {
      this.api.logger.error(`[lyra-ws] agent error on session ${session.id}:`, error);
      sendMessage(session.ws, { type: "error", message: (error as Error).message });
    } finally {
      session.state = "idle";
      session.lastText = "";
    }
  }
}
