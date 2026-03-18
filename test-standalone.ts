/**
 * Script de teste standalone — simula o bootstrap completo do OpenClaw.
 * Usa o register() real de index.ts com mock agent e mock das APIs do gateway.
 *
 * Uso:
 *   npx ts-node test-standalone.ts
 *
 * Depois conecte via: wscat -c ws://localhost:8765
 *
 * Fluxo de teste:
 *   1. Conectar → recebe { "type": "session_start", "sessionId": "..." }
 *   2. Enviar   → { "type": "transcript", "text": "qual o clima hoje?", "is_final": true }
 *   3. Enviar   → { "type": "end_of_speech" }
 *             → recebe chunks { "type": "reply", ... } finalizando com "is_final": true
 */

import register from "./index";
import { buildMockApi } from "./src/mock-agent";

const logger = {
  info: (...args: any[]) => console.log("[INFO]", ...args),
  warn: (...args: any[]) => console.warn("[WARN]", ...args),
  error: (...args: any[]) => console.error("[ERROR]", ...args),
};

const services: Record<string, { start: () => void; stop: () => void }> = {};

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
    logger.info(`[openclaw-mock] registerChannel → id="${plugin.id}"`);
    logger.info(`[openclaw-mock]   label    : ${plugin.meta.label}`);
    logger.info(`[openclaw-mock]   aliases  : ${plugin.meta.aliases.join(", ")}`);
    logger.info(`[openclaw-mock]   chatTypes: ${plugin.capabilities.chatTypes.join(", ")}`);
    logger.info(`[openclaw-mock]   delivery : ${plugin.outbound.deliveryMode}`);
    logger.info("[openclaw-mock] ✓ Canal registrado");
  },

  registerService(svc: { id: string; start: () => void; stop: () => void }) {
    logger.info(`[openclaw-mock] registerService → id="${svc.id}"`);
    services[svc.id] = svc;
  },

  registerGatewayMethod(name: string, _handler: any) {
    logger.info(`[openclaw-mock] registerGatewayMethod → "${name}"`);
  },

  registerCommand(cmd: { name: string; description: string }) {
    logger.info(`[openclaw-mock] registerCommand → /${cmd.name} (${cmd.description})`);
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
logger.info("=== Lyra Plugin — Teste Standalone ===\n");

register(mockApi);

// Iniciar serviços registrados (OpenClaw faria isso no gateway start)
for (const [id, svc] of Object.entries(services)) {
  logger.info(`[openclaw-mock] starting service "${id}"`);
  svc.start();
}

logger.info("\nPronto. Conecte via: wscat -c ws://localhost:8765");
logger.info('Transcrição: {"type":"transcript","text":"qual o clima hoje?","is_final":true}');
logger.info('Disparar:    {"type":"end_of_speech"}');
logger.info("Ctrl+C para encerrar\n");

process.on("SIGINT", () => {
  logger.info("Encerrando...");
  for (const svc of Object.values(services)) svc.stop();
  process.exit(0);
});
