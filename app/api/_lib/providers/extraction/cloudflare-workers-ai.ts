import type { ExtractionProvider } from "./types.js";

export const cloudflareWorkersAiExtractionProvider: ExtractionProvider = {
  async extract() {
    throw new Error("Extraction Cloudflare Workers AI non implémentée");
  },
};
