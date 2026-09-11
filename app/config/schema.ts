export interface FieldSpec {
  id: string;
  label: string;
  instructions?: string;
  example?: string;
}

export interface ExtractionConfig {
  documentContext: string;
  fields: FieldSpec[];
}

const MAX_CONFIG_CHARS = 20_000;

export function validateExtractionConfig(data: unknown): ExtractionConfig {
  const serialized = JSON.stringify(data) ?? "";
  if (serialized.length > MAX_CONFIG_CHARS) {
    throw new Error(`Config invalide : trop volumineuse (${serialized.length} caractères, max ${MAX_CONFIG_CHARS})`);
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("Config invalide : un objet est attendu");
  }

  const { documentContext, fields } = data as { documentContext?: unknown; fields?: unknown };

  if (typeof documentContext !== "string" || documentContext.trim() === "") {
    throw new Error('Config invalide : "documentContext" doit être une chaîne non vide');
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('Config invalide : "fields" doit être un tableau non vide');
  }

  const seenIds = new Set<string>();
  const validatedFields = fields.map((raw, index) => validateFieldSpec(raw, index, seenIds));

  return { documentContext, fields: validatedFields };
}

function validateFieldSpec(raw: unknown, index: number, seenIds: Set<string>): FieldSpec {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config invalide : le champ #${index} n'est pas un objet`);
  }
  const { id, label, instructions, example } = raw as Record<string, unknown>;

  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`Config invalide : le champ #${index} n'a pas d'"id" valide`);
  }
  if (seenIds.has(id)) {
    throw new Error(`Config invalide : id de champ dupliqué "${id}"`);
  }
  seenIds.add(id);

  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Config invalide : le champ "${id}" n'a pas de "label" valide`);
  }
  if (instructions !== undefined && typeof instructions !== "string") {
    throw new Error(`Config invalide : le champ "${id}" a des "instructions" invalides`);
  }
  if (example !== undefined && typeof example !== "string") {
    throw new Error(`Config invalide : le champ "${id}" a un "example" invalide`);
  }

  return {
    id,
    label,
    ...(instructions !== undefined ? { instructions } : {}),
    ...(example !== undefined ? { example } : {}),
  };
}
