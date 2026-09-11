import type { OcrProvider } from "./types.js";
import { mistralOcrProvider } from "./mistral.js";
import { openRouterOcrProvider } from "./openrouter.js";
import { geminiOcrProvider } from "./gemini.js";
import { cloudflareWorkersAiOcrProvider } from "./cloudflare-workers-ai.js";
import { zaiOcrProvider } from "./zai.js";

const PROVIDERS: Record<string, OcrProvider> = {
  mistral: mistralOcrProvider,
  openrouter: openRouterOcrProvider,
  gemini: geminiOcrProvider,
  "cloudflare-workers-ai": cloudflareWorkersAiOcrProvider,
  zai: zaiOcrProvider,
};

export function getOcrProvider(): { provider: OcrProvider; name: string } {
  const name = process.env.OCR_PROVIDER ?? "mistral";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`OCR_PROVIDER inconnu: "${name}"`);
  }
  return { provider, name };
}
