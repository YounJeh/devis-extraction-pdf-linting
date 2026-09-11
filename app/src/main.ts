import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";
import type { ExtractedField, ExtractResponse, OcrPage, OcrTextItem } from "./types";
import fieldsConfigJson from "../config/fields.config.json";
import { validateExtractionConfig } from "../config/schema";
import { mountFieldEditor } from "./field-editor";
import { get, escapeHtml } from "./dom-utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 30;

const fieldsConfig = validateExtractionConfig(fieldsConfigJson);

function emptyFields(): ExtractedField[] {
  return fieldsConfig.fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: null,
    evidence: null,
    page: null,
    source: "En attente",
  }));
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app introuvable");

app.innerHTML = `
  <div class="shell">
    <main>
      <section class="hero">
        <div>
          <p class="eyebrow">Photovoltaïque · Document intelligence</p>
          <p class="hero-copy">
            Extrayez les informations de vos devis. Vérifiez chaque détail à la source.
          </p>
        </div>
        <div class="hero-actions">
          <button class="btn" id="export-json" type="button">Exporter le JSON</button>
          <button class="btn btn-primary" id="print-pdf" type="button">PDF annoté</button>
        </div>
      </section>

      <section class="workspace">
        <div class="left-column">
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Déposez votre devis ici</h2>
              <span class="badge">PDF</span>
            </div>
            <div class="upload-wrap">
              <label class="dropzone" id="dropzone" tabindex="0" for="pdf-input">
                <span class="dropzone-icon">↑</span>
                <strong>Déposez votre devis ici</strong>
                <p>PDF natif ou scanné · 4 Mo maximum · Jusqu'à 30 pages</p>
                <span class="btn btn-primary">Importer un PDF</span>
              </label>
              <input class="file-input" id="pdf-input" type="file" accept="application/pdf,.pdf" />
              <div class="processing" id="processing"><span class="spinner"></span><span id="processing-label">Analyse du document…</span></div>
              <div class="message" id="message"></div>
            </div>
          </section>

          <section class="panel" style="margin-top: 20px">
            <div class="panel-header">
              <h2 class="panel-title">Champs extraits</h2>
              <div class="panel-header-actions">
                <button class="control-btn" id="field-editor-open" type="button">Réglages des champs</button>
                <span class="panel-count" id="field-count">6 / 6</span>
              </div>
            </div>
            <div class="fields-intro">Cliquez sur un champ pour le retrouver dans le document.</div>
            <div class="fields-list" id="fields-list"></div>
            <p class="rule-note">
              Extraction automatique par OCR et IA, à vérifier. Un champ absent n'est jamais déduit.
            </p>
          </section>
        </div>

        <section class="panel viewer-panel">
          <div class="panel-header">
            <div class="viewer-meta">
              <div class="viewer-file" id="viewer-file">Aucun document</div>
              <div class="viewer-subtitle" id="viewer-subtitle">En attente d'un PDF</div>
            </div>
            <span class="badge" id="viewer-badge">En attente</span>
          </div>

          <div class="viewer-controls">
            <button class="control-btn" id="prev-page" type="button">Page précédente</button>
            <span class="control-label" id="page-label">1 / 1</span>
            <button class="control-btn" id="next-page" type="button">Page suivante</button>
            <span class="spacer"></span>
            <button class="control-btn" id="zoom-out" type="button">Réduire</button>
            <span class="control-label" id="zoom-label">100 %</span>
            <button class="control-btn" id="zoom-in" type="button">Agrandir</button>
            <label class="toggle"><input id="highlight-toggle" type="checkbox" checked /> Surlignage</label>
          </div>

          <div class="document-stage" id="document-stage">
            <div class="document-frame" id="document-frame">
              <div class="empty-state" id="empty-state">Déposez un PDF pour commencer.</div>
              <canvas class="pdf-canvas" id="pdf-canvas" hidden></canvas>
              <div class="highlight-layer" id="highlight-layer"></div>
            </div>
          </div>

          <div class="source-panel">
            <div class="source-label">Source de l'information</div>
            <div class="source-evidence" id="source-evidence">Aucune source identifiée dans le document.</div>
            <div class="source-meta" id="source-meta">En attente · Page non identifiée</div>
          </div>
        </section>
      </section>
    </main>

    <footer class="footer">
      <span>Clarté · L'information, avec sa source.</span>
      <span>Vos PDF restent dans votre navigateur.</span>
    </footer>

    <div class="modal-overlay" id="field-editor-overlay" hidden>
      <div class="modal panel" id="field-editor-modal" role="dialog" aria-modal="true" aria-labelledby="field-editor-title">
        <div class="panel-header">
          <h2 class="panel-title" id="field-editor-title">Réglages des champs</h2>
          <button class="control-btn" id="field-editor-close" type="button">Fermer</button>
        </div>
        <div class="field-editor-body">
          <label class="field-editor-field">
            <span class="field-editor-field-label">Contexte du document</span>
            <textarea id="field-editor-context" rows="3"></textarea>
          </label>
          <div class="field-editor-list" id="field-editor-list"></div>
          <button class="btn" id="field-editor-add" type="button">+ Ajouter un champ</button>
          <div class="message" id="field-editor-message"></div>
        </div>
        <div class="field-editor-footer">
          <button class="btn" id="field-editor-import-btn" type="button">Importer un JSON</button>
          <input type="file" id="field-editor-import-input" accept="application/json,.json" hidden />
          <button class="btn btn-primary" id="field-editor-export" type="button">Exporter le JSON</button>
        </div>
      </div>
    </div>
  </div>
`;

