import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export type SourcePage = {
  id: string;
  documentId: string;
  documentName: string;
  documentPath: string;
  pageNumber: number;
  thumbnailUrl: string;
  pageWidth: number;
  pageHeight: number;
};

export type ImportedPdf = {
  id: string;
  name: string;
  path: string;
  pageCount: number;
  pdf: PDFDocumentProxy;
  pages: SourcePage[];
};

export type ExportPage = {
  id: string;
  source: SourcePage;
  rotation: number;
};

export type ExportFile = {
  id: string;
  name: string;
  pages: ExportPage[];
};

export type PreviewTarget = {
  source: SourcePage;
  rotation: number;
};

export type OperationRecord =
  | {
      type: "import_document";
      documentId: string;
      fileName: string;
      path: string;
      pageCount: number;
      timestamp: string;
    }
  | {
      type: "create_output";
      outputFileId: string;
      outputFileName: string;
      timestamp: string;
    }
  | {
      type: "add_page";
      outputFileId: string;
      outputFileName: string;
      exportPageId: string;
      sourceDocumentId: string;
      sourceDocumentName: string;
      sourcePath: string;
      sourcePageNumber: number;
      targetIndex: number;
      rotation: number;
      timestamp: string;
    }
  | {
      type: "remove_page";
      outputFileId: string;
      outputFileName: string;
      exportPageId: string;
      sourceDocumentId: string;
      sourcePageNumber: number;
      targetIndex: number;
      timestamp: string;
    }
  | {
      type: "rotate_page";
      outputFileId: string;
      outputFileName: string;
      exportPageId: string;
      sourceDocumentId: string;
      sourcePageNumber: number;
      targetIndex: number;
      rotation: number;
      timestamp: string;
    }
  | {
      type: "reorder_page";
      outputFileId: string;
      outputFileName: string;
      exportPageId: string;
      fromIndex: number;
      toIndex: number;
      timestamp: string;
    }
  | {
      type: "remove_document";
      documentId: string;
      fileName: string;
      path: string;
      pageCount: number;
      removedExportPageCount: number;
      timestamp: string;
    }
  | {
      type: "complete";
      outputFileCount: number;
      outputs: ExportSnapshotFile[];
      timestamp: string;
    };

export type ExportSnapshotFile = {
  outputFileId: string;
  outputFileName: string;
  pageCount: number;
  pages: Array<{
    sourceDocumentId: string;
    sourceDocumentName: string;
    sourcePath: string;
    sourcePageNumber: number;
    rotation: number;
    targetIndex: number;
  }>;
};

export type CompletionSnapshot = {
  createdAt: string;
  outputFileCount: number;
  operations: OperationRecord[];
  outputs: ExportSnapshotFile[];
};

export type FileContextMenu = {
  documentId: string;
  x: number;
  y: number;
};

export type ExportPageContextMenu = {
  exportPageId: string;
  x: number;
  y: number;
};

export type ExportFileContextMenu = {
  fileId: string;
  x: number;
  y: number;
};

export type ImportProgress = {
  current: number;
  total: number;
};
