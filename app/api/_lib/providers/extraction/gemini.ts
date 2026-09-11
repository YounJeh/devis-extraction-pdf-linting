import type { ExtractionProvider } from "./types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, parseExtractionFields } from "./shared.js";

const MODEL = "gemini-3.1-flash-lite";

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
      throw new Error(`Gemini a échoué (${response.status}): ${body.slice(0, 300)}`);
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
