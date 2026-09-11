import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getOcrProvider } from "./_lib/providers/ocr/index.js";
import { getExtractionProvider, getLargeDocExtractionProvider } from "./_lib/providers/extraction/index.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "./_lib/providers/extraction/shared.js";
import type { ExtractionProvider } from "./_lib/providers/extraction/types.js";
import { EXTRACTION_CONFIG } from "./_lib/config.js";
import { validateExtractionConfig } from "../config/schema.js";
import { getTracer } from "./_lib/tracing/index.js";
import type { OcrResult } from "./_lib/providers/ocr/types.js";

const MAX_BYTES = 4 * 1024 * 1024;

// Le fournisseur d'extraction par défaut (Groq, plan gratuit) est plafonné à
// 8000 tokens/minute pour son modèle non-agentique le plus fiable — un devis
// de plus d'une dizaine de pages dépasse ce budget. Au-delà de ce seuil
// (marge de sécurité sous 8000, en tokens ~4 caractères), on bascule sur
// LARGE_DOC_EXTRACTION_PROVIDER (Gemini par défaut, quota bien plus large).
const LARGE_DOC_CHAR_THRESHOLD = 24_000;

function pickExtractionProvider(ocrResult: OcrResult): {
  provider: ExtractionProvider;
  providerName: string;
  reason: "default" | "large_doc_threshold";
} {
  const totalChars = ocrResult.pages.reduce((sum, page) => sum + page.text.length, 0);
  const usedLargeDocProvider = totalChars > LARGE_DOC_CHAR_THRESHOLD;
  const { provider, name } = usedLargeDocProvider ? getLargeDocExtractionProvider() : getExtractionProvider();
  return { provider, providerName: name, reason: usedLargeDocProvider ? "large_doc_threshold" : "default" };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const body = req.body as { pdfBase64?: unknown; configOverride?: unknown } | undefined;

  const pdfBase64 = body?.pdfBase64;
  if (typeof pdfBase64 !== "string" || !pdfBase64) {
    res.status(400).json({ error: "pdfBase64 manquant" });
    return;
  }

  let extractionConfig = EXTRACTION_CONFIG;
  if (body?.configOverride !== undefined) {
    try {
      extractionConfig = validateExtractionConfig(body.configOverride);
    } catch (error) {
      res.status(400).json({ error: `configOverride invalide: ${errorMessage(error)}` });
      return;
    }
  }

  const pdfBytes = Buffer.from(pdfBase64, "base64");
  if (pdfBytes.byteLength === 0) {
    res.status(400).json({ error: "pdfBase64 invalide" });
    return;
  }
  if (pdfBytes.byteLength > MAX_BYTES) {
    res.status(400).json({ error: `Le PDF dépasse la limite de ${Math.floor(MAX_BYTES / (1024 * 1024))} Mo.` });
    return;
  }

  const tracer = await getTracer();

  try {
    await tracer.traceRequest(async (requestHandle) => {
      let ocrResult: OcrResult;
      let ocrProviderName: string;
      try {
        const { provider: ocrProvider, name } = getOcrProvider();
        ocrProviderName = name;
        ocrResult = await tracer.traceOcr({ provider: ocrProviderName }, async (handle) => {
          const result = await ocrProvider.run(new Uint8Array(pdfBytes));
          handle.setOutput({
            pageCount: result.pages.length,
            pages: result.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
          });
          return result;
        });
      } catch (error) {
        res.status(502).json({ error: `Échec OCR: ${errorMessage(error)}` });
        throw error;
      }

      const { provider: extractionProvider, providerName, reason } = pickExtractionProvider(ocrResult);

      let fields;
      try {
        fields = await tracer.traceExtraction({ provider: providerName, reason }, async (handle) => {
          handle.setInput({
            system: buildExtractionSystemPrompt(extractionConfig),
            user: buildExtractionUserPrompt(ocrResult, extractionConfig.fields),
          });
          const result = await extractionProvider.extract(ocrResult, extractionConfig);
          handle.setModel(result.model);
          if (result.usage) handle.setUsage(result.usage);
          handle.setOutput(result.fields);
          return result.fields;
        });
      } catch (error) {
        res.status(502).json({ error: `Échec extraction: ${errorMessage(error)}` });
        throw error;
      }

      requestHandle.setOutput({ ocrProvider: ocrProviderName, extractionProvider: providerName, fieldCount: fields.length });
      res.status(200).json({ pages: ocrResult.pages, fields });
    });
  } catch {
    // Réponse déjà envoyée par le bloc en échec ci-dessus — l'erreur n'est
    // re-lancée que pour que traceRequest marque aussi la trace racine en échec.
  } finally {
    await tracer.flush();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
