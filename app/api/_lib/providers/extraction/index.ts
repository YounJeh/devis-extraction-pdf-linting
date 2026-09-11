import type { ExtractionProvider } from "./types.js";
import { groqExtractionProvider } from "./groq.js";
import { openRouterExtractionProvider } from "./openrouter.js";
import { geminiExtractionProvider } from "./gemini.js";
import { cloudflareWorkersAiExtractionProvider } from "./cloudflare-workers-ai.js";
import { zaiExtractionProvider } from "./zai.js";

const PROVIDERS: Record<string, ExtractionProvider> = {
  groq: groqExtractionProvider,
  openrouter: openRouterExtractionProvider,
  gemini: geminiExtractionProvider,
  "cloudflare-workers-ai": cloudflareWorkersAiExtractionProvider,
  zai: zaiExtractionProvider,
};

function resolveProvider(envVar: string, name: string): ExtractionProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`${envVar} inconnu: "${name}"`);
  }
  return provider;
}

export function getExtractionProvider(): { provider: ExtractionProvider; name: string } {
  const name = process.env.EXTRACTION_PROVIDER ?? "groq";
  return { provider: resolveProvider("EXTRACTION_PROVIDER", name), name };
}

/** Fournisseur utilisé pour les documents trop volumineux pour le TPM du fournisseur par défaut. */
export function getLargeDocExtractionProvider(): { provider: ExtractionProvider; name: string } {
  const name = process.env.LARGE_DOC_EXTRACTION_PROVIDER ?? "gemini";
  return { provider: resolveProvider("LARGE_DOC_EXTRACTION_PROVIDER", name), name };
}
