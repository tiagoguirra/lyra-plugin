import { registerLyraChannel } from "./src/channel";
import { LyraWebSocketServer } from "./src/ws-server";

export default function register(api: any) {
  const cfg = api.config?.plugins?.entries?.["lyra-plugin"]?.config ?? {};

  // 1. Registrar canal
  registerLyraChannel(api);

  // 2. Instanciar WebSocket server
  const wsServer = new LyraWebSocketServer(api, cfg);

  api.registerService({
    id: "lyra-plugin-ws",
    start: () => wsServer.start(),
    stop: () => wsServer.stop(),
  });

  // 3. RPC de status
  api.registerGatewayMethod("lyra.status", ({ respond }: any) => {
    respond(true, { sessions: wsServer.activeSessions() });
  });

  // 4. Slash command
  api.registerCommand({
    name: "lyrastatus",
    description: "Show active voice sessions",
    handler: () => ({
      text: `Active voice sessions: ${wsServer.activeSessions()}`,
    }),
  });
}
