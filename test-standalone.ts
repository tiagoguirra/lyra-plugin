/**
 * Script de teste standalone — simula o bootstrap do OpenClaw com mock agent.
 * Roda o WebSocket server sem precisar do OpenClaw instalado.
 *
 * Uso:
 *   npx ts-node test-standalone.ts
 *
 * Depois conecte via: wscat -c ws://localhost:8765
 */

import { registerLyraChannel } from "./src/channel";
import { LyraWebSocketServer } from "./src/ws-server";
import { buildMockApi } from "./src/mock-agent";

const logger = {
  info: (...args: any[]) => console.log("[INFO]", ...args),
  warn: (...args: any[]) => console.warn("[WARN]", ...args),
  error: (...args: any[]) => console.error("[ERROR]", ...args),
};

const services: Record<string, { start: () => void; stop: () => void }> = {};
const commands: Record<string, any> = {};
const gatewayMethods: Record<string, any> = {};

const mockApi = {
  ...buildMockApi(logger),
  config: {
    plugins: {
      entries: {
        "lyra-plugin": { config: { wsPort: 8765 } },
      },
    },
  },
  registerChannel({ plugin }: any) {
    logger.info(`[openclaw-mock] registerChannel called: id=${plugin.id}`);
    logger.info(`[openclaw-mock]   label: ${plugin.meta.label}`);
    logger.info(`[openclaw-mock]   aliases: ${plugin.meta.aliases.join(", ")}`);
    logger.info(`[openclaw-mock]   deliveryMode: ${plugin.outbound.deliveryMode}`);
    logger.info("[openclaw-mock] ✓ Canal registrado com sucesso");
  },
  registerService(svc: any) {
    logger.info(`[openclaw-mock] registerService: ${svc.id}`);
    services[svc.id] = svc;
  },
  registerGatewayMethod(name: string, handler: any) {
    logger.info(`[openclaw-mock] registerGatewayMethod: ${name}`);
    gatewayMethods[name] = handler;
  },
  registerCommand(cmd: any) {
    logger.info(`[openclaw-mock] registerCommand: /${cmd.name} — ${cmd.description}`);
    commands[cmd.name] = cmd;
  },
};

// Bootstrap
logger.info("=== Lyra Plugin — Teste Standalone ===");

// Registrar canal (testa o registerChannel)
registerLyraChannel(mockApi);

// Iniciar WebSocket server
const cfg = { wsPort: 8765 };
const wsServer = new LyraWebSocketServer(mockApi, cfg);
wsServer.start();

logger.info("");
logger.info("Conecte via: wscat -c ws://localhost:8765");
logger.info("Envie: {\"type\":\"transcript\",\"text\":\"olá mundo\",\"is_final\":true}");
logger.info("Envie: {\"type\":\"end_of_speech\",\"text\":\"\",\"is_final\":true}");
logger.info("Ctrl+C para encerrar");

// Simular lyrastatus command
logger.info(`\n[slash-cmd /lyrastatus] Active voice sessions: ${wsServer.activeSessions()}`);

process.on("SIGINT", () => {
  logger.info("Encerrando...");
  wsServer.stop();
  process.exit(0);
});
