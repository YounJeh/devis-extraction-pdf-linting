import type { ExtractedFieldResult } from "./types.js";
import type { ExtractionConfig, FieldSpec } from "../../../../config/schema.js";
import type { OcrResult } from "../ocr/types.js";

const PROTOCOL_RULES =
  'Réponds uniquement en JSON avec un objet {"fields": [{"id": string, ' +
  '"value": string|null, "evidence": string|null, "page": number|null}]}, ' +
  "un élément par champ demandé, dans l'ordre donné.\n\n" +
  "Règles générales :\n" +
  "(1) \"evidence\" doit être une citation exacte et complète de la " +
  "phrase du texte source qui contient la valeur choisie pour \"value\" " +
  "— jamais une autre phrase, même voisine, jamais reformulée.\n" +
  "(2) \"value\" est la donnée nettoyée à afficher à un humain, pas une " +
  "recopie brute de \"evidence\" : applique les règles par champ " +
  "ci-dessous.\n" +
  "(3) Si un champ est absent du texte, ou seulement déductible par un " +
  "calcul, mets value, evidence et page à null. N'invente et ne " +
  "calcule jamais une valeur qui n'est pas écrite explicitement.\n" +
  "(4) Si plusieurs candidats existent pour un même champ (numéro " +
  "répété, plusieurs pourcentages sur des pages différentes), choisis " +
  "celui de la clause la plus explicite et la plus proche du " +
  "vocabulaire du champ (ex : la clause \"conditions de paiement\" / " +
  "\"modalités de règlement\" plutôt qu'une mention incidente).";

export function buildExtractionSystemPrompt(config: ExtractionConfig): string {
  const fieldsWithInstructions = config.fields.filter((field) => field.instructions);
  const fieldRules =
    fieldsWithInstructions.length > 0
      ? "\n\nRègles par champ :\n" +
        fieldsWithInstructions.map((field) => `- "${field.id}" (${field.label}) : ${field.instructions}`).join("\n")
      : "";

  return `${config.documentContext} ${PROTOCOL_RULES}${fieldRules}`;
}

interface RawExtractedField {
  id?: unknown;
  value?: unknown;
  evidence?: unknown;
  page?: unknown;
}

export function buildExtractionUserPrompt(ocr: OcrResult, fields: FieldSpec[]): string {
  const fieldIds = fields.map((field) => field.id).join(", ");
  const pages = ocr.pages
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
    .join("\n\n");
  return `Champs à extraire (id): ${fieldIds}.\n\n${pages}`;
}

/** Certains providers sans mode JSON garanti (ex: Z.ai) enveloppent leur réponse dans un bloc ```json ... ``` malgré la consigne du prompt. */
function stripCodeFence(content: string): string {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(content.trim());
  return match ? match[1] : content;
}

export function parseExtractionFields(
  content: string,
  fields: FieldSpec[],
  providerLabel: string,
): ExtractedFieldResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error(`Réponse ${providerLabel} : JSON invalide`);
  }

  const rawFields = (parsed as { fields?: unknown })?.fields;
  if (!Array.isArray(rawFields)) {
    throw new Error(`Réponse ${providerLabel} : champ "fields" absent ou invalide`);
  }

  const byId = new Map<string, RawExtractedField>();
  for (const raw of rawFields as RawExtractedField[]) {
    if (raw && typeof raw.id === "string") byId.set(raw.id, raw);
  }

  return fields.map((field) => {
    const raw = byId.get(field.id);
    return {
      id: field.id,
      label: field.label,
      value: typeof raw?.value === "string" ? raw.value : null,
      evidence: typeof raw?.evidence === "string" ? raw.evidence : null,
      page: typeof raw?.page === "number" ? raw.page : null,
    };
  });
}
