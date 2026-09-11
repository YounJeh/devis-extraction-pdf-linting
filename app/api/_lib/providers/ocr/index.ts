import type { OcrProvider, OcrResult } from "./types.js";
import { mistralOcrProvider } from "./mistral.js";
import { openRouterOcrProvider } from "./openrouter.js";
import { geminiOcrProvider } from "./gemini.js";
import { cloudflareWorkersAiOcrProvider } from "./cloudflare-workers-ai.js";
import { zaiOcrProvider } from "./zai.js";
import { PROVIDERS_CONFIG } from "../../config.js";
import { runChain, type ChainAttempt } from "../chain.js";

const PROVIDERS: Record<string, OcrProvider> = {
  mistral: mistralOcrProvider,
  openrouter: openRouterOcrProvider,
  gemini: geminiOcrProvider,
  "cloudflare-workers-ai": cloudflareWorkersAiOcrProvider,
  zai: zaiOcrProvider,
};

export interface OcrRunResult {
  result: OcrResult;
  provider: string;
  attempts: ChainAttempt[];
}

/**
 * OCR_PROVIDER force un seul provider et court-circuite la chaîne
 * (comportement historique conservé pour debug/override manuel). Sans
 * cette variable, essaie `providers.config.json#ocrOrder` dans l'ordre,
 * bascule au suivant sur quota dépassé (voir chain.ts).
 */
export async function runOcr(pdfBytes: Uint8Array): Promise<OcrRunResult> {
  const override = process.env.OCR_PROVIDER;
  if (override) {
    const provider = PROVIDERS[override];
    if (!provider) throw new Error(`OCR_PROVIDER inconnu: "${override}"`);
    const result = await provider.run(pdfBytes);
    return { result, provider: override, attempts: [{ provider: override, outcome: "success" }] };
  }

  const chainResult = await runChain(PROVIDERS_CONFIG.ocrOrder, {
    call: (name) => {
      const provider = PROVIDERS[name];
      if (!provider) throw new Error(`Provider OCR inconnu dans ocrOrder: "${name}"`);
      return provider.run(pdfBytes);
    },
  });
  return { result: chainResult.value, provider: chainResult.provider, attempts: chainResult.attempts };
}
