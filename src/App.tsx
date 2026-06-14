import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { AppTopbar } from "@/components/AppTopbar";
import { ExportDialog } from "@/components/ExportDialog";
import { ExportPanel } from "@/components/ExportPanel";
import { ImportProgressDialog } from "@/components/ImportProgressDialog";
import { ImportRail } from "@/components/ImportRail";
import { PageLibrary } from "@/components/PageLibrary";
import { PreviewModal } from "@/components/PreviewModal";
import { WorkspaceContextMenus } from "@/components/WorkspaceContextMenus";
import {
  DEFAULT_EXPORT_FILE_ID,
  DEFAULT_EXPORT_FILE_NAME,
} from "@/constants/pdf-workspace";
import { getPdfDocument, renderPageThumbnail } from "@/lib/pdf";
import {
  getErrorMessage,
  getFileName,
  getTimestamp,
} from "@/lib/pdf-workspace";
import type {
  CompletionSnapshot,
  ExportFile,
  ExportFileContextMenu,
  ExportPageContextMenu,
  FileContextMenu,
  ImportedPdf,
  ImportProgress,
  OperationRecord,
  PreviewTarget,
  SourcePage,
} from "@/types/pdf-workspace";
import "./App.css";

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
  const [_operations, setOperations] = useState<OperationRecord[]>(() => [
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
  const [exportFileContextMenu, setExportFileContextMenu] = useState<ExportFileContextMenu | null>(null);
  const [draggedExportPageId, setDraggedExportPageId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
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
      setExportFileContextMenu(null);
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

  useEffect(() => {
    if (!draggedExportPageId) {
      return;
    }

    const stopPointerDrag = () => {
      setDraggedExportPageId(null);
    };

    window.addEventListener("pointerup", stopPointerDrag);
    window.addEventListener("pointercancel", stopPointerDrag);

    return () => {
      window.removeEventListener("pointerup", stopPointerDrag);
      window.removeEventListener("pointercancel", stopPointerDrag);
    };
  }, [draggedExportPageId]);

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
  const contextMenuExportFilePageCount = useMemo(
    () => exportFiles.find((file) => file.id === exportFileContextMenu?.fileId)?.pages.length ?? 0,
    [exportFiles, exportFileContextMenu?.fileId],
  );

  const renderImportedPdf = useCallback(
    async (path: string, options?: { pdf: PDFDocumentProxy; onPageProgress?: () => void }) => {
      let pdf = options?.pdf;

      if (!pdf) {
        const data = await readFile(path);
        const loadingTask = await getPdfDocument(data);
        loadingTasksRef.current.push(loadingTask);
        pdf = await loadingTask.promise;
      }

      const documentId = createId("doc");
      const documentName = getFileName(path);
      const pages: SourcePage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const { thumbnailUrl, pageWidth, pageHeight } = await renderPageThumbnail(page);
        options?.onPageProgress?.();
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

      const existingPaths = new Set(importedPdfs.map((pdf) => pdf.path));
      const newPaths = selectedPaths.filter((path) => !existingPaths.has(path));

      if (newPaths.length === 0) {
        setStatusMessage("所选文件均已导入");
        return;
      }

      if (newPaths.length < selectedPaths.length) {
        setStatusMessage(`${selectedPaths.length - newPaths.length} 个文件已存在，跳过`);
      }

      const pdfInfos: Array<{ path: string; pdf: PDFDocumentProxy }> = [];

      for (const path of newPaths) {
        const data = await readFile(path);
        const loadingTask = await getPdfDocument(data);
        loadingTasksRef.current.push(loadingTask);
        const pdf = await loadingTask.promise;
        pdfInfos.push({ path, pdf });
      }

      const totalPages = pdfInfos.reduce((sum, info) => sum + info.pdf.numPages, 0);
      let renderedPages = 0;
      setImportProgress({ current: 0, total: totalPages });

      const nextPdfs: ImportedPdf[] = [];

      for (const { path, pdf } of pdfInfos) {
        const onPageProgress = () => {
          renderedPages += 1;

          if (renderedPages % 3 === 0 || renderedPages === totalPages) {
            setImportProgress({ current: renderedPages, total: totalPages });
            setStatusMessage(`正在导入... ${renderedPages}/${totalPages} 页`);
          }
        };

        nextPdfs.push(await renderImportedPdf(path, { pdf, onPageProgress }));
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
      setImportProgress(null);
    }
  }, [activeImportedPdfId, importedPdfs, renderImportedPdf]);

  const selectImportedPdf = useCallback((documentId: string) => {
    setActiveImportedPdfId(documentId);
    setSelectedSourcePageIds([]);
  }, []);

  const selectExportFile = useCallback((fileId: string) => {
    setActiveExportFileId(fileId);
    setSelectedExportPageIds([]);
  }, []);

  const openImportedFileContextMenu = useCallback((documentId: string, x: number, y: number) => {
    setFileContextMenu({ documentId, x, y });
    setExportPageContextMenu(null);
    setExportFileContextMenu(null);
  }, []);

  const openExportPageContextMenu = useCallback((exportPageId: string, x: number, y: number) => {
    setExportPageContextMenu({ exportPageId, x, y });
    setFileContextMenu(null);
    setExportFileContextMenu(null);
  }, []);

  const openExportFileContextMenu = useCallback((fileId: string, x: number, y: number) => {
    setExportFileContextMenu({ fileId, x, y });
    setFileContextMenu(null);
    setExportPageContextMenu(null);
  }, []);

  const createExportFile = useCallback(() => {
    const outputFileId = createId("output");
    const usedNums: number[] = [];
    let hasDefault = false;

    for (const file of exportFiles) {
      if (file.name === DEFAULT_EXPORT_FILE_NAME) {
        hasDefault = true;
      } else {
        const match = file.name.match(/^output(\d+)\.pdf$/);

        if (match) {
          usedNums.push(parseInt(match[1], 10));
        }
      }
    }

    let renameNum = 1;
    while (usedNums.includes(renameNum)) renameNum += 1;

    if (hasDefault) {
      usedNums.push(renameNum);
    }

    let nextNum = 1;
    while (usedNums.includes(nextNum)) nextNum += 1;

    const newFileName = `output${nextNum}.pdf`;

    setExportFiles((current) => {
      const renamed = hasDefault
        ? current.map((file) => (file.name === DEFAULT_EXPORT_FILE_NAME ? { ...file, name: `output${renameNum}.pdf` } : file))
        : current;

      return [...renamed, { id: outputFileId, name: newFileName, pages: [] }];
    });
    setActiveExportFileId(outputFileId);
    setSelectedExportPageIds([]);
    setCompletionSnapshot(null);
    setOperations((records) => [
      ...records,
      {
        type: "create_output",
        outputFileId,
        outputFileName: newFileName,
        timestamp: getTimestamp(),
      },
    ]);
    setStatusMessage(`已创建 ${newFileName}`);
  }, [createId, exportFiles]);

  const deleteExportFile = useCallback(
    (fileId: string) => {
      setExportFileContextMenu(null);

      if (exportFiles.length <= 1) {
        return;
      }

      const removedFile = exportFiles.find((file) => file.id === fileId);

      if (!removedFile) {
        return;
      }

      setExportFiles((current) => {
        const remaining = current.filter((file) => file.id !== fileId);

        if (remaining.length === 1) {
          return remaining.map((file) => ({ ...file, name: DEFAULT_EXPORT_FILE_NAME }));
        }

        return remaining.map((file, index) => ({ ...file, name: `output${index + 1}.pdf` }));
      });

      if (activeExportFileId === fileId) {
        const nextFile = exportFiles.find((file) => file.id !== fileId);
        setActiveExportFileId(nextFile?.id ?? "");
        setSelectedExportPageIds([]);
      }

      setCompletionSnapshot(null);
      setStatusMessage(`已删除 ${removedFile.name}`);
    },
    [activeExportFileId, exportFiles],
  );

  const clearExportFile = useCallback(
    (fileId: string) => {
      setExportFileContextMenu(null);

      const targetFile = exportFiles.find((file) => file.id === fileId);

      if (!targetFile) {
        return;
      }

      const pageCount = targetFile.pages.length;

      if (pageCount === 0) {
        return;
      }

      setExportFiles((current) =>
        current.map((file) => (file.id === fileId ? { ...file, pages: [] } : file)),
      );

      if (activeExportFileId === fileId) {
        setSelectedExportPageIds([]);
      }

      setCompletionSnapshot(null);
      setStatusMessage(`已清空 ${targetFile.name}，共删除 ${pageCount} 页`);
    },
    [activeExportFileId, exportFiles],
  );

  const deleteImportedPdf = useCallback(
    (documentId: string) => {
      const removedPdf = importedPdfs.find((pdf) => pdf.id === documentId);

      if (!removedPdf) {
        return;
      }

      const removedExportPageCount = exportFiles.reduce(
        (sum, file) => sum + file.pages.filter((page) => page.source.documentId === documentId).length,
        0,
      );

      removedPdf.pdf.cleanup();
      setImportedPdfs((current) => current.filter((pdf) => pdf.id !== documentId));
      setSelectedSourcePageIds((current) => current.filter((pageId) => !removedPdf.pages.some((page) => page.id === pageId)));
      setSelectedExportPageIds((current) =>
        current.filter((pageId) => !exportFiles.some((file) => file.pages.some((page) => page.id === pageId && page.source.documentId === documentId))),
      );
      setExportFiles((current) =>
        current.map((file) => ({
          ...file,
          pages: file.pages.filter((page) => page.source.documentId !== documentId),
        })),
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

      const startIndex = activeExportFile.pages.length;
      const nextPages = pagesToAdd.map((source) => ({
        id: createId("export-page"),
        source,
        rotation: 0,
      }));
      const addPageRecords: OperationRecord[] = nextPages.map((page, offset) => ({
        type: "add_page",
        outputFileId: activeExportFile.id,
        outputFileName: activeExportFile.name,
        exportPageId: page.id,
        sourceDocumentId: page.source.documentId,
        sourceDocumentName: page.source.documentName,
        sourcePath: page.source.documentPath,
        sourcePageNumber: page.source.pageNumber,
        targetIndex: startIndex + offset + 1,
        rotation: page.rotation,
        timestamp: getTimestamp(),
      }));

      setExportFiles((current) =>
        current.map((file) => (file.id === activeExportFile.id ? { ...file, pages: [...file.pages, ...nextPages] } : file)),
      );
      setOperations((records) => [...records, ...addPageRecords]);
      setStatusMessage(`已添加 ${nextPages.length} 页到 ${activeExportFile.name}`);
      setCompletionSnapshot(null);
    },
    [activeExportFile, createId],
  );

  const addSelectedToExport = useCallback(() => {
    addSourcePagesToActiveExport(selectedSourcePages);
    setSelectedSourcePageIds([]);
  }, [addSourcePagesToActiveExport, selectedSourcePages]);

  const exportAllSourcePages = useCallback(() => {
    if (sourcePages.length === 0) {
      setStatusMessage("当前输入文件没有可导出的页面");
      return;
    }

    addSourcePagesToActiveExport(sourcePages);
  }, [addSourcePagesToActiveExport, sourcePages]);

  const rotateExportPages = useCallback(
    (pageIds: string[]) => {
      if (!activeExportFile) {
        setStatusMessage("请先创建新 PDF 文件");
        return;
      }

      if (pageIds.length === 0) {
        setStatusMessage("请先选择导出文件中的页面");
        return;
      }

      const pageIdSet = new Set(pageIds);
      const changedRecords: OperationRecord[] = activeExportFile.pages.flatMap((page, index) => {
        if (!pageIdSet.has(page.id)) {
          return [];
        }

        return [
          {
            type: "rotate_page" as const,
            outputFileId: activeExportFile.id,
            outputFileName: activeExportFile.name,
            exportPageId: page.id,
            sourceDocumentId: page.source.documentId,
            sourcePageNumber: page.source.pageNumber,
            targetIndex: index + 1,
            rotation: (page.rotation + 90) % 360,
            timestamp: getTimestamp(),
          },
        ];
      });

      setExportFiles((current) =>
        current.map((file) =>
          file.id === activeExportFile.id
            ? {
                ...file,
                pages: file.pages.map((page) => (pageIdSet.has(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page)),
              }
            : file,
        ),
      );
      setOperations((records) => [...records, ...changedRecords]);
      setStatusMessage(`已旋转 ${changedRecords.length} 页`);
      setCompletionSnapshot(null);
    },
    [activeExportFile],
  );

  const removeExportPages = useCallback(
    (pageIds: string[]) => {
      if (!activeExportFile) {
        setStatusMessage("请先创建新 PDF 文件");
        return;
      }

      if (pageIds.length === 0) {
        setStatusMessage("请先选择导出文件中的页面");
        return;
      }

      const pageIdSet = new Set(pageIds);
      const removedRecords: OperationRecord[] = activeExportFile.pages.flatMap((page, index) => {
        if (!pageIdSet.has(page.id)) {
          return [];
        }

        return [
          {
            type: "remove_page" as const,
            outputFileId: activeExportFile.id,
            outputFileName: activeExportFile.name,
            exportPageId: page.id,
            sourceDocumentId: page.source.documentId,
            sourcePageNumber: page.source.pageNumber,
            targetIndex: index + 1,
            timestamp: getTimestamp(),
          },
        ];
      });

      setExportFiles((current) =>
        current.map((file) =>
          file.id === activeExportFile.id ? { ...file, pages: file.pages.filter((page) => !pageIdSet.has(page.id)) } : file,
        ),
      );
      setSelectedExportPageIds((currentSelected) => currentSelected.filter((id) => !pageIdSet.has(id)));
      setOperations((records) => [...records, ...removedRecords]);
      setStatusMessage(`已从 ${activeExportFile.name} 删除 ${removedRecords.length} 页`);
      setCompletionSnapshot(null);
    },
    [activeExportFile],
  );

  const reorderExportPage = useCallback(
    (targetId: string, sourceId = draggedExportPageId) => {
      if (!activeExportFile || !sourceId || sourceId === targetId) {
        return;
      }

      const fromIndex = activeExportFile.pages.findIndex((page) => page.id === sourceId);
      const toIndex = activeExportFile.pages.findIndex((page) => page.id === targetId);

      if (fromIndex < 0 || toIndex < 0) {
        return;
      }

      const nextPages = [...activeExportFile.pages];
      const [movedPage] = nextPages.splice(fromIndex, 1);
      nextPages.splice(toIndex, 0, movedPage);

      setExportFiles((current) =>
        current.map((file) => (file.id === activeExportFile.id ? { ...file, pages: nextPages } : file)),
      );
      setOperations((records) => [
        ...records,
        {
          type: "reorder_page",
          outputFileId: activeExportFile.id,
          outputFileName: activeExportFile.name,
          exportPageId: movedPage.id,
          fromIndex: fromIndex + 1,
          toIndex: toIndex + 1,
          timestamp: getTimestamp(),
        },
      ]);
      setStatusMessage(`已将 ${activeExportFile.name} 第 ${fromIndex + 1} 页移动到第 ${toIndex + 1} 页`);
      setCompletionSnapshot(null);
    },
    [activeExportFile, draggedExportPageId],
  );

  const startExportPageDrag = useCallback((pageId: string) => {
    setDraggedExportPageId(pageId);
  }, []);

  const finishExport = useCallback(() => {
    if (totalExportPageCount === 0) {
      setStatusMessage("输出文件中还没有页面");
      return;
    }
    setExportDialogOpen(true);
  }, [totalExportPageCount]);

  const previewSourcePage = useCallback((source: SourcePage, rotation = 0) => {
    setPreviewTarget({ source, rotation });
  }, []);

  const rotateContextMenuPage = useCallback(
    (exportPageId: string) => {
      rotateExportPages([exportPageId]);
      setExportPageContextMenu(null);
    },
    [rotateExportPages],
  );

  const removeContextMenuPage = useCallback(
    (exportPageId: string) => {
      removeExportPages([exportPageId]);
      setExportPageContextMenu(null);
    },
    [removeExportPages],
  );

  return (
    <main className="app-shell">
      <AppTopbar />

      {importProgress && <ImportProgressDialog progress={importProgress} />}

      <div className="workspace">
        <ImportRail
          importedPdfs={importedPdfs}
          activeImportedPdfId={activeImportedPdf?.id}
          isImporting={isImporting}
          onImportPdfs={importPdfs}
          onSelectImportedPdf={selectImportedPdf}
          onOpenContextMenu={openImportedFileContextMenu}
        />

        <PageLibrary
          sourcePages={sourcePages}
          selectedSourcePageIds={selectedSourcePageIds}
          canAddSelected={selectedSourcePages.length > 0 && Boolean(activeExportFile)}
          canExportAll={sourcePages.length > 0 && Boolean(activeExportFile)}
          statusMessage={statusMessage}
          error={error}
          onAddSelectedToExport={addSelectedToExport}
          onExportAllSourcePages={exportAllSourcePages}
          onToggleSourcePage={toggleSourcePage}
          onPreviewPage={(page) => previewSourcePage(page, 0)}
        />

        <ExportPanel
          exportFiles={exportFiles}
          activeExportFile={activeExportFile}
          activeExportPages={activeExportPages}
          selectedExportPageIds={selectedExportPageIds}
          draggingExportPageId={draggedExportPageId}
          completionSnapshot={completionSnapshot}
          totalExportPageCount={totalExportPageCount}
          onCreateExportFile={createExportFile}
          onSelectExportFile={selectExportFile}
          onOpenFileContextMenu={openExportFileContextMenu}
          onClearSelectedExportPages={() => setSelectedExportPageIds([])}
          onOpenPageContextMenu={openExportPageContextMenu}
          onReorderExportPage={reorderExportPage}
          onToggleExportPage={toggleExportPage}
          onPreviewPage={previewSourcePage}
          onStartPageDrag={startExportPageDrag}
          onEndPageDrag={() => setDraggedExportPageId(null)}
          onRotateExportPages={rotateExportPages}
          onRemoveExportPages={removeExportPages}
          onFinishExport={finishExport}
        />
      </div>

      <WorkspaceContextMenus
        fileContextMenu={fileContextMenu}
        contextMenuPdf={contextMenuPdf}
        exportPageContextMenu={exportPageContextMenu}
        contextMenuExportPage={contextMenuExportPage}
        exportFileContextMenu={exportFileContextMenu}
        exportFileCount={exportFiles.length}
        contextMenuExportFilePageCount={contextMenuExportFilePageCount}
        onDeleteImportedPdf={deleteImportedPdf}
        onRotateExportPage={rotateContextMenuPage}
        onRemoveExportPage={removeContextMenuPage}
        onDeleteExportFile={deleteExportFile}
        onClearExportFile={clearExportFile}
      />

      {previewTarget && <PreviewModal target={previewTarget} importedPdfs={importedPdfs} onClose={() => setPreviewTarget(null)} />}

      <ExportDialog
        open={exportDialogOpen}
        exportFiles={exportFiles}
        importedPdfs={importedPdfs}
        onClose={() => setExportDialogOpen(false)}
      />
    </main>
  );
}

export default App;
