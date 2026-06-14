export type PdfExportJob = {
  schemaVersion: 1;
  sources: SourceDocument[];
  outputs: OutputDocument[];
  options?: ExportJobOptions;
};

export type SourceDocument = {
  id: string;
  path: string;
  name: string;
  pageCount: number;
  password?: string;
};

export type OutputDocument = {
  id: string;
  outputPath: string;
  name?: string;
  pages: OutputPage[];
  options?: OutputDocumentOptions;
};

export type OutputPage = {
  id: string;
  source: PageSource;
  transform?: PageTransform;
};

export type PageSource = {
  documentId: string;
  pageNumber: number;
};

export type PageTransform = {
  rotate?: 0 | 90 | 180 | 270;
  crop?: CropRect;
};

export type CropRect =
  | {
      unit: "ratio";
      origin: "top-left";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      unit: "pt";
      origin: "bottom-left";
      x: number;
      y: number;
      width: number;
      height: number;
    };

export type ExportJobOptions = {
  overwritePolicy?: "fail" | "replace" | "rename";
  createParentDirs?: boolean;
};

export type OutputDocumentOptions = {
  linearize?: boolean;
  preserveMetadata?: boolean;
};

export type ExportResult = {
  success: boolean;
  outputs: ExportedFile[];
  warnings: ExportWarning[];
};

export type ExportedFile = {
  outputId: string;
  path: string;
  pageCount: number;
};

export type ExportWarning = {
  code: string;
  message: string;
  outputId?: string;
  pageId?: string;
};

export type ExportError = {
  code: string;
  message: string;
  outputId?: string;
  pageId?: string;
  details?: string;
};
