import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  PREVIEW_MAX_CANVAS_PIXELS,
  PREVIEW_MAX_SCALE,
  PREVIEW_MIN_SCALE,
  ZOOM_OPTIONS,
} from "@/constants/pdf-workspace";
import { NativeSelect } from "@/components/ui/native-select";
import { getErrorMessage } from "@/lib/pdf-workspace";
import type { ImportedPdf, PreviewTarget } from "@/types/pdf-workspace";

type PreviewModalProps = {
  target: PreviewTarget;
  importedPdfs: ImportedPdf[];
  onClose: () => void;
};

export function PreviewModal({ target, importedPdfs, onClose }: PreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{
    relativeX: number;
    relativeY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [pageNum, setPageNum] = useState(target.source.pageNumber);
  const [scale, setScale] = useState(1);
  const [zoomValue, setZoomValue] = useState("page-width");
  const [rotation, setRotation] = useState(target.rotation);
  const [error, setError] = useState("");

  const sourcePdf = useMemo(
    () => importedPdfs.find((pdf) => pdf.id === target.source.documentId) ?? null,
    [importedPdfs, target.source.documentId],
  );
  const totalPages = sourcePdf?.pageCount ?? 0;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function renderPreview() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context || !sourcePdf) {
        return;
      }

      try {
        const page = await sourcePdf.pdf.getPage(pageNum);
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
          page.cleanup();
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
  }, [rotation, sourcePdf, pageNum, zoomValue]);

  const changeZoom = useCallback((nextScale: number) => {
    const clampedScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, nextScale));
    setZoomValue(String(Number(clampedScale.toFixed(2))));
  }, []);

  const goToPage = useCallback(
    (nextPageNum: number) => {
      if (nextPageNum < 1 || nextPageNum > totalPages) {
        return;
      }

      setPageNum(nextPageNum);
      setZoomValue("page-width");
      setRotation(0);
      setScale(1);
      zoomAnchorRef.current = null;

      if (previewScrollRef.current) {
        previewScrollRef.current.scrollTop = 0;
        previewScrollRef.current.scrollLeft = 0;
      }
    },
    [totalPages],
  );

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

  const canPrev = pageNum > 1;
  const canNext = pageNum < totalPages;
  const canZoomOut = scale > PREVIEW_MIN_SCALE + 0.01;
  const canZoomIn = scale < PREVIEW_MAX_SCALE - 0.01;

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="预览">
      <div className="preview-window">
        <header className="preview-titlebar">
          <span>
            预览 · {sourcePdf?.name ?? target.source.documentName} · 第 {pageNum} 页
          </span>
          <button type="button" onClick={onClose} aria-label="关闭预览">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="preview-toolbar">
          <button type="button" title="上一页" disabled={!canPrev} onClick={() => goToPage(pageNum - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="preview-page-number">
            {pageNum} / {totalPages}
          </span>
          <button type="button" title="下一页" disabled={!canNext} onClick={() => goToPage(pageNum + 1)}>
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
