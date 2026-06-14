import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  GripVertical,
  Plus,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, WheelEvent as ReactWheelEvent } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import appIconUrl from "../src-tauri/icons/icon.png";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import "pdfjs-dist/web/pdf_viewer.css";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const THUMBNAIL_WIDTH = 144;
const EXPORT_PAGE_PREVIEW_MAX_WIDTH = 170;
const EXPORT_PAGE_PREVIEW_MAX_HEIGHT = 170;
const PREVIEW_MIN_SCALE = 0.45;
const PREVIEW_MAX_SCALE = 10;
const PREVIEW_MAX_CANVAS_PIXELS = 24_000_000;
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs-dist/`;

const ZOOM_OPTIONS = [
  { value: "auto", label: "自动缩放" },
  { value: "page-actual", label: "实际大小" },
  { value: "page-fit", label: "适合页面" },
  { value: "page-width", label: "适合页宽" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

type SourcePage = {
  id: string;
  documentId: string;
  documentName: string;
  documentPath: string;
  pageNumber: number;
  thumbnailUrl: string;
  pageWidth: number;
  pageHeight: number;
};

type ImportedPdf = {
  id: string;
  name: string;
  path: string;
  pageCount: number;
  pdf: PDFDocumentProxy;
  pages: SourcePage[];
};

type ExportPage = {
  id: string;
  source: SourcePage;
  rotation: number;
};

type ExportFile = {
  id: string;
  name: string;
  pages: ExportPage[];
};

type PreviewTarget = {
  source: SourcePage;
  rotation: number;
};

type OperationRecord =
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

type ExportSnapshotFile = {
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

type CompletionSnapshot = {
  createdAt: string;
  outputFileCount: number;
  operations: OperationRecord[];
  outputs: ExportSnapshotFile[];
};

type FileContextMenu = {
  documentId: string;
  x: number;
  y: number;
};

type ExportPageContextMenu = {
  exportPageId: string;
  x: number;
  y: number;
};

const DEFAULT_EXPORT_FILE_ID = "output-default";
const DEFAULT_EXPORT_FILE_NAME = "新PDF 1";

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function getTimestamp() {
  return new Date().toISOString();
}

function getPdfDocument(data: Uint8Array<ArrayBufferLike>) {
  return pdfjsLib.getDocument({
    data,
    cMapPacked: true,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
    useSystemFonts: true,
  });
}

async function renderPageThumbnail(page: PDFPageProxy) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = THUMBNAIL_WIDTH / baseViewport.width;
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

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function getExportPagePreviewStyle(source: SourcePage, rotation: number) {
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

function buildCompletionSnapshot(exportFiles: ExportFile[], operations: OperationRecord[]) {
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

function App() {
  const nextIdRef = useRef(1);
  const loadingTasksRef = useRef<PDFDocumentLoadingTask[]>([]);
  const importedPdfsRef = useRef<ImportedPdf[]>([]);

  const [importedPdfs, setImportedPdfs] = useState<ImportedPdf[]>([]);
  const [activeImportedPdfId, setActiveImportedPdfId] = useState("");
  const [selectedSourcePageIds, setSelectedSourcePageIds] = useState<string[]>([]);
  const [exportFiles, setExportFiles] = useState<ExportFile[]>(() => [
    {
      id: DEFAULT_EXPORT_FILE_ID,
      name: DEFAULT_EXPORT_FILE_NAME,
      pages: [],
    },
  ]);
  const [activeExportFileId, setActiveExportFileId] = useState(DEFAULT_EXPORT_FILE_ID);
  const [selectedExportPageIds, setSelectedExportPageIds] = useState<string[]>([]);
  const [operations, setOperations] = useState<OperationRecord[]>(() => [
    {
      type: "create_output",
      outputFileId: DEFAULT_EXPORT_FILE_ID,
      outputFileName: DEFAULT_EXPORT_FILE_NAME,
      timestamp: getTimestamp(),
    },
  ]);
  const [completionSnapshot, setCompletionSnapshot] = useState<CompletionSnapshot | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenu | null>(null);
  const [exportPageContextMenu, setExportPageContextMenu] = useState<ExportPageContextMenu | null>(null);
  const [draggedExportPageId, setDraggedExportPageId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("导入 PDF 后，在页面库中选择页面并添加到导出文件");

  useEffect(() => {
    const preventContextMenu = (event: Event) => {
      event.preventDefault();
    };
    const preventCtrlWheelZoom = (event: WheelEvent) => {
      const target = event.target;
      const isPreviewWheel = target instanceof Element && target.closest(".preview-window");

      if (event.ctrlKey && !isPreviewWheel) {
        event.preventDefault();
      }
    };
    const closeContextMenu = () => {
      setFileContextMenu(null);
      setExportPageContextMenu(null);
    };

    window.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("wheel", preventCtrlWheelZoom, { passive: false });
    window.addEventListener("click", closeContextMenu);

    return () => {
      window.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("wheel", preventCtrlWheelZoom);
      window.removeEventListener("click", closeContextMenu);
    };
  }, []);

  useEffect(() => {
    importedPdfsRef.current = importedPdfs;
  }, [importedPdfs]);

  useEffect(() => {
    return () => {
      loadingTasksRef.current.forEach((task) => {
        task.destroy();
      });
      importedPdfsRef.current.forEach((item) => {
        item.pdf.cleanup();
      });
    };
  }, []);

  const createId = useCallback((prefix: string) => {
    const id = `${prefix}-${Date.now()}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }, []);

  const activeImportedPdf = useMemo(
    () => importedPdfs.find((pdf) => pdf.id === activeImportedPdfId) ?? importedPdfs[0] ?? null,
    [activeImportedPdfId, importedPdfs],
  );
  const sourcePages = useMemo(() => activeImportedPdf?.pages ?? [], [activeImportedPdf]);
  const activeExportFile = useMemo(
    () => exportFiles.find((file) => file.id === activeExportFileId) ?? exportFiles[0] ?? null,
    [activeExportFileId, exportFiles],
  );
  const activeExportPages = useMemo(() => activeExportFile?.pages ?? [], [activeExportFile]);
  const selectedSourcePages = useMemo(
    () => sourcePages.filter((page) => selectedSourcePageIds.includes(page.id)),
    [selectedSourcePageIds, sourcePages],
  );
  const totalExportPageCount = useMemo(() => exportFiles.reduce((sum, file) => sum + file.pages.length, 0), [exportFiles]);
  const contextMenuPdf = useMemo(
    () => importedPdfs.find((pdf) => pdf.id === fileContextMenu?.documentId) ?? null,
    [fileContextMenu?.documentId, importedPdfs],
  );
  const contextMenuExportPage = useMemo(
    () => activeExportPages.find((page) => page.id === exportPageContextMenu?.exportPageId) ?? null,
    [activeExportPages, exportPageContextMenu?.exportPageId],
  );

  const renderImportedPdf = useCallback(
    async (path: string) => {
      const data = await readFile(path);
      const loadingTask = getPdfDocument(data);
      loadingTasksRef.current.push(loadingTask);
      const pdf = await loadingTask.promise;
      const documentId = createId("doc");
      const documentName = getFileName(path);
      const pages: SourcePage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const { thumbnailUrl, pageWidth, pageHeight } = await renderPageThumbnail(page);
        pages.push({
          id: createId("source-page"),
          documentId,
          documentName,
          documentPath: path,
          pageNumber,
          thumbnailUrl,
          pageWidth,
          pageHeight,
        });
      }

      return {
        id: documentId,
        name: documentName,
        path,
        pageCount: pdf.numPages,
        pdf,
        pages,
      };
    },
    [createId],
  );

  const importPdfs = useCallback(async () => {
    setError("");
    setIsImporting(true);

    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
        title: "导入 PDF",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      const selectedPaths = Array.isArray(selected) ? selected : selected ? [selected] : [];

      if (selectedPaths.length === 0) {
        setStatusMessage("未选择 PDF 文件");
        return;
      }

      const nextPdfs: ImportedPdf[] = [];

      for (const path of selectedPaths) {
        nextPdfs.push(await renderImportedPdf(path));
      }

      setImportedPdfs((current) => [...current, ...nextPdfs]);
      setActiveImportedPdfId(nextPdfs[0]?.id ?? activeImportedPdfId);
      setSelectedSourcePageIds([]);
      setOperations((current) => [
        ...current,
        ...nextPdfs.map((pdf) => ({
          type: "import_document" as const,
          documentId: pdf.id,
          fileName: pdf.name,
          path: pdf.path,
          pageCount: pdf.pageCount,
          timestamp: getTimestamp(),
        })),
      ]);
      setStatusMessage(`已导入 ${nextPdfs.length} 个 PDF，共 ${nextPdfs.reduce((sum, item) => sum + item.pageCount, 0)} 页`);
      setCompletionSnapshot(null);
    } catch (cause) {
      setError(`导入失败：${getErrorMessage(cause)}`);
    } finally {
      setIsImporting(false);
    }
  }, [activeImportedPdfId, renderImportedPdf]);

  const selectImportedPdf = useCallback((documentId: string) => {
    setActiveImportedPdfId(documentId);
    setSelectedSourcePageIds([]);
  }, []);

  const createExportFile = useCallback(() => {
    const outputFileId = createId("output");
    const outputFileName = `新PDF ${exportFiles.length + 1}`;
    const nextFile: ExportFile = {
      id: outputFileId,
      name: outputFileName,
      pages: [],
    };

    setExportFiles((current) => [...current, nextFile]);
    setActiveExportFileId(outputFileId);
    setSelectedExportPageIds([]);
    setCompletionSnapshot(null);
    setOperations((records) => [
      ...records,
      {
        type: "create_output",
        outputFileId,
        outputFileName,
        timestamp: getTimestamp(),
      },
    ]);
    setStatusMessage(`已创建 ${outputFileName}`);
  }, [createId, exportFiles.length]);

  const deleteImportedPdf = useCallback(
    (documentId: string) => {
      const removedPdf = importedPdfs.find((pdf) => pdf.id === documentId);

      if (!removedPdf) {
        return;
      }

      removedPdf.pdf.cleanup();
      setImportedPdfs((current) => current.filter((pdf) => pdf.id !== documentId));
      setSelectedSourcePageIds((current) => current.filter((pageId) => !removedPdf.pages.some((page) => page.id === pageId)));
      setSelectedExportPageIds((current) =>
        current.filter((pageId) => !exportFiles.some((file) => file.pages.some((page) => page.id === pageId && page.source.documentId === documentId))),
      );
      setExportFiles((current) => {
        const removedExportPageCount = current.reduce(
          (sum, file) => sum + file.pages.filter((page) => page.source.documentId === documentId).length,
          0,
        );
        setOperations((records) => [
          ...records,
          {
            type: "remove_document",
            documentId: removedPdf.id,
            fileName: removedPdf.name,
            path: removedPdf.path,
            pageCount: removedPdf.pageCount,
            removedExportPageCount,
            timestamp: getTimestamp(),
          },
        ]);
        return current.map((file) => ({
          ...file,
          pages: file.pages.filter((page) => page.source.documentId !== documentId),
        }));
      });
      setActiveImportedPdfId((current) => {
        if (current !== documentId) {
          return current;
        }

        return importedPdfs.find((pdf) => pdf.id !== documentId)?.id ?? "";
      });
      setPreviewTarget((current) => (current?.source.documentId === documentId ? null : current));
      setCompletionSnapshot(null);
      setFileContextMenu(null);
      setStatusMessage(`已删除 ${removedPdf.name}`);
    },
    [exportFiles, importedPdfs],
  );

  const toggleSourcePage = useCallback((pageId: string, event?: MouseEvent<HTMLButtonElement>) => {
    setSelectedSourcePageIds((current) => {
      if (event?.shiftKey) {
        return current.includes(pageId) ? current : [...current, pageId];
      }

      return current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId];
    });
  }, []);

  const toggleExportPage = useCallback((pageId: string, event?: MouseEvent<HTMLButtonElement>) => {
    setSelectedExportPageIds((current) => {
      if (event?.shiftKey) {
        return current.includes(pageId) ? current : [...current, pageId];
      }

      return current.includes(pageId) ? current.filter((id) => id !== pageId) : [pageId];
    });
  }, []);

  const addSourcePagesToActiveExport = useCallback(
    (pagesToAdd: SourcePage[]) => {
      if (!activeExportFile) {
        setStatusMessage("请先创建新 PDF 文件");
        return;
      }

      if (pagesToAdd.length === 0) {
        setStatusMessage("请先在页面库中选择页面");
        return;
      }

      setExportFiles((current) =>
        current.map((file) => {
          if (file.id !== activeExportFile.id) {
            return file;
          }

          const startIndex = file.pages.length;
          const nextPages = pagesToAdd.map((source) => ({
            id: createId("export-page"),
            source,
            rotation: 0,
          }));

          setOperations((records) => [
            ...records,
            ...nextPages.map((page, offset) => ({
              type: "add_page" as const,
              outputFileId: file.id,
              outputFileName: file.name,
              exportPageId: page.id,
              sourceDocumentId: page.source.documentId,
              sourceDocumentName: page.source.documentName,
              sourcePath: page.source.documentPath,
              sourcePageNumber: page.source.pageNumber,
              targetIndex: startIndex + offset + 1,
              rotation: page.rotation,
              timestamp: getTimestamp(),
            })),
          ]);
          setSelectedExportPageIds(nextPages.map((page) => page.id));
          setStatusMessage(`已添加 ${nextPages.length} 页到 ${file.name}`);
          setCompletionSnapshot(null);

          return {
            ...file,
            pages: [...file.pages, ...nextPages],
          };
        }),
      );
    },
    [activeExportFile, createId],
  );

  const addSelectedToExport = useCallback(() => {
    addSourcePagesToActiveExport(selectedSourcePages);
  }, [addSourcePagesToActiveExport, selectedSourcePages]);

  const exportAllSourcePages = useCallback(() => {
    if (sourcePages.length === 0) {
      setStatusMessage("当前输入文件没有可导出的页面");
      return;
    }

    addSourcePagesToActiveExport(sourcePages);
  }, [addSourcePagesToActiveExport, sourcePages]);

  const rotateExportPages = useCallback((pageIds: string[]) => {
    if (!activeExportFile) {
      setStatusMessage("请先创建新 PDF 文件");
      return;
    }

    if (pageIds.length === 0) {
      setStatusMessage("请先选择导出文件中的页面");
      return;
    }

    setExportFiles((current) =>
      current.map((file) => {
        if (file.id !== activeExportFile.id) {
          return file;
        }

        const nextPages = file.pages.map((page) => (pageIds.includes(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page));
        const changedRecords = nextPages.flatMap((page, index) => {
          if (!pageIds.includes(page.id)) {
            return [];
          }

          return [
            {
              type: "rotate_page" as const,
              outputFileId: file.id,
              outputFileName: file.name,
              exportPageId: page.id,
              sourceDocumentId: page.source.documentId,
              sourcePageNumber: page.source.pageNumber,
              targetIndex: index + 1,
              rotation: page.rotation,
              timestamp: getTimestamp(),
            },
          ];
        });

        setOperations((records) => [...records, ...changedRecords]);
        setStatusMessage(`已旋转 ${changedRecords.length} 页`);
        setCompletionSnapshot(null);
        return {
          ...file,
          pages: nextPages,
        };
      }),
    );
  }, [activeExportFile]);

  const removeExportPages = useCallback((pageIds: string[]) => {
    if (!activeExportFile) {
      setStatusMessage("请先创建新 PDF 文件");
      return;
    }

    if (pageIds.length === 0) {
      setStatusMessage("请先选择导出文件中的页面");
      return;
    }

    setExportFiles((current) =>
      current.map((file) => {
        if (file.id !== activeExportFile.id) {
          return file;
        }

        const removedRecords = file.pages.flatMap((page, index) => {
          if (!pageIds.includes(page.id)) {
            return [];
          }

          return [
            {
              type: "remove_page" as const,
              outputFileId: file.id,
              outputFileName: file.name,
              exportPageId: page.id,
              sourceDocumentId: page.source.documentId,
              sourcePageNumber: page.source.pageNumber,
              targetIndex: index + 1,
              timestamp: getTimestamp(),
            },
          ];
        });

        setOperations((records) => [...records, ...removedRecords]);
        setSelectedExportPageIds((currentSelected) => currentSelected.filter((id) => !pageIds.includes(id)));
        setStatusMessage(`已从 ${file.name} 删除 ${removedRecords.length} 页`);
        setCompletionSnapshot(null);

        return {
          ...file,
          pages: file.pages.filter((page) => !pageIds.includes(page.id)),
        };
      }),
    );
  }, [activeExportFile]);

  const reorderExportPage = useCallback((targetId: string, sourceId = draggedExportPageId) => {
    if (!activeExportFile) {
      return;
    }

    setExportFiles((current) =>
      current.map((file) => {
        if (file.id !== activeExportFile.id || !sourceId || sourceId === targetId) {
          return file;
        }

        const fromIndex = file.pages.findIndex((page) => page.id === sourceId);
        const toIndex = file.pages.findIndex((page) => page.id === targetId);

        if (fromIndex < 0 || toIndex < 0) {
          return file;
        }

        const nextPages = [...file.pages];
        const [movedPage] = nextPages.splice(fromIndex, 1);
        nextPages.splice(toIndex, 0, movedPage);
        setOperations((records) => [
          ...records,
          {
            type: "reorder_page",
            outputFileId: file.id,
            outputFileName: file.name,
            exportPageId: movedPage.id,
            fromIndex: fromIndex + 1,
            toIndex: toIndex + 1,
            timestamp: getTimestamp(),
          },
        ]);
        setStatusMessage(`已将 ${file.name} 第 ${fromIndex + 1} 页移动到第 ${toIndex + 1} 页`);
        setCompletionSnapshot(null);

        return {
          ...file,
          pages: nextPages,
        };
      }),
    );
    setDraggedExportPageId(null);
  }, [activeExportFile, draggedExportPageId]);

  const startExportPageDrag = useCallback((event: DragEvent<HTMLElement>, pageId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedExportPageId(pageId);
  }, []);

  const finishExport = useCallback(() => {
    if (totalExportPageCount === 0) {
      setStatusMessage("输出文件中还没有页面");
      return;
    }

    const { snapshot, completeRecord } = buildCompletionSnapshot(exportFiles, operations);
    setOperations((current) => [...current, completeRecord]);
    setCompletionSnapshot(snapshot);
    setStatusMessage(`已生成 ${snapshot.outputFileCount} 个输出文件的操作记录`);
  }, [exportFiles, operations, totalExportPageCount]);

  return (
    <main className="app-shell">
      <section className="app-topbar" aria-label="应用工具栏">
        <div className="app-brand">
          <img src={appIconUrl} alt="" aria-hidden="true" />
          <strong>PDFLeaf</strong>
        </div>
      </section>

      <div className="workspace">
        <aside className="import-rail" aria-label="已导入文件">
          <div className="rail-heading">
            <span>已导入文件</span>
            <Button type="button" variant="ghost" size="icon" onClick={importPdfs} disabled={isImporting} title="导入 PDF">
              <FilePlus2 aria-hidden="true" />
            </Button>
          </div>

          <div className="file-list">
            {importedPdfs.length === 0 ? (
              <button className="drop-import" type="button" onClick={importPdfs}>
                <Plus aria-hidden="true" />
                <span>点击导入 PDF</span>
              </button>
            ) : (
              importedPdfs.map((pdf) => (
                <button
                  className={activeImportedPdf?.id === pdf.id ? "file-item file-item-active" : "file-item"}
                  key={pdf.id}
                  type="button"
                  onClick={() => selectImportedPdf(pdf.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFileContextMenu({
                      documentId: pdf.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                    setExportPageContextMenu(null);
                  }}
                >
                  <FileText aria-hidden="true" />
                  <div>
                    <strong title={pdf.name}>{pdf.name}</strong>
                    <span>{pdf.pageCount} 页</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="page-library panel-frame" aria-label="页面库">
          <header className="panel-header">
            <div>
              <h1>页面库</h1>
              {activeImportedPdf ? (
                <p className="library-meta">
                  <span className="library-file-name" title={activeImportedPdf.name}>
                    {activeImportedPdf.name}
                  </span>
                  <span className="library-page-count">共 {sourcePages.length} 页，已选择 {selectedSourcePages.length} 页</span>
                </p>
              ) : (
                <p>导入 PDF 后会显示分页缩略图</p>
              )}
            </div>
            <div className="panel-actions">
              <Button type="button" variant="outline" onClick={exportAllSourcePages} disabled={sourcePages.length === 0 || !activeExportFile}>
                <FileText data-icon="inline-start" aria-hidden="true" />
                导出全部
              </Button>
              <Button type="button" variant="outline" onClick={addSelectedToExport} disabled={selectedSourcePages.length === 0 || !activeExportFile}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                添加到导出
              </Button>
            </div>
          </header>

          <div className={sourcePages.length === 0 ? "thumbnail-grid source-grid thumbnail-grid-empty" : "thumbnail-grid source-grid"}>
            {sourcePages.length === 0 ? (
              <div className="empty-state">
                <FilePlus2 aria-hidden="true" />
                <strong>页面库为空</strong>
                <span>{error || statusMessage}</span>
              </div>
            ) : (
              sourcePages.map((page) => {
                const isSelected = selectedSourcePageIds.includes(page.id);
                return (
                  <button
                    className={isSelected ? "page-thumb page-thumb-selected" : "page-thumb"}
                    key={page.id}
                    type="button"
                    onClick={(event) => toggleSourcePage(page.id, event)}
                    onDoubleClick={() => setPreviewTarget({ source: page, rotation: 0 })}
                    aria-pressed={isSelected}
                  >
                    <span className="thumb-image-wrap">
                      <img src={page.thumbnailUrl} alt={`${page.documentName} 第 ${page.pageNumber} 页`} />
                      {isSelected && (
                        <span className="selection-check">
                          <Check aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="thumb-caption">
                      <strong>{page.pageNumber}</strong>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="export-panel panel-frame" aria-label="导出文件">
          <header className="panel-header">
            <div>
              <h2>导出文件</h2>
              <p>
                {activeExportFile
                  ? `${activeExportFile.name} · ${activeExportPages.length} 页，可拖拽排序`
                  : "创建新 PDF 文件后，从页面库导入页面"}
              </p>
            </div>
            <div className="panel-actions">
              <Button type="button" variant="outline" onClick={createExportFile}>
                <FilePlus2 data-icon="inline-start" aria-hidden="true" />
                创建新 PDF 文件
              </Button>
            </div>
          </header>

          {exportFiles.length > 0 && (
            <div className="export-file-tabs" aria-label="输出文件列表">
              {exportFiles.map((file) => (
                <button
                  className={activeExportFile?.id === file.id ? "export-file-tab export-file-tab-active" : "export-file-tab"}
                  key={file.id}
                  type="button"
                  onClick={() => {
                    setActiveExportFileId(file.id);
                    setSelectedExportPageIds([]);
                  }}
                >
                  <FileText aria-hidden="true" />
                  <span>{file.name}</span>
                  <small>{file.pages.length} 页</small>
                </button>
              ))}
            </div>
          )}

          <div className={activeExportPages.length === 0 ? "thumbnail-grid export-grid thumbnail-grid-empty" : "thumbnail-grid export-grid"}>
            {activeExportPages.length === 0 ? (
              <div className="empty-state">
                <Plus aria-hidden="true" />
                <strong>{activeExportFile ? "输出文件为空" : "创建输出文件"}</strong>
                <span>{activeExportFile ? "选择左侧页面后点击“添加到导出”或“导出全部”" : "点击右上角“创建新 PDF 文件”"}</span>
              </div>
            ) : (
              activeExportPages.map((page, index) => {
                const isSelected = selectedExportPageIds.includes(page.id);
                const previewStyle = getExportPagePreviewStyle(page.source, page.rotation);
                return (
                  <article
                    className={isSelected ? "export-card export-card-selected" : "export-card"}
                    key={page.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExportPageContextMenu({
                        exportPageId: page.id,
                        x: event.clientX,
                        y: event.clientY,
                      });
                      setFileContextMenu(null);
                    }}
                    onDragOver={(event: DragEvent<HTMLElement>) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderExportPage(page.id, event.dataTransfer.getData("text/plain"));
                    }}
                  >
                    <button
                      className="export-thumb-button"
                      type="button"
                      onClick={(event) => toggleExportPage(page.id, event)}
                      onDoubleClick={() => setPreviewTarget({ source: page.source, rotation: page.rotation })}
                      aria-pressed={isSelected}
                    >
                      <span className="export-page-frame" style={previewStyle}>
                        <img src={page.source.thumbnailUrl} alt={`导出第 ${index + 1} 页`} />
                      </span>
                    </button>
                    <div className="export-card-meta">
                      <button
                        className="export-drag-handle"
                        type="button"
                        draggable
                        onDragStart={(event) => startExportPageDrag(event, page.id)}
                        onDragEnd={() => setDraggedExportPageId(null)}
                        title="拖拽排序"
                        aria-label={`拖拽第 ${index + 1} 页排序`}
                      >
                        <GripVertical aria-hidden="true" />
                      </button>
                      <span>{index + 1}</span>
                      <small>{page.source.documentName} · {page.source.pageNumber}</small>
                      <button type="button" onClick={() => rotateExportPages([page.id])} title="旋转">
                        <RotateCw aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => removeExportPages([page.id])} title="删除">
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <footer className="export-footer">
            <Button className="finish-button" type="button" onClick={finishExport} disabled={totalExportPageCount === 0}>
              完成
            </Button>
          </footer>

          {completionSnapshot && (
            <pre className="operation-output" aria-label="操作记录">
              {JSON.stringify(completionSnapshot, null, 2)}
            </pre>
          )}
        </section>
      </div>

      {fileContextMenu && contextMenuPdf && (
        <div className="file-context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }} role="menu">
          <button type="button" role="menuitem" onClick={() => deleteImportedPdf(contextMenuPdf.id)}>
            <Trash2 aria-hidden="true" />
            删除文件
          </button>
        </div>
      )}

      {exportPageContextMenu && contextMenuExportPage && (
        <div className="file-context-menu" style={{ left: exportPageContextMenu.x, top: exportPageContextMenu.y }} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              rotateExportPages([contextMenuExportPage.id]);
              setExportPageContextMenu(null);
            }}
          >
            <RotateCw aria-hidden="true" />
            旋转页面
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              removeExportPages([contextMenuExportPage.id]);
              setExportPageContextMenu(null);
            }}
          >
            <Trash2 aria-hidden="true" />
            删除页面
          </button>
        </div>
      )}

      {previewTarget && <PreviewModal target={previewTarget} importedPdfs={importedPdfs} onClose={() => setPreviewTarget(null)} />}
    </main>
  );
}

function PreviewModal({
  target,
  importedPdfs,
  onClose,
}: {
  target: PreviewTarget;
  importedPdfs: ImportedPdf[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{
    relativeX: number;
    relativeY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [zoomValue, setZoomValue] = useState("page-width");
  const [rotation, setRotation] = useState(target.rotation);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderPreview() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const sourcePdf = importedPdfs.find((pdf) => pdf.id === target.source.documentId);

      if (!canvas || !context || !sourcePdf) {
        return;
      }

      try {
        const page = await sourcePdf.pdf.getPage(target.source.pageNumber);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const parsedScale = Number(zoomValue);
        const fitWidthScale = Math.max(PREVIEW_MIN_SCALE, 760 / baseViewport.width);
        const fitPageScale = Math.max(PREVIEW_MIN_SCALE, Math.min(760 / baseViewport.width, 620 / baseViewport.height));
        const nextScale =
          zoomValue === "auto" || zoomValue === "page-width"
            ? Math.min(PREVIEW_MAX_SCALE, fitWidthScale)
            : zoomValue === "page-fit"
              ? Math.min(PREVIEW_MAX_SCALE, fitPageScale)
              : zoomValue === "page-actual"
                ? 1
                : Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, Number.isFinite(parsedScale) ? parsedScale : 1));
        const viewport = page.getViewport({ scale: nextScale, rotation });

        if (cancelled) {
          return;
        }

        const outputScale = Math.max(
          1,
          Math.min(window.devicePixelRatio || 1, Math.sqrt(PREVIEW_MAX_CANVAS_PIXELS / (viewport.width * viewport.height))),
        );
        const canvasWidth = Math.floor(viewport.width * outputScale);
        const canvasHeight = Math.floor(viewport.height * outputScale);

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise;
        page.cleanup();
        if (cancelled) {
          return;
        }

        const zoomAnchor = zoomAnchorRef.current;

        if (zoomAnchor) {
          zoomAnchorRef.current = null;
          requestAnimationFrame(() => {
            const previewScroll = previewScrollRef.current;
            const previewCanvas = canvasRef.current;

            if (!previewScroll || !previewCanvas) {
              return;
            }

            const scrollRect = previewScroll.getBoundingClientRect();
            const canvasRect = previewCanvas.getBoundingClientRect();
            const anchoredClientX = canvasRect.left + canvasRect.width * zoomAnchor.relativeX;
            const anchoredClientY = canvasRect.top + canvasRect.height * zoomAnchor.relativeY;

            previewScroll.scrollLeft += anchoredClientX - (scrollRect.left + zoomAnchor.offsetX);
            previewScroll.scrollTop += anchoredClientY - (scrollRect.top + zoomAnchor.offsetY);
          });
        }

        setScale(nextScale);
        setError("");
      } catch (cause) {
        if (!cancelled) {
          setError(`预览失败：${getErrorMessage(cause)}`);
        }
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [importedPdfs, rotation, target.source.documentId, target.source.pageNumber, zoomValue]);

  const changeZoom = useCallback((nextScale: number) => {
    const clampedScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, nextScale));
    setZoomValue(String(Number(clampedScale.toFixed(2))));
  }, []);

  const handlePreviewWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const canvas = canvasRef.current;

      if (canvas) {
        const scrollRect = event.currentTarget.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        if (canvasRect.width > 0 && canvasRect.height > 0) {
          zoomAnchorRef.current = {
            relativeX: Math.min(1, Math.max(0, (event.clientX - canvasRect.left) / canvasRect.width)),
            relativeY: Math.min(1, Math.max(0, (event.clientY - canvasRect.top) / canvasRect.height)),
            offsetX: event.clientX - scrollRect.left,
            offsetY: event.clientY - scrollRect.top,
          };
        }
      }

      changeZoom(scale + (event.deltaY < 0 ? 0.25 : -0.25));
    },
    [changeZoom, scale],
  );

  const canZoomOut = scale > PREVIEW_MIN_SCALE + 0.01;
  const canZoomIn = scale < PREVIEW_MAX_SCALE - 0.01;

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="预览">
      <div className="preview-window">
        <header className="preview-titlebar">
          <span>预览 · {target.source.documentName} · 第 {target.source.pageNumber} 页</span>
          <button type="button" onClick={onClose} aria-label="关闭预览">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="preview-toolbar">
          <button type="button" title="上一页" disabled>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="preview-page-number">{target.source.pageNumber} / {target.source.pageNumber}</span>
          <button type="button" title="下一页" disabled>
            <ChevronRight aria-hidden="true" />
          </button>
          <span className="preview-divider" />
          <button type="button" onClick={() => changeZoom(scale - 0.15)} disabled={!canZoomOut} title="缩小">
            <ZoomOut aria-hidden="true" />
          </button>
          <button type="button" onClick={() => changeZoom(scale + 0.15)} disabled={!canZoomIn} title="放大">
            <ZoomIn aria-hidden="true" />
          </button>
          <NativeSelect
            value={zoomValue}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;

              if (nextValue === "auto" || nextValue === "page-actual" || nextValue === "page-fit" || nextValue === "page-width") {
                setZoomValue(nextValue);
                return;
              }

              const nextScale = Number(nextValue);
              setZoomValue(String(Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, Number.isFinite(nextScale) ? nextScale : 1))));
            }}
            aria-label="缩放比例"
          >
            {zoomValue !== "page-width" && !ZOOM_OPTIONS.some((option) => option.value === zoomValue) && (
              <option value={zoomValue}>{Math.round(scale * 100)}%</option>
            )}
            {ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <button type="button" onClick={() => setRotation((current) => (current + 90) % 360)} title="旋转">
            <RotateCw aria-hidden="true" />
          </button>
        </div>
        <div className="preview-canvas-wrap" ref={previewScrollRef} onWheel={handlePreviewWheel}>
          {error ? <p className="preview-error">{error}</p> : <canvas ref={canvasRef} aria-label="PDF 页面预览" />}
        </div>
      </div>
    </div>
  );
}

export default App;
