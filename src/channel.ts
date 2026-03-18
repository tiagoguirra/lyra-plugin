export function registerLyraChannel(api: any): void {
  const plugin = {
    id: "lyra-channel",
    meta: {
      id: "lyra-channel",
      label: "Lyra Channel",
      selectionLabel: "Lyra Channel (WebSocket)",
      docsPath: "/channels/lyra-channel",
      blurb: "Text-based voice channel. STT and TTS handled by the client.",
      aliases: ["lyra", "lc"],
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: (cfg: any) =>
        Object.keys(cfg.channels?.["lyra-channel"]?.accounts ?? {}),
      resolveAccount: (cfg: any, accountId: string) =>
        cfg.channels?.["lyra-channel"]?.accounts?.[accountId ?? "default"] ?? {
          accountId,
        },
    },
    outbound: {
      deliveryMode: "direct",
      // Respostas vão pelo WebSocket via streaming — outbound é no-op
      sendText: async () => ({ ok: true }),
    },
  };

  api.registerChannel({ plugin });
  api.logger.info("[lyra-channel] channel registered");
}
