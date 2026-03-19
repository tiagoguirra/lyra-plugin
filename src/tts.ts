import { TtsConfig } from "./types";

export async function streamTts(
  text: string,
  ttsCfg: TtsConfig,
  onChunk: (chunk: Buffer) => void,
): Promise<void> {
  const { apiKey, voice: voiceId, model = "eleven_multilingual_v2" } = ttsCfg;

  if (!apiKey || !voiceId) {
    throw Object.assign(
      new Error("TTS: apiKey e voice são obrigatórios"),
      { code: "tts_failed" },
    );
  }

  const voiceSettings: Record<string, number> = {};
  if (ttsCfg.stability  != null) voiceSettings.stability        = ttsCfg.stability;
  if (ttsCfg.speed      != null) voiceSettings.speed             = ttsCfg.speed;
  if (ttsCfg.similarity != null) voiceSettings.similarity_boost  = ttsCfg.similarity;

  const body: Record<string, unknown> = {
    text,
    model_id: model,
    output_format: "mp3_44100_128",
  };
  if (Object.keys(voiceSettings).length > 0) {
    body.voice_settings = voiceSettings;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`ElevenLabs TTS error ${response.status}: ${errBody}`),
      { code: "tts_failed" },
    );
  }

  if (!response.body) {
    throw Object.assign(new Error("ElevenLabs: response sem body"), {
      code: "tts_failed",
    });
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) onChunk(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}
