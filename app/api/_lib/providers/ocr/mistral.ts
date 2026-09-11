import type { OcrProvider, OcrResult } from "./types.js";
import { ProviderHttpError } from "../http-error.js";

interface MistralOcrBlock {
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  content: string;
  type: string;
}

interface MistralOcrPage {
  index: number;
  markdown: string;
  blocks: MistralOcrBlock[];
  dimensions: { width: number; height: number; dpi: number };
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
}

export const mistralOcrProvider: OcrProvider = {
  async run(pdfBytes) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");

    const base64 = Buffer.from(pdfBytes).toString("base64");
    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${base64}`,
        },
        include_blocks: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderHttpError(response.status, `Mistral OCR a échoué (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as MistralOcrResponse;
    return mapToOcrResult(data);
  },
};

function mapToOcrResult(data: MistralOcrResponse): OcrResult {
  return {
    pages: data.pages.map((page) => {
      const { width, height } = page.dimensions;
      return {
        pageNumber: page.index + 1,
        text: page.markdown,
        items: page.blocks.map((block) => ({
          text: block.content,
          bbox: {
            x: block.top_left_x / width,
            y: block.top_left_y / height,
            width: (block.bottom_right_x - block.top_left_x) / width,
            height: (block.bottom_right_y - block.top_left_y) / height,
          },
        })),
      };
    }),
  };
}
