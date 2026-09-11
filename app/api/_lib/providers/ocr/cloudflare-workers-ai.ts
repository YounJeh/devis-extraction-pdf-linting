import type { OcrProvider } from "./types.js";

export const cloudflareWorkersAiOcrProvider: OcrProvider = {
  async run() {
    throw new Error("OCR Cloudflare Workers AI non implémenté");
  },
};
