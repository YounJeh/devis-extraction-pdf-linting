import type { OcrProvider } from "./types.js";

export const geminiOcrProvider: OcrProvider = {
  async run() {
    throw new Error("OCR Gemini non implémenté");
  },
};
