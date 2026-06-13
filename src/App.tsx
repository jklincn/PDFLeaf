import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import pageDownIcon from "pdfjs-dist/web/images/toolbarButton-pageDown.svg?url";
import pageUpIcon from "pdfjs-dist/web/images/toolbarButton-pageUp.svg?url";
import zoomInIcon from "pdfjs-dist/web/images/toolbarButton-zoomIn.svg?url";
import zoomOutIcon from "pdfjs-dist/web/images/toolbarButton-zoomOut.svg?url";
import "pdfjs-dist/web/pdf_viewer.css";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_SCALE = 0.1;
const MAX_SCALE = 25;
const WHEEL_ZOOM_DELAY_MS = 200;
const MIN_SIDEBAR_WIDTH = 240;
const MIN_VIEWER_WIDTH = 420;
const RESIZER_WIDTH = 8;
const ZOOM_OPTIONS = [
  { value: "auto", label: "自动缩放" },
  { value: "page-actual", label: "实际大小" },
  { value: "page-width", label: "适合页宽" },
  { value: "page-fit", label: "适合整页" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function resetViewerDocument(pdfViewer: PDFViewer | null, linkService: PDFLinkService | null) {
  (pdfViewer as { setDocument(pdfDocument: PDFDocumentProxy | null): void } | null)?.setDocument(null);
  linkService?.setDocument(null);
}

function getScaleValue(nextScale: number, presetValue?: string | number) {
  if (presetValue !== undefined) {
    return String(presetValue);
  }

  const matchingOption = ZOOM_OPTIONS.find(({ value }) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && Math.abs(numericValue - nextScale) < 0.001;
  });

  return matchingOption?.value ?? `custom:${Math.round(nextScale * 100)}`;
}

function getMaxSidebarWidth() {
  if (typeof window === "undefined") {
    return 720;
  }

  return Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_VIEWER_WIDTH - RESIZER_WIDTH);
}

function clampSidebarWidth(nextWidth: number) {
  return Math.min(getMaxSidebarWidth(), Math.max(MIN_SIDEBAR_WIDTH, nextWidth));
}

