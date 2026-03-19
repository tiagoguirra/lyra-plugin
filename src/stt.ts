import WebSocket from "ws";
import { SttConfig } from "./types";

export interface SttStream {
  write: (chunk: Buffer) => void;
  end: () => Promise<string>;
  destroy: () => void;
}

export function createSttStream(
  sttCfg: SttConfig,
  onResult: (text: string, isFinal: boolean) => void,
  onError?: (err: Error) => void,
): SttStream {
  const { apiKey, model = "nova-3", language = "pt" } = sttCfg;

  const params = new URLSearchParams({
    model,
    language,
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    punctuate: "true",
  });

  const dg = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  let finalText = "";
  let destroyed = false;
  let connected = false;
  const pending: Buffer[] = [];

  let resolveEnd: ((text: string) => void) | null = null;
  let rejectEnd: ((err: Error) => void) | null = null;
  const endPromise = new Promise<string>((res, rej) => {
    resolveEnd = res;
    rejectEnd = rej;
  });
  // Prevents UnhandledPromiseRejection if an error occurs before end() is awaited
  endPromise.catch(() => {});

  const safetyTimeout = setTimeout(() => {
    if (!destroyed) {
      destroy();
      rejectEnd?.(new Error("STT timeout: no result in 30s"));
    }
  }, 30_000);

  dg.on("open", () => {
    connected = true;
    for (const chunk of pending) dg.send(chunk);
    pending.length = 0;
  });

  dg.on("message", (raw: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "Results") {
      const transcript: string = msg.channel?.alternatives?.[0]?.transcript ?? "";
      const isFinal: boolean = msg.is_final ?? false;
      const speechFinal: boolean = msg.speech_final ?? false;

      if (!transcript) return;

      if (isFinal) {
        finalText += (finalText ? " " : "") + transcript;
      }
      onResult(transcript, isFinal || speechFinal);

    } else if (msg.type === "Metadata") {
      // Deepgram closed the stream
      clearTimeout(safetyTimeout);
      resolveEnd?.(finalText);

    } else if (msg.type === "Error") {
      clearTimeout(safetyTimeout);
      destroyed = true;
      const dgErr = new Error(`Deepgram error: ${msg.message ?? JSON.stringify(msg)}`);
      rejectEnd?.(dgErr);
      onError?.(dgErr);
    }
  });

  dg.on("close", () => {
    clearTimeout(safetyTimeout);
    if (!destroyed) {
      destroyed = true;
      resolveEnd?.(finalText);
    }
  });

  dg.on("error", (err: Error) => {
    clearTimeout(safetyTimeout);
    destroyed = true;
    rejectEnd?.(err);
    onError?.(err);
  });

  function write(chunk: Buffer): void {
    if (destroyed) return;
    if (connected) {
      dg.send(chunk);
    } else {
      pending.push(chunk);
    }
  }

  function end(): Promise<string> {
    if (!destroyed) {
      const closeStream = () => dg.send(JSON.stringify({ type: "CloseStream" }));
      if (connected) {
        closeStream();
      } else {
        dg.once("open", closeStream);
      }
    }
    return endPromise;
  }

  function destroy(): void {
    if (!destroyed) {
      destroyed = true;
      clearTimeout(safetyTimeout);
      dg.terminate();
      resolveEnd?.(finalText);
    }
  }

  return { write, end, destroy };
}
