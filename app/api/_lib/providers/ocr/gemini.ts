import type { OcrProvider } from "./types.js";
import { OCR_PAGE_MARKER_INSTRUCTION, parsePageMarkedText } from "./shared.js";
import { PROVIDERS_CONFIG } from "../../config.js";
import { ProviderHttpError } from "../http-error.js";

const MODEL = PROVIDERS_CONFIG.providers.gemini.ocr!.model;

export const geminiOcrProvider: OcrProvider = {
  async run(pdfBytes) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

    const base64 = Buffer.from(pdfBytes).toString("base64");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: OCR_PAGE_MARKER_INSTRUCTION },
                { inlineData: { mimeType: "application/pdf", data: base64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(response.status, `OCR Gemini a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string") {
      throw new Error("Réponse OCR Gemini sans contenu exploitable");
    }

    return parsePageMarkedText(content);
  },
};
