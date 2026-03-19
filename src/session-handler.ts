import { createSession as _createSession, resetSessionState, VoiceSession } from "./session";
import { sendMessage, ClientMessage } from "./messages";
import { createSttStream } from "./stt";
import { runAgent } from "./agent-runner";
import { PluginConfig } from "./types";

export class SessionHandler {
  private static normalizeClientId(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, "-")
      .slice(0, 64);
  }

  private authTimeout: NodeJS.Timeout;

  constructor(
    private api: any,
    private cfg: PluginConfig,
    readonly session: VoiceSession,
    private onSessionEnd: () => void,
  ) {
    // Authentication timer: client has 5s to send auth
    this.authTimeout = setTimeout(() => {
      if (!this.session.authenticated) {
        sendMessage(this.session.ws, { type: "auth_error", message: "authentication timeout" });
        this.session.ws.close(4401, "authentication timeout");
        this.onSessionEnd();
      }
    }, 5000);
  }

  // ── WebSocket event entry points ─────────────────────────────────────────

  handleMessage(data: Buffer | string, isBinary: boolean): void {
    if (isBinary) {
      this.handleAudioChunk(data as Buffer);
    } else {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        sendMessage(this.session.ws, { type: "error", message: "invalid json" });
        return;
      }
      this.handleControlMessage(msg);
    }
  }

  onClose(): void {
    clearTimeout(this.authTimeout);
    this.session.cancelRequested = true;
    this.session.sttStream?.destroy();
    this.onSessionEnd();
    this.api.logger.info(`[lyra-ws] session closed: ${this.session.id}`);
  }

  // ── Binary PCM frame handler ──────────────────────────────────────────────

  private handleAudioChunk(chunk: Buffer): void {
    if (this.session.state !== "streaming_audio") return;

    if (this.session.cancelRequested) {
      this.session.sttStream?.destroy();
      return;
    }

    this.session.audioBuffer.push(chunk);
    this.session.sttStream?.write(chunk);
  }

  // ── JSON control message handler ─────────────────────────────────────────

  private handleControlMessage(msg: ClientMessage): void {
    const { session } = this;
    const ws = session.ws;

    // ── Authentication handshake ─────────────────────────────────────────────
    if (!session.authenticated) {
      if (msg.type !== "auth") {
        sendMessage(ws, { type: "auth_error", message: "not authenticated" });
        return;
      }

      const rawClientId = (msg as any).clientId ?? "";

      if (!rawClientId) {
        sendMessage(ws, { type: "auth_error", message: "clientId required" });
        ws.close(4401, "clientId required");
        this.onSessionEnd();
        return;
      }

      const clientId = SessionHandler.normalizeClientId(rawClientId);
      const expectedToken = this.cfg.authToken;

      if (expectedToken && msg.token !== expectedToken) {
        sendMessage(ws, { type: "auth_error", message: "unauthorized" });
        ws.close(4401, "unauthorized");
        this.onSessionEnd();
        return;
      }

      session.authenticated = true;
      session.clientId = clientId;
      session.state = "authenticated";
      clearTimeout(this.authTimeout);
      sendMessage(ws, { type: "auth_ok", sessionId: session.id, clientId });
      this.api.logger.info(`[lyra-ws] authenticated: ${session.id} clientId="${clientId}"`);
      return;
    }

    // ── Authenticated flow ────────────────────────────────────────────────────

    if (msg.type === "wake_detected") {
      if (session.state !== "authenticated" && session.state !== "idle") {
        this.api.logger.warn(`[lyra-ws] wake_detected ignored — current state: ${session.state}`);
        return;
      }
      this.startAudioStream();
      return;
    }

    if (msg.type === "end_of_audio") {
      if (session.state !== "streaming_audio") return;

      const sttStream = session.sttStream;
      session.sttStream = undefined;

      (async () => {
        try {
          const finalText = await sttStream?.end();
          if (session.cancelRequested) return;  // cancel arrived during STT drain
          if (finalText && !session.pendingSttText) {
            session.pendingSttText = finalText;
          }
          await this.handleVoicePipeline();
        } catch (err) {
          this.api.logger.error(`[lyra-ws] pipeline error on session ${session.id}:`, err);
        }
      })();
      return;
    }

    if (msg.type === "playback_done") {
      session.state = "authenticated";
      this.api.logger.info(`[lyra-ws] playback_done: ${session.id}`);
      return;
    }

    if (msg.type === "cancel") {
      session.cancelRequested = true;  // signal runAgent to abort before resetting state
      session.sttStream?.destroy();
      resetSessionState(session);
      this.api.logger.info(`[lyra-ws] cancel requested: ${session.id}`);
      return;
    }
  }

  // ── Full pipeline: STT → Agent → TTS ─────────────────────────────────────

  private async handleVoicePipeline(): Promise<void> {
    const { session } = this;
    const ws = session.ws;
    let fullText = "";
    let wasCancelled = false;

    try {
      const sttText = session.pendingSttText;
      if (!sttText?.trim()) {
        sendMessage(ws, { type: "error", message: "stt returned empty", code: "stt_failed" });
        return;
      }

      if (session.cancelRequested) return;  // cancel arrived before pipeline started

      sendMessage(ws, { type: "stt_result", text: sttText, is_final: true });
      sendMessage(ws, { type: "thinking" });
      session.state = "processing";

      fullText = await runAgent(this.api, this.cfg, session, sttText);

      this.api.logger.info(
        `[lyra-ws] agent reply for session ${session.id} (clientId="${session.clientId}"): ${fullText}`,
      );

      if (!session.cancelRequested) {
        sendMessage(ws, { type: "audio_done" });
        if (fullText.includes("[ASK]")) {
          sendMessage(ws, { type: "ask_user" });
        }
      }
    } catch (err: any) {
      if (!session.cancelRequested) {
        sendMessage(ws, {
          type: "error",
          message: err.message ?? "unknown error",
          code: err.code ?? "agent_failed",
        });
      }
    } finally {
      wasCancelled = session.cancelRequested;
      resetSessionState(session);
      session.cancelRequested = false;  // clear only after pipeline fully completes
    }

    // Auto-start recording after ask_user — bypasses VAD
    if (fullText.includes("[ASK]") && !wasCancelled) {
      this.startAudioStream();
    }
  }

  // ── Start audio / STT stream (wake_detected or auto after ask_user) ────────

  startAudioStream(): void {
    const { session } = this;
    const ws = session.ws;
    session.state = "streaming_audio";
    session.audioBuffer = [];
    session.cancelRequested = false;
    session.pendingSttText = undefined;

    session.sttStream = createSttStream(
      this.cfg.stt ?? {} as any,
      (text: string, isFinal: boolean) => {
        if (isFinal) session.pendingSttText = text;
        sendMessage(ws, { type: "stt_result", text, is_final: isFinal });
      },
      (err: Error) => {
        this.api.logger.error(`[lyra-ws] STT error on session ${session.id}:`, err.message);
        sendMessage(ws, { type: "error", message: err.message, code: "stt_failed" });
        session.state = "authenticated";
        session.sttStream = undefined;
        session.audioBuffer = [];
      },
    );

    sendMessage(ws, { type: "ready_for_audio" });
    this.api.logger.info(`[lyra-ws] ready for audio: ${session.id}`);
  }
}
