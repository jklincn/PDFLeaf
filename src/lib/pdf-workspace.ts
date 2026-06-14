import type { CSSProperties } from "react";
import {
  EXPORT_PAGE_PREVIEW_MAX_HEIGHT,
  EXPORT_PAGE_PREVIEW_MAX_WIDTH,
} from "@/constants/pdf-workspace";
import type { ExportFile, OperationRecord, SourcePage } from "@/types/pdf-workspace";

export function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function getTimestamp() {
  return new Date().toISOString();
}

export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function getPageFrameStyle(source: SourcePage, rotation: number) {
  const normalizedRotation = normalizeRotation(rotation);
  const isSideways = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = isSideways ? source.pageHeight : source.pageWidth;
  const rotatedHeight = isSideways ? source.pageWidth : source.pageHeight;
  const scale = Math.min(EXPORT_PAGE_PREVIEW_MAX_WIDTH / rotatedWidth, EXPORT_PAGE_PREVIEW_MAX_HEIGHT / rotatedHeight);

  return {
    "--page-frame-width": `${rotatedWidth * scale}px`,
    "--page-frame-height": `${rotatedHeight * scale}px`,
    "--page-image-width": `${source.pageWidth * scale}px`,
    "--page-image-height": `${source.pageHeight * scale}px`,
    "--page-rotation": `${normalizedRotation}deg`,
  } as CSSProperties;
}

export function getExportPagePreviewStyle(source: SourcePage, rotation: number) {
  return getPageFrameStyle(source, rotation);
}

export function buildCompletionSnapshot(exportFiles: ExportFile[], operations: OperationRecord[]) {
  const timestamp = getTimestamp();
  const outputs = exportFiles
    .filter((file) => file.pages.length > 0)
    .map((file) => ({
      outputFileId: file.id,
      outputFileName: file.name,
      pageCount: file.pages.length,
      pages: file.pages.map((page, index) => ({
        targetIndex: index + 1,
        sourceDocumentId: page.source.documentId,
        sourceDocumentName: page.source.documentName,
        sourcePath: page.source.documentPath,
        sourcePageNumber: page.source.pageNumber,
        rotation: page.rotation,
      })),
    }));
  const completeRecord: OperationRecord = {
    type: "complete",
    outputFileCount: outputs.length,
    outputs,
    timestamp,
  };

  return {
    snapshot: {
      createdAt: timestamp,
      outputFileCount: outputs.length,
      operations: [...operations, completeRecord],
      outputs,
    },
    completeRecord,
  };
}
