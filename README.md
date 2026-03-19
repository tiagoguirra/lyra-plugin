# Lyra Voice Openclaw Plugin

Openclaw plugin that adds a voice channel to the platform. It exposes a local WebSocket server that the [Lyra Voice for Openclaw](https://github.com/openclaw/lyra-voice-client) Windows client connects to, and handles speech-to-text (Deepgram) and text-to-speech (ElevenLabs) for each session.

## Requirements

- Node.js 18+
- An [Openclaw](https://openclaw.dev) instance with plugin support
- Deepgram API key (STT)
- ElevenLabs API key (TTS)

## Project structure

```
LyraPlugin/
├── index.ts              # Plugin entry point — registers the channel
├── src/
│   ├── channel.ts        # Openclaw channel implementation
│   ├── session.ts        # Per-connection session lifecycle
│   ├── ws-server.ts      # Local WebSocket server (client ↔ plugin)
│   ├── stt.ts            # Deepgram speech-to-text integration
│   ├── tts.ts            # ElevenLabs text-to-speech integration
│   ├── messages.ts       # WebSocket message types
│   └── mock-agent.ts     # Mock agent for local testing
├── openclaw.plugin.json  # Plugin manifest and config schema
├── package.json
└── tsconfig.json
```

## Installation

Install the plugin through the Openclaw plugin manager, or manually copy this folder into your Openclaw plugins directory and restart the server.

## Configuration

The plugin is configured via the Openclaw UI or directly in your Openclaw config. Available fields:

| Field | Description |
|---|---|
| `wsPort` | Local WebSocket port the client connects to (default: `8765`) |
| `authToken` | Shared secret used to authenticate the desktop client |
| `stt.apiKey` | Deepgram API key |
| `stt.model` | Deepgram model (default: `nova-3`) |
| `stt.language` | Transcription language (default: `pt`) |
| `tts.apiKey` | ElevenLabs API key |
| `tts.voice` | ElevenLabs voice ID |
| `tts.model` | ElevenLabs model (default: `eleven_multilingual_v2`) |
| `tts.speed` | Speech speed, 0.7–1.2 |
| `tts.stability` | Voice stability, 0–1 |

## Development

```bash
npm install
```

The plugin is loaded directly from TypeScript by Openclaw's runtime — no build step needed during development. To type-check:

```bash
npx tsc --noEmit
```
