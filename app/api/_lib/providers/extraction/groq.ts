import type { ExtractionProvider } from "./types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, parseExtractionFields, mapOpenAiUsage } from "./shared.js";
import { ProviderHttpError } from "../http-error.js";
import { PROVIDERS_CONFIG } from "../../config.js";

const MODEL = PROVIDERS_CONFIG.providers.groq.extraction!.model;

export const groqExtractionProvider: ExtractionProvider = {
  async extract(ocr, config) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY manquante");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildExtractionSystemPrompt(config) },
          { role: "user", content: buildExtractionUserPrompt(ocr, config.fields) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(response.status, `Groq a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Réponse Groq sans contenu exploitable");
    }

    return {
      fields: parseExtractionFields(content, config.fields, "Groq"),
      model: MODEL,
      usage: mapOpenAiUsage(data.usage),
    };
  },
};
