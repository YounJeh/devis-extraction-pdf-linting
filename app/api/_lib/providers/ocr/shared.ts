import type { OcrPage, OcrResult } from "./types.js";

const PAGE_MARKER = /^--- Page (\d+) ---$/;

/**
 * Instruction commune aux providers OCR "chat-completion" (Gemini,
 * OpenRouter, Cloudflare Workers AI, Z.ai) : contrairement à l'API OCR
 * dédiée de Mistral, ces modèles ne renvoient ni découpage en pages
 * structuré ni bounding boxes — on leur demande de marquer les pages en
 * texte pour pouvoir reconstruire un OcrResult.
 */
export const OCR_PAGE_MARKER_INSTRUCTION =
  "Transcris fidèlement, en Markdown, l'intégralité du texte de ce document PDF. " +
  "Ne résume pas, ne commente pas, ne traduis pas. " +
  'Pour chaque page du document, commence une nouvelle ligne exactement "--- Page N ---" ' +
  "(N = numéro de page en commençant à 1), suivie du texte complet de cette page.";

/** `items` reste toujours vide (aucun de ces providers ne renvoie de bounding boxes). */
export function parsePageMarkedText(content: string): OcrResult {
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
