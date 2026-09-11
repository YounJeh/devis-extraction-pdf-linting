import type { ExtractionConfig } from "../../config/schema.js";
import { validateExtractionConfig } from "../../config/schema.js";
import fieldsConfigJson from "../../config/fields.config.json" with { type: "json" };

export const EXTRACTION_CONFIG: ExtractionConfig = validateExtractionConfig(fieldsConfigJson);
