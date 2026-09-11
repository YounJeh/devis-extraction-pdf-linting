import type { OcrResult } from "../ocr/types.js";
import type { ExtractionConfig } from "../../../../config/schema.js";
import type { GenerationUsage } from "../../tracing/types.js";

export interface ExtractedFieldResult {
  id: string;
  label: string;
  value: string | null;
  evidence: string | null;
  page: number | null;
}

export interface ExtractionResult {
  fields: ExtractedFieldResult[];
  /** Nom du modèle effectivement appelé — remonté pour le tracing (Langfuse). */
  model: string;
  /** Absent si le fournisseur ne renvoie pas l'usage dans sa réponse. */
  usage?: GenerationUsage;
}

export interface ExtractionProvider {
  extract(ocr: OcrResult, config: ExtractionConfig): Promise<ExtractionResult>;
}