const input = get<HTMLInputElement>("#pdf-input");
const dropzone = get<HTMLLabelElement>("#dropzone");
const fieldsList = get<HTMLDivElement>("#fields-list");
const fieldCount = get<HTMLSpanElement>("#field-count");
const processing = get<HTMLDivElement>("#processing");
const processingLabel = get<HTMLSpanElement>("#processing-label");
const message = get<HTMLDivElement>("#message");
const viewerFile = get<HTMLDivElement>("#viewer-file");
const viewerSubtitle = get<HTMLDivElement>("#viewer-subtitle");
const viewerBadge = get<HTMLSpanElement>("#viewer-badge");
const pageLabel = get<HTMLSpanElement>("#page-label");
const prevPage = get<HTMLButtonElement>("#prev-page");
const nextPage = get<HTMLButtonElement>("#next-page");
const zoomOut = get<HTMLButtonElement>("#zoom-out");
const zoomIn = get<HTMLButtonElement>("#zoom-in");
const zoomLabel = get<HTMLSpanElement>("#zoom-label");
const highlightToggle = get<HTMLInputElement>("#highlight-toggle");
const emptyState = get<HTMLDivElement>("#empty-state");
const canvas = get<HTMLCanvasElement>("#pdf-canvas");
const highlightLayer = get<HTMLDivElement>("#highlight-layer");
const documentFrame = get<HTMLDivElement>("#document-frame");
const sourceEvidence = get<HTMLDivElement>("#source-evidence");
const sourceMeta = get<HTMLDivElement>("#source-meta");
const exportJson = get<HTMLButtonElement>("#export-json");
const printPdf = get<HTMLButtonElement>("#print-pdf");

const fieldEditor = mountFieldEditor(fieldsConfig);

let fields: ExtractedField[] = emptyFields();
let activeFieldId = fields[0].id;
let pdfDocument: any = null;
let ocrPages: OcrPage[] = [];
let currentPage = 1;
let zoom = 1;
let hasDocument = false;
let renderSequence = 0;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function showMessage(text: string, kind: "error" | "warning"): void {
  message.textContent = text;
  message.className = `message visible ${kind}`;
}

function clearMessage(): void {
  message.textContent = "";
  message.className = "message";
}

function activeField(): ExtractedField | undefined {
  return fields.find((field) => field.id === activeFieldId);
}

