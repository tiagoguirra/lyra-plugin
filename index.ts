import { registerLyraChannel } from "./src/channel";
import { LyraWebSocketServer } from "./src/ws-server";

export default function register(api: any) {
  const cfg = api.config?.plugins?.entries?.["lyra-voice-plugin"]?.config ?? {};

  registerLyraChannel(api);

  const wsServer = new LyraWebSocketServer(api, cfg);

  api.registerService({
    id: "lyra-voice-plugin-ws",
    start: () => wsServer.start(),
    stop: () => wsServer.stop(),
  });

  api.registerGatewayMethod("lyra.status", ({ respond }: any) => {
    respond(true, { sessions: wsServer.activeSessions() });
  });

  api.registerCommand({
    name: "lyrasvoice:sessions",
    description: "Show active voice sessions",
    handler: () => ({
      text: `Active voice sessions: ${wsServer.activeSessions()}`,
    }),
  });

  api.registerTool({
    name: 'lyrasvoice:speak',
    description: 'Speaks text as audio to a connected Lyra voice client.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'ID of the connected client' },
        text: { type: 'string', description: 'Text to speak as audio' },
      },
      required: ['clientId', 'text'],
    },
    handler: async ({ clientId, text }: any) => {
      const ok = await wsServer.speakToClient(clientId, text);
      return { ok, message: ok ? 'sent' : `client ${clientId} not connected` };
    },
  });
}