import type { OcrProvider } from "./types.js";

// Écarté volontairement (pas un stub oublié) : le modèle vision Workers AI
// (@cf/meta/llama-3.2-11b-vision-instruct) n'accepte qu'une image, pas un
// PDF multi-page. Rasteriser côté serveur ajouterait une dépendance de
// rendu PDF→image non prévue au plan — voir choix_techniques.md. Ce
// provider n'est plus dans ocrOrder ; il ne peut être atteint que via un
// override manuel explicite (OCR_PROVIDER=cloudflare-workers-ai).
export const cloudflareWorkersAiOcrProvider: OcrProvider = {
  async run() {
    throw new Error(
      "OCR Cloudflare Workers AI non supporté : le modèle vision disponible n'accepte qu'une image, pas un PDF multi-page",
    );
  },
};