function renderFields(): void {
  const complete = fields.filter((field) => field.value !== null).length;
  fieldCount.textContent = `${complete} / ${fields.length}`;
  fieldsList.innerHTML = fields
    .map((field) => {
      const active = field.id === activeFieldId ? " active" : "";
      const empty = field.value === null ? " empty" : "";
      const value = field.value ?? "Non trouvé";
      const evidence = field.evidence ? `« ${escapeHtml(field.evidence)} »` : "Aucune source identifiée";
      const page = field.page ? `Page ${field.page}` : "—";
      return `
        <div class="field-card${active}${empty}" role="button" tabindex="0" data-field-id="${field.id}">
          <span class="field-topline">
            <span class="field-label">${escapeHtml(field.label)}</span>
            <span class="field-page">${page}</span>
          </span>
          <div class="field-value-row">
            <div class="field-value">${escapeHtml(value)}</div>
            <button
              class="copy-btn"
              type="button"
              data-copy-field-id="${field.id}"
              aria-label="Copier la valeur"
              title="Copier la valeur"
              ${field.value === null ? "disabled" : ""}
            ><span class="copy-icon">⧉</span></button>
          </div>
          <div class="field-evidence">${evidence}</div>
        </div>
      `;
    })
    .join("");

  fieldsList.querySelectorAll<HTMLElement>("[data-field-id]").forEach((card) => {
    const activate = async () => {
      activeFieldId = card.dataset.fieldId ?? activeFieldId;
      const field = activeField();
      if (field?.page) currentPage = field.page;
      renderFields();
      await renderViewer();
    };
    card.addEventListener("click", () => void activate());
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void activate();
      }
    });
  });

  fieldsList.querySelectorAll<HTMLButtonElement>(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const field = fields.find((candidate) => candidate.id === button.dataset.copyFieldId);
      if (!field?.value) return;
      void copyToClipboard(field.value, button);
    });
  });
}

async function copyToClipboard(value: string, button: HTMLButtonElement): Promise<void> {
  const icon = button.querySelector<HTMLSpanElement>(".copy-icon");
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    console.error(error);
    return;
  }
  button.classList.add("copied");
  if (icon) icon.textContent = "✓";
  setTimeout(() => {
    button.classList.remove("copied");
    if (icon) icon.textContent = "⧉";
  }, 1500);
}

function updateSourcePanel(): void {
  const field = activeField();
  sourceEvidence.textContent = field?.evidence ? `« ${field.evidence} »` : "Aucune source identifiée dans le document.";
  const source = field?.source ?? "En attente";
  const page = field?.page ? `Page ${field.page}` : "Page non identifiée";
  sourceMeta.textContent = `${source} · ${page}`;
}

function updateControls(): void {
  const total = hasDocument ? pdfDocument?.numPages ?? 1 : 1;
  pageLabel.textContent = `${currentPage} / ${total}`;
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= total;
  zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
}

async function renderViewer(): Promise<void> {
  updateSourcePanel();
  updateControls();

  if (!hasDocument) {
    emptyState.hidden = false;
    canvas.hidden = true;
    highlightLayer.innerHTML = "";
    return;
  }

  emptyState.hidden = true;
  canvas.hidden = false;
  await renderPdfPage();
}

async function renderPdfPage(): Promise<void> {
  if (!pdfDocument) return;
  const sequence = ++renderSequence;
  const page = await pdfDocument.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1.25 * zoom });
  const devicePixelRatio = window.devicePixelRatio || 1;
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = Math.floor(viewport.width * devicePixelRatio);
  canvas.height = Math.floor(viewport.height * devicePixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  highlightLayer.style.width = `${viewport.width}px`;
  highlightLayer.style.height = `${viewport.height}px`;

  await page.render({
    canvasContext: context,
    viewport,
    transform: devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
  }).promise;
  if (sequence !== renderSequence) return;

  highlightLayer.innerHTML = "";
  if (!highlightToggle.checked) return;
  const field = activeField();
  if (!field?.value || field.page !== currentPage) return;

  const ocrPage = ocrPages[currentPage - 1];
  if (!ocrPage) return;
  drawPdfHighlights(ocrPage.items, viewport, field);
}

function drawPdfHighlights(items: OcrTextItem[], viewport: any, field: ExtractedField): void {
  const normalizedValue = normalize(field.value ?? "");
  const normalizedEvidence = normalize(field.evidence ?? "");
  let candidates = items.filter((item) => {
    const text = normalize(item.text);
    if (!text) return false;
    return normalizedValue.includes(text) || text.includes(normalizedValue);
  });

  if (candidates.length === 0) {
    candidates = items.filter((item) => {
      const text = normalize(item.text);
      return text.length >= 4 && normalizedEvidence.includes(text);
    });
  }

  candidates.forEach((item) => {
    const rectangle = document.createElement("div");
    rectangle.className = "pdf-highlight";
    rectangle.style.left = `${item.bbox.x * viewport.width - 2}px`;
    rectangle.style.top = `${item.bbox.y * viewport.height - 1}px`;
    rectangle.style.width = `${item.bbox.width * viewport.width + 4}px`;
    rectangle.style.height = `${item.bbox.height * viewport.height + 3}px`;
    highlightLayer.appendChild(rectangle);
  });
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

async function callExtractApi(bytes: Uint8Array): Promise<ExtractResponse> {
  const configOverride = fieldEditor.getConfigOverride();
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64: arrayBufferToBase64(bytes),
      ...(configOverride ? { configOverride } : {}),
    }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Réponse du serveur illisible (${response.status}).`);
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Erreur serveur (${response.status}).`;
    throw new Error(message);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { pages?: unknown }).pages) ||
    !Array.isArray((body as { fields?: unknown }).fields)
  ) {
    throw new Error("Réponse du serveur invalide (structure inattendue).");
  }

  return body as ExtractResponse;
}

