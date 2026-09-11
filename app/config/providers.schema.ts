export interface ProviderFreeQuota {
  rpm?: number;
  rpd?: number;
  rpdWithCredits?: number;
  tpm?: number;
  neuronsPerDay?: number;
  note?: string;
}

export interface ProviderCapability {
  model: string;
  freeQuota: ProviderFreeQuota;
  /** Extraction uniquement : au-delà de ce nombre de caractères OCR, ce provider est sauté (contexte trop grand). */
  contextCharThreshold?: number;
}

export interface ProviderEntry {
  apiKeyEnv: string;
  /** Cloudflare Workers AI uniquement : nom de la variable d'env portant l'account ID. */
  accountIdEnv?: string;
  ocr?: ProviderCapability;
  extraction?: ProviderCapability;
}

export interface ProvidersConfig {
  providers: Record<string, ProviderEntry>;
  ocrOrder: string[];
  extractionOrder: string[];
}

export function validateProvidersConfig(data: unknown): ProvidersConfig {
  if (typeof data !== "object" || data === null) {
    throw new Error("Config providers invalide : un objet est attendu");
  }

  const { providers, ocrOrder, extractionOrder } = data as Record<string, unknown>;

  if (typeof providers !== "object" || providers === null || Array.isArray(providers)) {
    throw new Error('Config providers invalide : "providers" doit être un objet');
  }

  const validatedProviders: Record<string, ProviderEntry> = {};
  for (const [name, raw] of Object.entries(providers as Record<string, unknown>)) {
    validatedProviders[name] = validateProviderEntry(name, raw);
  }

  const validatedOcrOrder = validateOrder(ocrOrder, "ocrOrder", validatedProviders, "ocr");
  const validatedExtractionOrder = validateOrder(extractionOrder, "extractionOrder", validatedProviders, "extraction");

  return { providers: validatedProviders, ocrOrder: validatedOcrOrder, extractionOrder: validatedExtractionOrder };
}

function validateProviderEntry(name: string, raw: unknown): ProviderEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config providers invalide : le provider "${name}" n'est pas un objet`);
  }
  const { apiKeyEnv, accountIdEnv, ocr, extraction } = raw as Record<string, unknown>;

  if (typeof apiKeyEnv !== "string" || apiKeyEnv.trim() === "") {
    throw new Error(`Config providers invalide : "${name}.apiKeyEnv" doit être une chaîne non vide`);
  }
  if (accountIdEnv !== undefined && (typeof accountIdEnv !== "string" || accountIdEnv.trim() === "")) {
    throw new Error(`Config providers invalide : "${name}.accountIdEnv" doit être une chaîne non vide`);
  }
  if (ocr === undefined && extraction === undefined) {
    throw new Error(`Config providers invalide : "${name}" ne déclare ni "ocr" ni "extraction"`);
  }

  return {
    apiKeyEnv,
    ...(accountIdEnv !== undefined ? { accountIdEnv } : {}),
    ...(ocr !== undefined ? { ocr: validateCapability(name, "ocr", ocr) } : {}),
    ...(extraction !== undefined ? { extraction: validateCapability(name, "extraction", extraction) } : {}),
  };
}

function validateCapability(providerName: string, capability: string, raw: unknown): ProviderCapability {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config providers invalide : "${providerName}.${capability}" n'est pas un objet`);
  }
  const { model, freeQuota, contextCharThreshold } = raw as Record<string, unknown>;

  if (typeof model !== "string" || model.trim() === "") {
    throw new Error(`Config providers invalide : "${providerName}.${capability}.model" doit être une chaîne non vide`);
  }
  if (typeof freeQuota !== "object" || freeQuota === null) {
    throw new Error(`Config providers invalide : "${providerName}.${capability}.freeQuota" doit être un objet`);
  }
  if (contextCharThreshold !== undefined && typeof contextCharThreshold !== "number") {
    throw new Error(`Config providers invalide : "${providerName}.${capability}.contextCharThreshold" doit être un nombre`);
  }

  return {
    model,
    freeQuota: freeQuota as ProviderFreeQuota,
    ...(contextCharThreshold !== undefined ? { contextCharThreshold } : {}),
  };
}

function validateOrder(
  raw: unknown,
  fieldName: string,
  providers: Record<string, ProviderEntry>,
  capability: "ocr" | "extraction",
): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Config providers invalide : "${fieldName}" doit être un tableau non vide`);
  }
  return raw.map((name, index) => {
    if (typeof name !== "string") {
      throw new Error(`Config providers invalide : "${fieldName}[${index}]" doit être une chaîne`);
    }
    const provider = providers[name];
    if (!provider) {
      throw new Error(`Config providers invalide : "${fieldName}" référence le provider inconnu "${name}"`);
    }
    if (!provider[capability]) {
      throw new Error(`Config providers invalide : "${fieldName}" liste "${name}" qui ne déclare pas la capacité "${capability}"`);
    }
    return name;
  });
}
