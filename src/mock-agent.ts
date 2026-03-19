/**
 * Mock agent for testing the channel without a real Openclaw agent.
 * Simulates streaming responses with a delay between chunks.
 */

async function* mockStreamChunks(text: string): AsyncGenerator<string> {
  const parts = [
    `Received your message: "${text}". `,
    "This is the mock agent. ",
    "Lyra voice channel is working correctly!",
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
        return `Received: "${text}". Lyra channel OK (fallback).`;
      },
    },
  };
}
