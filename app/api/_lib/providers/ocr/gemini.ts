import type { OcrProvider, OcrPage, OcrResult } from "./types.js";
import { PROVIDERS_CONFIG } from "../../config.js";

const MODEL = PROVIDERS_CONFIG.providers.gemini.ocr!.model;

const PAGE_MARKER = /^--- Page (\d+) ---$/;

const OCR_INSTRUCTION =
  "Transcris fidèlement, en Markdown, l'intégralité du texte de ce document PDF. " +
  "Ne résume pas, ne commente pas, ne traduis pas. " +
  'Pour chaque page du document, commence une nouvelle ligne exactement "--- Page N ---" ' +
  "(N = numéro de page en commençant à 1), suivie du texte complet de cette page.";

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
                { text: OCR_INSTRUCTION },
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
      throw new Error(`OCR Gemini a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string") {
      throw new Error("Réponse OCR Gemini sans contenu exploitable");
    }

    return parseToOcrResult(content);
  },
};

/**
 * Gemini ne renvoie ni découpage en pages structuré ni bounding boxes
 * (contrairement à Mistral OCR) — on reconstruit les pages à partir des
 * marqueurs "--- Page N ---" demandés dans le prompt. `items` reste vide.
 */
function parseToOcrResult(content: string): OcrResult {
  const lines = content.split("\n");
  const pages: OcrPage[] = [];
  let current: { pageNumber: number; lines: string[] } | null = null;

  for (const line of lines) {
    const match = PAGE_MARKER.exec(line.trim());
    if (match) {
      if (current) pages.push(toPage(current));
      current = { pageNumber: Number(match[1]), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) pages.push(toPage(current));

  if (pages.length === 0) {
    // Le modèle n'a pas suivi le format de marqueurs demandé : on renvoie
    // tout le contenu comme une page unique plutôt que de perdre le texte.
    pages.push({ pageNumber: 1, text: content.trim(), items: [] });
  }

  return { pages };
}

function toPage(current: { pageNumber: number; lines: string[] }): OcrPage {
  return { pageNumber: current.pageNumber, text: current.lines.join("\n").trim(), items: [] };
}
