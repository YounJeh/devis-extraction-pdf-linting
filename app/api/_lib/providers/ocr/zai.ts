import type { OcrProvider } from "./types.js";

export const zaiOcrProvider: OcrProvider = {
  async run() {
    throw new Error("OCR Z.ai non implémenté");
  },
};
