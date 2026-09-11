/** Bbox en fraction [0, 1] de la largeur/hauteur de la page, origine en haut à gauche. */
export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrTextItem {
  text: string;
  bbox: OcrBoundingBox;
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  items: OcrTextItem[];
}

export interface OcrResult {
  pages: OcrPage[];
}

export interface OcrProvider {
  run(pdfBytes: Uint8Array): Promise<OcrResult>;
}
