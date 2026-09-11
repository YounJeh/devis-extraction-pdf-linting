import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runOcr } from "./_lib/providers/ocr/index.js";
import { runExtraction } from "./_lib/providers/extraction/index.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "./_lib/providers/extraction/shared.js";
import { EXTRACTION_CONFIG } from "./_lib/config.js";
import { validateExtractionConfig } from "../config/schema.js";
import { getTracer } from "./_lib/tracing/index.js";
import type { OcrResult } from "./_lib/providers/ocr/types.js";

const MAX_BYTES = 4 * 1024 * 1024;

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
        const ocrRun = await tracer.traceOcr(async (handle) => {
          const run = await runOcr(new Uint8Array(pdfBytes));
          handle.setMetadata({ provider: run.provider, attempts: run.attempts });
          handle.setOutput({
            pageCount: run.result.pages.length,
            pages: run.result.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
          });
          return run;
        });
        ocrResult = ocrRun.result;
        ocrProviderName = ocrRun.provider;
      } catch (error) {
        res.status(502).json({ error: `Échec OCR: ${errorMessage(error)}` });
        throw error;
      }

      let fields;
      let extractionProviderName: string;
      try {
        const extractionRun = await tracer.traceExtraction(async (handle) => {
          handle.setInput({
            system: buildExtractionSystemPrompt(extractionConfig),
            user: buildExtractionUserPrompt(ocrResult, extractionConfig.fields),
          });
          const run = await runExtraction(ocrResult, extractionConfig);
          handle.setModel(run.result.model);
          if (run.result.usage) handle.setUsage(run.result.usage);
          handle.setMetadata({ provider: run.provider, attempts: run.attempts });
          handle.setOutput(run.result.fields);
          return run;
        });
        fields = extractionRun.result.fields;
        extractionProviderName = extractionRun.provider;
      } catch (error) {
        res.status(502).json({ error: `Échec extraction: ${errorMessage(error)}` });
        throw error;
      }

      requestHandle.setOutput({ ocrProvider: ocrProviderName, extractionProvider: extractionProviderName, fieldCount: fields.length });
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
