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

      // Timer de autenticação: cliente tem 5s para enviar auth
      const authTimeout = setTimeout(() => {
        if (!session.authenticated) {
          sendMessage(ws, { type: "auth_error", message: "authentication timeout" });
          ws.close(4401, "authentication timeout");
          this.sessions.delete(id);
        }
      }, 5000);

      ws.on("close", () => {
        clearTimeout(authTimeout);
        this.sessions.delete(id);
        this.api.logger.info(`[lyra-ws] session closed: ${id}`);
      });

      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
          sendMessage(ws, { type: "error", message: "invalid json" });
          return;
        }

        // ── Handshake de autenticação ────────────────────────────────────────
        if (!session.authenticated) {
          if (msg.type === "auth") {
            const expectedToken: string | undefined = this.cfg.authToken;

            if (!expectedToken) {
              // Sem token configurado → aceitar qualquer conexão (modo dev)
              session.authenticated = true;
              clearTimeout(authTimeout);
              sendMessage(ws, { type: "auth_ok" });
              this.api.logger.info(`[lyra-ws] session authenticated (no token configured): ${id}`);
              return;
            }

            if (msg.token === expectedToken) {
              session.authenticated = true;
              clearTimeout(authTimeout);
              sendMessage(ws, { type: "auth_ok" });
              this.api.logger.info(`[lyra-ws] session authenticated: ${id}`);
            } else {
              sendMessage(ws, { type: "auth_error", message: "unauthorized" });
              ws.close(4401, "unauthorized");
              this.sessions.delete(id);
            }
          } else {
            // Mensagem antes de autenticar → avisar, não fechar
            sendMessage(ws, { type: "auth_error", message: "not authenticated" });
          }
          return;
        }

        // ── Fluxo normal (sessão autenticada) ────────────────────────────────
        if (msg.type === "transcript") {
          session.state = "receiving";
          if (msg.is_final) {
            session.lastText = session.lastText
              ? `${session.lastText} ${msg.text}`
              : msg.text;
          }
          this.api.logger.info(
            `[lyra-ws] transcript [${id}] final=${msg.is_final}: "${msg.text}"`
          );
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
