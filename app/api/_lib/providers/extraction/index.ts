import type { ExtractionProvider, ExtractionResult } from "./types.js";
import type { OcrResult } from "../ocr/types.js";
import type { ExtractionConfig } from "../../../../config/schema.js";
import { groqExtractionProvider } from "./groq.js";
import { openRouterExtractionProvider } from "./openrouter.js";
import { geminiExtractionProvider } from "./gemini.js";
import { cloudflareWorkersAiExtractionProvider } from "./cloudflare-workers-ai.js";
import { zaiExtractionProvider } from "./zai.js";
import { PROVIDERS_CONFIG } from "../../config.js";
import { runChain, type ChainAttempt } from "../chain.js";

const PROVIDERS: Record<string, ExtractionProvider> = {
  groq: groqExtractionProvider,
  openrouter: openRouterExtractionProvider,
  gemini: geminiExtractionProvider,
  "cloudflare-workers-ai": cloudflareWorkersAiExtractionProvider,
  zai: zaiExtractionProvider,
};

export interface ExtractionRunResult {
  result: ExtractionResult;
  provider: string;
  attempts: ChainAttempt[];
}

function totalOcrChars(ocr: OcrResult): number {
  return ocr.pages.reduce((sum, page) => sum + page.text.length, 0);
}

/**
 * EXTRACTION_PROVIDER force un seul provider et court-circuite la chaîne
 * (comportement historique conservé pour debug/override manuel — y
 * compris le seuil de contexte, ignoré dans ce cas). Sans cette variable,
 * essaie `providers.config.json#extractionOrder` dans l'ordre, bascule au
 * suivant sur quota dépassé ou si le texte OCR dépasse le
 * `contextCharThreshold` déclaré pour ce provider (remplace l'ancien
 * LARGE_DOC_EXTRACTION_PROVIDER fixe — voir choix_techniques.md).
 */
export async function runExtraction(ocr: OcrResult, config: ExtractionConfig): Promise<ExtractionRunResult> {
  const override = process.env.EXTRACTION_PROVIDER;
  if (override) {
    const provider = PROVIDERS[override];
    if (!provider) throw new Error(`EXTRACTION_PROVIDER inconnu: "${override}"`);
    const result = await provider.extract(ocr, config);
    return { result, provider: override, attempts: [{ provider: override, outcome: "success" }] };
  }

  const chars = totalOcrChars(ocr);
  const chainResult = await runChain(PROVIDERS_CONFIG.extractionOrder, {
    contextTooLarge: (name) => {
      const threshold = PROVIDERS_CONFIG.providers[name].extraction?.contextCharThreshold;
      return threshold !== undefined && chars > threshold;
    },
    call: (name) => {
      const provider = PROVIDERS[name];
      if (!provider) throw new Error(`Provider extraction inconnu dans extractionOrder: "${name}"`);
      return provider.extract(ocr, config);
    },
  });
  return { result: chainResult.value, provider: chainResult.provider, attempts: chainResult.attempts };
}
