import type { ExtractionProvider } from "./types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, parseExtractionFields } from "./shared.js";
import { PROVIDERS_CONFIG } from "../../config.js";
import { ProviderHttpError } from "../http-error.js";

const MODEL = PROVIDERS_CONFIG.providers["cloudflare-workers-ai"].extraction!.model;

export const cloudflareWorkersAiExtractionProvider: ExtractionProvider = {
  async extract(ocr, config) {
    const apiKey = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiKey) throw new Error("CLOUDFLARE_API_TOKEN manquante");
    if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID manquante");

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          temperature: 0,
          messages: [
            { role: "system", content: buildExtractionSystemPrompt(config) },
            { role: "user", content: buildExtractionUserPrompt(ocr, config.fields) },
          ],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(
        response.status,
        `Extraction Cloudflare Workers AI a échoué (${response.status}): ${body.slice(0, 300)}`,
      );
    }

    const data = await response.json();
    if (data.success === false) {
      throw new Error(`Extraction Cloudflare Workers AI a échoué: ${JSON.stringify(data.errors).slice(0, 300)}`);
    }
    // La réponse Workers AI est au format chat-completions OpenAI
    // (choices[0].message.content) — result.response existe aussi mais est
    // déjà un objet JSON parsé, pas la chaîne attendue par parseExtractionFields.
    const content = data.result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Réponse Cloudflare Workers AI sans contenu exploitable");
    }

    return {
      fields: parseExtractionFields(content, config.fields, "Cloudflare Workers AI"),
      model: MODEL,
      usage: data.result?.usage
        ? {
            input: data.result.usage.prompt_tokens,
            output: data.result.usage.completion_tokens,
            total: data.result.usage.total_tokens,
          }
        : undefined,
    };
  },
};
