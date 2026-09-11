import type { OcrProvider } from "./types.js";

export const openRouterOcrProvider: OcrProvider = {
  async run() {
    throw new Error("OCR OpenRouter non implémenté");
  },
};
