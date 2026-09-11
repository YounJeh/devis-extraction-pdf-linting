import type { ExtractionProvider } from "./types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, parseExtractionFields } from "./shared.js";
import { PROVIDERS_CONFIG } from "../../config.js";

const MODEL = PROVIDERS_CONFIG.providers.openrouter.extraction!.model;

export const openRouterExtractionProvider: ExtractionProvider = {
  async extract(ocr, config) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY manquante");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      throw new Error(`Extraction OpenRouter a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Réponse OpenRouter sans contenu exploitable");
    }

    return {
      fields: parseExtractionFields(content, config.fields, "OpenRouter"),
      model: MODEL,
      usage: data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens,
          }
        : undefined,
    };
  },
};
