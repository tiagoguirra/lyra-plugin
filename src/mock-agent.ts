/**
 * Mock agent para testar o canal sem precisar do agente real do OpenClaw.
 * Simula streaming de resposta com delay entre chunks.
 */

const MOCK_RESPONSES: Record<string, string[]> = {
  default: [
    "Recebi sua mensagem: ",
    '"{text}"',
    ". Este é o agente mockado.",
    " Canal Lyra funcionando corretamente!",
  ],
};

async function* mockStreamChunks(text: string): AsyncGenerator<string> {
  const parts = [
    `Recebi sua mensagem: "${text}". `,
    "Este é o agente mockado. ",
    "Canal Lyra funcionando corretamente!",
  ];

  for (const part of parts) {
    await new Promise((res) => setTimeout(res, 150));
    yield part;
  }
}

export function buildMockApi(logger: any): any {
  return {
    logger,
    agent: {
      async streamMessage({ channel, text, userId }: { channel: string; text: string; userId: string }) {
        logger.info(`[mock-agent] streamMessage channel=${channel} userId=${userId} text="${text}"`);
        return mockStreamChunks(text);
      },
      async sendMessage({ channel, text, userId }: { channel: string; text: string; userId: string }) {
        logger.info(`[mock-agent] sendMessage channel=${channel} userId=${userId} text="${text}"`);
        await new Promise((res) => setTimeout(res, 300));
        return `Recebi: "${text}". Canal Lyra OK (fallback).`;
      },
    },
  };
}
