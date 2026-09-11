import type { ExtractionConfig } from "../../config/schema.js";
import { validateExtractionConfig } from "../../config/schema.js";
import fieldsConfigJson from "../../config/fields.config.json" with { type: "json" };
import type { ProvidersConfig } from "../../config/providers.schema.js";
import { validateProvidersConfig } from "../../config/providers.schema.js";
import providersConfigJson from "../../config/providers.config.json" with { type: "json" };

export const EXTRACTION_CONFIG: ExtractionConfig = validateExtractionConfig(fieldsConfigJson);
export const PROVIDERS_CONFIG: ProvidersConfig = validateProvidersConfig(providersConfigJson);
