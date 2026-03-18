import { WebSocketServer, WebSocket as WsClient } from "ws";
import { randomUUID } from "crypto";
import { createSession, VoiceSession } from "./session";
import { sendMessage, ClientMessage } from "./messages";

export class LyraWebSocketServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, VoiceSession>();

  constructor(
    private api: any,
    private cfg: any,
  ) {}

  start(): void {
    const port: number = this.cfg.wsPort ?? 8765;

    this.wss = new WebSocketServer({ port });

    this.wss.on("listening", () => {
      this.api.logger.info(
        `[lyra-ws] WebSocket server listening on port ${port}`,
      );
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
          sendMessage(ws, {
            type: "auth_error",
            message: "authentication timeout",
          });
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
              this.api.logger.info(
                `[lyra-ws] session authenticated (no token configured): ${id}`,
              );
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
            sendMessage(ws, {
              type: "auth_error",
              message: "not authenticated",
            });
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
            `[lyra-ws] transcript [${id}] final=${msg.is_final}: "${msg.text}"`,
          );
          return;
        }

        if (msg.type === "end_of_speech") {
          const text = session.lastText.trim();
          if (!text) {
            sendMessage(ws, { type: "error", message: "empty transcript" });
            return;
          }
          (async () => {
            try {
              await this.streamAgentResponse(session, text);
            } catch (err) {
              this.api.logger.error(
                `[lyra-ws] streamAgentResponse error on session ${id}:`,
                err,
              );
              // sendMessage já foi chamado dentro de streamAgentResponse
            } finally {
              session.state = "idle";
              session.lastText = "";
            }
          })();
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

  private async streamAgentResponse(
    session: VoiceSession,
    text: string,
  ): Promise<void> {
    session.state = "processing";

    const gatewayPort: number = this.api.config?.gateway?.port ?? 18789;
    const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;
    const gatewayToken: string = this.api.config?.gateway?.auth?.token ?? "";
    const connectReqId = randomUUID();
    const chatReqId = randomUUID();

    return new Promise<void>((resolve, reject) => {
      const gws = new WsClient(gatewayUrl);
      let connectDone = false;
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        session.state = "idle";
        session.lastText = "";
        try {
          gws.close();
        } catch {}
        fn();
      };

      const fail = (message: string) => {
        this.api.logger.error(`[lyra] ${message}`);
        sendMessage(session.ws, { type: "error", message });
        settle(() => reject(new Error(message)));
      };

      gws.on("open", () => {
        // Aguardar o connect.challenge do Gateway antes de enviar connect
      });

      gws.on("message", (raw: Buffer) => {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Passo 1: receber challenge → responder com connect + nonce
        if (
          msg.type === "event" &&
          msg.event === "connect.challenge" &&
          !connectDone
        ) {
          const nonce: string = msg.payload?.nonce ?? "";
          gws.send(
            JSON.stringify({
              type: "req",
              id: connectReqId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "cli",
                  version: "dev",
                  platform: "linux",
                  mode: "cli",
                },
                auth: { token: gatewayToken, nonce },
              },
            }),
          );
          return;
        }

        // Passo 2: connect confirmado → enviar mensagem ao agente
        if (msg.type === "res" && msg.id === connectReqId) {
          if (!msg.ok) {
            fail(msg.error?.message ?? "gateway auth failed");
            return;
          }
          connectDone = true;
          session.state = "streaming";
          gws.send(
            JSON.stringify({
              type: "req",
              id: chatReqId,
              method: "chat.send",
              params: {
                text,
                sessionKey: `lyra-channel:${session.id}`,
              },
            }),
          );
          return;
        }

        // Passo 3: chunks de streaming do agente
        if (
          msg.type === "event" &&
          msg.event === "agent" &&
          msg.runId === chatReqId
        ) {
          const delta = msg.data;
          if (
            delta?.stream === "assistant" &&
            typeof delta.text === "string" &&
            delta.text
          ) {
            sendMessage(session.ws, {
              type: "reply",
              text: delta.text,
              is_final: false,
            });
          }
          if (delta?.status === "done" || delta?.final === true) {
            sendMessage(session.ws, {
              type: "reply",
              text: "",
              is_final: true,
            });
            settle(resolve);
          }
          return;
        }

        // Erro no chat.send
        if (msg.type === "res" && msg.id === chatReqId && !msg.ok) {
          fail(msg.error?.message ?? "chat.send failed");
        }
      });

      gws.on("error", (err: Error) => {
        fail(`gateway connection failed: ${err.message}`);
      });

      gws.on("close", () => {
        settle(() => {
          sendMessage(session.ws, {
            type: "error",
            message: "gateway disconnected",
          });
          reject(new Error("gateway disconnected"));
        });
      });
    });
  }
}
