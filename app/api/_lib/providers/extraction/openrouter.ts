import type { ExtractionProvider } from "./types.js";

export const openRouterExtractionProvider: ExtractionProvider = {
  async extract() {
    throw new Error("Extraction OpenRouter non implémentée");
  },
};
