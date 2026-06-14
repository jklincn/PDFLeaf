import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { THUMBNAIL_MAX_HEIGHT, THUMBNAIL_WIDTH } from "@/constants/pdf-workspace";

let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;

const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs-dist/`;

async function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist");
    const pdfjsLib = await pdfjsLibPromise;
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }

  return pdfjsLibPromise;
}

export async function getPdfDocument(data: Uint8Array<ArrayBufferLike>) {
  const pdfjsLib = await getPdfjsLib();

  return pdfjsLib.getDocument({
    data,
    cMapPacked: true,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
    useSystemFonts: true,
  });
}

export async function renderPageThumbnail(page: PDFPageProxy) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(THUMBNAIL_WIDTH / baseViewport.width, THUMBNAIL_MAX_HEIGHT / baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法创建缩略图画布");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const thumbnailUrl = canvas.toDataURL("image/png");
  page.cleanup();

  return {
    thumbnailUrl,
    pageWidth: baseViewport.width,
    pageHeight: baseViewport.height,
  };
}
