export interface SttConfig {
  apiKey: string;
  model?: string;
  language?: string;
}

export interface TtsConfig {
  apiKey: string;
  voice: string;
  model?: string;
  speed?: number;
  stability?: number;
  similarity?: number;
}

export interface PluginConfig {
  wsPort?: number;
  authToken?: string;
  stt?: SttConfig;
  tts?: TtsConfig;
}