function App() {
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);
  const pdfViewerRef = useRef<PDFViewer | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [maxSidebarWidth, setMaxSidebarWidth] = useState(getMaxSidebarWidth);
  const [filePath, setFilePath] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("请选择一个 PDF 文件开始预览。");
  const [error, setError] = useState("");

  useEffect(() => {
    const container = viewerContainerRef.current;
    const viewer = viewerRef.current;

    if (!container || !viewer) {
      return;
    }

    let eventBus: EventBus;
    let linkService: PDFLinkService;
    let pdfViewer: PDFViewer;

    try {
      eventBus = new EventBus();
      linkService = new PDFLinkService({ eventBus });
      pdfViewer = new PDFViewer({
        container,
        viewer,
        eventBus,
        linkService,
        removePageBorders: false,
      });
    } catch (cause) {
      setError(`PDF viewer 初始化失败：${getErrorMessage(cause)}`);
      return;
    }

    linkService.setViewer(pdfViewer);

    const handlePagesInit = () => {
      pdfViewer.currentScaleValue = "page-width";
      setScale(pdfViewer.currentScale);
      setPageNumber(pdfViewer.currentPageNumber);
      setPageInput(String(pdfViewer.currentPageNumber));
      setScaleValue("page-width");
    };
    const handlePageChanging = ({ pageNumber: nextPageNumber }: { pageNumber: number }) => {
      setPageNumber(nextPageNumber);
      setPageInput(String(nextPageNumber));
    };
    const handleScaleChanging = ({ scale: nextScale, presetValue }: { scale: number; presetValue?: string | number }) => {
      setScale(nextScale);
      setScaleValue(getScaleValue(nextScale, presetValue));
    };

    eventBus.on("pagesinit", handlePagesInit);
    eventBus.on("pagechanging", handlePageChanging);
    eventBus.on("scalechanging", handleScaleChanging);

    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    pdfViewerRef.current = pdfViewer;

    return () => {
      eventBus.off("pagesinit", handlePagesInit);
      eventBus.off("pagechanging", handlePageChanging);
      eventBus.off("scalechanging", handleScaleChanging);
      resetViewerDocument(pdfViewer, linkService);
      eventBusRef.current = null;
      linkServiceRef.current = null;
      pdfViewerRef.current = null;
    };
  }, []);

  const clearPdfViewer = useCallback(() => {
    resetViewerDocument(pdfViewerRef.current, linkServiceRef.current);
    setPdfDocument(null);
    setPageNumber(1);
    setPageInput("1");
    setPageCount(0);
    setScale(1);
    setScaleValue("page-width");
  }, []);

  const openPdfData = useCallback(
    async (data: Uint8Array | ArrayBuffer, displayPath: string) => {
      setIsLoading(true);
      setError("");
      setMessage("正在读取 PDF...");

      try {
        clearPdfViewer();
        loadingTaskRef.current?.destroy();

        const loadingTask = pdfjsLib.getDocument({ data });
        const loadedPdf = await loadingTask.promise;

        loadingTaskRef.current = loadingTask;
        setFilePath(displayPath);
        setPdfDocument(loadedPdf);
        setPageCount(loadedPdf.numPages);
        setMessage(`已加载 ${loadedPdf.numPages} 页`);

        linkServiceRef.current?.setDocument(loadedPdf);
        pdfViewerRef.current?.setDocument(loadedPdf);
      } catch (cause) {
        setError(`无法打开该 PDF：${getErrorMessage(cause)}`);
        setMessage("请选择一个 PDF 文件开始预览");
      } finally {
        setIsLoading(false);
      }
    },
    [clearPdfViewer],
  );

  const choosePdf = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: "选择 PDF 文件",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (typeof selected !== "string") {
        setIsLoading(false);
        return;
      }

      const data = await readFile(selected);
      await openPdfData(data, selected);
    } catch (cause) {
      setError(`文件选择失败：${getErrorMessage(cause)}`);
      setMessage("请选择一个 PDF 文件开始预览");
      setIsLoading(false);
    }
  }, [openPdfData]);

  useEffect(() => {
    return () => {
      loadingTaskRef.current?.destroy();
    };
  }, []);

  const getViewerCenterOrigin = useCallback(() => {
    const container = viewerContainerRef.current;

    if (!container) {
      return undefined;
    }

    const rect = container.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  }, []);

  const zoomOut = useCallback(() => {
    pdfViewerRef.current?.decreaseScale({
      drawingDelay: WHEEL_ZOOM_DELAY_MS,
      origin: getViewerCenterOrigin(),
    });
  }, [getViewerCenterOrigin]);

  const zoomIn = useCallback(() => {
    pdfViewerRef.current?.increaseScale({
      drawingDelay: WHEEL_ZOOM_DELAY_MS,
      origin: getViewerCenterOrigin(),
    });
  }, [getViewerCenterOrigin]);

  const commitPageInput = useCallback(() => {
    const pdfViewer = pdfViewerRef.current;

    if (!pdfViewer || !pdfDocument) {
      setPageInput(String(pageNumber));
      return;
    }

    const parsedPage = Number.parseInt(pageInput, 10);

    if (!Number.isFinite(parsedPage)) {
      setPageInput(String(pageNumber));
      return;
    }

    const nextPage = Math.min(pageCount, Math.max(1, parsedPage));
    pdfViewer.currentPageNumber = nextPage;
    setPageInput(String(nextPage));
  }, [pageCount, pageInput, pageNumber, pdfDocument]);

  const handlePageInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
        commitPageInput();
      }
    },
    [commitPageInput],
  );

  const handleScaleSelect = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextScaleValue = event.currentTarget.value;
    const pdfViewer = pdfViewerRef.current;

    if (!pdfViewer) {
      return;
    }

    setScaleValue(nextScaleValue);
    pdfViewer.currentScaleValue = nextScaleValue;
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      const nextMaxSidebarWidth = getMaxSidebarWidth();
      setMaxSidebarWidth(nextMaxSidebarWidth);
      setSidebarWidth((currentWidth) => Math.min(nextMaxSidebarWidth, currentWidth));
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      document.body.classList.remove("is-resizing-sidebar");
    };
  }, []);

  const startSidebarResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("is-resizing-sidebar");
    },
    [sidebarWidth],
  );

  const resizeSidebar = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextWidth = clampSidebarWidth(dragState.startWidth + event.clientX - dragState.startX);
    setSidebarWidth(nextWidth);
  }, []);

  const stopSidebarResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("is-resizing-sidebar");
  }, []);

  const handlePreviewWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const pdfViewer = pdfViewerRef.current;

      if (!pdfViewer || !pdfDocument || !event.ctrlKey) {
        return;
      }

      event.preventDefault();

      const options = {
        drawingDelay: WHEEL_ZOOM_DELAY_MS,
        origin: [event.clientX, event.clientY],
      };

      if (event.deltaY < 0) {
        pdfViewer.increaseScale(options);
      } else {
        pdfViewer.decreaseScale(options);
      }
    },
    [pdfDocument],
  );

  const goPreviousPage = useCallback(() => {
    pdfViewerRef.current?.previousPage();
  }, []);

  const goNextPage = useCallback(() => {
    pdfViewerRef.current?.nextPage();
  }, []);

  const canPreview = pdfDocument !== null;
  const canGoBack = canPreview && pageNumber > 1;
  const canGoForward = canPreview && pageNumber < pageCount;
  const canZoomOut = canPreview && scale > MIN_SCALE;
  const canZoomIn = canPreview && scale < MAX_SCALE;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="PDF 文件控制" style={{ width: sidebarWidth, flexBasis: sidebarWidth }}>
        <div className="brand">
          <span className="brand-mark">PDF</span>
          <div>
            <h1>PDFLeaf</h1>
            <p>本地 PDF 预览</p>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={choosePdf} disabled={isLoading}>
          {isLoading ? "正在打开..." : "选择 PDF 文件"}
        </button>
        <label className="field-label" htmlFor="pdf-path">
          文件路径
        </label>
        <input
          id="pdf-path"
          className="path-input"
          value={filePath}
          readOnly
          placeholder="尚未选择 PDF 文件"
          title={filePath}
        />

        <p className={error ? "status status-error" : "status"}>{error || message}</p>
      </aside>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整文件栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={maxSidebarWidth}
        aria-valuenow={sidebarWidth}
        onPointerDown={startSidebarResize}
        onPointerMove={resizeSidebar}
        onPointerUp={stopSidebarResize}
        onPointerCancel={stopSidebarResize}
      />

      <section className="viewer" aria-label="PDF 预览">
        <div className="viewer-toolbar" aria-label="PDF 阅读控制">
          <button
            className="toolbar-button icon-button"
            type="button"
            onClick={goPreviousPage}
            disabled={!canGoBack}
            title="上一页"
          >
            <img className="toolbar-icon" src={pageUpIcon} alt="" aria-hidden="true" />
          </button>
          <button
            className="toolbar-button icon-button"
            type="button"
            onClick={goNextPage}
            disabled={!canGoForward}
            title="下一页"
          >
            <img className="toolbar-icon" src={pageDownIcon} alt="" aria-hidden="true" />
          </button>
          <div className="page-control">
            <input
              className="page-input"
              value={pageInput}
              inputMode="numeric"
              aria-label="当前页"
              disabled={!canPreview}
              onBlur={commitPageInput}
              onChange={(event) => setPageInput(event.currentTarget.value.replace(/\D/g, ""))}
              onKeyDown={handlePageInputKeyDown}
            />
            <span className="page-total">/ {pageCount || "-"}</span>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            className="toolbar-button icon-button"
            type="button"
            onClick={zoomOut}
            disabled={!canZoomOut}
            title="缩小"
          >
            <img className="toolbar-icon" src={zoomOutIcon} alt="" aria-hidden="true" />
          </button>
          <button
            className="toolbar-button icon-button"
            type="button"
            onClick={zoomIn}
            disabled={!canZoomIn}
            title="放大"
          >
            <img className="toolbar-icon" src={zoomInIcon} alt="" aria-hidden="true" />
          </button>
          <select className="zoom-select" value={scaleValue} onChange={handleScaleSelect} disabled={!canPreview} aria-label="缩放比例">
            {scaleValue.startsWith("custom:") && <option value={scaleValue}>{Math.round(scale * 100)}%</option>}
            {ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={canPreview ? "viewer-container" : "viewer-container viewer-container-empty"} ref={viewerContainerRef} onWheel={handlePreviewWheel}>
          <div className="pdfViewer" ref={viewerRef} />
          {!canPreview && (
            <div className="empty-state">
              <strong>未选择文件</strong>
              <span>从左侧选择一个本地 PDF 文件</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
