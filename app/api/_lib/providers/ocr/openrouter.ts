import type { OcrProvider } from "./types.js";
import { OCR_PAGE_MARKER_INSTRUCTION, parsePageMarkedText } from "./shared.js";
import { PROVIDERS_CONFIG } from "../../config.js";
import { ProviderHttpError } from "../http-error.js";

const MODEL = PROVIDERS_CONFIG.providers.openrouter.ocr!.model;

export const openRouterOcrProvider: OcrProvider = {
  async run(pdfBytes) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY manquante");

    const base64 = Buffer.from(pdfBytes).toString("base64");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PAGE_MARKER_INSTRUCTION },
              {
                type: "file",
                file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(response.status, `OCR OpenRouter a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Réponse OCR OpenRouter sans contenu exploitable");
    }

    return parsePageMarkedText(content);
  },
};
