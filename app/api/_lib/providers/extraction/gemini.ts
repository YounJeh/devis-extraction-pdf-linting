import type { ExtractionProvider } from "./types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, parseExtractionFields } from "./shared.js";
import { ProviderHttpError } from "../http-error.js";
import { PROVIDERS_CONFIG } from "../../config.js";

const MODEL = PROVIDERS_CONFIG.providers.gemini.extraction!.model;

export const geminiExtractionProvider: ExtractionProvider = {
  async extract(ocr, config) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildExtractionSystemPrompt(config) }] },
          contents: [{ parts: [{ text: buildExtractionUserPrompt(ocr, config.fields) }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(response.status, `Gemini a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string") {
      throw new Error("Réponse Gemini sans contenu exploitable");
    }

    return {
      fields: parseExtractionFields(content, config.fields, "Gemini"),
      model: MODEL,
      usage: data.usageMetadata
        ? {
            input: data.usageMetadata.promptTokenCount,
            output: data.usageMetadata.candidatesTokenCount,
            total: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  },
};
