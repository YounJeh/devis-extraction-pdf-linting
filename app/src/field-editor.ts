import type { ExtractionConfig } from "../config/schema";
import { validateExtractionConfig } from "../config/schema";
import { get, escapeHtml } from "./dom-utils";

export interface FieldEditorController {
  getConfigOverride(): ExtractionConfig | undefined;
}

function cloneConfig(config: ExtractionConfig): ExtractionConfig {
  return {
    documentContext: config.documentContext,
    fields: config.fields.map((field) => ({ ...field })),
  };
}

export function mountFieldEditor(defaultConfig: ExtractionConfig): FieldEditorController {
  const openButton = get<HTMLButtonElement>("#field-editor-open");
  const overlay = get<HTMLDivElement>("#field-editor-overlay");
  const closeButton = get<HTMLButtonElement>("#field-editor-close");
  const contextInput = get<HTMLTextAreaElement>("#field-editor-context");
  const list = get<HTMLDivElement>("#field-editor-list");
  const addButton = get<HTMLButtonElement>("#field-editor-add");
  const messageEl = get<HTMLDivElement>("#field-editor-message");
  const importButton = get<HTMLButtonElement>("#field-editor-import-btn");
  const importInput = get<HTMLInputElement>("#field-editor-import-input");
  const exportButton = get<HTMLButtonElement>("#field-editor-export");

  let draft = cloneConfig(defaultConfig);
  let dirty = false;

  function markDirty(): void {
    dirty = true;
  }

  function showError(text: string): void {
    messageEl.textContent = text;
    messageEl.className = "message visible error";
  }

  function clearError(): void {
    messageEl.textContent = "";
    messageEl.className = "message";
  }

  function validateDraft(): void {
    try {
      validateExtractionConfig(draft);
      clearError();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Config invalide.");
    }
  }

  function renderList(): void {
    list.innerHTML = draft.fields
      .map(
        (field, index) => `
        <div class="field-editor-row" data-index="${index}">
          <div class="field-editor-row-grid">
            <label class="field-editor-field">
              <span class="field-editor-field-label">Id</span>
              <input type="text" class="fe-id" value="${escapeHtml(field.id)}" />
            </label>
            <label class="field-editor-field">
              <span class="field-editor-field-label">Label</span>
              <input type="text" class="fe-label" value="${escapeHtml(field.label)}" />
            </label>
          </div>
          <label class="field-editor-field">
            <span class="field-editor-field-label">Instructions d'extraction</span>
            <textarea class="fe-instructions" rows="2">${escapeHtml(field.instructions ?? "")}</textarea>
          </label>
          <label class="field-editor-field">
            <span class="field-editor-field-label">Exemple (optionnel)</span>
            <input type="text" class="fe-example" value="${escapeHtml(field.example ?? "")}" />
          </label>
          <button class="control-btn fe-remove" type="button">Supprimer ce champ</button>
        </div>
      `,
      )
      .join("");

    list.querySelectorAll<HTMLElement>(".field-editor-row").forEach((row) => {
      const index = Number(row.dataset.index);

      const idInput = row.querySelector<HTMLInputElement>(".fe-id");
      idInput?.addEventListener("input", () => {
        draft.fields[index].id = idInput.value;
        markDirty();
      });
      idInput?.addEventListener("blur", validateDraft);

      const labelInput = row.querySelector<HTMLInputElement>(".fe-label");
      labelInput?.addEventListener("input", () => {
        draft.fields[index].label = labelInput.value;
        markDirty();
      });
      labelInput?.addEventListener("blur", validateDraft);

      row.querySelector<HTMLTextAreaElement>(".fe-instructions")?.addEventListener("input", (event) => {
        draft.fields[index].instructions = (event.target as HTMLTextAreaElement).value;
        markDirty();
      });

      row.querySelector<HTMLInputElement>(".fe-example")?.addEventListener("input", (event) => {
        draft.fields[index].example = (event.target as HTMLInputElement).value;
        markDirty();
      });

      row.querySelector<HTMLButtonElement>(".fe-remove")?.addEventListener("click", () => {
        draft.fields.splice(index, 1);
        markDirty();
        renderList();
        validateDraft();
      });
    });
  }

  function loadDraft(config: ExtractionConfig): void {
    draft = cloneConfig(config);
    contextInput.value = draft.documentContext;
    renderList();
  }

  contextInput.addEventListener("input", () => {
    draft.documentContext = contextInput.value;
    markDirty();
  });

  addButton.addEventListener("click", () => {
    draft.fields.push({ id: "", label: "", instructions: "", example: "" });
    markDirty();
    renderList();
    validateDraft();
  });

  openButton.addEventListener("click", () => {
    overlay.hidden = false;
  });

  closeButton.addEventListener("click", () => {
    overlay.hidden = true;
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });

  importButton.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) void importConfigFile(file);
  });

  async function importConfigFile(file: File): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      loadDraft(validateExtractionConfig(parsed));
      markDirty();
      clearError();
    } catch (error) {
      showError(error instanceof Error ? `Import invalide : ${error.message}` : "Import invalide.");
    } finally {
      importInput.value = "";
    }
  }

  exportButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fields.config.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  contextInput.value = draft.documentContext;
  renderList();

  return {
    getConfigOverride(): ExtractionConfig | undefined {
      if (!dirty) return undefined;
      return cloneConfig(draft);
    },
  };
}
