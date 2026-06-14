import type { ExportFile, ImportedPdf } from "@/types/pdf-workspace";
import type { OutputDocument, OutputPage, PdfExportJob, SourceDocument } from "@/types/pdf-export";

const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);

function normalizeExportRotation(rotation: number): 0 | 90 | 180 | 270 {
  const normalized = ((rotation % 360) + 360) % 360;
  return ALLOWED_ROTATIONS.has(normalized) ? (normalized as 0 | 90 | 180 | 270) : 0;
}

/**
 * 从当前 UI 状态构建 PdfExportJob。
 * outputPath 先使用文件名占位，调用方在对话框选择目录后替换。
 */
export function buildPdfExportJob(
  exportFiles: ExportFile[],
  importedPdfs: ImportedPdf[],
): PdfExportJob {
  const nonEmptyFiles = exportFiles.filter((file) => file.pages.length > 0);

  const sources: SourceDocument[] = importedPdfs.map((pdf) => ({
    id: pdf.id,
    path: pdf.path,
    name: pdf.name,
    pageCount: pdf.pageCount,
  }));

  const outputs: OutputDocument[] = nonEmptyFiles.map((file) => ({
    id: file.id,
    outputPath: file.name, // 占位，调用方用目录 + 文件名替换
    name: file.name,
    pages: file.pages.map(
      (page): OutputPage => ({
        id: page.id,
        source: {
          documentId: page.source.documentId,
          pageNumber: page.source.pageNumber,
        },
        transform:
          page.rotation !== 0
            ? { rotate: normalizeExportRotation(page.rotation) }
            : undefined,
      }),
    ),
  }));

  return {
    schemaVersion: 1,
    sources,
    outputs,
  };
}