async function loadPdf(file: File): Promise<void> {
  clearMessage();
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showMessage("Le fichier doit être un PDF.", "error");
    return;
  }
  if (file.size > MAX_BYTES) {
    showMessage(`Ce PDF dépasse la limite de ${MAX_BYTES / (1024 * 1024)} Mo.`, "error");
    return;
  }

  processing.classList.add("visible");
  processingLabel.textContent = "Lecture du document…";
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const loadedDocument = await loadingTask.promise;
    if (loadedDocument.numPages > MAX_PAGES) {
      await loadingTask.destroy();
      throw new Error(`Ce PDF contient ${loadedDocument.numPages} pages ; la limite est de ${MAX_PAGES}.`);
    }

    processingLabel.textContent = "Analyse OCR et extraction en cours…";
    // PDF.js transfère (et détache) le buffer passé à getDocument() vers son worker,
    // donc on relit le fichier plutôt que de réutiliser le même ArrayBuffer.
    const result = await callExtractApi(new Uint8Array(await file.arrayBuffer()));

    if (pdfDocument) await pdfDocument.loadingTask.destroy();
    pdfDocument = loadedDocument;
    ocrPages = result.pages;
    fields = result.fields.map((field) => ({ ...field, source: "Mistral OCR + Groq" as const }));
    activeFieldId = fields.find((field) => field.value)?.id ?? fields[0].id;
    currentPage = fields.find((field) => field.id === activeFieldId)?.page ?? 1;
    zoom = 1;
    hasDocument = true;

    viewerFile.textContent = file.name;
    viewerSubtitle.textContent = `${loadedDocument.numPages} page${loadedDocument.numPages > 1 ? "s" : ""} · OCR + extraction`;
    viewerBadge.textContent = "PDF importé";

    renderFields();
    await renderViewer();
  } catch (error) {
    console.error(error);
    showMessage(error instanceof Error ? error.message : "Impossible de traiter ce PDF.", "error");
  } finally {
    processing.classList.remove("visible");
    input.value = "";
  }
}

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file) void loadPdf(file);
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadPdf(file);
});

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    input.click();
  }
});

prevPage.addEventListener("click", async () => {
  if (currentPage > 1) {
    currentPage -= 1;
    await renderViewer();
  }
});

nextPage.addEventListener("click", async () => {
  const total = hasDocument ? pdfDocument?.numPages ?? 1 : 1;
  if (currentPage < total) {
    currentPage += 1;
    await renderViewer();
  }
});

zoomOut.addEventListener("click", async () => {
  zoom = Math.max(0.6, Math.round((zoom - 0.1) * 10) / 10);
  await renderViewer();
});

zoomIn.addEventListener("click", async () => {
  zoom = Math.min(1.8, Math.round((zoom + 0.1) * 10) / 10);
  await renderViewer();
});

highlightToggle.addEventListener("change", () => void renderViewer());

exportJson.addEventListener("click", () => {
  const payload = {
    document: viewerFile.textContent,
    generated_at: new Date().toISOString(),
    fields: Object.fromEntries(
      fields.map((field) => [
        field.id,
        {
          label: field.label,
          value: field.value,
          grounding: {
            evidence: field.evidence,
            page: field.page,
          },
          source: field.source,
        },
      ]),
    ),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(viewerFile.textContent ?? "clarte").replace(/\.pdf$/i, "")}_extraction.json`;
  link.click();
  URL.revokeObjectURL(url);
});

printPdf.addEventListener("click", () => {
  window.print();
});

window.addEventListener("resize", () => {
  if (hasDocument) void renderPdfPage();
});

renderFields();
void renderViewer();
