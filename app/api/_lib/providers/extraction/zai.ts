import type { ExtractionProvider } from "./types.js";

export const zaiExtractionProvider: ExtractionProvider = {
  async extract() {
    throw new Error("Extraction Z.ai non implémentée");
  },
};
